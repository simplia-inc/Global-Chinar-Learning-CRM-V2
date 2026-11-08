-- Online/offline batches and batch-wise fee roster. Additive. Money is visible to Admin/Super Admin only.

alter table public.school_batches add column if not exists delivery_mode text not null default 'offline';
do $$ begin
  alter table public.school_batches add constraint school_batches_delivery_mode_chk check (delivery_mode in ('online','offline','hybrid'));
exception when duplicate_object then null; end $$;
create index if not exists batches_start_idx on public.school_batches(start_date);

-- Per-student fee roster for one batch or a filtered set (month of start date, mode, course).
create or replace function public.batch_fee_roster(
  p_batch uuid default null, p_month date default null, p_mode text default null,
  p_course uuid default null, p_include_withdrawn boolean default false)
returns table (
  enrollment_id uuid, batch_id uuid, batch_name text, batch_code text, delivery_mode text, batch_start date, course_name text,
  student_id uuid, student_code text, student_name text, phone text, enrollment_status text, enrolled_at timestamptz,
  agreed_fee numeric, discount numeric, net_fee numeric, invoiced numeric, paid numeric, outstanding numeric,
  fee_status text, next_due date, last_payment_at timestamptz)
language sql stable security invoker set search_path = public as $$
  with adm as (select public.is_school_admin() as ok),
  pay as (
    select i.enrollment_id,
           sum(case when p.entry_type = 'payment' then p.amount else -p.amount end) as paid,
           max(p.payment_date) filter (where p.entry_type = 'payment') as last_pay
      from public.student_invoices i join public.student_payments p on p.invoice_id = i.id
     where i.enrollment_id is not null and i.status <> 'void' group by i.enrollment_id),
  inv as (
    select enrollment_id, sum(total_amount) as invoiced,
           min(due_date) filter (where status in ('unpaid','partially_paid')) as next_due
      from public.student_invoices where enrollment_id is not null and status <> 'void' group by enrollment_id)
  select e.id, b.id, b.name, b.code, b.delivery_mode, b.start_date, c.name,
         s.id, s.student_code, s.full_name, s.phone, e.status, e.enrolled_at,
         case when adm.ok then e.agreed_fee end,
         case when adm.ok then e.discount_amount end,
         case when adm.ok then e.agreed_fee - e.discount_amount end,
         case when adm.ok then coalesce(inv.invoiced, 0) end,
         case when adm.ok then coalesce(pay.paid, 0) end,
         case when adm.ok then greatest(e.agreed_fee - e.discount_amount - coalesce(pay.paid, 0), 0) end,
         case when not adm.ok then null
              when e.agreed_fee - e.discount_amount <= 0 then 'no_fee'
              when coalesce(pay.paid, 0) >= e.agreed_fee - e.discount_amount then 'paid'
              when coalesce(pay.paid, 0) > 0 then 'partial' else 'unpaid' end,
         case when adm.ok then inv.next_due end,
         case when adm.ok then pay.last_pay end
    from public.enrollments e
    cross join adm
    join public.school_batches b on b.id = e.batch_id
    join public.students s on s.id = e.student_id
    left join public.school_courses c on c.id = b.course_id
    left join pay on pay.enrollment_id = e.id
    left join inv on inv.enrollment_id = e.id
   where (p_batch is null or b.id = p_batch)
     and (p_month is null or date_trunc('month', b.start_date) = date_trunc('month', p_month::timestamp))
     and (p_mode is null or b.delivery_mode = p_mode)
     and (p_course is null or b.course_id = p_course)
     and (p_include_withdrawn or e.status <> 'withdrawn')
   order by b.start_date desc nulls last, b.name, s.full_name
$$;

-- One row per batch (including empty batches) with seats and money totals.
create or replace function public.batch_overview(
  p_month date default null, p_mode text default null, p_course uuid default null)
