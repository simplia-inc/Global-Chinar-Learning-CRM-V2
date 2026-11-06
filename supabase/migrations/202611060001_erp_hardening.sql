-- Global Chinar ERP hardening (additive). Applies on top of 202611050001_school_erp_foundation.sql.
-- Fixes: deletable finance rows, missing updated_at/audit triggers, employee scope,
-- payment validation/reversals, anon grants, profile management policies.

-- 1. Helpers --------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;

create or replace function public.is_employee() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_app_role() = 'employee'::public.app_role, false)
$$;

create or replace function public.can_access_student(p_student uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.students s
    where s.id = p_student
      and (public.is_school_admin()
        or (public.is_employee()
            and (s.created_by = (select auth.uid())
              or (s.source_lead_id is not null and public.can_access_lead(s.source_lead_id)))))
  )
$$;

-- 2. Missing columns, numbering, constraints ------------------------------
alter table public.enrollments       add column if not exists updated_at timestamptz not null default now();
alter table public.class_sessions    add column if not exists updated_at timestamptz not null default now();
alter table public.student_invoices  add column if not exists updated_at timestamptz not null default now();
alter table public.trainer_payouts   add column if not exists updated_at timestamptz not null default now();

alter table public.student_payments add column if not exists entry_type text not null default 'payment';
alter table public.student_payments add column if not exists reverses_payment_id uuid references public.student_payments(id) on delete restrict;
alter table public.student_payments add column if not exists reversal_reason text;
do $$ begin
  alter table public.student_payments add constraint student_payments_entry_type_chk check (entry_type in ('payment','reversal'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.student_payments add constraint student_payments_reversal_chk check ((entry_type = 'reversal') = (reverses_payment_id is not null));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.student_invoices add constraint student_invoices_total_chk check (total_amount = subtotal - discount_amount);
exception when duplicate_object then null; end $$;
create unique index if not exists student_payments_one_reversal on public.student_payments(reverses_payment_id) where reverses_payment_id is not null;
create unique index if not exists students_one_per_lead on public.students(source_lead_id) where source_lead_id is not null;

create sequence if not exists public.student_code_seq;
create sequence if not exists public.invoice_number_seq;
alter table public.students alter column student_code set default ('GC-' || to_char(now(), 'YY') || '-' || lpad(nextval('public.student_code_seq')::text, 5, '0'));
alter table public.student_invoices alter column invoice_number set default ('INV-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.invoice_number_seq')::text, 5, '0'));

-- 3. Indexes on foreign keys / filters ------------------------------------
create index if not exists students_source_lead_idx on public.students(source_lead_id);
create index if not exists batches_course_idx on public.school_batches(course_id);
create index if not exists batch_trainers_trainer_idx on public.batch_trainers(trainer_id);
create index if not exists sessions_trainer_idx on public.class_sessions(trainer_id);
create index if not exists attendance_student_idx on public.attendance(student_id);
create index if not exists invoices_enrollment_idx on public.student_invoices(enrollment_id);
create index if not exists payments_student_idx on public.student_payments(student_id);
create index if not exists payouts_batch_idx on public.trainer_payouts(batch_id);
create index if not exists payouts_session_idx on public.trainer_payouts(session_id);
create index if not exists audit_entity_idx on public.school_audit_logs(entity_table, entity_id);
create index if not exists audit_created_idx on public.school_audit_logs(created_at desc);
create index if not exists leads_assigned_idx on public.leads(assigned_to);
create index if not exists leads_status_idx on public.leads(status);
create index if not exists leads_created_by_idx on public.leads(created_by);
create index if not exists follow_ups_lead_idx on public.follow_ups(lead_id);
create index if not exists follow_ups_employee_idx on public.follow_ups(employee_id);
create index if not exists lead_assignments_lead_idx on public.lead_assignments(lead_id);
create index if not exists lead_assignments_employee_idx on public.lead_assignments(employee_id);

