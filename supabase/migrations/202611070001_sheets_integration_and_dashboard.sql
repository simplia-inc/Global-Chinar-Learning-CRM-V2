-- Google Sheets lead sync + dashboard overview. Additive; no existing data is modified.

-- 1. Helpers ---------------------------------------------------------------
create or replace function public.norm_phone(p text) returns text
language sql immutable parallel safe set search_path = public as $$
  select right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 10)
$$;

create or replace function public.sheet_guard() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_school_admin() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
end $$;

-- 2. Tables ----------------------------------------------------------------
create table if not exists public.sheet_connections (
  id uuid primary key default gen_random_uuid(),
  name text,
  method text not null check (method in ('shared_link','service_account')),
  spreadsheet_id text not null check (spreadsheet_id ~ '^[A-Za-z0-9_-]{20,100}$'),
  worksheet_gid text not null default '0' check (worksheet_gid ~ '^[0-9]{1,12}$'),
  worksheet_title text,
  source_url text,
  headers jsonb not null default '[]'::jsonb,
  column_mapping jsonb not null default '{}'::jsonb,
  sync_enabled boolean not null default false,
  sync_interval_minutes integer not null default 60 check (sync_interval_minutes between 5 and 1440),
  status text not null default 'pending' check (status in ('pending','connected','error')),
  last_validated_at timestamptz,
  last_sync_at timestamptz,
  last_success_at timestamptz,
  next_sync_at timestamptz,
  last_error text,
  consecutive_failures integer not null default 0,
  sync_started_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (spreadsheet_id, worksheet_gid)
);

