import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSheetUrl, SheetError } from '../server/sheets/url.js';
import { parseCsv } from '../server/sheets/csv.js';
import { suggestMapping, buildLeadRows, validateMapping, cleanPhone, deriveStatus } from '../server/sheets/mapping.js';
import { fetchPublicTable } from '../server/sheets/fetchers.js';
import { runSync } from '../server/sheets/service.js';

const ID = '1nzjZ6SzAQ-lCymEVzuQHPhrXBTwovr_mnUHvsWgFij8';
const resp = (status, body = '', headers = {}) => ({ status, ok: status >= 200 && status < 300, headers: { get: (k) => headers[k.toLowerCase()] ?? null }, text: async () => body, json: async () => JSON.parse(body) });

test('parses sharing links and extracts id + gid', () => {
  const a = parseSheetUrl(`https://docs.google.com/spreadsheets/d/${ID}/edit?gid=123456`);
  assert.equal(a.spreadsheetId, ID); assert.equal(a.gid, '123456');
  assert.equal(parseSheetUrl(`https://docs.google.com/spreadsheets/d/${ID}/edit#gid=77`).gid, '77');
  assert.equal(parseSheetUrl(`https://docs.google.com/spreadsheets/d/${ID}/edit?usp=sharing`).gid, '0');
});

test('rejects non-Google, http, userinfo and look-alike hosts (SSRF)', () => {
  for (const bad of ['http://docs.google.com/spreadsheets/d/' + ID, 'https://evil.com/spreadsheets/d/' + ID,
    'https://docs.google.com.evil.com/spreadsheets/d/' + ID, 'https://user@docs.google.com/spreadsheets/d/' + ID,
    'https://docs.google.com:8080/spreadsheets/d/' + ID, 'https://169.254.169.254/latest', 'file:///etc/passwd', '', 'not a url',
    'https://docs.google.com/spreadsheets/d/short/edit']) {
    assert.throws(() => parseSheetUrl(bad), SheetError, bad);
  }
});

test('csv parser handles quotes, embedded newlines and CRLF', () => {
  const t = parseCsv('\uFEFFName,Notes\r\n"Doe, J","line1\nline2"\r\nB,"say ""hi"""\r\n');
  assert.deepEqual(t, [['Name', 'Notes'], ['Doe, J', 'line1\nline2'], ['B', 'say "hi"']]);
});

test('suggests mapping from typical headers', () => {
  const m = suggestMapping(['Lead ID', 'Student Name', 'Mobile', 'E-mail', 'Course', 'Lead Source', 'Remarks', 'Status', 'Priority']);
  assert.deepEqual(m, { full_name: 'Student Name', email: 'E-mail', phone: 'Mobile', interested_course: 'Course', source: 'Lead Source', notes: 'Remarks', status: 'Status', priority: 'Priority', external_id: 'Lead ID' });
});

test('mapping validation requires name and phone-or-email and real columns', () => {
  assert.ok(validateMapping({ phone: 'P' }, ['P']).length);
  assert.ok(validateMapping({ full_name: 'N' }, ['N']).length);
  assert.ok(validateMapping({ full_name: 'Zzz', phone: 'P' }, ['N', 'P']).length);
  assert.deepEqual(validateMapping({ full_name: 'N', phone: 'P' }, ['N', 'P']), []);
});

test('builds lead rows: validation, phone cleanup, keys, in-sheet duplicates, status synonyms', () => {
  const table = [
    ['ID', 'Name', 'Phone', 'Email', 'Course', 'Status', 'Priority'],
    ['L1', 'Asha', '+91 98765 43210 / 91234 56789', 'ASHA@Example.com', 'SEO', 'Follow up', 'medium'],
    ['', '', '', '', '', '', ''],
    ['L2', '', '9876500000', '', '', '', ''],
    ['L3', 'No Contact', 'abc', 'not-an-email', '', '', ''],
    ['L4', 'Asha Again', '9876543210', '', '', 'weird', 'urgent'],
    ['', 'No Id', '99999 11111', '', '', '', ''],
  ];
  const m = { external_id: 'ID', full_name: 'Name', phone: 'Phone', email: 'Email', interested_course: 'Course', status: 'Status', priority: 'Priority' };
  const r = buildLeadRows(table, m);
  assert.equal(r.scanned, 5);
  assert.equal(r.valid.length, 4);
  const [a, unnamed, b, c] = r.valid;
  assert.equal(unnamed.key, 'id:L2'); assert.equal(unnamed.name_placeholder, true); // phone but no name: kept under a placeholder
  assert.equal(a.key, 'id:L1'); assert.equal(a.phone, '+919876543210'); assert.equal(a.email, 'asha@example.com');
  assert.equal(a.status, 'follow_up'); assert.equal(a.priority, 'normal'); assert.equal(a.row_number, 2);
  assert.equal(b.key, 'id:L4'); assert.equal(b.status, undefined); assert.equal(b.priority, 'high');
  assert.equal(c.key, 'phone:9999911111');
  assert.deepEqual(r.errors.map((e) => [e.row_number, e.error_type]), [[5, 'invalid']]); // only the row with no usable contact is rejected
  assert.equal(cleanPhone('12'), '');
  const again = buildLeadRows(table, m).valid[0].hash;
  assert.equal(again, a.hash);
});

