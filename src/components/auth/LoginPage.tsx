import React, { useState } from 'react';
import { Eye, EyeOff, Lock, Mail, AlertCircle, ArrowRight, ShieldCheck, Database, Settings2, RefreshCw, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ConnectionBanner } from '../common/ConnectionBanner';
import { Modal } from '../common/Modal';
import { saveLocalSupabaseCredentials, clearLocalSupabaseCredentials } from '../../lib/supabase';

export const LoginPage: React.FC = () => {
  const {
    signIn,
    resetPasswordForEmail,
    resendVerificationEmail,
    authError,
    clearAuthError,
    isAccountInactive,
    configInfo,
    recheckConfiguration,
  } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Forgot password modal state
  const [forgotModalOpen, setForgotModalOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSubmitted, setForgotSubmitted] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotLoading, setForgotLoading] = useState(false);

  // Resend verification state
  const [resendStatus, setResendStatus] = useState<string | null>(null);
  const [resendLoading, setResendLoading] = useState(false);

  // Project Switcher Modal state
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [customUrl, setCustomUrl] = useState('');
  const [customKey, setCustomKey] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;

    setIsSubmitting(true);
    await signIn(email.trim(), password);
    setIsSubmitting(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) return;

    setForgotLoading(true);
    setForgotError(null);
    const { error } = await resetPasswordForEmail(forgotEmail.trim());
    setForgotLoading(false);

    if (error) {
      setForgotError(error.message);
    } else {
      setForgotSubmitted(true);
    }
  };

  const handleResendVerification = async () => {
    const targetEmail = email.trim() || 'simpliain@gmail.com';
    setResendLoading(true);
    setResendStatus(null);
    const { error } = await resendVerificationEmail(targetEmail);
    setResendLoading(false);

    if (error) {
      setResendStatus(`Failed to resend: ${error.message}`);
    } else {
      setResendStatus(`Verification email dispatched to ${targetEmail}. Check your inbox/spam folder.`);
    }
  };

  const handleOpenProjectModal = () => {
    setCustomUrl(configInfo.url || '');
    setCustomKey(configInfo.anonKey || '');
    setProjectModalOpen(true);
  };

  const handleSaveProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customUrl.trim() || !customKey.trim()) return;

    saveLocalSupabaseCredentials(customUrl.trim(), customKey.trim());
    recheckConfiguration();
    setProjectModalOpen(false);
    window.location.reload();
  };

  const handleResetToEnv = () => {
    clearLocalSupabaseCredentials();
    recheckConfiguration();
    setProjectModalOpen(false);
    window.location.reload();
  };

  const isInvalidCredentials = authError?.toLowerCase().includes('invalid');
  const isSchemaMissing = authError?.toLowerCase().includes('profiles');

  return (
    <div className="min-h-screen bg-[#070B14] flex flex-col justify-between text-slate-100 font-sans selection:bg-amber-500 selection:text-black">
      {/* Top Connection Banner */}
      <ConnectionBanner />

      {/* Main Login Card */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-md bg-[#0F172A] border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8 relative overflow-hidden">
          {/* Subtle brand glow accent */}
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Brand Header */}
          <div className="text-center mb-6 relative">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-[#D4AF37] via-[#B48A1B] to-[#0D9488] p-0.5 shadow-lg mb-3">
              <div className="w-full h-full bg-[#0F172A] rounded-[14px] flex items-center justify-center">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-8 h-8 text-[#D4AF37]"
                >
                  <path
                    d="M12 2L13.5 6.5L17 5L15.5 9.5L19.5 9.5L16.5 13L20 15L15 16L15.5 20L12 17.5L8.5 20L9 16L4 15L7.5 13L4.5 9.5L8.5 9.5L7 5L10.5 6.5L12 2Z"
                    fill="url(#loginChinarGrad)"
                    stroke="#EAB308"
                    strokeWidth="0.75"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M12 17.5V22"
                    stroke="#10B981"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                  <defs>
                    <linearGradient id="loginChinarGrad" x1="4" y1="2" x2="20" y2="20" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#FDE047" />
                      <stop offset="0.5" stopColor="#D4AF37" />
                      <stop offset="1" stopColor="#0D9488" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            </div>

            <h1 className="text-xl font-bold tracking-tight text-white uppercase">
              GLOBAL CHINAR
            </h1>
            <p className="text-xs font-semibold tracking-wider text-teal-400 uppercase mt-0.5">
              Digital Marketing School CRM
            </p>
            <p className="text-[11px] font-medium text-amber-400/90 tracking-widest uppercase mt-1.5">
              LOCAL ROOTS | GLOBAL REACH
            </p>

            {/* Target Project Verification Indicator */}
            <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-800/80 border border-slate-700/80 rounded-md text-[11px] text-slate-300 max-w-full truncate">
              <Database className="w-3 h-3 text-teal-400 shrink-0" />
              <span>Project:</span>
              <span className="font-mono text-amber-300 font-medium truncate">
                {configInfo.projectHost || 'global-chinar-crm'}
              </span>
              <button
                type="button"
                onClick={handleOpenProjectModal}
                title="Change Supabase Project Connection"
                className="ml-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <Settings2 className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* User-Friendly Authentication Error Box */}
          {authError && (
            <div className="mb-5 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
              <div className="flex-1 space-y-1.5">
                <p className="font-semibold text-rose-200">
                  {isAccountInactive ? 'Account Inactive' : isSchemaMissing ? 'Database Schema Notice' : 'Login Failed (400)'}
                </p>
                <p className="text-rose-200/90 font-medium leading-relaxed font-mono text-[11px]">
                  {authError}
                </p>

                {isInvalidCredentials && (
                  <div className="mt-2 pt-2 border-t border-rose-500/20 text-[11px] text-slate-300 space-y-1.5">
                    <p className="text-slate-200 font-medium">Possible reasons:</p>
                    <ul className="list-disc pl-4 space-y-0.5 text-slate-300">
                      <li>The password does not match for project <span className="font-mono text-amber-300">{configInfo.projectHost}</span>.</li>
                      <li>The user email is unconfirmed or requires verification.</li>
                      <li>
                        The environment may be pointing to a different project than your intended <strong>global-chinar-crm</strong>.
                      </li>
                    </ul>

                    <div className="pt-1.5 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleOpenProjectModal}
                        className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded text-[11px] font-semibold transition-colors cursor-pointer"
                      >
                        Switch Supabase Project URL / Key
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setForgotEmail(email || 'simpliain@gmail.com');
                          setForgotSubmitted(false);
                          setForgotError(null);
                          setForgotModalOpen(true);
                        }}
                        className="px-2.5 py-1 bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/40 rounded text-[11px] font-semibold transition-colors cursor-pointer"
                      >
                        Reset Password
                      </button>

                      <button
                        type="button"
                        onClick={handleResendVerification}
                        disabled={resendLoading}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded text-[11px] font-medium transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {resendLoading ? 'Resending...' : 'Resend Confirmation'}
                      </button>
                    </div>

                    {resendStatus && (
                      <p className="pt-1 text-[11px] text-amber-300 font-mono leading-relaxed">
                        {resendStatus}
                      </p>
                    )}
                  </div>
                )}

                {isSchemaMissing && (
                  <div className="mt-2 pt-2 border-t border-rose-500/20 text-[11px] text-slate-300 space-y-1.5">
                    <p>
                      The connected project <strong className="font-mono text-amber-300">{configInfo.projectHost}</strong> does not contain the required <code className="font-mono">public.profiles</code> table.
                    </p>
                    <button
                      type="button"
                      onClick={handleOpenProjectModal}
                      className="mt-1 px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-[11px] font-semibold"
                    >
                      Connect to your global-chinar-crm project
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Staff Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="name@globalchinar.com"
                  value={email}
                  onChange={(e) => {
                    clearAuthError();
                    setEmail(e.target.value);
                  }}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-colors"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-amber-400" />
                <span>Super Admin: <button type="button" onClick={() => setEmail('simpliain@gmail.com')} className="text-amber-400 hover:underline">simpliain@gmail.com</button></span>
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-slate-300">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setForgotEmail(email || 'simpliain@gmail.com');
                    setForgotSubmitted(false);
                    setForgotError(null);
                    setForgotModalOpen(true);
                  }}
                  className="text-xs text-teal-400 hover:text-teal-300 transition-colors cursor-pointer"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  placeholder="Enter your CRM password"
                  value={password}
                  onChange={(e) => {
                    clearAuthError();
                    setPassword(e.target.value);
                  }}
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-900 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors p-1"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-2 py-3 px-4 bg-gradient-to-r from-amber-600 via-amber-500 to-teal-600 hover:from-amber-500 hover:to-teal-500 text-white font-semibold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <span>Authenticating with Supabase...</span>
              ) : (
                <>
                  <span>Sign In to School CRM</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Database & RLS Security Notice */}
          <div className="mt-6 pt-4 border-t border-slate-800/80 text-center text-[11px] text-slate-500 flex flex-col items-center gap-1">
            <p>Protected by Row Level Security (RLS) on Supabase.</p>
            <p className="text-slate-600">Roles enforced: Super Admin, Admin, Admissions & Staff, Trainer.</p>
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      <Modal
        isOpen={forgotModalOpen}
        onClose={() => setForgotModalOpen(false)}
        title="Reset CRM Password"
        subtitle={`Connected to ${configInfo.projectHost || 'Supabase'}`}
        maxWidth="sm"
      >
        {forgotSubmitted ? (
          <div className="text-center py-4 space-y-3">
            <div className="w-12 h-12 bg-teal-50 text-teal-600 rounded-full mx-auto flex items-center justify-center">
              <Mail className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-semibold text-slate-900">Check Your Email</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              If <strong>{forgotEmail}</strong> is registered in Supabase project <code className="font-mono text-slate-700">{configInfo.projectHost}</code>, an account recovery link has been dispatched.
            </p>
            <button
              type="button"
              onClick={() => setForgotModalOpen(false)}
              className="w-full py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800"
            >
              Back to Login
            </button>
          </div>
        ) : (
          <form onSubmit={handleForgotPassword} className="space-y-4">
            {forgotError && (
              <div className="p-2.5 bg-rose-50 text-rose-700 text-xs rounded-lg border border-rose-200">
                {forgotError}
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Your Registered Email
              </label>
              <input
                type="email"
                required
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="simpliain@gmail.com"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-teal-600"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setForgotModalOpen(false)}
                className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={forgotLoading}
                className="px-4 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 disabled:opacity-50"
              >
                {forgotLoading ? 'Sending...' : 'Send Recovery Link'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Switch / Configure Supabase Project Modal */}
      <Modal
        isOpen={projectModalOpen}
        onClose={() => setProjectModalOpen(false)}
        title="Supabase Project Configuration"
        subtitle="Connect to your Global Chinar CRM Supabase project"
        maxWidth="md"
      >
        <form onSubmit={handleSaveProject} className="space-y-4 text-xs text-slate-700">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-[11px] space-y-1">
            <p className="font-semibold">Current Active Project:</p>
            <p className="font-mono font-medium text-amber-950">{configInfo.projectHost || 'None'}</p>
            <p className="text-slate-600">
              Source: {configInfo.source === 'storage' ? 'Custom local override' : 'System environment variable (VITE_SUPABASE_URL)'}
            </p>
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">
              Project URL (<code className="font-mono">VITE_SUPABASE_URL</code>)
            </label>
            <input
              type="url"
              required
              placeholder="https://your-project-id.supabase.co"
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-xs focus:ring-2 focus:ring-teal-600"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              From your Supabase project dashboard Settings &gt; API.
            </p>
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">
              Anon / Public Key (<code className="font-mono">VITE_SUPABASE_ANON_KEY</code>)
            </label>
            <textarea
              required
              rows={3}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... or sb_publishable_..."
              value={customKey}
              onChange={(e) => setCustomKey(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-xs focus:ring-2 focus:ring-teal-600"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Only provide the public anon key. Never paste the service_role key.
            </p>
          </div>

          <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
            {configInfo.source === 'storage' ? (
              <button
                type="button"
                onClick={handleResetToEnv}
                className="text-rose-600 hover:underline font-medium text-[11px]"
              >
                Reset to Environment Default
              </button>
            ) : <span />}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setProjectModalOpen(false)}
                className="px-3 py-1.5 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-slate-900 text-white rounded-lg font-semibold hover:bg-slate-800"
              >
                Save & Connect
              </button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Footer */}
      <footer className="p-4 text-center text-xs text-slate-600 border-t border-slate-900">
        Global Chinar Digital Marketing School CRM · Enterprise Admissions & Pipeline
      </footer>
    </div>
  );
};
