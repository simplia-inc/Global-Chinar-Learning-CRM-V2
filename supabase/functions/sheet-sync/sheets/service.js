import { SheetError } from './url.js';
import { fetchPublicTable, fetchPrivateTable, loadServiceAccount } from './fetchers.js';
import { buildLeadRows, validateMapping } from './mapping.js';

const CHUNK = 200;

export async function loadTable(conn, { fetchImpl } = {}) {
  if (conn.method === 'service_account') {
    const r = await fetchPrivateTable(conn.spreadsheet_id, conn.worksheet_gid, loadServiceAccount(), { fetchImpl });
    return r.table;
  }
  return fetchPublicTable(conn.spreadsheet_id, conn.worksheet_gid, { fetchImpl });
}

// Runs one synchronisation. `client` is a Supabase client (admin user's JWT or the service role).
export async function runSync(client, connectionId, trigger = 'manual', { fetchImpl } = {}) {
  const { data: conn, error: connErr } = await client.from('sheet_connections').select('*').eq('id', connectionId).maybeSingle();
  if (connErr) throw new SheetError('DB', 'Could not load the connection.');
  if (!conn) throw new SheetError('NOT_FOUND', 'Connection not found.');

  const { data: runId, error: startErr } = await client.rpc('start_sheet_run', { p_connection: connectionId, p_trigger: trigger });
  if (startErr) {
    if (startErr.code === '55P03') throw new SheetError('BUSY', 'A synchronisation is already running for this connection.');
    throw new SheetError('DB', startErr.message);
  }

  const counts = { scanned: 0, new: 0, updated: 0, unchanged: 0, duplicates: 0, invalid: 0, failed: 0 };
  let status = 'success';
  let message = null;
  try {
    const table = await loadTable(conn, { fetchImpl });
    if (!table.length) throw new SheetError('EMPTY', 'The worksheet is empty. Row 1 must contain column headers.');
    const mapErrors = validateMapping(conn.column_mapping, (table[0] || []).map((h) => String(h ?? '').trim()));
    if (mapErrors.length) throw new SheetError('MAPPING', `Column mapping needs attention: ${mapErrors.join('; ')}`);

    const { valid, errors, scanned, truncated } = buildLeadRows(table, conn.column_mapping);
    counts.scanned = scanned;
    counts.invalid = errors.filter((e) => e.error_type === 'invalid').length;
    counts.duplicates = errors.filter((e) => e.error_type === 'duplicate').length;
    if (truncated) errors.push({ row_number: null, error_type: 'invalid', message: 'Sheet has more than 20,000 rows; extra rows were ignored' });
    if (errors.length) await client.rpc('record_sheet_errors', { p_run: runId, p_errors: errors });

    for (let i = 0; i < valid.length; i += CHUNK) {
      const { data, error } = await client.rpc('apply_sheet_rows', { p_run: runId, p_rows: valid.slice(i, i + CHUNK) });
      if (error) throw new SheetError('DB', `Import failed: ${error.message}`);
      counts.new += data.new; counts.updated += data.updated; counts.unchanged += data.unchanged;
      counts.duplicates += data.duplicates; counts.invalid += data.invalid; counts.failed += data.failed;
    }
    if (counts.failed || counts.invalid || counts.duplicates) status = 'partial';
    if (counts.failed && counts.failed >= counts.scanned) status = 'failed';
  } catch (e) {
    status = 'failed';
    message = e instanceof SheetError ? e.message : 'Unexpected error during synchronisation.';
    if (!(e instanceof SheetError)) console.error('[sheets] sync error:', e?.name);
  }
  await client.rpc('finish_sheet_run', { p_run: runId, p_status: status, p_counts: counts, p_error: message });
  return { runId, status, counts, error: message };
}