test('same phone repeated in a sheet without an ID column is reported as duplicate', () => {
  const r = buildLeadRows([['N', 'P'], ['A', '9876543210'], ['B', '98765 43210']], { full_name: 'N', phone: 'P' });
  assert.equal(r.valid.length, 1); assert.equal(r.errors[0].error_type, 'duplicate');
});

test('public fetch: success, private redirect, html login page, 404, evil redirect', async () => {
  const ok = await fetchPublicTable(ID, '0', { fetchImpl: async () => resp(200, 'a,b\n1,2', { 'content-type': 'text/csv' }) });
  assert.deepEqual(ok, [['a', 'b'], ['1', '2']]);
  const code = async (impl) => fetchPublicTable(ID, '0', { fetchImpl: impl }).then(() => 'no error', (e) => e.code);
  assert.equal(await code(async () => resp(307, '', { location: 'https://accounts.google.com/ServiceLogin?x=1' })), 'ACCESS_DENIED');
  assert.equal(await code(async () => resp(200, '<html>login</html>', { 'content-type': 'text/html; charset=utf-8' })), 'ACCESS_DENIED');
  assert.equal(await code(async () => resp(403)), 'ACCESS_DENIED');
  assert.equal(await code(async () => resp(404)), 'NOT_FOUND');
  assert.equal(await code(async () => resp(302, '', { location: 'https://evil.example.com/x' })), 'ACCESS_DENIED');
  assert.equal(await code(async () => resp(302, '', { location: 'http://127.0.0.1:8080/' })), 'ACCESS_DENIED');
});

test('public fetch follows a Google redirect and retries temporary errors', async () => {
  const seen = [];
  let n = 0;
  const impl = async (url) => {
    seen.push(url);
    if (url.includes('docs.google.com/spreadsheets/d/') && n++ === 0) return resp(503);
    if (url.includes('docs.google.com')) return resp(307, '', { location: 'https://doc-0c-8g-sheets.googleusercontent.com/export/abc' });
    return resp(200, 'x\n1', { 'content-type': 'text/csv' });
  };
  const t = await fetchPublicTable(ID, '5', { fetchImpl: impl });
  assert.deepEqual(t, [['x'], ['1']]);
  assert.ok(seen[0].endsWith(`/export?format=csv&gid=5`));
  assert.ok(seen.length >= 3);
});

function fakeDb({ conn }) {
  const calls = [];
  return {
    calls,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: conn, error: null }) }) }) }),
    rpc: async (name, args) => {
      calls.push([name, args]);
      if (name === 'start_sheet_run') return { data: 'run-1', error: null };
      if (name === 'apply_sheet_rows') return { data: { new: args.p_rows.length, updated: 0, unchanged: 0, duplicates: 0, invalid: 0, failed: 0 }, error: null };
      return { data: null, error: null };
    },
  };
}
const conn = { id: 'c1', method: 'shared_link', spreadsheet_id: ID, worksheet_gid: '0', column_mapping: { full_name: 'Name', phone: 'Phone' } };

test('runSync: imports valid rows, records invalid ones, finishes as partial', async () => {
  const db = fakeDb({ conn });
  const csv = 'Name,Phone\nA,9876543210\n,111\nB,9123456780\n';
  const r = await runSync(db, 'c1', 'manual', { fetchImpl: async () => resp(200, csv, { 'content-type': 'text/csv' }) });
  assert.equal(r.status, 'partial'); assert.equal(r.counts.scanned, 3); assert.equal(r.counts.new, 2); assert.equal(r.counts.invalid, 1);
  const fin = db.calls.find((c) => c[0] === 'finish_sheet_run');
  assert.equal(fin[1].p_status, 'partial');
  const rows = db.calls.find((c) => c[0] === 'apply_sheet_rows')[1].p_rows;
  assert.ok(rows.every((x) => !('status' in x) || x.status === undefined));
});

test('runSync: access failure is logged as failed and the run is always closed', async () => {
  const db = fakeDb({ conn });
  const r = await runSync(db, 'c1', 'manual', { fetchImpl: async () => resp(403) });
  assert.equal(r.status, 'failed'); assert.match(r.error, /Anyone with the link/);
  assert.equal(db.calls.at(-1)[0], 'finish_sheet_run'); assert.equal(db.calls.at(-1)[1].p_status, 'failed');
  assert.ok(!db.calls.some((c) => c[0] === 'apply_sheet_rows'));
});

