-- 1) Converting a lead creates (or links) exactly one student.  2) Every student gets a fee account automatically.
-- Additive: no renames, no deletes. Reuses students.source_lead_id (unique), student_invoices (installments) and student_payments (history).

-- Fee account: one per student. total_fee = 0 means "use the fees from the student's batch enrolments".
create table if not exists public.student_fee_accounts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null unique references public.students(id) on delete restrict,
  total_fee numeric(12,2) not null default 0 check (total_fee >= 0),
  discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (discount_amount <= total_fee)
);
create index if not exists student_fee_accounts_creator_idx on public.student_fee_accounts(created_by);
alter table public.student_fee_accounts enable row level security;
revoke all on public.student_fee_accounts from anon, authenticated;
grant select, insert, update on public.student_fee_accounts to authenticated;
create policy fee_accounts_admin_select on public.student_fee_accounts for select to authenticated using (public.is_school_admin());
create policy fee_accounts_admin_insert on public.student_fee_accounts for insert to authenticated with check (public.is_school_admin());
create policy fee_accounts_admin_update on public.student_fee_accounts for update to authenticated using (public.is_school_admin()) with check (public.is_school_admin());
drop trigger if exists set_updated_at on public.student_fee_accounts;
create trigger set_updated_at before update on public.student_fee_accounts for each row execute function public.set_updated_at();
drop trigger if exists audit_log on public.student_fee_accounts;
create trigger audit_log after insert or update or delete on public.student_fee_accounts for each row execute function public.log_audit_event();

-- Every new student (manual, lead conversion, import) gets a fee account.
create or replace function public.create_fee_account_for_student() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.student_fee_accounts(student_id, created_by) values (new.id, auth.uid()) on conflict (student_id) do nothing;
  return null;
end $$;
drop trigger if exists students_create_fee_account on public.students;
create trigger students_create_fee_account after insert on public.students for each row execute function public.create_fee_account_for_student();

