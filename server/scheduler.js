import { createClient } from '@supabase/supabase-js';
import { runSync } from './sheets/service.js';

// Runs inside the always-on Node process, so it does not depend on any browser tab.
// Needs SUPABASE_SERVICE_ROLE_KEY in the server environment (never in VITE_* variables).
export function startScheduler() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log('[sheets] Scheduler disabled: SUPABASE_SERVICE_ROLE_KEY is not set on the server.');
    return null;
  }
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const { data: due } = await db.from('sheet_connections').select('id')
        .eq('sync_enabled', true).or(`next_sync_at.is.null,next_sync_at.lte.${new Date().toISOString()}`).limit(5);
      for (const c of due || []) {
        try { await runSync(db, c.id, 'scheduled'); } catch (e) { if (e?.code !== 'BUSY') console.error('[sheets] scheduled sync failed:', e?.code || e?.name); }
      }
    } catch (e) { console.error('[sheets] scheduler tick failed:', e?.name); } finally { busy = false; }
  };
  const timer = setInterval(tick, 60_000);
  timer.unref?.();
  setTimeout(tick, 10_000).unref?.();
  console.log('[sheets] Scheduler started (checks every 60s).');
  return timer;
}