-- 4. updated_at triggers --------------------------------------------------
do $$ declare t text; begin
  foreach t in array array['school_courses','students','school_batches','enrollments','class_sessions','student_invoices','trainer_payouts','leads','profiles'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- 5. Business-rule triggers -----------------------------------------------
create or replace function public.enforce_batch_capacity() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_cap int; v_used int;
begin
  if new.status <> 'active' then return new; end if;
  select capacity into v_cap from public.school_batches where id = new.batch_id for update;
  if v_cap is null then return new; end if;
  select count(*) into v_used from public.enrollments
   where batch_id = new.batch_id and status = 'active' and id is distinct from new.id;
  if v_used >= v_cap then
    raise exception 'Batch is full (% of % seats taken)', v_used, v_cap using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists enrollments_capacity on public.enrollments;
create trigger enrollments_capacity before insert or update of status, batch_id on public.enrollments
for each row execute function public.enforce_batch_capacity();

create or replace function public.validate_payment() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_total numeric; v_status text; v_student uuid; v_paid numeric; v_orig public.student_payments;
begin
  select total_amount, status, student_id into v_total, v_status, v_student
    from public.student_invoices where id = new.invoice_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  if v_status = 'void' then raise exception 'Cannot record payments against a void invoice'; end if;
  if new.student_id <> v_student then raise exception 'Payment student does not match the invoice student'; end if;
  select coalesce(sum(case when entry_type = 'payment' then amount else -amount end), 0)
    into v_paid from public.student_payments where invoice_id = new.invoice_id;
  if new.entry_type = 'payment' then
    if v_paid + new.amount > v_total then
      raise exception 'Payment of % exceeds the outstanding balance of %', new.amount, v_total - v_paid;
    end if;
  else
    select * into v_orig from public.student_payments where id = new.reverses_payment_id;
    if not found or v_orig.entry_type <> 'payment' or v_orig.invoice_id <> new.invoice_id then
      raise exception 'Invalid reversal target';
    end if;
    if new.amount <> v_orig.amount then raise exception 'A reversal must match the original payment amount'; end if;
    if new.reversal_reason is null or length(trim(new.reversal_reason)) = 0 then
      raise exception 'A reversal reason is required';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists payments_validate on public.student_payments;
create trigger payments_validate before insert on public.student_payments
for each row execute function public.validate_payment();

create or replace function public.sync_invoice_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_total numeric; v_paid numeric;
begin
  select total_amount into v_total from public.student_invoices where id = new.invoice_id;
  select coalesce(sum(case when entry_type = 'payment' then amount else -amount end), 0)
    into v_paid from public.student_payments where invoice_id = new.invoice_id;
  update public.student_invoices
     set status = case when v_paid >= v_total and v_total > 0 then 'paid'
                       when v_paid > 0 then 'partially_paid' else 'unpaid' end
   where id = new.invoice_id and status <> 'void';
  return new;
end $$;
drop trigger if exists payments_sync_invoice on public.student_payments;
create trigger payments_sync_invoice after insert on public.student_payments
for each row execute function public.sync_invoice_status();

-- 6. Audit trail ----------------------------------------------------------
create or replace function public.log_audit_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_details jsonb; v_id text;
begin
  if tg_op = 'INSERT' then
    v_details := jsonb_build_object('new', to_jsonb(new)); v_id := to_jsonb(new)->>'id';
  elsif tg_op = 'UPDATE' then
    select coalesce(jsonb_object_agg(n.key, jsonb_build_object('old', o.value, 'new', n.value)), '{}'::jsonb)
      into v_details
      from jsonb_each(to_jsonb(old)) o join jsonb_each(to_jsonb(new)) n on n.key = o.key
     where o.value is distinct from n.value and n.key <> 'updated_at';
    if v_details = '{}'::jsonb then return new; end if;
    v_id := to_jsonb(new)->>'id';
  else
    v_details := jsonb_build_object('old', to_jsonb(old)); v_id := to_jsonb(old)->>'id';
  end if;
  insert into public.school_audit_logs(actor_id, action, entity_table, entity_id, details)
  values ((select auth.uid()), lower(tg_op), tg_table_name, v_id, v_details);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.log_audit_event() from public, anon, authenticated;

do $$ declare t text; begin
  foreach t in array array['students','enrollments','school_courses','school_batches','batch_trainers','class_sessions','student_invoices','student_payments','trainer_payouts','leads','lead_assignments','profiles'] loop
    execute format('drop trigger if exists audit_log on public.%I', t);
    execute format('create trigger audit_log after insert or update or delete on public.%I for each row execute function public.log_audit_event()', t);
  end loop;
end $$;

-- 7. Privileges: no anon access, no deletes on business/finance records ----
revoke all on public.school_courses, public.students, public.school_batches, public.batch_trainers,
  public.enrollments, public.class_sessions, public.attendance, public.student_invoices,
  public.student_payments, public.trainer_payouts, public.school_audit_logs from anon, authenticated;
grant select, insert, update on public.school_courses, public.students, public.school_batches,
  public.enrollments, public.class_sessions, public.attendance, public.student_invoices, public.trainer_payouts to authenticated;
grant select, insert, delete on public.batch_trainers to authenticated;
grant select, insert on public.student_payments to authenticated;
grant select on public.school_audit_logs to authenticated;
grant usage on sequence public.student_code_seq, public.invoice_number_seq to authenticated;
revoke all on sequence public.school_audit_logs_id_seq from authenticated;

revoke all on function public.current_app_role(), public.is_school_admin(), public.is_employee(), public.can_access_student(uuid) from public, anon;
grant execute on function public.current_app_role(), public.is_school_admin(), public.is_employee(), public.can_access_student(uuid) to authenticated;

-- 8. Finance + audit policies (replace broad FOR ALL) ---------------------
drop policy if exists invoices_admin_all on public.student_invoices;
drop policy if exists payments_admin_all on public.student_payments;
drop policy if exists payouts_admin_all on public.trainer_payouts;
create policy invoices_admin_select on public.student_invoices for select to authenticated using (public.is_school_admin());
create policy invoices_admin_insert on public.student_invoices for insert to authenticated with check (public.is_school_admin());
create policy invoices_admin_update on public.student_invoices for update to authenticated using (public.is_school_admin()) with check (public.is_school_admin());
create policy payments_admin_select on public.student_payments for select to authenticated using (public.is_school_admin());
create policy payments_admin_insert on public.student_payments for insert to authenticated with check (public.is_school_admin());
create policy payouts_admin_select on public.trainer_payouts for select to authenticated using (public.is_school_admin());
create policy payouts_admin_insert on public.trainer_payouts for insert to authenticated with check (public.is_school_admin());
create policy payouts_admin_update on public.trainer_payouts for update to authenticated using (public.is_school_admin()) with check (public.is_school_admin());

-- 9. Employee (admissions) scope ------------------------------------------
create policy school_courses_employee_read on public.school_courses for select to authenticated using (public.is_employee());
create policy school_batches_employee_read on public.school_batches for select to authenticated using (public.is_employee());
create policy students_employee_select on public.students for select to authenticated using (public.can_access_student(id));
create policy students_employee_insert on public.students for insert to authenticated
  with check (public.is_employee() and created_by = (select auth.uid()) and (source_lead_id is null or public.can_access_lead(source_lead_id)));
create policy students_employee_update on public.students for update to authenticated
  using (public.is_employee() and public.can_access_student(id))
  with check (public.is_employee() and public.can_access_student(id));
create policy enrollments_employee_select on public.enrollments for select to authenticated
  using (public.is_employee() and public.can_access_student(student_id));
create policy enrollments_employee_insert on public.enrollments for insert to authenticated
  with check (public.is_employee() and created_by = (select auth.uid()) and public.can_access_student(student_id));

-- 10. Profile management --------------------------------------------------
revoke update on public.profiles from authenticated;
grant update (full_name, phone, role, is_active) on public.profiles to authenticated;
create policy profiles_self_update on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()) and role = public.current_app_role() and is_active = true);
create policy profiles_admin_update on public.profiles for update to authenticated
  using (public.current_app_role() = 'super_admin'::public.app_role
         or (public.current_app_role() = 'admin'::public.app_role and role <> 'super_admin'::public.app_role and id <> (select auth.uid())))
  with check (public.current_app_role() = 'super_admin'::public.app_role
         or (public.current_app_role() = 'admin'::public.app_role and role <> 'super_admin'::public.app_role and id <> (select auth.uid())));