-- Idempotent: returns the one student for a lead, creating or linking it only if needed.
create or replace function public.ensure_student_for_lead(p_lead uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare l public.leads; v_student uuid; v_note text;
begin
  select * into l from public.leads where id = p_lead;
  if not found then raise exception 'Lead not found' using errcode = 'P0002'; end if;

  select id into v_student from public.students where source_lead_id = l.id;
  if v_student is not null then
    -- Already exists: keep it. Only fill blanks; never overwrite what staff entered.
    update public.students s set
      email = coalesce(nullif(s.email, ''), nullif(l.email, '')),
      whatsapp = coalesce(nullif(s.whatsapp, ''), nullif(l.whatsapp_number, '')),
      phone = case when coalesce(s.phone, '') = '' then coalesce(nullif(trim(l.phone), ''), s.phone) else s.phone end
     where s.id = v_student
       and ((coalesce(s.email, '') = '' and coalesce(l.email, '') <> '')
         or (coalesce(s.whatsapp, '') = '' and coalesce(l.whatsapp_number, '') <> '')
         or (coalesce(s.phone, '') = '' and coalesce(l.phone, '') <> ''));
    return v_student;
  end if;

  -- A student added by hand earlier (same name and same phone, not linked to any lead) is linked, not duplicated.
  if length(public.norm_phone(l.phone)) >= 7 then
    select s.id into v_student from public.students s
     where s.source_lead_id is null and public.norm_phone(s.phone) = public.norm_phone(l.phone)
       and lower(trim(s.full_name)) = lower(trim(l.full_name))
     order by s.created_at limit 1;
    if v_student is not null then
      update public.students set source_lead_id = l.id where id = v_student;
      return v_student;
    end if;
  end if;

  v_note := concat_ws(E'\n', nullif(trim(l.notes), ''),
    format('Converted from lead. Interested course: %s. Source: %s.',
           coalesce(nullif(trim(l.interested_course), ''), 'not specified'), coalesce(nullif(trim(l.source), ''), 'not specified')));
  insert into public.students(full_name, email, phone, whatsapp, admission_date, status, source_lead_id, notes, created_by)
  values (trim(l.full_name), nullif(trim(l.email), ''),
          coalesce(nullif(trim(l.phone), ''), nullif(trim(l.whatsapp_number), ''), ''),
          nullif(trim(l.whatsapp_number), ''), (now() at time zone 'Asia/Kolkata')::date, 'active', l.id, v_note,
          coalesce(auth.uid(), l.created_by))
  on conflict (source_lead_id) where source_lead_id is not null do nothing
  returning id into v_student;
  if v_student is null then select id into v_student from public.students where source_lead_id = l.id; end if;
  return v_student;
end $$;

create or replace function public.leads_convert_to_student() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.ensure_student_for_lead(new.id);
  return null;
end $$;
drop trigger if exists leads_convert_to_student on public.leads;
create trigger leads_convert_to_student after insert or update of status on public.leads
for each row when (new.status = 'converted') execute function public.leads_convert_to_student();

revoke all on function public.create_fee_account_for_student(), public.ensure_student_for_lead(uuid), public.leads_convert_to_student() from public, anon, authenticated;

-- One-time catch-up (idempotent): leads already marked Converted, and any student without a fee account.
do $$ declare r record; begin
  for r in select id from public.leads where status = 'converted' loop perform public.ensure_student_for_lead(r.id); end loop;
  insert into public.student_fee_accounts(student_id) select s.id from public.students s
   where not exists (select 1 from public.student_fee_accounts a where a.student_id = s.id);
end $$;

-- Fee helpers (SECURITY INVOKER: RLS applies; money is Admin / Super Admin only) --------------------------
create or replace function public.student_net_fee(p_student uuid) returns numeric
language sql stable security invoker set search_path = public as $$
  select case when coalesce(a.total_fee, 0) > 0 then a.total_fee - a.discount_amount
              else coalesce((select sum(e.agreed_fee - e.discount_amount) from public.enrollments e
                              where e.student_id = p_student and e.status <> 'withdrawn'), 0) end
    from (select 1) x left join public.student_fee_accounts a on a.student_id = p_student
$$;

create or replace function public.student_fee_overview(p_search text default null, p_status text default null)
returns table (student_id uuid, student_code text, full_name text, phone text, student_status text, admission_date date, batches text,
  total_fee numeric, discount numeric, net_fee numeric, invoiced numeric, paid numeric, pending numeric, fee_status text,
  next_due date, last_payment_at timestamptz, installments integer)
language sql stable security invoker set search_path = public as $$
  with adm as (select public.is_school_admin() as ok),
  enr as (select e.student_id, sum(e.agreed_fee - e.discount_amount) as net,
                 string_agg(distinct b.name || ' (' || initcap(b.delivery_mode) || ')', ', ') as batches
            from public.enrollments e join public.school_batches b on b.id = e.batch_id
           where e.status <> 'withdrawn' group by e.student_id),
  inv as (select student_id, sum(total_amount) as invoiced, count(*) as n,
                 min(due_date) filter (where status in ('unpaid', 'partially_paid')) as next_due
            from public.student_invoices where status <> 'void' group by student_id),
  pay as (select i.student_id, sum(case when p.entry_type = 'payment' then p.amount else -p.amount end) as paid,
                 max(p.payment_date) filter (where p.entry_type = 'payment') as last_pay
            from public.student_invoices i join public.student_payments p on p.invoice_id = i.id
           where i.status <> 'void' group by i.student_id),
  base as (
    select s.id, s.student_code, s.full_name, s.phone, s.status, s.admission_date, enr.batches,
           coalesce(a.total_fee, 0) as tf, coalesce(a.discount_amount, 0) as dc,
           case when coalesce(a.total_fee, 0) > 0 then a.total_fee - a.discount_amount else coalesce(enr.net, 0) end as net,
           coalesce(inv.invoiced, 0) as invoiced, coalesce(pay.paid, 0) as paid, inv.next_due, pay.last_pay, coalesce(inv.n, 0) as n
      from public.students s
      left join public.student_fee_accounts a on a.student_id = s.id
      left join enr on enr.student_id = s.id left join inv on inv.student_id = s.id left join pay on pay.student_id = s.id
     where (p_status is null or p_status = '' or s.status = p_status)
       and (p_search is null or p_search = ''
            or strpos(lower(s.full_name), lower(p_search)) > 0 or strpos(lower(coalesce(s.student_code, '')), lower(p_search)) > 0
            or strpos(coalesce(s.phone, ''), p_search) > 0))
  select b.id, b.student_code, b.full_name, b.phone, b.status, b.admission_date, b.batches,
         case when adm.ok then b.tf end, case when adm.ok then b.dc end, case when adm.ok then b.net end,
         case when adm.ok then b.invoiced end, case when adm.ok then b.paid end,
         case when adm.ok then greatest(b.net - b.paid, 0) end,
         case when not adm.ok then null when b.net <= 0 then 'no_fee' when b.paid >= b.net then 'paid'
              when b.paid > 0 then 'partial' else 'unpaid' end,
         case when adm.ok then b.next_due end, case when adm.ok then b.last_pay end, b.n::int
    from base b cross join adm order by b.full_name
$$;

create or replace function public.student_fee_detail(p_student uuid) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
begin
  if not public.is_school_admin() then raise exception 'Only Admin can view fee details' using errcode = '42501'; end if;
  return jsonb_build_object(
    'net_fee', public.student_net_fee(p_student),
    'account', (select jsonb_build_object('total_fee', a.total_fee, 'discount_amount', a.discount_amount, 'notes', a.notes)
                  from public.student_fee_accounts a where a.student_id = p_student),
    'enrollments', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'batch_name', b.name, 'delivery_mode', b.delivery_mode,
                  'agreed_fee', e.agreed_fee, 'discount', e.discount_amount, 'status', e.status) order by e.enrolled_at)
                  from public.enrollments e join public.school_batches b on b.id = e.batch_id where e.student_id = p_student), '[]'::jsonb),
    'installments', coalesce((select jsonb_agg(t) from (
        select i.id, i.invoice_number, i.due_date, i.total_amount, i.status, i.enrollment_id, i.notes,
               coalesce((select sum(case when p.entry_type = 'payment' then p.amount else -p.amount end)
                           from public.student_payments p where p.invoice_id = i.id), 0) as paid
          from public.student_invoices i where i.student_id = p_student and i.status <> 'void'
         order by i.due_date nulls last, i.created_at) t), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(t) from (
        select p.id, i.invoice_number, p.entry_type, p.amount, p.method, p.reference_number, p.payment_date, p.notes, p.reversal_reason,
               exists (select 1 from public.student_payments r where r.reverses_payment_id = p.id) as is_reversed
          from public.student_payments p join public.student_invoices i on i.id = p.invoice_id
         where i.student_id = p_student order by p.payment_date desc, p.created_at desc) t), '[]'::jsonb));
