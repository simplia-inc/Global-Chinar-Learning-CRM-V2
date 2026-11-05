import React, { useState } from 'react';
import { Database, AlertTriangle, CheckCircle, ChevronDown, ChevronUp, Key, Shield, RefreshCw, XCircle } from 'lucide-react';
import {
  getSupabaseCredentials,
  saveLocalSupabaseCredentials,
  clearLocalSupabaseCredentials,
  auditSupabaseConnection,
  SupabaseAuditResult,
} from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Modal } from './Modal';

export const ConnectionBanner: React.FC = () => {
  const { isConfigured, configInfo, recheckConfiguration } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [keyInput, setKeyInput] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [auditResult, setAuditResult] = useState<SupabaseAuditResult | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);

  const creds = getSupabaseCredentials();

  const runAudit = async () => {
    setIsAuditing(true);
    try {
      const res = await auditSupabaseConnection();
      setAuditResult(res);
    } catch {
      // Ignored
    } finally {
      setIsAuditing(false);
    }
  };

  const handleOpenModal = () => {
    setUrlInput(creds.url);
    setKeyInput(creds.anonKey);
    setSaveSuccess(false);
    setModalOpen(true);
    runAudit();
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim() || !keyInput.trim()) return;

    saveLocalSupabaseCredentials(urlInput.trim(), keyInput.trim());
    recheckConfiguration();
    setSaveSuccess(true);
    setTimeout(() => {
      setModalOpen(false);
      window.location.reload();
    }, 500);
  };

  const handleClear = () => {
    clearLocalSupabaseCredentials();
    recheckConfiguration();
    window.location.reload();
  };

  // If configured, show active connection details with host verification
  if (isConfigured) {
    return (
      <div className="bg-slate-900 text-slate-300 text-xs px-4 py-1.5 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
            <CheckCircle className="w-3.5 h-3.5" />
            Supabase Connected:
          </span>
          <span className="text-amber-300 font-mono font-medium">{configInfo.projectHost}</span>
          <span className="text-slate-600">·</span>
          <span className="text-slate-400 text-[11px]">
            {configInfo.source === 'environment' ? 'from env (VITE_SUPABASE_URL)' : 'from custom config'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleOpenModal}
            className="text-slate-400 hover:text-white transition-colors underline cursor-pointer text-[11px]"
          >
            Verify Project & Keys
          </button>
        </div>

        <Modal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          title="Supabase Project Connection Details"
          subtitle="Verifying connection to Global Chinar CRM database"
          maxWidth="md"
        >
          <div className="space-y-4 text-xs text-slate-600">
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900 space-y-1">
              <div className="flex items-center justify-between">
                <p className="font-semibold flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  Active Connection
                </p>
                <button
                  type="button"
                  onClick={runAudit}
                  disabled={isAuditing}
                  className="inline-flex items-center gap-1 text-[11px] text-emerald-700 hover:text-emerald-900 font-medium cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${isAuditing ? 'animate-spin' : ''}`} />
                  <span>{isAuditing ? 'Auditing...' : 'Re-test'}</span>
                </button>
              </div>
              <p className="text-[11px]">
                Endpoint: <span className="font-mono font-bold text-emerald-800">{configInfo.projectHost}</span>
              </p>
              <p className="text-[11px] text-emerald-700">
                Source: <span className="font-semibold">{configInfo.source === 'environment' ? 'Environment Variables (VITE_SUPABASE_URL)' : 'Local Configuration'}</span>
              </p>
            </div>

            {/* Audit Status Report */}
            {auditResult && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                <p className="font-semibold text-slate-800">Database Schema Verification:</p>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="flex items-center gap-1.5">
                    {auditResult.tablesStatus?.profiles ? (
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                    )}
                    <span className="font-mono">public.profiles</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {auditResult.tablesStatus?.leads ? (
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                    )}
                    <span className="font-mono">public.leads</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {auditResult.tablesStatus?.lead_assignments ? (
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                    )}
                    <span className="font-mono">lead_assignments</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {auditResult.tablesStatus?.follow_ups ? (
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                    )}
                    <span className="font-mono">follow_ups</span>
                  </div>
                </div>

                {auditResult.error && (
                  <p className="text-[11px] text-rose-600 font-mono pt-1">
                    Notice: {auditResult.error}
                  </p>
                )}
              </div>
            )}

            <div>
              <p className="font-medium text-slate-800 mb-1">Target Project Specification:</p>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded text-slate-700 space-y-0.5">
                <p>Expected Project: <span className="font-mono font-semibold">global-chinar-crm</span></p>
                <p>Super Admin: <span className="font-mono font-semibold">simpliain@gmail.com</span></p>
                <p>Tables: <code className="font-mono text-slate-800">public.profiles, leads, lead_assignments, follow_ups</code></p>
              </div>
            </div>

            <div>
              <p className="font-medium text-slate-800 mb-1">Anon Key Status:</p>
              <p className="text-slate-500 text-[11px] leading-relaxed">
                Client uses public Anon / Publishable key via environment. Service-role keys are never exposed in frontend code.
              </p>
            </div>

            {configInfo.source === 'storage' && (
              <div className="pt-2 border-t border-slate-200 flex justify-between items-center">
                <button
                  type="button"
                  onClick={handleClear}
                  className="text-rose-600 hover:text-rose-700 font-medium underline"
                >
                  Reset Saved Override
                </button>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </Modal>
      </div>
    );
  }

  // If not configured, show prominent connection setup prompt
  return (
    <aside aria-label="Supabase Connection Setup" className="bg-amber-500/10 border-b border-amber-300/60 px-4 py-2.5 text-xs text-amber-950">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
          <div>
            <span className="font-bold">Supabase Connection Required:</span>{' '}
            <span>
              Target project is <span className="font-mono font-semibold">global-chinar-crm</span>. Provide <span className="font-mono">VITE_SUPABASE_URL</span> and <span className="font-mono">VITE_SUPABASE_ANON_KEY</span>.
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleOpenModal}
            className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-md font-semibold shadow-xs transition-colors shrink-0 flex items-center gap-1.5"
          >
            <Key className="w-3.5 h-3.5" />
            Enter Credentials
          </button>
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="p-1 text-amber-800 hover:text-amber-950"
            aria-label="Toggle setup instructions"
          >
            {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="max-w-7xl mx-auto mt-2 pt-2 border-t border-amber-300/40 text-amber-900 space-y-1">
          <p>
            1. Open your Supabase dashboard at <strong>supabase.com</strong> for project <strong>global-chinar-crm</strong>.
          </p>
          <p>
            2. Go to <strong>Project Settings &gt; API</strong> and copy your <strong>Project URL</strong> and <strong>anon / public key</strong>.
          </p>
          <p>
            3. Set them in your environment as <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">VITE_SUPABASE_URL</code> and <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">VITE_SUPABASE_ANON_KEY</code>, or click <strong>Enter Credentials</strong> above for instant testing.
          </p>
        </div>
      )}

      {/* Interactive Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Connect to global-chinar-crm"
        subtitle="Provide Supabase URL and Anon Key"
        maxWidth="md"
      >
        <form onSubmit={handleSave} className="space-y-4 text-xs">
          {saveSuccess && (
            <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg">
              Saved! Re-initializing client...
            </div>
          )}
          <div>
            <label className="block font-medium text-slate-700 mb-1">
              Project URL (<code className="font-mono">VITE_SUPABASE_URL</code>)
            </label>
            <input
              type="url"
              required
              placeholder="https://xyzcompany.supabase.co"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-600 font-mono text-xs"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-700 mb-1">
              Anon / Public Key (<code className="font-mono">VITE_SUPABASE_ANON_KEY</code>)
            </label>
            <textarea
              required
              rows={3}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-600 font-mono text-xs"
            />
            <p className="text-slate-500 mt-1">
              Only use the <strong>anon / public</strong> key. Never paste the service_role secret.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800"
            >
              Connect & Reload
            </button>
          </div>
        </form>
      </Modal>
    </aside>
  );
};
