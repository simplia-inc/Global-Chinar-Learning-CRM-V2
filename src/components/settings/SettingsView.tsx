import React, { useState } from 'react';
import { User, Shield, Lock, CheckCircle, Database, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { RoleBadge } from '../common/Badge';
import { getSupabaseCredentials } from '../../lib/supabase';

export const SettingsView: React.FC = () => {
  const { user, profile, role, updateUserPassword, refreshProfile } = useAuth();
  const creds = getSupabaseCredentials();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }

    setPasswordLoading(true);
    setPasswordError(null);
    setPasswordSuccess(false);

    const { error } = await updateUserPassword(newPassword);
    setPasswordLoading(false);

    if (error) {
      setPasswordError(error.message);
    } else {
      setPasswordSuccess(true);
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccess(false), 5000);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Account & System Configuration</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          User profile details, role governance, and Supabase integration status.
        </p>
      </div>

      {/* Profile & Security Governance Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-slate-900 text-amber-400 font-bold text-base flex items-center justify-center">
              {profile?.full_name?.charAt(0) || user?.email?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">{profile?.full_name || 'Staff Member'}</h3>
              <p className="text-xs text-slate-500 font-mono">{user?.email}</p>
            </div>
          </div>

          <div className="text-right">
            <RoleBadge role={role || 'employee'} />
            <p className="text-[10px] text-emerald-600 font-medium mt-1">Status: Active</p>
          </div>
        </div>

        {/* Read-Only Role Enforcement notice */}
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
          <div className="flex items-center gap-2 text-slate-900 font-semibold">
            <Shield className="w-4 h-4 text-amber-600" />
            <span>Database Role Enforcement (Security Policy)</span>
          </div>
          <p className="text-slate-600 leading-relaxed">
            Your role is assigned directly within the database <code className="font-mono text-slate-800">profiles</code> table. Users cannot select or alter their own roles from the client interface. All data queries are protected by Row Level Security (RLS).
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-2">
          <div>
            <span className="block text-slate-500 text-[11px] mb-1">User UUID (Auth)</span>
            <div className="font-mono bg-slate-50 p-2 rounded border border-slate-200 text-slate-800 break-all">
              {user?.id}
            </div>
          </div>
          <div>
            <span className="block text-slate-500 text-[11px] mb-1">Assigned Contact Phone</span>
            <div className="font-mono bg-slate-50 p-2 rounded border border-slate-200 text-slate-800">
              {profile?.phone || 'Not recorded'}
            </div>
          </div>
        </div>
      </div>

      {/* Supabase Connection Details */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Database className="w-4 h-4 text-teal-600" />
          <span>Supabase Infrastructure</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <span className="text-[11px] text-slate-500 block">Supabase Project</span>
            <span className="font-mono font-bold text-slate-800">global-chinar-crm</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <span className="text-[11px] text-slate-500 block">Super Admin Account</span>
            <span className="font-mono font-semibold text-amber-700">simpliain@gmail.com</span>
          </div>
        </div>

        <div className="text-[11px] text-slate-500 space-y-1">
          <p>• Database tables in use: <code className="font-mono text-slate-700">profiles</code>, <code className="font-mono text-slate-700">leads</code>, <code className="font-mono text-slate-700">lead_assignments</code>, <code className="font-mono text-slate-700">follow_ups</code>.</p>
          <p>• Connected API URL: <code className="font-mono text-slate-700">{creds.url || 'Not configured'}</code>.</p>
        </div>
      </div>

      {/* Update Password */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <h3 className="text-sm font-semibold text-slate-900 mb-1">Update CRM Password</h3>
        <p className="text-xs text-slate-500 mb-4">Change your password through Supabase Authentication</p>

        {passwordSuccess && (
          <div className="mb-4 p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-xs flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            <span>Password updated successfully!</span>
          </div>
        )}

        {passwordError && (
          <div className="mb-4 p-3 bg-rose-50 text-rose-800 border border-rose-200 rounded-lg text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600" />
            <span>{passwordError}</span>
          </div>
        )}

        <form onSubmit={handlePasswordUpdate} className="space-y-4 max-w-md text-xs">
          <div>
            <label className="block font-medium text-slate-700 mb-1">New Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimum 6 characters"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-600 text-xs"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">Confirm New Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-600 text-xs"
            />
          </div>

          <button
            type="submit"
            disabled={passwordLoading}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 cursor-pointer"
          >
            {passwordLoading ? 'Updating Password...' : 'Save New Password'}
          </button>
        </form>
      </div>
    </div>
  );
};