returns table (
  batch_id uuid, name text, code text, delivery_mode text, status text, start_date date, end_date date,
  course_id uuid, course_name text, capacity integer, enrolled integer, seats_left integer, trainer_names text,
  net_fee_total numeric, collected numeric, outstanding numeric)
language sql stable security invoker set search_path = public as $$
  with adm as (select public.is_school_admin() as ok),
  pay as (
    select i.enrollment_id, sum(case when p.entry_type = 'payment' then p.amount else -p.amount end) as paid
      from public.student_invoices i join public.student_payments p on p.invoice_id = i.id
     where i.enrollment_id is not null and i.status <> 'void' group by i.enrollment_id),
  fee as (
    select e.batch_id, count(*) as n, sum(e.agreed_fee - e.discount_amount) as net, sum(coalesce(pay.paid, 0)) as paid,
           sum(greatest(e.agreed_fee - e.discount_amount - coalesce(pay.paid, 0), 0)) as owed
      from public.enrollments e left join pay on pay.enrollment_id = e.id
     where e.status <> 'withdrawn' group by e.batch_id),
  tr as (
    select bt.batch_id, string_agg(coalesce(nullif(p.full_name, ''), p.email), ', ' order by p.full_name) as names
      from public.batch_trainers bt join public.profiles p on p.id = bt.trainer_id group by bt.batch_id)
  select b.id, b.name, b.code, b.delivery_mode, b.status, b.start_date, b.end_date, b.course_id, c.name, b.capacity,
         coalesce(fee.n, 0)::int,
         case when b.capacity is null then null else greatest(b.capacity - coalesce(fee.n, 0), 0)::int end,
         tr.names,
         case when adm.ok then coalesce(fee.net, 0) end,
         case when adm.ok then coalesce(fee.paid, 0) end,
         case when adm.ok then coalesce(fee.owed, 0) end
    from public.school_batches b
    cross join adm
    left join public.school_courses c on c.id = b.course_id
    left join fee on fee.batch_id = b.id
    left join tr on tr.batch_id = b.id
   where (p_month is null or date_trunc('month', b.start_date) = date_trunc('month', p_month::timestamp))
     and (p_mode is null or b.delivery_mode = p_mode)
     and (p_course is null or b.course_id = p_course)
   order by b.start_date desc nulls last, b.name
$$;

-- Enrol a student in a batch (fee defaults to the course fee) and optionally raise the invoice atomically.
create or replace function public.enroll_student(
  p_student uuid, p_batch uuid, p_agreed_fee numeric default null, p_discount numeric default 0,
  p_due_date date default null, p_create_invoice boolean default true)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_fee numeric; v_enr uuid; v_disc numeric := coalesce(p_discount, 0);
begin
  v_fee := coalesce(p_agreed_fee,
    (select c.fee_amount from public.school_batches b join public.school_courses c on c.id = b.course_id where b.id = p_batch), 0);
  if v_fee < 0 or v_disc < 0 or v_disc > v_fee then
    raise exception 'Discount must be between 0 and the agreed fee' using errcode = '22023';
  end if;
  begin
    insert into public.enrollments(student_id, batch_id, agreed_fee, discount_amount, created_by)
    values (p_student, p_batch, v_fee, v_disc, auth.uid()) returning id into v_enr;
  exception when unique_violation then
    raise exception 'This student is already enrolled in this batch' using errcode = '23505';
  end;
  if p_create_invoice and v_fee - v_disc > 0 and public.is_school_admin() then
    insert into public.student_invoices(student_id, enrollment_id, due_date, subtotal, discount_amount, total_amount, created_by)
    values (p_student, v_enr, p_due_date, v_fee, v_disc, v_fee - v_disc, auth.uid());
  end if;
  return v_enr;
end $$;

