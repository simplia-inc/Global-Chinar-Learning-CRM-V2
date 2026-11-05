import React, { useState } from 'react';
import { Lock, Eye, EyeOff, CheckCircle2, AlertCircle, ArrowRight, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface SetNewPasswordViewProps {
  onComplete: () => void;
}

export const SetNewPasswordView: React.FC<SetNewPasswordViewProps> = ({ onComplete }) => {
  const { updateUserPassword, signOut, user } = useAuth();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    const { error } = await updateUserPassword(password);
    setIsSubmitting(false);

    if (error) {
      setErrorMsg(error.message);
    } else {
      setIsSuccess(true);
      // Clean up URL hash so token isn't retained in history
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', window.location.pathname);
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#070B14] flex flex-col justify-between text-slate-100 font-sans selection:bg-amber-500 selection:text-black">
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-md bg-[#0F172A] border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8 relative overflow-hidden">
          {/* Subtle brand glow accent */}
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Header */}
          <div className="text-center mb-6 relative">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-[#D4AF37] via-[#B48A1B] to-[#0D9488] p-0.5 shadow-lg mb-3">
              <div className="w-full h-full bg-[#0F172A] rounded-[10px] flex items-center justify-center text-amber-400">
                <Lock className="w-6 h-6" />
              </div>
            </div>

            <h1 className="text-lg font-bold tracking-tight text-white uppercase">
              Set New Password
            </h1>
            <p className="text-xs text-teal-400 uppercase tracking-wider font-semibold mt-0.5">
              Global Chinar Digital Marketing School CRM
            </p>
            {user?.email && (
              <p className="text-[11px] text-slate-400 mt-1 font-mono">
                Account: {user.email}
              </p>
            )}
          </div>

          {isSuccess ? (
            <div className="text-center py-6 space-y-4">
              <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-full mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div>
                <h3 className="text-sm font-bold text-white">Password Updated Successfully</h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Your new credentials have been recorded in Supabase Authentication. You may now continue to the school dashboard.
                </p>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={onComplete}
                  className="w-full py-2.5 px-4 bg-gradient-to-r from-amber-600 via-amber-500 to-teal-600 hover:from-amber-500 hover:to-teal-500 text-white font-semibold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Continue to Dashboard</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {errorMsg && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                  <p className="leading-relaxed">{errorMsg}</p>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  New Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    placeholder="Minimum 6 characters"
                    value={password}
                    onChange={(e) => {
                      setErrorMsg(null);
                      setPassword(e.target.value);
                    }}
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-900 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Confirm New Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    placeholder="Re-enter password"
                    value={confirmPassword}
                    onChange={(e) => {
                      setErrorMsg(null);
                      setConfirmPassword(e.target.value);
                    }}
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-900 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full mt-2 py-3 px-4 bg-gradient-to-r from-amber-600 via-amber-500 to-teal-600 hover:from-amber-500 hover:to-teal-500 text-white font-semibold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <span>Updating Password in Supabase...</span>
                ) : (
                  <>
                    <span>Confirm & Update Password</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => signOut()}
                  className="text-xs text-slate-400 hover:text-slate-200 underline cursor-pointer"
                >
                  Cancel & Return to Login
                </button>
              </div>
            </form>
          )}

          <div className="mt-6 pt-4 border-t border-slate-800/80 text-center text-[11px] text-slate-500">
            <p>Protected by Supabase Authentication Recovery Flow</p>
          </div>
        </div>
      </div>

      <footer className="p-4 text-center text-xs text-slate-600 border-t border-slate-900">
        Global Chinar Digital Marketing School CRM · LOCAL ROOTS | GLOBAL REACH
      </footer>
    </div>
  );
};