end $$;

create or replace function public.set_student_fee(p_student uuid, p_total numeric, p_discount numeric default 0, p_notes text default null)
returns void language plpgsql security invoker set search_path = public as $$
declare v_paid numeric; v_effective numeric; v_disc numeric := coalesce(p_discount, 0);
begin
  if not public.is_school_admin() then raise exception 'Only Admin can change fees' using errcode = '42501'; end if;
  if p_total is null or p_total < 0 or v_disc < 0 or v_disc > p_total then
    raise exception 'Total fee must be 0 or more, and the discount cannot exceed it' using errcode = '22023';
  end if;
  select coalesce(sum(case when p.entry_type = 'payment' then p.amount else -p.amount end), 0) into v_paid
    from public.student_payments p join public.student_invoices i on i.id = p.invoice_id where i.student_id = p_student and i.status <> 'void';
  v_effective := case when p_total > 0 then p_total - v_disc
                      else coalesce((select sum(e.agreed_fee - e.discount_amount) from public.enrollments e where e.student_id = p_student and e.status <> 'withdrawn'), 0) end;
  if v_effective < v_paid then
    raise exception 'The net fee cannot be lower than the amount already paid (%)', v_paid using errcode = '22023';
  end if;
  insert into public.student_fee_accounts(student_id, total_fee, discount_amount, notes, created_by)
  values (p_student, p_total, v_disc, nullif(trim(p_notes), ''), auth.uid())
  on conflict (student_id) do update set total_fee = excluded.total_fee, discount_amount = excluded.discount_amount, notes = excluded.notes;
end $$;

