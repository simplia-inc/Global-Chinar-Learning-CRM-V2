import React, { useCallback, useEffect, useState } from 'react';
import { Sheet, Link2, ShieldCheck, ShieldAlert, RefreshCw, CheckCircle2, XCircle, AlertTriangle, Trash2, Clock, ExternalLink, Info } from 'lucide-react';
import { sheetsApi, type Capabilities, type ColumnMapping, type Inspection, type SheetConnection, type SheetMethod, type SyncError, type SyncRun } from '../../services/sheetsApi';

interface Props { onViewLeadById: (leadId: string) => void }

const FIELDS: Array<{ key: keyof ColumnMapping; label: string; hint?: string; required?: string }> = [
  { key: 'full_name', label: 'Full name', required: 'Required' },
  { key: 'phone', label: 'Phone', required: 'Phone or email' },
  { key: 'email', label: 'Email', required: 'Phone or email' },
  { key: 'interested_course', label: 'Interested course', hint: 'Saved to the CRM field interested_course' },
  { key: 'source', label: 'Lead source' },
  { key: 'notes', label: 'Notes / remarks' },
  { key: 'extra_notes', label: 'Additional notes', hint: 'A second remarks column. Added to the lead’s notes with its heading' },
  { key: 'status', label: 'Status', hint: 'Used only when a lead is first created' },
  { key: 'priority', label: 'Priority', hint: 'Used only when a lead is first created' },
  { key: 'external_id', label: 'Lead ID (recommended)', hint: 'A unique ID column prevents duplicates even if phone numbers change' },
];
const INTERVALS = [15, 30, 60, 180, 360, 720, 1440];
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '—');
const intervalLabel = (m: number) => (m < 60 ? `${m} minutes` : m === 60 ? 'Every hour' : m === 1440 ? 'Once a day' : `Every ${m / 60} hours`);

const MappingEditor: React.FC<{ headers: string[]; value: ColumnMapping; onChange: (m: ColumnMapping) => void }> = ({ headers, value, onChange }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
    {FIELDS.map((f) => (
      <label key={f.key} className="block text-xs">
        <span className="flex items-center justify-between mb-1 font-medium text-slate-700">{f.label}{f.required && <span className="text-[10px] font-semibold text-amber-700">{f.required}</span>}</span>
        <select value={value[f.key] || ''} onChange={(e) => { const next = { ...value }; if (e.target.value) next[f.key] = e.target.value; else delete next[f.key]; onChange(next); }}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-600">
          <option value="">— Not mapped —</option>
          {headers.map((h, i) => <option key={`${h}-${i}`} value={h}>{h || `(blank column ${i + 1})`}</option>)}
        </select>
        {f.hint && <span className="block mt-1 text-[10px] text-slate-400">{f.hint}</span>}
      </label>
    ))}
    <label className="sm:col-span-2 flex items-start gap-2 text-xs text-slate-700 p-3 rounded-lg bg-slate-50 border border-slate-200">
      <input type="checkbox" checked={value.auto_status === 'on'} onChange={(e) => { const next = { ...value }; if (e.target.checked) next.auto_status = 'on'; else delete next.auto_status; onChange(next); }} className="accent-teal-600 mt-0.5" />
      <span><strong>Suggest a status from the remarks</strong> for new leads that have no status column. “Will visit / call back / brochure shared” becomes Follow-up, “Sale” becomes Qualified, “No enquiry / clicked by mistake” becomes Lost, anything else stays New. Only used when a lead is first created; the CRM manages status afterwards.</span>
    </label>
  </div>
);

