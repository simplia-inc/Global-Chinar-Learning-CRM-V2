-- Global Chinar School ERP foundation (additive, rerunnable).
-- Run in Supabase SQL Editor after reviewing. Does not alter existing CRM tables.
create extension if not exists pgcrypto;

create or replace function public.current_app_role()
returns public.app_role
language sql stable security definer
set search_path = public
as $$
  select role from public.profiles
  where id = (select auth.uid()) and is_active = true
  limit 1
$$;

create or replace function public.is_school_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(public.current_app_role() in ('super_admin'::public.app_role, 'admin'::public.app_role), false)
$$;

create table if not exists public.school_courses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique,
  description text,
  duration_weeks integer check (duration_weeks is null or duration_weeks > 0),
  fee_amount numeric(12,2) not null default 0 check (fee_amount >= 0),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  student_code text unique,
  full_name text not null,
  email text,
  phone text not null,
  whatsapp text,
  address text,
  date_of_birth date,
  guardian_name text,
  guardian_phone text,
  admission_date date not null default current_date,
  status text not null default 'active' check (status in ('active','completed','paused','withdrawn')),
  source_lead_id uuid references public.leads(id) on delete set null,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.school_batches (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references public.school_courses(id) on delete restrict,
  name text not null,
  code text unique,
  start_date date,
  end_date date,
  schedule_text text,
  capacity integer check (capacity is null or capacity > 0),
  status text not null default 'planned' check (status in ('planned','ongoing','completed','cancelled')),
  room_or_link text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.batch_trainers (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.school_batches(id) on delete cascade,
  trainer_id uuid not null references public.profiles(id) on delete restrict,
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(batch_id, trainer_id)
);

create table if not exists public.enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete restrict,
  batch_id uuid not null references public.school_batches(id) on delete restrict,
  agreed_fee numeric(12,2) not null default 0 check (agreed_fee >= 0),
  discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0),
  status text not null default 'active' check (status in ('active','completed','withdrawn')),
  enrolled_at timestamptz not null default now(),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(student_id, batch_id)
);

create table if not exists public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.school_batches(id) on delete cascade,
  trainer_id uuid references public.profiles(id) on delete set null,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','completed','cancelled')),
  topic text,
  meeting_link text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.class_sessions(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete restrict,
  status text not null check (status in ('present','absent','late','excused')),
  remarks text,
  marked_by uuid references public.profiles(id) on delete set null,
  marked_at timestamptz not null default now(),
  unique(session_id, student_id)
);

