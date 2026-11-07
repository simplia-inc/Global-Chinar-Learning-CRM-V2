// Strict parsing of Google Sheets links. Only IDs/gids are extracted; the fetch URL is always
// rebuilt from a fixed host, so user input can never choose the host, path or query (SSRF-safe).
export const SPREADSHEET_ID_RE = /^[A-Za-z0-9_-]{20,100}$/;
export const GID_RE = /^[0-9]{1,12}$/;

export class SheetError extends Error {
  constructor(code, message, { retryable = false } = {}) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}

export function parseSheetUrl(input) {
  const raw = String(input ?? '').trim();
  if (!raw || raw.length > 2000) throw new SheetError('BAD_URL', 'Paste the full Google Sheets link.');
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new SheetError('BAD_URL', 'That is not a valid link.');
  }
  if (url.protocol !== 'https:' || url.hostname !== 'docs.google.com' || url.username || url.password || url.port) {
    throw new SheetError('BAD_URL', 'Only https://docs.google.com/spreadsheets/... links are accepted.');
  }
  const m = url.pathname.match(/^\/spreadsheets\/d\/([A-Za-z0-9_-]+)(?:\/|$)/);
  if (!m || !SPREADSHEET_ID_RE.test(m[1])) {
    throw new SheetError('BAD_URL', 'Could not find a spreadsheet ID in that link. Use a link like https://docs.google.com/spreadsheets/d/<ID>/edit');
  }
  const gidMatch = (url.searchParams.get('gid') || url.hash.replace(/^#/, '').match(/(?:^|&)gid=([0-9]+)/)?.[1] || '0');
  const gid = GID_RE.test(gidMatch) ? gidMatch : '0';
  return { spreadsheetId: m[1], gid, canonicalUrl: `https://docs.google.com/spreadsheets/d/${m[1]}/edit?gid=${gid}` };
}

export function assertIds(spreadsheetId, gid) {
  if (!SPREADSHEET_ID_RE.test(String(spreadsheetId))) throw new SheetError('BAD_URL', 'Invalid spreadsheet ID.');
  if (!GID_RE.test(String(gid))) throw new SheetError('BAD_URL', 'Invalid worksheet ID.');
}
