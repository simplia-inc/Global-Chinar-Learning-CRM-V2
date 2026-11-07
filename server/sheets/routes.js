import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { parseSheetUrl, SheetError } from './url.js';
import { fetchPublicTable, fetchPublicTabs, fetchPrivateTable, loadServiceAccount } from './fetchers.js';
import { suggestMapping, validateMapping } from './mapping.js';
import { runSync } from './service.js';

const supaUrl = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const anonKey = () => process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Tiny in-memory rate limiter (per user, 30 requests/minute).
const hits = new Map();
function rateLimited(userId) {
  const now = Date.now();
  const arr = (hits.get(userId) || []).filter((t) => now - t < 60000);
  arr.push(now); hits.set(userId, arr);
  return arr.length > 30;
}

async function authenticate(req, res, next) {
  if (!supaUrl() || !anonKey()) return res.status(503).json({ error: 'Server is missing SUPABASE_URL / SUPABASE_ANON_KEY.' });
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Sign in required.' });
  const client = createClient(supaUrl(), anonKey(), { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: u, error } = await client.auth.getUser(token);
  if (error || !u?.user) return res.status(401).json({ error: 'Session expired. Sign in again.' });
  const { data: isAdmin } = await client.rpc('is_school_admin');
  if (isAdmin !== true) return res.status(403).json({ error: 'Only Admin or Super Admin can manage the Google Sheets integration.' });
  if (rateLimited(u.user.id)) return res.status(429).json({ error: 'Too many requests. Wait a minute.' });
  req.db = client; req.userId = u.user.id;
  next();
}

const fail = (res, e) => {
  if (e instanceof SheetError) {
    const status = { BAD_URL: 400, ACCESS_DENIED: 422, NOT_FOUND: 404, MAPPING: 422, EMPTY: 422, BUSY: 409, NO_SERVICE_ACCOUNT: 422, AUTH: 502, NETWORK: 502, TEMPORARY: 502, TOO_LARGE: 413 }[e.code] || 500;
    return res.status(status).json({ error: e.message, code: e.code });
  }
  console.error('[sheets] route error:', e?.name);
  return res.status(500).json({ error: 'Unexpected server error.' });
};

async function inspect(method, spreadsheetId, gid) {
  if (method === 'service_account') {
    const r = await fetchPrivateTable(spreadsheetId, gid, loadServiceAccount());
    return { title: r.title, tabs: r.tabs, tabTitle: r.tab.title, table: r.table };
  }
  const [table, meta] = await Promise.all([fetchPublicTable(spreadsheetId, gid), fetchPublicTabs(spreadsheetId)]);
  const tabTitle = meta.tabs.find((t) => t.gid === gid)?.title || null;
  return { title: meta.title, tabs: meta.tabs, tabTitle, table };
}

const summarise = (info) => {
  const headers = (info.table[0] || []).map((h) => String(h ?? '').trim());
  return {
    title: info.title, tabs: info.tabs, worksheetTitle: info.tabTitle, headers,
    rowCount: Math.max(0, info.table.length - 1), suggestedMapping: suggestMapping(headers),
  };
};

export function sheetsRouter() {
  const r = express.Router();
  r.use(express.json({ limit: '50kb' }));
  r.use(authenticate);

  r.get('/capabilities', (req, res) => {
    const sa = loadServiceAccount();
    res.json({
      serviceAccountConfigured: Boolean(sa), serviceAccountEmail: sa?.email || null,
      schedulerAvailable: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    });
  });

  r.post('/validate', async (req, res) => {
    try {
      const method = req.body?.method === 'service_account' ? 'service_account' : 'shared_link';
      const { spreadsheetId, gid } = parseSheetUrl(req.body?.url);
      const useGid = /^[0-9]{1,12}$/.test(String(req.body?.gid ?? '')) ? String(req.body.gid) : gid;
      const info = await inspect(method, spreadsheetId, useGid);
      res.json({ ok: true, method, spreadsheetId, gid: useGid, ...summarise(info) });
    } catch (e) { fail(res, e); }
  });

  r.post('/connect', async (req, res) => {
    try {
      const method = req.body?.method === 'service_account' ? 'service_account' : 'shared_link';
      const { spreadsheetId, gid: urlGid, canonicalUrl } = parseSheetUrl(req.body?.url);
      const gid = /^[0-9]{1,12}$/.test(String(req.body?.gid ?? '')) ? String(req.body.gid) : urlGid;
      const info = await inspect(method, spreadsheetId, gid);
      const s = summarise(info);
      const { data: existing } = await req.db.from('sheet_connections').select('id, column_mapping')
        .eq('spreadsheet_id', spreadsheetId).eq('worksheet_gid', gid).maybeSingle();
      const provided = req.body?.mapping && typeof req.body.mapping === 'object' ? req.body.mapping : null;
      // Re-connecting never overwrites a mapping the admin already saved.
      const mapping = provided || (existing && Object.keys(existing.column_mapping || {}).length ? existing.column_mapping : s.suggestedMapping);
      const row = {
        name: s.title, method, spreadsheet_id: spreadsheetId, worksheet_gid: gid, worksheet_title: s.worksheetTitle,
        source_url: canonicalUrl, headers: s.headers, column_mapping: mapping, status: 'connected',
        last_validated_at: new Date().toISOString(), last_error: null,
      };
      const q = existing
        ? req.db.from('sheet_connections').update(row).eq('id', existing.id)
        : req.db.from('sheet_connections').insert({ ...row, created_by: req.userId });
      const { data, error } = await q.select().single();
      if (error) throw new SheetError('DB', error.message);
      res.json({ ok: true, connection: data, ...s });
    } catch (e) { fail(res, e); }
  });

  r.post('/:id/mapping', async (req, res) => {
    try {
      if (!UUID.test(req.params.id)) throw new SheetError('BAD_URL', 'Invalid id.');
      const { data: conn } = await req.db.from('sheet_connections').select('headers').eq('id', req.params.id).maybeSingle();
      if (!conn) throw new SheetError('NOT_FOUND', 'Connection not found.');
      const mapping = Object.fromEntries(Object.entries(req.body?.mapping || {}).filter(([, v]) => typeof v === 'string' && v));
      const errs = validateMapping(mapping, conn.headers || []);
      if (errs.length) throw new SheetError('MAPPING', errs.join('; '));
      const { error } = await req.db.from('sheet_connections').update({ column_mapping: mapping }).eq('id', req.params.id);
      if (error) throw new SheetError('DB', error.message);
      res.json({ ok: true });
    } catch (e) { fail(res, e); }
  });

  r.post('/:id/settings', async (req, res) => {
    try {
      if (!UUID.test(req.params.id)) throw new SheetError('BAD_URL', 'Invalid id.');
      const interval = Number(req.body?.sync_interval_minutes);
      if (!Number.isInteger(interval) || interval < 5 || interval > 1440) throw new SheetError('BAD_URL', 'Interval must be between 5 and 1440 minutes.');
      const enabled = req.body?.sync_enabled === true;
      const { error } = await req.db.from('sheet_connections').update({
        sync_enabled: enabled, sync_interval_minutes: interval, next_sync_at: enabled ? new Date().toISOString() : null,
      }).eq('id', req.params.id);
      if (error) throw new SheetError('DB', error.message);
      res.json({ ok: true });
    } catch (e) { fail(res, e); }
  });

  r.post('/:id/sync', async (req, res) => {
    try {
      if (!UUID.test(req.params.id)) throw new SheetError('BAD_URL', 'Invalid id.');
      const trigger = req.body?.retry === true ? 'retry' : 'manual';
      res.json(await runSync(req.db, req.params.id, trigger));
    } catch (e) { fail(res, e); }
  });

  r.delete('/:id', async (req, res) => {
    try {
      if (!UUID.test(req.params.id)) throw new SheetError('BAD_URL', 'Invalid id.');
      const { error } = await req.db.from('sheet_connections').delete().eq('id', req.params.id);
      if (error) throw new SheetError('DB', error.message);
      res.json({ ok: true }); // imported leads are kept; only the link is removed
    } catch (e) { fail(res, e); }
  });

  return r;
}
