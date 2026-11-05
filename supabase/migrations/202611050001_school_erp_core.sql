-- Global Chinar Digital Marketing School ERP foundation
-- Additive migration: preserves existing CRM tables and records.
-- Apply manually in the intended Supabase project's SQL Editor after reviewing.

create extension if not exists pgcrypto;

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique,
  description text,
  duration_weeks integer check (duration_weeks is null or duration_weeks > 0),
  fee_amount numeric(12,2) not null default 0 check (fee_amount >= 0),
  is_active boolean not null default true,
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
  date_of_birth date,
  gender text,
  address text,
  guardian_name text,
  guardian_phone text,
  admission_date date not null default current_date,
  status text not null default 'active' check (status in ('active','completed','paused','dropped')),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.batches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  course_id uuid not null references public.courses(id) on delete restrict,
  trainer_id uuid references public.profiles(id) on delete set null,
  start_date date,
  end_date date,
  schedule_days text[] not null default '{}',
  start_time time,
  end_time time,
  capacity integer check (capacity is null or capacity > 0),
  status text not null default 'planned' check (status in ('planned','ongoing','completed','cancelled')),
  room text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date),
  check (end_time is null or start_time is null or end_time > start_time)
);

create table if not exists public.enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete restrict,
  course_id uuid not null references public.courses(id) on delete restrict,
  batch_id uuid references public.batches(id) on delete set null,
  enrolled_on date not null default current_date,
  agreed_fee numeric(12,2) not null default 0 check (agreed_fee >= 0),
  discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0),
  status text not null default 'active' check (status in ('active','completed','paused','withdrawn')),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.batches(id) on delete cascade,
  trainer_id uuid references public.profiles(id) on delete set null,
  title text not null,
  session_date date not null,
  start_time time,
  end_time time,
  topic text,
  meeting_url text,
  status text not null default 'scheduled' check (status in ('scheduled','completed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time is null or start_time is null or end_time > start_time)
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.class_sessions(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete restrict,
  status text not null check (status in ('present','absent','late','excused')),
  remarks text,
  marked_by uuid references public.profiles(id) on delete set null,
  marked_at timestamptz not null default now(),
  unique (session_id, student_id)
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  student_id uuid not null references public.students(id) on delete restrict,
  enrollment_id uuid references public.enrollments(id) on delete set null,
  issue_date date not null default current_date,
  due_date date,
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0),
  tax_amount numeric(12,2) not null default 0 check (tax_amount >= 0),
  total_amount numeric(12,2) not null default 0 check (total_amount >= 0),
  status text not null default 'unpaid' check (status in ('unpaid','partially_paid','paid','void')),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_date is null or due_date >= issue_date)
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  payment_date date not null default current_date,
  payment_method text not null default 'cash' check (payment_method in ('cash','bank_transfer','upi','card','other')),
  transaction_reference text,
  received_by uuid references public.profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.trainer_payouts (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles(id) on delete restrict,
  batch_id uuid references public.batches(id) on delete set null,
  session_id uuid references public.class_sessions(id) on delete set null,
  amount numeric(12,2) not null check (amount >= 0),
  payout_date date,
  status text not null default 'pending' check (status in ('pending','approved','paid','cancelled')),
  payment_reference text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.certificates (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete restrict,
  enrollment_id uuid references public.enrollments(id) on delete set null,
  certificate_number text not null unique,
  issued_on date not null default current_date,
  course_title text not null,
  grade text,
  file_url text,
  status text not null default 'issued' check (status in ('issued','revoked')),
  issued_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_students_name on public.students using gin (to_tsvector('simple', full_name));
create index if not exists idx_students_phone on public.students (phone);
create index if not exists idx_batches_course_status on public.batches (course_id, status);
create index if not exists idx_batches_trainer on public.batches (trainer_id);
create index if not exists idx_enrollments_student on public.enrollments (student_id);
create index if not exists idx_enrollments_batch on public.enrollments (batch_id);
create index if not exists idx_sessions_batch_date on public.class_sessions (batch_id, session_date);
create index if not exists idx_attendance_student on public.attendance (student_id);
create index if not exists idx_invoices_student_status on public.invoices (student_id, status);
create index if not exists idx_payments_invoice on public.payments (invoice_id);
create index if not exists idx_payouts_trainer_status on public.trainer_payouts (trainer_id, status);
create index if not exists idx_audit_logs_created on public.audit_logs (created_at desc);

-- Keep updated_at consistent for mutable ERP records.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['courses','students','batches','enrollments','class_sessions','invoices','trainer_payouts'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- Enable RLS on all new tables. No anon/public access is granted.
alter table public.courses enable row level security;
alter table public.students enable row level security;
alter table public.batches enable row level security;
alter table public.enrollments enable row level security;
alter table public.class_sessions enable row level security;
alter table public.attendance enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;
alter table public.trainer_payouts enable row level security;
alter table public.certificates enable row level security;
alter table public.audit_logs enable row level security;

-- Admins have full operational access. Authenticated employees can work with
-- academic/admissions records; finance and audit remain admin-only.
do $$
declare t text;
begin
  foreach t in array array['courses','students','batches','enrollments','class_sessions','attendance','invoices','payments','trainer_payouts','certificates','audit_logs'] loop
    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in (''super_admin'',''admin''))) with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in (''super_admin'',''admin'')))',
      t || '_admin_all', t
    );
  end loop;
end $$;

create policy courses_staff_read on public.courses for select to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active and p.role in ('employee','trainer')));

create policy students_staff_read on public.students for select to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active and p.role in ('employee','trainer')));

create policy students_employee_insert on public.students for insert to authenticated
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active and p.role = 'employee'));

create policy students_employee_update on public.students for update to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active and p.role = 'employee'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active and p.role = 'employee'));

create policy batches_staff_read on public.batches for select to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active and p.role in ('employee','trainer')));

create policy sessions_staff_read on public.class_sessions for select to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active and p.role in ('employee','trainer')));

create policy attendance_staff_read on public.attendance for select to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active and p.role in ('employee','trainer')));

create policy attendance_trainer_mark on public.attendance for insert to authenticated
with check (
  exists (
    select 1 from public.profiles p
    join public.class_sessions s on s.id = session_id
    join public.batches b on b.id = s.batch_id
    where p.id = auth.uid() and p.is_active and p.role = 'trainer'
      and (s.trainer_id = auth.uid() or b.trainer_id = auth.uid())
  )
);

create policy attendance_trainer_update on public.attendance for update to authenticated
using (
  exists (
    select 1 from public.profiles p
    join public.class_sessions s on s.id = session_id
    join public.batches b on b.id = s.batch_id
    where p.id = auth.uid() and p.is_active and p.role = 'trainer'
      and (s.trainer_id = auth.uid() or b.trainer_id = auth.uid())
  )
)
with check (
  exists (
    select 1 from public.profiles p
    join public.class_sessions s on s.id = session_id
    join public.batches b on b.id = s.batch_id
    where p.id = auth.uid() and p.is_active and p.role = 'trainer'
      and (s.trainer_id = auth.uid() or b.trainer_id = auth.uid())
  )
);

create policy certificates_staff_read on public.certificates for select to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active and p.role in ('employee','trainer')));
