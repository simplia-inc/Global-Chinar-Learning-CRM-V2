// Runs due Google Sheets synchronisations. Called once a minute by a database timer (pg_cron) only when a sync is due.
// Authenticated with a shared secret kept in the database (verify_jwt is off because the caller is the database itself).
// Handles shared-link sheets. Private (service-account) sheets are synced by the web server scheduler.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { runSync } from './sheets/service.js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return json({ error: 'Function environment is incomplete' }, 500);
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: ok } = await db.rpc('verify_sheet_cron_secret', { p_secret: req.headers.get('x-cron-secret') ?? '' });
  if (ok !== true) return json({ error: 'Unauthorized' }, 401);

  const { data: due, error } = await db
    .from('sheet_connections')
    .select('id')
    .eq('sync_enabled', true)
    .eq('method', 'shared_link')
    .or(`next_sync_at.is.null,next_sync_at.lte.${new Date().toISOString()}`)
    .order('next_sync_at', { ascending: true, nullsFirst: true })
    .limit(5);
  if (error) return json({ error: 'Could not read connections' }, 500);

  const results: Array<Record<string, unknown>> = [];
  for (const c of due ?? []) {
    try {
      const r = await runSync(db, c.id, 'scheduled');
      results.push({ id: c.id, status: r.status, counts: r.counts });
    } catch (e) {
      // BUSY means another run is already in progress; anything else is recorded by runSync on the run itself.
      results.push({ id: c.id, error: (e as { code?: string }).code ?? 'ERROR' });
    }
  }
  return json({ ran: results.length, results });
});
