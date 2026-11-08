import React, { useState } from 'react';
import { Eye, EyeOff, Lock, Mail, AlertCircle, ArrowRight, RefreshCw, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { BrandLogo } from '../common/BrandLogo';
import { ConnectionBanner } from '../common/ConnectionBanner';
import { Modal } from '../common/Modal';

export const LoginPage: React.FC = () => {
  const {
    signIn,
    resetPasswordForEmail,
    resendVerificationEmail,
    authError,
    clearAuthError,
    isAccountInactive,
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
    const targetEmail = email.trim();
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

  const isInvalidCredentials = authError?.toLowerCase().includes('invalid');
  const isSchemaMissing = authError?.toLowerCase().includes('database is not set up');

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
            <div className="flex justify-center mb-3">
              <BrandLogo size={84} className="drop-shadow-[0_4px_14px_rgba(212,175,55,0.3)]" />
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

          </div>

          {/* User-Friendly Authentication Error Box */}
          {authError && (
            <div className="mb-5 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
              <div className="flex-1 space-y-1.5">
                <p className="font-semibold text-rose-200">
                  {isAccountInactive ? 'Account Inactive' : isSchemaMissing ? 'Database Schema Notice' : 'Sign-in failed'}
                </p>
                <p className="text-rose-200/90 font-medium leading-relaxed font-mono text-[11px]">
                  {authError}
                </p>

                {isInvalidCredentials && (
                  <div className="mt-2 pt-2 border-t border-rose-500/20 text-[11px] text-slate-300 space-y-1.5">
                    <p className="text-slate-200 font-medium">Please check:</p>
                    <ul className="list-disc pl-4 space-y-0.5 text-slate-300">
                      <li>Your email and password are correct.</li>
                      <li>Your email address has been confirmed.</li>
                    </ul>

                    <div className="pt-1.5 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setForgotEmail(email);
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
                        disabled={resendLoading || !email.trim()}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded text-[11px] font-medium transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {resendLoading ? 'Resending...' : 'Resend Confirmation'}
                      </button>
                    </div>

                    {resendStatus && (
                      <p className="pt-1 text-[11px] text-amber-300 leading-relaxed">
                        {resendStatus}
                      </p>
                    )}
                  </div>
                )}

                {isSchemaMissing && (
                  <p className="mt-2 pt-2 border-t border-rose-500/20 text-[11px] text-slate-300">
                    The CRM database is not set up correctly. Please contact your administrator.
                  </p>
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
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-slate-300">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setForgotEmail(email);
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
        subtitle="We will email you a recovery link"
        maxWidth="sm"
      >
        {forgotSubmitted ? (
          <div className="text-center py-4 space-y-3">
            <div className="w-12 h-12 bg-teal-50 text-teal-600 rounded-full mx-auto flex items-center justify-center">
              <Mail className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-semibold text-slate-900">Check Your Email</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              If <strong>{forgotEmail}</strong> is registered, an account recovery link has been dispatched.
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
                placeholder="name@globalchinar.com"
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

      {/* Footer */}
      <footer className="p-4 text-center text-xs text-slate-600 border-t border-slate-900">
        Global Chinar Digital Marketing School CRM · Enterprise Admissions & Pipeline
      </footer>
    </div>
  );
};
