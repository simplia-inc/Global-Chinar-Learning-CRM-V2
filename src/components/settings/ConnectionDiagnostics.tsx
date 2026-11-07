import React, { useState } from 'react';
import { Database, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import { auditSupabaseConnection, type SupabaseAuditResult } from '../../lib/supabase';

// Read-only diagnostics for Super Admin. Never shows keys or tokens.
export const ConnectionDiagnostics: React.FC = () => {
  const [result, setResult] = useState<SupabaseAuditResult | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    try { setResult(await auditSupabaseConnection()); } finally { setRunning(false); }
  };

  const Row: React.FC<{ label: string; ok: boolean }> = ({ label, ok }) => (
    <li className="flex items-center justify-between py-1.5 text-xs">
      <span className="text-slate-600">{label}</span>
      {ok ? <span className="inline-flex items-center gap-1 text-emerald-700 font-medium"><CheckCircle2 className="w-3.5 h-3.5" />OK</span>
          : <span className="inline-flex items-center gap-1 text-rose-600 font-medium"><XCircle className="w-3.5 h-3.5" />Failed</span>}
    </li>
  );

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Database className="w-4 h-4 text-teal-600" /> Connection diagnostics</div>
        <button type="button" onClick={() => void run()} disabled={running}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg cursor-pointer disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${running ? 'animate-spin' : ''}`} /> Run check
        </button>
      </div>
      <p className="text-[11px] text-slate-500">Visible to Super Admin only. Keys and tokens are never displayed.</p>
      {result && (
        <>
          <ul className="divide-y divide-slate-100">
            <Row label="Configuration present" ok={result.isConfigured} />
            <Row label="Authentication service reachable" ok={result.authReachable} />
            <Row label="Database reachable" ok={result.databaseReachable} />
            <Row label="Profiles table available" ok={result.profilesTableExists} />
          </ul>
          {result.projectHost && <p className="text-[11px] text-slate-500">Project host: <code className="font-mono text-slate-700">{result.projectHost}</code></p>}
          {result.error && <p className="text-[11px] text-rose-600">{result.error}</p>}
        </>
      )}
    </div>
  );
};