create or replace function public.add_installment(p_student uuid, p_amount numeric, p_due date default null, p_notes text default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_net numeric; v_invoiced numeric; v_id uuid;
begin
  if not public.is_school_admin() then raise exception 'Only Admin can add installments' using errcode = '42501'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter an installment amount greater than zero' using errcode = '22023'; end if;
  v_net := public.student_net_fee(p_student);
  select coalesce(sum(total_amount), 0) into v_invoiced from public.student_invoices where student_id = p_student and status <> 'void';
  if p_amount > v_net - v_invoiced then
    raise exception 'Installments would exceed the fee. Only % is left to schedule', greatest(v_net - v_invoiced, 0) using errcode = '22023';
  end if;
  insert into public.student_invoices(student_id, due_date, subtotal, discount_amount, total_amount, notes, created_by)
  values (p_student, p_due, p_amount, 0, p_amount, nullif(trim(p_notes), ''), auth.uid()) returning id into v_id;
  return v_id;
end $$;

create or replace function public.void_installment(p_invoice uuid) returns void
language plpgsql security invoker set search_path = public as $$
declare i public.student_invoices;
begin
  if not public.is_school_admin() then raise exception 'Only Admin can remove installments' using errcode = '42501'; end if;
  select * into i from public.student_invoices where id = p_invoice;
  if not found then raise exception 'Installment not found'; end if;
  if i.enrollment_id is not null then raise exception 'Fees from a batch enrolment cannot be removed here'; end if;
  if exists (select 1 from public.student_payments where invoice_id = p_invoice) then
    raise exception 'This installment has payments. Reverse them first';
  end if;
  update public.student_invoices set status = 'void' where id = p_invoice;
end $$;

-- Records a payment and applies it to the earliest open installments (creating an invoice for any remainder).
create or replace function public.record_student_payment(p_student uuid, p_amount numeric, p_method text,
  p_reference text default null, p_paid_at timestamptz default null, p_notes text default null)
returns integer language plpgsql security invoker set search_path = public as $$
declare v_net numeric; v_paid numeric; v_left numeric; v_out numeric; v_take numeric; v_n int := 0; v_invoiced numeric; v_inv uuid;
        r record; v_when timestamptz := coalesce(p_paid_at, now());
begin
  if not public.is_school_admin() then raise exception 'Only Admin can record payments' using errcode = '42501'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter an amount greater than zero' using errcode = '22023'; end if;
  if not exists (select 1 from public.students where id = p_student) then raise exception 'Student not found'; end if;
  v_net := public.student_net_fee(p_student);
  select coalesce(sum(case when p.entry_type = 'payment' then p.amount else -p.amount end), 0) into v_paid
    from public.student_payments p join public.student_invoices i on i.id = p.invoice_id where i.student_id = p_student and i.status <> 'void';
  if p_amount > greatest(v_net - v_paid, 0) then
    raise exception 'Payment of % is more than the pending amount of %', p_amount, greatest(v_net - v_paid, 0) using errcode = '22023';
  end if;
  v_left := p_amount;
  for r in select i.id, i.total_amount from public.student_invoices i
            where i.student_id = p_student and i.status in ('unpaid', 'partially_paid')
            order by i.due_date nulls last, i.created_at, i.id loop
    select r.total_amount - coalesce(sum(case when entry_type = 'payment' then amount else -amount end), 0) into v_out
      from public.student_payments where invoice_id = r.id;
    continue when v_out <= 0;
    v_take := least(v_left, v_out);
    insert into public.student_payments(invoice_id, student_id, amount, method, reference_number, payment_date, received_by, notes)
    values (r.id, p_student, v_take, p_method, nullif(trim(p_reference), ''), v_when, auth.uid(), nullif(trim(p_notes), ''));
    v_n := v_n + 1; v_left := v_left - v_take;
    exit when v_left <= 0;
  end loop;
  if v_left > 0 then
    select coalesce(sum(total_amount), 0) into v_invoiced from public.student_invoices where student_id = p_student and status <> 'void';
    if v_left > v_net - v_invoiced then raise exception 'Nothing left to invoice for this amount'; end if;
    insert into public.student_invoices(student_id, subtotal, discount_amount, total_amount, notes, created_by)
    values (p_student, v_left, 0, v_left, 'Created automatically for a payment', auth.uid()) returning id into v_inv;
    insert into public.student_payments(invoice_id, student_id, amount, method, reference_number, payment_date, received_by, notes)
    values (v_inv, p_student, v_left, p_method, nullif(trim(p_reference), ''), v_when, auth.uid(), nullif(trim(p_notes), ''));
    v_n := v_n + 1;
  end if;
  return v_n;
end $$;

revoke all on function public.student_net_fee(uuid), public.student_fee_overview(text, text), public.student_fee_detail(uuid),
  public.set_student_fee(uuid, numeric, numeric, text), public.add_installment(uuid, numeric, date, text), public.void_installment(uuid),
  public.record_student_payment(uuid, numeric, text, text, timestamptz, text) from public, anon;
grant execute on function public.student_net_fee(uuid), public.student_fee_overview(text, text), public.student_fee_detail(uuid),
  public.set_student_fee(uuid, numeric, numeric, text), public.add_installment(uuid, numeric, date, text), public.void_installment(uuid),
  public.record_student_payment(uuid, numeric, text, text, timestamptz, text) to authenticated;