-- Record a payment against an enrolment's open invoice (creates the invoice first if none exists).
create or replace function public.record_enrollment_payment(
  p_enrollment uuid, p_amount numeric, p_method text, p_reference text default null,
  p_paid_at timestamptz default null, p_notes text default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare e record; v_inv uuid; v_id uuid;
begin
  if not public.is_school_admin() then raise exception 'Only Admin can record payments' using errcode = '42501'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter an amount greater than zero' using errcode = '22023'; end if;
  select id, student_id, agreed_fee, discount_amount into e from public.enrollments where id = p_enrollment;
  if not found then raise exception 'Enrolment not found'; end if;
  select i.id into v_inv from public.student_invoices i
   where i.enrollment_id = p_enrollment and i.status in ('unpaid', 'partially_paid')
   order by i.created_at limit 1;
  if v_inv is null then
    if e.agreed_fee - e.discount_amount <= 0 then raise exception 'This enrolment has no fee to collect'; end if;
    if exists (select 1 from public.student_invoices where enrollment_id = p_enrollment and status = 'paid') then
      raise exception 'This enrolment is already fully paid';
    end if;
    insert into public.student_invoices(student_id, enrollment_id, subtotal, discount_amount, total_amount, created_by)
    values (e.student_id, p_enrollment, e.agreed_fee, e.discount_amount, e.agreed_fee - e.discount_amount, auth.uid())
    returning id into v_inv;
  end if;
  insert into public.student_payments(invoice_id, student_id, amount, method, reference_number, payment_date, received_by, notes)
  values (v_inv, e.student_id, p_amount, p_method, nullif(trim(p_reference), ''), coalesce(p_paid_at, now()), auth.uid(), nullif(trim(p_notes), ''))
  returning id into v_id;
  return v_id;
end $$;

-- Payments are never deleted; a mistake is corrected with an auditable reversal.
create or replace function public.reverse_payment(p_payment uuid, p_reason text) returns uuid
language plpgsql security invoker set search_path = public as $$
declare o record; v_id uuid;
begin
  if not public.is_school_admin() then raise exception 'Only Admin can reverse payments' using errcode = '42501'; end if;
  select * into o from public.student_payments where id = p_payment;
  if not found or o.entry_type <> 'payment' then raise exception 'Payment not found'; end if;
  insert into public.student_payments(invoice_id, student_id, amount, method, reference_number, payment_date, received_by,
                                      entry_type, reverses_payment_id, reversal_reason)
  values (o.invoice_id, o.student_id, o.amount, o.method, o.reference_number, now(), auth.uid(), 'reversal', o.id, p_reason)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.enrollment_payments(p_enrollment uuid)
returns table (id uuid, invoice_number text, entry_type text, amount numeric, method text, reference_number text,
               payment_date timestamptz, notes text, reversal_reason text, is_reversed boolean)
language sql stable security invoker set search_path = public as $$
  select p.id, i.invoice_number, p.entry_type, p.amount, p.method, p.reference_number, p.payment_date, p.notes, p.reversal_reason,
         exists (select 1 from public.student_payments r where r.reverses_payment_id = p.id)
    from public.student_payments p join public.student_invoices i on i.id = p.invoice_id
   where i.enrollment_id = p_enrollment order by p.payment_date desc, p.created_at desc
$$;

revoke all on function public.batch_fee_roster(uuid, date, text, uuid, boolean), public.batch_overview(date, text, uuid),
  public.enroll_student(uuid, uuid, numeric, numeric, date, boolean), public.record_enrollment_payment(uuid, numeric, text, text, timestamptz, text),
  public.reverse_payment(uuid, text), public.enrollment_payments(uuid) from public, anon;
grant execute on function public.batch_fee_roster(uuid, date, text, uuid, boolean), public.batch_overview(date, text, uuid),
  public.enroll_student(uuid, uuid, numeric, numeric, date, boolean), public.record_enrollment_payment(uuid, numeric, text, text, timestamptz, text),
  public.reverse_payment(uuid, text), public.enrollment_payments(uuid) to authenticated;
