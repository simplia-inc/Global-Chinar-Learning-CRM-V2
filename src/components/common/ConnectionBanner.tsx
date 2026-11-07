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

  // Connected deployments show nothing here. Diagnostics live in Settings (Super Admin only).
  if (isConfigured) return null;

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