create table if not exists public.student_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  student_id uuid not null references public.students(id) on delete restrict,
  enrollment_id uuid references public.enrollments(id) on delete set null,
  issue_date date not null default current_date,
  due_date date,
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0),
  total_amount numeric(12,2) not null check (total_amount >= 0),
  status text not null default 'unpaid' check (status in ('unpaid','partially_paid','paid','void')),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.student_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.student_invoices(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  payment_date timestamptz not null default now(),
  method text not null check (method in ('cash','upi','bank_transfer','card','other')),
  reference_number text,
  received_by uuid references public.profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.trainer_payouts (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles(id) on delete restrict,
  batch_id uuid references public.school_batches(id) on delete set null,
  session_id uuid references public.class_sessions(id) on delete set null,
  amount numeric(12,2) not null check (amount >= 0),
  status text not null default 'pending' check (status in ('pending','approved','paid','cancelled')),
  paid_at timestamptz,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.school_audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_table text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists students_name_idx on public.students using gin (to_tsvector('simple', full_name));
create index if not exists students_phone_idx on public.students(phone);
create index if not exists enrollments_student_idx on public.enrollments(student_id);
create index if not exists enrollments_batch_idx on public.enrollments(batch_id);
create index if not exists sessions_batch_start_idx on public.class_sessions(batch_id, starts_at);
create index if not exists attendance_session_idx on public.attendance(session_id);
create index if not exists invoices_student_idx on public.student_invoices(student_id);
create index if not exists payments_invoice_idx on public.student_payments(invoice_id);
create index if not exists payouts_trainer_idx on public.trainer_payouts(trainer_id);

-- All ERP tables are protected by RLS. Admins operate school data; trainers
-- can read only batches they are assigned to and the associated class roster.
do $$
declare t text;
begin
  foreach t in array array['school_courses','students','school_batches','batch_trainers','enrollments','class_sessions','attendance','student_invoices','student_payments','trainer_payouts','school_audit_logs']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

drop policy if exists school_courses_admin_all on public.school_courses;
create policy school_courses_admin_all on public.school_courses for all to authenticated
using (public.is_school_admin()) with check (public.is_school_admin());

drop policy if exists students_admin_all on public.students;
create policy students_admin_all on public.students for all to authenticated
using (public.is_school_admin()) with check (public.is_school_admin());
drop policy if exists students_trainer_read on public.students;
create policy students_trainer_read on public.students for select to authenticated
using (exists (
  select 1 from public.enrollments e
  join public.batch_trainers bt on bt.batch_id = e.batch_id
  where e.student_id = students.id and bt.trainer_id = (select auth.uid())
));

drop policy if exists school_batches_admin_all on public.school_batches;
create policy school_batches_admin_all on public.school_batches for all to authenticated
using (public.is_school_admin()) with check (public.is_school_admin());
drop policy if exists school_batches_trainer_read on public.school_batches;
create policy school_batches_trainer_read on public.school_batches for select to authenticated
using (exists (select 1 from public.batch_trainers bt where bt.batch_id = school_batches.id and bt.trainer_id = (select auth.uid())));

drop policy if exists batch_trainers_admin_all on public.batch_trainers;
create policy batch_trainers_admin_all on public.batch_trainers for all to authenticated
using (public.is_school_admin()) with check (public.is_school_admin());
drop policy if exists batch_trainers_self_read on public.batch_trainers;
create policy batch_trainers_self_read on public.batch_trainers for select to authenticated
using (trainer_id = (select auth.uid()));

drop policy if exists enrollments_admin_all on public.enrollments;
create policy enrollments_admin_all on public.enrollments for all to authenticated
using (public.is_school_admin()) with check (public.is_school_admin());
drop policy if exists enrollments_trainer_read on public.enrollments;
create policy enrollments_trainer_read on public.enrollments for select to authenticated
using (exists (select 1 from public.batch_trainers bt where bt.batch_id = enrollments.batch_id and bt.trainer_id = (select auth.uid())));

drop policy if exists class_sessions_admin_all on public.class_sessions;
create policy class_sessions_admin_all on public.class_sessions for all to authenticated
using (public.is_school_admin()) with check (public.is_school_admin());
drop policy if exists class_sessions_trainer_all on public.class_sessions;
create policy class_sessions_trainer_all on public.class_sessions for all to authenticated
using (trainer_id = (select auth.uid()) and exists (select 1 from public.batch_trainers bt where bt.batch_id = class_sessions.batch_id and bt.trainer_id = (select auth.uid())))
with check (trainer_id = (select auth.uid()) and exists (select 1 from public.batch_trainers bt where bt.batch_id = class_sessions.batch_id and bt.trainer_id = (select auth.uid())));

drop policy if exists attendance_admin_all on public.attendance;
create policy attendance_admin_all on public.attendance for all to authenticated
using (public.is_school_admin()) with check (public.is_school_admin());
drop policy if exists attendance_trainer_all on public.attendance;
create policy attendance_trainer_all on public.attendance for all to authenticated
using (exists (select 1 from public.class_sessions cs join public.batch_trainers bt on bt.batch_id = cs.batch_id where cs.id = attendance.session_id and bt.trainer_id = (select auth.uid())))
with check (exists (select 1 from public.class_sessions cs join public.batch_trainers bt on bt.batch_id = cs.batch_id where cs.id = attendance.session_id and bt.trainer_id = (select auth.uid())));

drop policy if exists invoices_admin_all on public.student_invoices;
create policy invoices_admin_all on public.student_invoices for all to authenticated
using (public.is_school_admin()) with check (public.is_school_admin());
drop policy if exists payments_admin_all on public.student_payments;
create policy payments_admin_all on public.student_payments for all to authenticated
using (public.is_school_admin()) with check (public.is_school_admin());
drop policy if exists payouts_admin_all on public.trainer_payouts;
create policy payouts_admin_all on public.trainer_payouts for all to authenticated
using (public.is_school_admin()) with check (public.is_school_admin());
drop policy if exists audit_admin_read on public.school_audit_logs;
create policy audit_admin_read on public.school_audit_logs for select to authenticated
using (public.is_school_admin());

grant select, insert, update, delete on public.school_courses, public.students, public.school_batches, public.batch_trainers, public.enrollments, public.class_sessions, public.attendance, public.student_invoices, public.student_payments, public.trainer_payouts to authenticated;
grant select on public.school_audit_logs to authenticated;
grant usage, select on sequence public.school_audit_logs_id_seq to authenticated;