export const SheetsIntegrationView: React.FC<Props> = ({ onViewLeadById }) => {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [connections, setConnections] = useState<SheetConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [method, setMethod] = useState<SheetMethod>('shared_link');
  const [url, setUrl] = useState('');
  const [inspect, setInspect] = useState<Inspection | null>(null);
  const [gid, setGid] = useState('0');
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [busy, setBusy] = useState<'validate' | 'connect' | 'sync' | 'save' | null>(null);
  const [showConnect, setShowConnect] = useState(false);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [runs, setRuns] = useState<SyncRun[]>([]);
  const [errors, setErrors] = useState<SyncError[]>([]);
  const [errorsRunId, setErrorsRunId] = useState<string | null>(null);
  const [editMapping, setEditMapping] = useState<ColumnMapping | null>(null);
  const [autoOn, setAutoOn] = useState(false);
  const [interval, setIntervalMin] = useState(60);

  const active = connections.find((c) => c.id === activeId) || null;

  const loadConnections = useCallback(async () => {
    try {
      const list = await sheetsApi.listConnections();
      setConnections(list);
      setActiveId((cur) => (cur && list.some((c) => c.id === cur) ? cur : list[0]?.id ?? null));
    } catch (e) { setNotice({ type: 'err', text: (e as Error).message }); } finally { setLoading(false); }
  }, []);

  const loadRuns = useCallback(async (id: string) => {
    try {
      const r = await sheetsApi.listRuns(id);
      setRuns(r);
      const target = r.find((x) => x.rows_invalid + x.rows_duplicates + x.rows_failed > 0 || x.status === 'failed') || r[0];
      if (target) { setErrorsRunId(target.id); setErrors(await sheetsApi.listErrors(target.id)); } else { setErrors([]); setErrorsRunId(null); }
    } catch (e) { setNotice({ type: 'err', text: (e as Error).message }); }
  }, []);

  useEffect(() => { void loadConnections(); sheetsApi.capabilities().then(setCaps).catch(() => setCaps(null)); }, [loadConnections]);
  useEffect(() => {
    if (!active) return;
    setAutoOn(active.sync_enabled); setIntervalMin(active.sync_interval_minutes); setEditMapping(null);
    void loadRuns(active.id);
  }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const validate = async (useGid?: string) => {
    setBusy('validate'); setNotice(null);
    try {
      const r = await sheetsApi.validate(url.trim(), method, useGid);
      setInspect(r); setGid(r.gid); setMapping(r.suggestedMapping);
      setNotice({ type: 'ok', text: `Connection validated: ${r.rowCount} data row${r.rowCount === 1 ? '' : 's'} found.` });
    } catch (e) { setInspect(null); setNotice({ type: 'err', text: (e as Error).message }); } finally { setBusy(null); }
  };

  const connect = async () => {
    setBusy('connect'); setNotice(null);
    try {
      const r = await sheetsApi.connect(url.trim(), method, gid, mapping);
      setNotice({ type: 'ok', text: 'Spreadsheet connected. Run “Sync now” to import leads.' });
      setInspect(null); setUrl(''); setShowConnect(false);
      await loadConnections(); setActiveId(r.connection.id);
    } catch (e) { setNotice({ type: 'err', text: (e as Error).message }); } finally { setBusy(null); }
  };

  const syncNow = async (retry = false) => {
    if (!active) return;
    setBusy('sync'); setNotice(null);
    try {
      const r = await sheetsApi.sync(active.id, retry);
      const c = r.counts;
      setNotice(r.status === 'failed'
        ? { type: 'err', text: r.error || 'Synchronisation failed.' }
        : { type: 'ok', text: `Sync finished: ${c.new} new, ${c.updated} updated, ${c.unchanged} unchanged, ${c.duplicates} duplicates skipped, ${c.invalid} invalid, ${c.failed} failed.` });
    } catch (e) { setNotice({ type: 'err', text: (e as Error).message }); }
    setBusy(null); await loadConnections(); await loadRuns(active.id);
  };

  const saveSettings = async () => {
    if (!active) return; setBusy('save');
    try { await sheetsApi.saveSettings(active.id, autoOn, interval); setNotice({ type: 'ok', text: 'Automatic sync settings saved.' }); await loadConnections(); }
    catch (e) { setNotice({ type: 'err', text: (e as Error).message }); } finally { setBusy(null); }
  };

  const saveMapping = async () => {
    if (!active || !editMapping) return; setBusy('save');
    try { await sheetsApi.saveMapping(active.id, editMapping); setNotice({ type: 'ok', text: 'Column mapping saved. It applies from the next sync.' }); setEditMapping(null); await loadConnections(); }
    catch (e) { setNotice({ type: 'err', text: (e as Error).message }); } finally { setBusy(null); }
  };

  const disconnect = async () => {
    if (!active) return;
    if (!window.confirm('Disconnect this spreadsheet? Imported leads, assignments and follow-ups are kept. Only the link and sync history are removed.')) return;
    try { await sheetsApi.remove(active.id); setNotice({ type: 'ok', text: 'Spreadsheet disconnected. No leads were deleted.' }); await loadConnections(); }
    catch (e) { setNotice({ type: 'err', text: (e as Error).message }); }
  };

  const lastRun = runs[0];
  const showForm = showConnect || (!loading && connections.length === 0);
  const sa = caps?.serviceAccountEmail;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2"><Sheet className="w-5 h-5 text-teal-600" /> Google Sheets Integration</h1>
        <p className="text-xs text-slate-500 mt-1">Leads from your admissions spreadsheet are imported into the CRM automatically. The CRM stays in charge of status, assignment and follow-ups after import.</p>
      </div>

      {notice && (
        <div role="status" className={`flex items-start gap-2 p-3 rounded-xl text-xs border ${notice.type === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'}`}>
          {notice.type === 'ok' ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 shrink-0 mt-0.5" />}
          <span className="flex-1">{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} className="font-semibold underline cursor-pointer">Dismiss</button>
        </div>
      )}

      {loading ? <div className="h-40 rounded-xl bg-slate-100 animate-pulse" /> : (
        <>
          {active && (
            <section className="bg-white border border-slate-200 rounded-xl shadow-xs">
              <header className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 border-b border-slate-100">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-sm font-semibold text-slate-900 truncate">{active.name || 'Google spreadsheet'}</h2>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${active.status === 'connected' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : active.status === 'error' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                      {active.status === 'connected' ? 'Connected' : active.status === 'error' ? 'Needs attention' : 'Pending'}
                    </span>
                    <span className="text-[11px] text-slate-500">{active.method === 'service_account' ? 'Private (service account)' : 'Shared link'}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Worksheet: <span className="font-medium text-slate-700">{active.worksheet_title || `gid ${active.worksheet_gid}`}</span>
                    {active.source_url && <> · <a href={active.source_url} target="_blank" rel="noopener noreferrer" className="text-teal-700 hover:underline inline-flex items-center gap-0.5">Open sheet <ExternalLink className="w-3 h-3" /></a></>}</p>
                </div>
                <div className="flex items-center gap-2">
                  {lastRun && (lastRun.status === 'partial' || lastRun.status === 'failed') && (
                    <button type="button" onClick={() => void syncNow(true)} disabled={busy === 'sync'} className="px-3 py-1.5 text-xs font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg cursor-pointer disabled:opacity-50">Retry failed rows</button>
                  )}
                  <button type="button" onClick={() => void syncNow()} disabled={busy === 'sync'} className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer disabled:opacity-60">
                    <RefreshCw className={`w-3.5 h-3.5 ${busy === 'sync' ? 'animate-spin' : ''}`} /> {busy === 'sync' ? 'Syncing…' : 'Sync now'}
                  </button>
                </div>
              </header>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-5">
                {[['Last successful sync', fmt(active.last_success_at)], ['Next scheduled sync', active.sync_enabled ? fmt(active.next_sync_at) : 'Automatic sync is off'],
                  ['Rows processed (last run)', lastRun ? String(lastRun.rows_scanned) : '—'], ['New leads (last run)', lastRun ? String(lastRun.rows_new) : '—'],
                  ['Updated leads', lastRun ? String(lastRun.rows_updated) : '—'], ['Duplicate rows skipped', lastRun ? String(lastRun.rows_duplicates) : '—'],
                  ['Invalid rows', lastRun ? String(lastRun.rows_invalid) : '—'], ['Failed rows', lastRun ? String(lastRun.rows_failed) : '—']].map(([k, v]) => (
                  <div key={k} className="p-3 rounded-lg bg-slate-50 border border-slate-200"><div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">{k}</div><div className="mt-1 text-sm font-bold text-slate-900">{v}</div></div>
                ))}
              </div>
              {active.last_error && <p className="mx-5 mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800"><AlertTriangle className="w-3.5 h-3.5 inline mr-1" />{active.last_error}</p>}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 px-5 pb-5">
                <div className="space-y-3">
                  <h3 className="text-xs font-semibold text-slate-900 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-teal-600" /> Automatic synchronisation</h3>
                  {caps && !caps.schedulerAvailable && (
                    <p className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-900">The scheduler is not active on the server yet. Add <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code> to the server’s environment variables (never a VITE_ variable) and restart the app. Manual sync works without it.</p>
                  )}
                  <label className="flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" checked={autoOn} onChange={(e) => setAutoOn(e.target.checked)} className="accent-teal-600" /> Sync automatically on the server</label>
                  <select value={interval} onChange={(e) => setIntervalMin(Number(e.target.value))} disabled={!autoOn} className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white disabled:bg-slate-50">
                    {INTERVALS.map((m) => <option key={m} value={m}>{intervalLabel(m)}</option>)}
                  </select>
                  <button type="button" onClick={() => void saveSettings()} disabled={busy === 'save'} className="px-3 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg cursor-pointer disabled:opacity-50">Save schedule</button>
                  <p className="text-[11px] text-slate-400">Overlapping runs are blocked. Temporary failures are retried automatically with increasing delays.</p>
                </div>
                <div className="space-y-3">
                  <h3 className="text-xs font-semibold text-slate-900">Column mapping</h3>
                  {editMapping ? (
                    <>
                      <MappingEditor headers={active.headers} value={editMapping} onChange={setEditMapping} />
                      <div className="flex gap-2">
                        <button type="button" onClick={() => void saveMapping()} disabled={busy === 'save'} className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer disabled:opacity-50">Save mapping</button>
                        <button type="button" onClick={() => setEditMapping(null)} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer">Cancel</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <ul className="text-xs text-slate-600 space-y-0.5">{FIELDS.filter((f) => active.column_mapping[f.key]).map((f) => <li key={f.key}><span className="text-slate-400">{f.label}:</span> <span className="font-medium text-slate-800">{active.column_mapping[f.key]}</span></li>)}{active.column_mapping.auto_status === 'on' && <li><span className="text-slate-400">Status suggestion:</span> <span className="font-medium text-slate-800">On (from remarks)</span></li>}</ul>
                      <button type="button" onClick={() => setEditMapping({ ...active.column_mapping })} className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg cursor-pointer">Edit mapping</button>
                    </>
                  )}
                </div>
              </div>
              <footer className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50/60 rounded-b-xl">
                <button type="button" onClick={() => setShowConnect(true)} className="text-xs font-medium text-teal-700 hover:underline cursor-pointer">Connect another spreadsheet</button>
                <button type="button" onClick={() => void disconnect()} className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 hover:text-rose-800 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /> Disconnect</button>
              </footer>
            </section>
          )}

          {active && (
            <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div className="bg-white border border-slate-200 rounded-xl shadow-xs">
                <h3 className="text-sm font-semibold text-slate-900 px-5 pt-4 pb-3 border-b border-slate-100">Import history</h3>
                {runs.length === 0 ? <p className="p-5 text-xs text-slate-500">No synchronisations yet. Use “Sync now” to run the first import.</p> : (
                  <div className="overflow-x-auto"><table className="w-full text-xs min-w-[520px]">
                    <thead><tr className="text-left text-[10px] uppercase tracking-wide text-slate-400"><th className="px-5 py-2">Started</th><th>Type</th><th>Status</th><th className="text-right">Scanned</th><th className="text-right">New</th><th className="text-right">Upd.</th><th className="text-right">Dup.</th><th className="text-right pr-5">Err.</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">{runs.map((r) => (
                      <tr key={r.id} onClick={async () => { setErrorsRunId(r.id); try { setErrors(await sheetsApi.listErrors(r.id)); } catch { /* shown on next load */ } }} className={`cursor-pointer hover:bg-slate-50 ${errorsRunId === r.id ? 'bg-teal-50/50' : ''}`}>
                        <td className="px-5 py-2 whitespace-nowrap">{fmt(r.started_at)}</td><td className="capitalize text-slate-500">{r.trigger}</td>
                        <td><span className={`font-semibold ${r.status === 'success' ? 'text-emerald-700' : r.status === 'failed' ? 'text-rose-600' : r.status === 'partial' ? 'text-amber-700' : 'text-slate-500'}`}>{r.status}</span></td>
                        <td className="text-right tabular-nums">{r.rows_scanned}</td><td className="text-right tabular-nums">{r.rows_new}</td><td className="text-right tabular-nums">{r.rows_updated}</td>
                        <td className="text-right tabular-nums">{r.rows_duplicates}</td><td className="text-right tabular-nums pr-5">{r.rows_invalid + r.rows_failed}</td>
                      </tr>))}</tbody></table></div>
                )}
              </div>
              <div className="bg-white border border-slate-200 rounded-xl shadow-xs">
                <h3 className="text-sm font-semibold text-slate-900 px-5 pt-4 pb-3 border-b border-slate-100">Error log {errorsRunId && runs.find((r) => r.id === errorsRunId) ? <span className="text-[11px] font-normal text-slate-400">· run of {fmt(runs.find((r) => r.id === errorsRunId)!.started_at)}</span> : null}</h3>
                {runs.find((r) => r.id === errorsRunId)?.error && <p className="mx-5 mt-3 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-[11px] text-rose-800">{runs.find((r) => r.id === errorsRunId)?.error}</p>}
                {errors.length === 0 ? <p className="p-5 text-xs text-slate-500">No rejected or failed rows for this run.</p> : (
                  <ul className="divide-y divide-slate-100 max-h-80 overflow-y-auto">{errors.map((e) => (
                    <li key={e.id} className="px-5 py-2.5 text-xs flex items-start gap-3">
                      <span className="shrink-0 w-14 text-slate-400 tabular-nums">Row {e.row_number ?? '—'}</span>
                      <span className={`shrink-0 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${e.error_type === 'failed' ? 'bg-rose-50 text-rose-700' : e.error_type === 'duplicate' ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>{e.error_type}</span>
                      <span className="flex-1 text-slate-700">{e.message}{e.existing_lead_id && <> <button type="button" onClick={() => onViewLeadById(e.existing_lead_id!)} className="text-teal-700 font-semibold hover:underline cursor-pointer">View existing lead</button></>}</span>
                    </li>))}</ul>
                )}
              </div>
            </section>
          )}

          {showForm && (
            <section className="bg-white border border-slate-200 rounded-xl shadow-xs p-5 space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2"><Link2 className="w-4 h-4 text-teal-600" /> Connect a spreadsheet</h2>
                {connections.length > 0 && <button type="button" onClick={() => { setShowConnect(false); setInspect(null); }} className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer">Cancel</button>}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button type="button" onClick={() => { setMethod('shared_link'); setInspect(null); }} className={`text-left p-4 rounded-xl border-2 transition cursor-pointer ${method === 'shared_link' ? 'border-teal-600 bg-teal-50/40' : 'border-slate-200 hover:border-slate-300'}`}>
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-900"><ShieldAlert className="w-4 h-4 text-amber-600" /> Method A · Shared link (simple)</div>
                  <p className="text-[11px] text-slate-600 mt-1.5">The owner sets <strong>Share → General access → Anyone with the link → Viewer</strong>. Read-only; the CRM never edits the sheet.</p>
                  <p className="text-[11px] text-amber-800 mt-1.5">Anyone who has the link can view the spreadsheet. Not recommended for sensitive data.</p>
                </button>
                <button type="button" onClick={() => { setMethod('service_account'); setInspect(null); }} className={`text-left p-4 rounded-xl border-2 transition cursor-pointer ${method === 'service_account' ? 'border-teal-600 bg-teal-50/40' : 'border-slate-200 hover:border-slate-300'}`}>
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-900"><ShieldCheck className="w-4 h-4 text-emerald-600" /> Method B · Private spreadsheet (secure)</div>
                  <p className="text-[11px] text-slate-600 mt-1.5">The sheet stays private and is shared only with a Google service account. Credentials live on the server and never reach the browser.</p>
                </button>
              </div>

              {method === 'service_account' && (
                caps?.serviceAccountConfigured ? (
                  <p className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900"><Info className="w-3.5 h-3.5 inline mr-1" />Share your spreadsheet with <code className="font-mono font-semibold break-all">{sa}</code> as <strong>Viewer</strong>, then paste the sheet link below. A link alone does not grant access to a private sheet.</p>
                ) : (
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1.5">
                    <p className="font-semibold">Private access is not set up on the server yet. One-time setup:</p>
                    <ol className="list-decimal ml-4 space-y-0.5">
                      <li>In Google Cloud Console, create a project and enable the <strong>Google Sheets API</strong>.</li>
                      <li>Create a <strong>service account</strong> and download its JSON key.</li>
                      <li>Add the JSON as the server environment variable <code className="font-mono">GOOGLE_SERVICE_ACCOUNT_JSON</code> (Hostinger → Node.js app → Environment variables) and restart.</li>
                      <li>Share the spreadsheet with the service account’s email as <strong>Viewer</strong>.</li>
                    </ol>
                  </div>
                )
              )}

              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-700" htmlFor="sheet-url">Google Sheets sharing URL</label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input id="sheet-url" value={url} onChange={(e) => { setUrl(e.target.value); setInspect(null); }} placeholder="https://docs.google.com/spreadsheets/d/…/edit?gid=0"
                    className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-600" />
                  <button type="button" onClick={() => void validate()} disabled={!url.trim() || busy === 'validate' || (method === 'service_account' && !caps?.serviceAccountConfigured)}
                    className="px-4 py-2 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg cursor-pointer disabled:opacity-50">
                    {busy === 'validate' ? 'Validating…' : 'Validate connection'}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400">The spreadsheet ID and worksheet (gid) are extracted automatically.</p>
              </div>

              {inspect && (
                <div className="space-y-4 border-t border-slate-100 pt-4">
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs">
                    <span><span className="text-slate-400">Spreadsheet:</span> <strong className="text-slate-900">{inspect.title || 'Name unavailable for shared links'}</strong></span>
                    <span><span className="text-slate-400">Rows found:</span> <strong className="text-slate-900">{inspect.rowCount}</strong></span>
                  </div>
                  <div className="text-xs">
                    <label htmlFor="sheet-tab" className="font-medium text-slate-700 block mb-1">Worksheet</label>
                    {inspect.tabs.length > 0 ? (
                      <select id="sheet-tab" value={gid} onChange={(e) => { setGid(e.target.value); void validate(e.target.value); }} className="px-3 py-2 border border-slate-300 rounded-lg bg-white">
                        {inspect.tabs.map((t) => <option key={t.gid} value={t.gid}>{t.title}</option>)}
                      </select>
                    ) : (
                      <p className="text-slate-500">Using worksheet <strong>{inspect.worksheetTitle || `gid ${gid}`}</strong>. To import a different tab, open it in Google Sheets and paste that tab’s link (the URL ends with its <code className="font-mono">gid</code>).</p>
                    )}
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-slate-900 mb-2">Map spreadsheet columns to CRM fields</h3>
                    <MappingEditor headers={inspect.headers} value={mapping} onChange={setMapping} />
                  </div>
                  <button type="button" onClick={() => void connect()} disabled={busy === 'connect' || !mapping.full_name || (!mapping.phone && !mapping.email)}
                    className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer disabled:opacity-50">
                    {busy === 'connect' ? 'Connecting…' : 'Connect spreadsheet'}
                  </button>
                  {(!mapping.full_name || (!mapping.phone && !mapping.email)) && <p className="text-[11px] text-amber-700">Map Full name and at least Phone or Email to continue.</p>}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
};
