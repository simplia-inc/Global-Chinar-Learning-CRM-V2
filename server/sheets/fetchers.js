import { createSign } from 'node:crypto';
import { SheetError, assertIds } from './url.js';
import { parseCsv } from './csv.js';

const MAX_BYTES = 10 * 1024 * 1024;
const TIMEOUT_MS = 20000;
const UA = 'GlobalChinarCRM-SheetSync/1.0';

const isAllowedHost = (h) => h === 'docs.google.com' || /^[a-z0-9-]+\.googleusercontent\.com$/.test(h);

export async function withRetry(fn, attempts = 3, baseMs = 800) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); } catch (e) {
      last = e;
      if (!(e instanceof SheetError) || !e.retryable || i === attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, baseMs * 2 ** i));
    }
  }
  throw last;
}

// Follows redirects manually and only to Google hosts; never to anything user-supplied.
async function safeGet(url, { fetchImpl = fetch, headers = {} } = {}) {
  let current = url;
  for (let hop = 0; hop < 5; hop++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res;
    try {
      res = await fetchImpl(current, { redirect: 'manual', signal: ctrl.signal, headers: { 'User-Agent': UA, ...headers } });
    } catch {
      throw new SheetError('NETWORK', 'Could not reach Google. This is usually temporary.', { retryable: true });
    } finally { clearTimeout(timer); }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      let next;
      try { next = new URL(loc, current); } catch { throw new SheetError('ACCESS_DENIED', 'Unexpected redirect from Google.'); }
      if (next.hostname === 'accounts.google.com') {
        throw new SheetError('ACCESS_DENIED', 'This spreadsheet is private. Set Share → General access → "Anyone with the link" → Viewer, or use the private (service account) method.');
      }
      if (next.protocol !== 'https:' || !isAllowedHost(next.hostname)) {
        throw new SheetError('ACCESS_DENIED', 'Google redirected to an unsupported address; request blocked.');
      }
      current = next.toString();
      continue;
    }
    return res;
  }
  throw new SheetError('NETWORK', 'Too many redirects from Google.');
}

export async function readLimited(res) {
  const len = Number(res.headers.get('content-length') || 0);
  if (len > MAX_BYTES) throw new SheetError('TOO_LARGE', 'The worksheet is larger than 10 MB.');
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new SheetError('TOO_LARGE', 'The worksheet is larger than 10 MB.');
  return text;
}

// Method A: public "Anyone with the link" CSV export.
async function fetchCsv(url, opts) {
  return withRetry(async () => {
    const res = await safeGet(url, opts);
    if (res.status === 401 || res.status === 403) {
      throw new SheetError('ACCESS_DENIED', 'Access denied. The owner must set Share → General access → "Anyone with the link" → Viewer.');
    }
    if (res.status === 404 || res.status === 400) {
      throw new SheetError('NOT_FOUND', 'Spreadsheet or worksheet not found. Check the link and the gid (worksheet) number.');
    }
    if (res.status === 429 || res.status >= 500) {
      throw new SheetError('TEMPORARY', `Google returned ${res.status}. Will retry.`, { retryable: true });
    }
    if (!res.ok) throw new SheetError('ACCESS_DENIED', `Google returned ${res.status}.`);
    const type = (res.headers.get('content-type') || '').toLowerCase();
    if (type.includes('text/html')) {
      throw new SheetError('ACCESS_DENIED', 'Google returned a web page instead of data. The spreadsheet is probably private: set sharing to "Anyone with the link → Viewer", or use the private method.');
    }
    return parseCsv(await readLimited(res));
  });
}

export async function fetchPublicTable(spreadsheetId, gid, opts = {}) {
  assertIds(spreadsheetId, gid);
  const base = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv`;
  try {
    return await fetchCsv(`${base}&gid=${gid}`, opts);
  } catch (e) {
    // A link without a gid means "first tab", whose id is not always 0. Retry without a gid in that case.
    if (gid === '0' && e instanceof SheetError && e.code === 'NOT_FOUND') return fetchCsv(base, opts);
    throw e;
  }
}

// Best-effort tab list for public sheets (Google exposes no stable API without credentials).
export async function fetchPublicTabs(spreadsheetId, opts = {}) {
  assertIds(spreadsheetId, '0');
  try {
    const res = await safeGet(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/htmlview`, opts);
    if (!res.ok) return { title: null, tabs: [] };
    const html = await readLimited(res);
    const title = html.match(/<title>([^<]*)<\/title>/i)?.[1]?.replace(/\s*-\s*Google Sheets\s*$/i, '').trim() || null;
    const tabs = [...html.matchAll(/id="sheet-button-(\d+)"[^>]*>\s*<a[^>]*>([^<]+)<\/a>/g)].map((m) => ({ gid: m[1], title: m[2].trim() }));
    return { title, tabs };
  } catch { return { title: null, tabs: [] }; }
}