create table if not exists public.sheet_sync_runs (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.sheet_connections(id) on delete cascade,
  trigger text not null check (trigger in ('manual','scheduled','retry')),
  status text not null default 'running' check (status in ('running','success','partial','failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  rows_scanned integer not null default 0,
  rows_new integer not null default 0,
  rows_updated integer not null default 0,
  rows_unchanged integer not null default 0,
  rows_duplicates integer not null default 0,
  rows_invalid integer not null default 0,
  rows_failed integer not null default 0,
  error text,
  started_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.sheet_sync_errors (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.sheet_sync_runs(id) on delete cascade,
  connection_id uuid not null references public.sheet_connections(id) on delete cascade,
  row_number integer,
  error_type text not null check (error_type in ('invalid','duplicate','failed')),
  message text not null,
  existing_lead_id uuid references public.leads(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists sheet_runs_conn_idx on public.sheet_sync_runs(connection_id, started_at desc);
create index if not exists sheet_errors_run_idx on public.sheet_sync_errors(run_id);
create index if not exists sheet_errors_conn_idx on public.sheet_sync_errors(connection_id);
create index if not exists sheet_errors_lead_idx on public.sheet_sync_errors(existing_lead_id);
create index if not exists sheet_conn_creator_idx on public.sheet_connections(created_by);

drop trigger if exists set_updated_at on public.sheet_connections;
create trigger set_updated_at before update on public.sheet_connections for each row execute function public.set_updated_at();

-- 3. Lead columns for sheet identity ----------------------------------------
alter table public.leads
  add column if not exists sheet_connection_id uuid references public.sheet_connections(id) on delete set null,
  add column if not exists external_key text,
  add column if not exists sheet_row_number integer,
  add column if not exists sheet_row_hash text,
  add column if not exists sheet_notes text,
  add column if not exists sheet_synced_at timestamptz;
create unique index if not exists leads_sheet_identity_idx on public.leads(sheet_connection_id, external_key) where external_key is not null;
create index if not exists leads_sheet_conn_idx on public.leads(sheet_connection_id);
create index if not exists leads_phone_norm_idx on public.leads (public.norm_phone(phone));
create index if not exists leads_email_lower_idx on public.leads (lower(email));

-- Staff cannot forge or alter the sheet identity columns through the API.
create or replace function public.protect_sheet_columns() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.sheet_connection_id := null; new.external_key := null; new.sheet_row_number := null;
      new.sheet_row_hash := null; new.sheet_notes := null; new.sheet_synced_at := null;
    elsif (new.sheet_connection_id, new.external_key, new.sheet_row_number, new.sheet_row_hash, new.sheet_notes, new.sheet_synced_at)
          is distinct from (old.sheet_connection_id, old.external_key, old.sheet_row_number, old.sheet_row_hash, old.sheet_notes, old.sheet_synced_at) then
      raise exception 'Sheet-managed columns cannot be edited directly' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists protect_sheet_columns on public.leads;
create trigger protect_sheet_columns before insert or update on public.leads for each row execute function public.protect_sheet_columns();

-- 4. RLS / grants (admin only) ---------------------------------------------
alter table public.sheet_connections enable row level security;
alter table public.sheet_sync_runs enable row level security;
alter table public.sheet_sync_errors enable row level security;
revoke all on public.sheet_connections, public.sheet_sync_runs, public.sheet_sync_errors from anon, authenticated;
grant select, insert, update, delete on public.sheet_connections to authenticated;
grant select on public.sheet_sync_runs, public.sheet_sync_errors to authenticated;
revoke all on sequence public.sheet_sync_errors_id_seq from authenticated;

drop policy if exists sheet_connections_admin on public.sheet_connections;
create policy sheet_connections_admin_select on public.sheet_connections for select to authenticated using (public.is_school_admin());
create policy sheet_connections_admin_insert on public.sheet_connections for insert to authenticated with check (public.is_school_admin());
create policy sheet_connections_admin_update on public.sheet_connections for update to authenticated using (public.is_school_admin()) with check (public.is_school_admin());
create policy sheet_connections_admin_delete on public.sheet_connections for delete to authenticated using (public.is_school_admin());
create policy sheet_runs_admin_select on public.sheet_sync_runs for select to authenticated using (public.is_school_admin());
create policy sheet_errors_admin_select on public.sheet_sync_errors for select to authenticated using (public.is_school_admin());

-- 5. Sync RPCs (SECURITY DEFINER, admin or service role only) ----------------
create or replace function public.start_sheet_run(p_connection uuid, p_trigger text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_run uuid;
begin
  perform public.sheet_guard();
  update public.sheet_connections set sync_started_at = now()
   where id = p_connection and (sync_started_at is null or sync_started_at < now() - interval '10 minutes');
  if not found then
    if exists (select 1 from public.sheet_connections where id = p_connection) then
      raise exception 'A synchronisation is already running for this connection' using errcode = '55P03';
    end if;
    raise exception 'Connection not found' using errcode = 'P0002';
  end if;
  insert into public.sheet_sync_runs(connection_id, trigger, status, started_by)
  values (p_connection, p_trigger, 'running', auth.uid()) returning id into v_run;
  return v_run;
end $$;

create or replace function public.record_sheet_errors(p_run uuid, p_errors jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.sheet_guard();
  insert into public.sheet_sync_errors(run_id, connection_id, row_number, error_type, message)
  select p_run, r.connection_id, x.row_number, x.error_type, left(x.message, 300)
    from jsonb_to_recordset(p_errors) as x(row_number int, error_type text, message text)
    join public.sheet_sync_runs r on r.id = p_run
   where x.error_type in ('invalid', 'duplicate', 'failed');
end $$;

create or replace function public.apply_sheet_rows(p_run uuid, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_conn uuid; x record; l record; d record;
  n_new int := 0; n_upd int := 0; n_same int := 0; n_dup int := 0; n_inv int := 0; n_fail int := 0;
  v_status text; v_priority text; v_phone_norm text;
begin
  perform public.sheet_guard();
  select connection_id into v_conn from public.sheet_sync_runs where id = p_run and status = 'running';
  if v_conn is null then raise exception 'Sync run is not active' using errcode = 'P0002'; end if;

  for x in select * from jsonb_to_recordset(p_rows) as t(
      row_number int, key text, full_name text, email text, phone text, course text,
      source text, notes text, status text, priority text, hash text)
  loop
    begin
      if x.key is null or length(trim(x.key)) = 0 or x.full_name is null or length(trim(x.full_name)) = 0
         or (coalesce(trim(x.phone), '') = '' and coalesce(trim(x.email), '') = '') then
        n_inv := n_inv + 1;
        insert into public.sheet_sync_errors(run_id, connection_id, row_number, error_type, message)
        values (p_run, v_conn, x.row_number, 'invalid', 'Missing name, or neither phone nor email, or no usable identifier');
        continue;
      end if;

      select id, sheet_row_hash, notes, sheet_notes into l
        from public.leads where sheet_connection_id = v_conn and external_key = x.key;

      if found then
        if l.sheet_row_hash is not distinct from x.hash then
          update public.leads set sheet_synced_at = now(), sheet_row_number = x.row_number where id = l.id;
          n_same := n_same + 1;
        else
          -- Only sheet-owned contact fields change. Status, priority, assignment and follow-ups are CRM-managed.
          update public.leads set
            full_name = trim(x.full_name),
            email = nullif(trim(x.email), ''),
            phone = nullif(trim(x.phone), ''),
            interested_course = nullif(trim(x.course), ''),
            source = coalesce(nullif(trim(x.source), ''), source),
            notes = case when notes is not distinct from sheet_notes then nullif(trim(x.notes), '') else notes end,
            sheet_notes = nullif(trim(x.notes), ''),
            sheet_row_hash = x.hash, sheet_row_number = x.row_number, sheet_synced_at = now()
          where id = l.id;
          n_upd := n_upd + 1;
        end if;
      else
        v_phone_norm := public.norm_phone(x.phone);
        select id into d from public.leads
         where (length(v_phone_norm) >= 7 and public.norm_phone(phone) = v_phone_norm)
            or (coalesce(trim(x.email), '') <> '' and lower(email) = lower(trim(x.email)))
         limit 1;
        if found then
          n_dup := n_dup + 1;
          insert into public.sheet_sync_errors(run_id, connection_id, row_number, error_type, message, existing_lead_id)
          values (p_run, v_conn, x.row_number, 'duplicate', 'Phone or email matches an existing CRM lead; not imported. Review the existing lead.', d.id);
        else
          v_status := case when x.status in ('new','contacted','follow_up','qualified','converted','lost') then x.status else 'new' end;
          v_priority := case when x.priority in ('low','normal','high') then x.priority else 'normal' end;
          insert into public.leads(full_name, email, phone, interested_course, source, notes, status, priority,
                                   created_by, sheet_connection_id, external_key, sheet_row_number, sheet_row_hash, sheet_notes, sheet_synced_at)
          values (trim(x.full_name), nullif(trim(x.email), ''), nullif(trim(x.phone), ''), nullif(trim(x.course), ''),
                  coalesce(nullif(trim(x.source), ''), 'Google Sheet'), nullif(trim(x.notes), ''), v_status, v_priority,
                  auth.uid(), v_conn, x.key, x.row_number, x.hash, nullif(trim(x.notes), ''), now());
          n_new := n_new + 1;
        end if;
      end if;
    exception when others then
      n_fail := n_fail + 1;
      insert into public.sheet_sync_errors(run_id, connection_id, row_number, error_type, message)
      values (p_run, v_conn, x.row_number, 'failed', left(sqlerrm, 300));
    end;
  end loop;
  return jsonb_build_object('new', n_new, 'updated', n_upd, 'unchanged', n_same, 'duplicates', n_dup, 'invalid', n_inv, 'failed', n_fail);
end $$;

create or replace function public.finish_sheet_run(p_run uuid, p_status text, p_counts jsonb, p_error text) returns void
language plpgsql security definer set search_path = public as $$
declare v_conn uuid;
begin
  perform public.sheet_guard();
  if p_status not in ('success', 'partial', 'failed') then raise exception 'Invalid status'; end if;
  update public.sheet_sync_runs set status = p_status, finished_at = now(),
    rows_scanned = coalesce((p_counts->>'scanned')::int, 0), rows_new = coalesce((p_counts->>'new')::int, 0),
    rows_updated = coalesce((p_counts->>'updated')::int, 0), rows_unchanged = coalesce((p_counts->>'unchanged')::int, 0),
    rows_duplicates = coalesce((p_counts->>'duplicates')::int, 0), rows_invalid = coalesce((p_counts->>'invalid')::int, 0),
    rows_failed = coalesce((p_counts->>'failed')::int, 0), error = left(p_error, 500)
  where id = p_run and status = 'running' returning connection_id into v_conn;
  if v_conn is null then return; end if;
  update public.sheet_connections c set
    sync_started_at = null, last_sync_at = now(),
    last_success_at = case when p_status in ('success', 'partial') then now() else c.last_success_at end,
    consecutive_failures = case when p_status = 'failed' then c.consecutive_failures + 1 else 0 end,
    status = case when p_status = 'failed' then 'error' else 'connected' end,
    last_error = case when p_status = 'failed' then left(p_error, 500) else null end,
    next_sync_at = case
      when not c.sync_enabled then null
      when p_status = 'failed' then now() + make_interval(mins => least(c.sync_interval_minutes, 5 * power(2, least(c.consecutive_failures, 6))::int))
      else now() + make_interval(mins => c.sync_interval_minutes) end
  where c.id = v_conn;
end $$;

revoke all on function public.sheet_guard(), public.start_sheet_run(uuid, text), public.record_sheet_errors(uuid, jsonb),
  public.apply_sheet_rows(uuid, jsonb), public.finish_sheet_run(uuid, text, jsonb, text) from public, anon;
grant execute on function public.start_sheet_run(uuid, text), public.record_sheet_errors(uuid, jsonb),
  public.apply_sheet_rows(uuid, jsonb), public.finish_sheet_run(uuid, text, jsonb, text) to authenticated, service_role;
grant execute on function public.sheet_guard() to authenticated, service_role;
revoke all on function public.protect_sheet_columns() from public, anon, authenticated;

-- 6. Dashboard (SECURITY INVOKER: every figure respects the caller's RLS) ----
create or replace function public.dashboard_overview() returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v_tz constant text := 'Asia/Kolkata';
  v_start timestamptz := date_trunc('day', now() at time zone v_tz) at time zone v_tz;
  v_end timestamptz := (date_trunc('day', now() at time zone v_tz) + interval '1 day') at time zone v_tz;
  v_month timestamptz := date_trunc('month', now() at time zone v_tz) at time zone v_tz;
  v_admin boolean := public.is_school_admin();
  v jsonb;
begin
  v := jsonb_build_object(
    'role', public.current_app_role(),
    'leads', (select jsonb_build_object('total', count(*), 'new', count(*) filter (where status = 'new'),
        'contacted', count(*) filter (where status = 'contacted'), 'follow_up', count(*) filter (where status = 'follow_up'),
        'qualified', count(*) filter (where status = 'qualified'), 'converted', count(*) filter (where status = 'converted'),
        'lost', count(*) filter (where status = 'lost')) from public.leads),
    'followups', (select jsonb_build_object(
        'due_today', count(*) filter (where status = 'pending' and scheduled_at >= v_start and scheduled_at < v_end),
        'overdue', count(*) filter (where status = 'pending' and scheduled_at < v_start)) from public.follow_ups),
    'students', (select jsonb_build_object('total', count(*), 'active', count(*) filter (where status = 'active')) from public.students),
    'courses_active', (select count(*) from public.school_courses where is_active),
    'batches_active', (select count(*) from public.school_batches where status = 'ongoing'),
    'classes_today', (select count(*) from public.class_sessions where starts_at >= v_start and starts_at < v_end and status <> 'cancelled'),
    'attendance_today', (select jsonb_build_object('present', count(*) filter (where a.status = 'present'),
        'late', count(*) filter (where a.status = 'late'), 'absent', count(*) filter (where a.status = 'absent'),
        'excused', count(*) filter (where a.status = 'excused'), 'marked', count(*))
        from public.attendance a join public.class_sessions s on s.id = a.session_id
        where s.starts_at >= v_start and s.starts_at < v_end),
    'admissions_30d', (select count(*) from public.students where admission_date >= (now() at time zone v_tz)::date - 30),
    'recent_leads', coalesce((select jsonb_agg(t) from (
        select l.id, l.full_name, l.phone, l.email, l.interested_course, l.source, l.status, l.priority, l.created_at,
               p.full_name as assigned_name
          from public.leads l left join public.profiles p on p.id = l.assigned_to
         order by l.created_at desc limit 6) t), '[]'::jsonb),
    'upcoming_followups', coalesce((select jsonb_agg(t) from (
        select f.id, f.lead_id, l.full_name as lead_name, f.scheduled_at, f.follow_up_type,
               (f.scheduled_at < v_start) as is_overdue
          from public.follow_ups f join public.leads l on l.id = f.lead_id
         where f.status = 'pending' order by f.scheduled_at asc limit 6) t), '[]'::jsonb),
    'recent_admissions', coalesce((select jsonb_agg(t) from (
        select s.id, s.full_name, s.student_code, s.admission_date, s.status,
               (select c.name from public.enrollments e join public.school_batches b on b.id = e.batch_id
                  join public.school_courses c on c.id = b.course_id
                 where e.student_id = s.id order by e.enrolled_at desc limit 1) as course_name
          from public.students s order by s.admission_date desc, s.created_at desc limit 5) t), '[]'::jsonb),
    'upcoming_classes', coalesce((select jsonb_agg(t) from (
        select s.id, s.title, s.starts_at, s.ends_at, b.name as batch_name, p.full_name as trainer_name
          from public.class_sessions s join public.school_batches b on b.id = s.batch_id
          left join public.profiles p on p.id = s.trainer_id
         where s.status = 'scheduled' and s.ends_at >= now() order by s.starts_at asc limit 5) t), '[]'::jsonb),
    'lead_sources', coalesce((select jsonb_agg(t) from (
        select coalesce(nullif(trim(source), ''), 'Unknown') as source, count(*) as count
          from public.leads group by 1 order by 2 desc limit 8) t), '[]'::jsonb)
  );

  if v_admin then
    v := v || jsonb_build_object(
      'fees', jsonb_build_object(
        'collected_total', coalesce((select sum(case when entry_type = 'payment' then amount else -amount end) from public.student_payments), 0),
        'collected_month', coalesce((select sum(case when entry_type = 'payment' then amount else -amount end) from public.student_payments where payment_date >= v_month), 0),
        'outstanding', coalesce((select sum(greatest(i.total_amount - coalesce(pd.paid, 0), 0))
            from public.student_invoices i
            left join (select invoice_id, sum(case when entry_type = 'payment' then amount else -amount end) paid
                         from public.student_payments group by invoice_id) pd on pd.invoice_id = i.id
           where i.status <> 'void'), 0)),
      'recent_payments', coalesce((select jsonb_agg(t) from (
          select pay.id, pay.amount, pay.entry_type, pay.method, pay.payment_date, s.full_name as student_name, i.invoice_number
            from public.student_payments pay join public.students s on s.id = pay.student_id
            join public.student_invoices i on i.id = pay.invoice_id
           order by pay.payment_date desc limit 5) t), '[]'::jsonb),
      'employee_performance', coalesce((select jsonb_agg(t) from (
          select p.id, p.full_name, count(l.id) as total,
                 count(*) filter (where l.status = 'converted') as converted,
                 count(*) filter (where l.status in ('new', 'contacted', 'follow_up', 'qualified')) as open,
                 (select count(*) from public.follow_ups f where f.employee_id = p.id and f.status = 'pending' and f.scheduled_at < v_start) as overdue_followups
            from public.leads l join public.profiles p on p.id = l.assigned_to
           group by p.id, p.full_name order by count(l.id) desc limit 8) t), '[]'::jsonb));
  end if;
  return v;
end $$;
revoke all on function public.dashboard_overview() from public, anon;
grant execute on function public.dashboard_overview() to authenticated;
