import { getSupabaseClient } from '../lib/supabase';

export type SheetMethod = 'shared_link' | 'service_account';
export type ColumnMapping = Partial<Record<'full_name' | 'email' | 'phone' | 'interested_course' | 'source' | 'notes' | 'status' | 'priority' | 'external_id', string>>;

export interface SheetConnection {
  id: string; name: string | null; method: SheetMethod; spreadsheet_id: string; worksheet_gid: string; worksheet_title: string | null;
  source_url: string | null; headers: string[]; column_mapping: ColumnMapping; sync_enabled: boolean; sync_interval_minutes: number;
  status: 'pending' | 'connected' | 'error'; last_validated_at: string | null; last_sync_at: string | null; last_success_at: string | null;
  next_sync_at: string | null; last_error: string | null; consecutive_failures: number; sync_started_at: string | null; created_at: string;
}
export interface SyncRun {
  id: string; connection_id: string; trigger: 'manual' | 'scheduled' | 'retry'; status: 'running' | 'success' | 'partial' | 'failed';
  started_at: string; finished_at: string | null; rows_scanned: number; rows_new: number; rows_updated: number; rows_unchanged: number;
  rows_duplicates: number; rows_invalid: number; rows_failed: number; error: string | null;
}
export interface SyncError { id: number; run_id: string; row_number: number | null; error_type: 'invalid' | 'duplicate' | 'failed'; message: string; existing_lead_id: string | null; created_at: string }
export interface Inspection {
  ok: true; method: SheetMethod; spreadsheetId: string; gid: string; title: string | null; tabs: Array<{ gid: string; title: string }>;
  worksheetTitle: string | null; headers: string[]; rowCount: number; suggestedMapping: ColumnMapping;
}
export interface Capabilities { serviceAccountConfigured: boolean; serviceAccountEmail: string | null; schedulerAvailable: boolean }

async function call<T>(path: string, method: string, body?: unknown): Promise<T> {
  const client = getSupabaseClient();
  const { data } = (await client?.auth.getSession()) ?? { data: { session: null } };
  const token = data.session?.access_token;
  if (!token) throw new Error('Your session has expired. Sign in again.');
  let res: Response;
  try {
    res = await fetch(`/api/sheets${path}`, {
      method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('The sync server could not be reached. Check your connection and try again.');
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json as T;
}

export const sheetsApi = {
  capabilities: () => call<Capabilities>('/capabilities', 'GET'),
  validate: (url: string, method: SheetMethod, gid?: string) => call<Inspection>('/validate', 'POST', { url, method, gid }),
  connect: (url: string, method: SheetMethod, gid: string, mapping: ColumnMapping) => call<{ connection: SheetConnection }>('/connect', 'POST', { url, method, gid, mapping }),
  saveMapping: (id: string, mapping: ColumnMapping) => call<{ ok: true }>(`/${id}/mapping`, 'POST', { mapping }),
  saveSettings: (id: string, sync_enabled: boolean, sync_interval_minutes: number) => call<{ ok: true }>(`/${id}/settings`, 'POST', { sync_enabled, sync_interval_minutes }),
  sync: (id: string, retry = false) => call<{ runId: string; status: string; counts: Record<string, number>; error: string | null }>(`/${id}/sync`, 'POST', { retry }),
  remove: (id: string) => call<{ ok: true }>(`/${id}`, 'DELETE'),

  async listConnections(): Promise<SheetConnection[]> {
    const c = getSupabaseClient(); if (!c) return [];
    const { data, error } = await c.from('sheet_connections').select('*').order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data || []) as SheetConnection[];
  },
  async listRuns(connectionId: string): Promise<SyncRun[]> {
    const c = getSupabaseClient(); if (!c) return [];
    const { data, error } = await c.from('sheet_sync_runs').select('*').eq('connection_id', connectionId).order('started_at', { ascending: false }).limit(15);
    if (error) throw new Error(error.message);
    return (data || []) as SyncRun[];
  },
  async listErrors(runId: string): Promise<SyncError[]> {
    const c = getSupabaseClient(); if (!c) return [];
    const { data, error } = await c.from('sheet_sync_errors').select('*').eq('run_id', runId).order('row_number', { ascending: true }).limit(200);
    if (error) throw new Error(error.message);
    return (data || []) as SyncError[];
  },
};