// Method B: Google service account (private spreadsheets). Credentials live only in server env.
export function loadServiceAccount(env = process.env) {
  try {
    if (env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      const j = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
      if (j.client_email && j.private_key) return { email: j.client_email, key: j.private_key };
    }
    if (env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_PRIVATE_KEY) {
      return { email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL, key: env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n') };
    }
  } catch { /* fall through */ }
  return null;
}

const b64u = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');

async function getAccessToken(sa, fetchImpl = fetch) {
  const iat = Math.floor(Date.now() / 1000);
  const unsigned = `${b64u({ alg: 'RS256', typ: 'JWT' })}.${b64u({
    iss: sa.email, scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600,
  })}`;
  const sig = createSign('RSA-SHA256').update(unsigned).sign(sa.key).toString('base64url');
  let res;
  try {
    res = await fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }),
    });
  } catch { throw new SheetError('NETWORK', 'Could not reach Google to authorise.', { retryable: true }); }
  if (!res.ok) throw new SheetError('AUTH', 'Google rejected the service account credentials. Check GOOGLE_SERVICE_ACCOUNT_JSON on the server.');
  return (await res.json()).access_token;
}

async function sheetsApi(path, token, fetchImpl = fetch) {
  let res;
  try { res = await fetchImpl(`https://sheets.googleapis.com/v4/spreadsheets/${path}`, { headers: { Authorization: `Bearer ${token}`, 'User-Agent': UA } }); }
  catch { throw new SheetError('NETWORK', 'Could not reach the Google Sheets API.', { retryable: true }); }
  return res;
}

export async function fetchPrivateTable(spreadsheetId, gid, sa, { fetchImpl = fetch } = {}) {
  assertIds(spreadsheetId, gid);
  if (!sa) throw new SheetError('NO_SERVICE_ACCOUNT', 'Private access is not configured on the server yet (GOOGLE_SERVICE_ACCOUNT_JSON).');
  return withRetry(async () => {
    const token = await getAccessToken(sa, fetchImpl);
    const meta = await sheetsApi(`${spreadsheetId}?fields=properties.title,sheets.properties(sheetId,title)`, token, fetchImpl);
    if (meta.status === 403 || meta.status === 404) {
      throw new SheetError('ACCESS_DENIED', `Not accessible. Share the spreadsheet with ${sa.email} as Viewer, then try again.`);
    }
    if (meta.status === 429 || meta.status >= 500) throw new SheetError('TEMPORARY', `Google returned ${meta.status}.`, { retryable: true });
    if (!meta.ok) throw new SheetError('ACCESS_DENIED', `Google returned ${meta.status}.`);
    const info = await meta.json();
    const tabs = (info.sheets || []).map((s) => ({ gid: String(s.properties.sheetId), title: s.properties.title }));
    const tab = tabs.find((t) => t.gid === String(gid));
    if (!tab) throw new SheetError('NOT_FOUND', 'That worksheet (gid) does not exist in this spreadsheet.');
    const range = encodeURIComponent(`'${tab.title.replace(/'/g, "''")}'`);
    const vals = await sheetsApi(`${spreadsheetId}/values/${range}?majorDimension=ROWS`, token, fetchImpl);
    if (vals.status === 429 || vals.status >= 500) throw new SheetError('TEMPORARY', `Google returned ${vals.status}.`, { retryable: true });
    if (!vals.ok) throw new SheetError('ACCESS_DENIED', `Google returned ${vals.status}.`);
    const body = await vals.json();
    return { title: info.properties?.title || null, tabs, tab, table: body.values || [] };
  });
}
