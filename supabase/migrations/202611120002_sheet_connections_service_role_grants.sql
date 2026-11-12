-- The scheduled sync (Edge Function / web-server scheduler) reads due connections with the service role.
grant select, update on public.sheet_connections to service_role;
