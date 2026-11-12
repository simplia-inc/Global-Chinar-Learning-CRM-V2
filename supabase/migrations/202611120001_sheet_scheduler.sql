-- Automatic Google Sheets synchronisation that runs inside Supabase (no server secret needed on the web host).
-- A once-a-minute timer calls the `sheet-sync` Edge Function, but only when a connection is actually due.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- Shared secret between the timer and the function. Locked down: no API role can read it.
create table if not exists public.sheet_scheduler_config (
  id integer primary key default 1 check (id = 1),
  secret text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now()
);
insert into public.sheet_scheduler_config(id) values (1) on conflict do nothing;
alter table public.sheet_scheduler_config enable row level security;
revoke all on public.sheet_scheduler_config from anon, authenticated;

create or replace function public.verify_sheet_cron_secret(p_secret text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.sheet_scheduler_config where id = 1 and secret = p_secret and length(coalesce(p_secret, '')) >= 32)
$$;
revoke all on function public.verify_sheet_cron_secret(text) from public, anon, authenticated;
grant execute on function public.verify_sheet_cron_secret(text) to service_role;

-- Lets the CRM page know whether automatic sync is available.
create or replace function public.sheet_scheduler_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.sheet_guard();
  return jsonb_build_object('active', exists (select 1 from cron.job where jobname = 'sheet-sync' and active));
end $$;
revoke all on function public.sheet_scheduler_status() from public, anon;
grant execute on function public.sheet_scheduler_status() to authenticated, service_role;

do $$ begin perform cron.unschedule('sheet-sync'); exception when others then null; end $$;
select cron.schedule('sheet-sync', '* * * * *', $cmd$
  select net.http_post(
    url := 'https://wdyhepnaaxjdnyxtfpfl.supabase.co/functions/v1/sheet-sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select secret from public.sheet_scheduler_config where id = 1)),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000)
  where exists (select 1 from public.sheet_connections
                 where sync_enabled and method = 'shared_link' and (next_sync_at is null or next_sync_at <= now()))
$cmd$);