test('runSync: invalid mapping fails clearly without importing', async () => {
  const db = fakeDb({ conn: { ...conn, column_mapping: { full_name: 'Nope', phone: 'Phone' } } });
  const r = await runSync(db, 'c1', 'manual', { fetchImpl: async () => resp(200, 'Name,Phone\nA,9876543210', { 'content-type': 'text/csv' }) });
  assert.equal(r.status, 'failed'); assert.match(r.error, /not found in the worksheet/);
});

test('maps a sheet whose headers are Name / Number / Remarks / Uzair Note', () => {
  const headers = ['Name', 'Number', 'Remarks', 'Uzair Note'];
  const m = suggestMapping(headers);
  assert.deepEqual(m, { full_name: 'Name', phone: 'Number', notes: 'Remarks', extra_notes: 'Uzair Note' });
  assert.deepEqual(validateMapping(m, headers), []);
});

test('a caller with a number but no name is kept under a placeholder name', () => {
  const r = buildLeadRows([['Name', 'Number', 'Remarks'], ['', '90000 00001', 'No Answer'], ['', '', 'nothing usable']], { full_name: 'Name', phone: 'Number', notes: 'Remarks' });
  assert.equal(r.valid.length, 1);
  assert.equal(r.valid[0].full_name, 'Unnamed lead 9000000001');
  assert.equal(r.valid[0].name_placeholder, true);
  assert.deepEqual(r.errors.map((e) => [e.row_number, e.error_type]), [[3, 'invalid']]);
});

test('additional notes column is appended with its heading; stray cells beyond the headers are ignored', () => {
  const t = [['Name', 'Number', 'Remarks', 'Uzair Note'], ['Test A', '9000000002', 'will visit', 'Sale', '1000', '', '9000000002']];
  const r = buildLeadRows(t, { full_name: 'Name', phone: 'Number', notes: 'Remarks', extra_notes: 'Uzair Note' });
  assert.equal(r.valid[0].notes, 'will visit\nUzair Note: Sale');
});

test('status suggestion: conservative, opt-in, and never treats "ni" as not interested', () => {
  assert.equal(deriveStatus('will visit tomorrow / NI'), 'follow_up');
  assert.equal(deriveStatus('Anantnag shared qr will pay/ni'), 'follow_up');
  assert.equal(deriveStatus('Asked to share the Broucher'), 'follow_up');
  assert.equal(deriveStatus('call back 10am'), 'follow_up');
  assert.equal(deriveStatus('x\nUzair Note: Sale'), 'qualified');
  assert.equal(deriveStatus('No enquiry'), 'lost');
  assert.equal(deriveStatus('Clicked By Mistake'), 'lost');
  assert.equal(deriveStatus('No Answer'), undefined);
  assert.equal(deriveStatus('Switched Off'), undefined);
  const t = [['Name', 'Number', 'Remarks'], ['A', '9000000003', 'will visit'], ['B', '9000000004', 'No Answer']];
  const off = buildLeadRows(t, { full_name: 'Name', phone: 'Number', notes: 'Remarks' });
  assert.deepEqual(off.valid.map((v) => v.status), [undefined, undefined]);
  const on = buildLeadRows(t, { full_name: 'Name', phone: 'Number', notes: 'Remarks', auto_status: 'on' });
  assert.deepEqual(on.valid.map((v) => v.status), ['follow_up', undefined]);
  const explicit = buildLeadRows([['Name', 'Number', 'Status'], ['C', '9000000005', 'Lost']], { full_name: 'Name', phone: 'Number', status: 'Status', auto_status: 'on' });
  assert.equal(explicit.valid[0].status, 'lost');
});

test('mapping validation accepts the status-suggestion switch only as "on"', () => {
  const h = ['Name', 'Number'];
  assert.deepEqual(validateMapping({ full_name: 'Name', phone: 'Number', auto_status: 'on' }, h), []);
  assert.ok(validateMapping({ full_name: 'Name', phone: 'Number', auto_status: 'yes' }, h).length);
});

test('public fetch: a link without a tab number falls back to the first tab', async () => {
  const seen = [];
  const impl = async (url) => { seen.push(url); return url.includes('gid=0') ? resp(404) : resp(200, 'a\n1', { 'content-type': 'text/csv' }); };
  const t = await fetchPublicTable(ID, '0', { fetchImpl: impl });
  assert.deepEqual(t, [['a'], ['1']]);
  assert.ok(seen[0].includes('gid=0') && !seen[1].includes('gid='));
});
