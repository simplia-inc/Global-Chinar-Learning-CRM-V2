import React, { useState, useEffect } from 'react';
import { UserCheck, Shield, RefreshCw, Mail, Phone, CheckCircle, XCircle } from 'lucide-react';
import { teamService } from '../../services/teamService';
import type { Profile } from '../../types/database';
import { RoleBadge } from '../common/Badge';

export const TeamView: React.FC = () => {
  const [team, setTeam] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadTeam = async () => {
    setLoading(true);
    setErrorMsg(null);
    const { data, error } = await teamService.getTeamMembers();
    setLoading(false);

    if (error) {
      setErrorMsg(error.message);
    } else {
      setTeam(data);
    }
  };

  useEffect(() => {
    loadTeam();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Staff & Faculty Directory</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Profiles registered in the <code className="font-mono text-slate-700">profiles</code> table with assigned database roles.
          </p>
        </div>

        <button
          type="button"
          onClick={loadTeam}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Sync Profiles</span>
        </button>
      </div>

      {errorMsg && (
        <div className="p-3 bg-amber-50 text-amber-900 rounded-xl border border-amber-200 text-xs">
          Notice: {errorMsg}
        </div>
      )}

      {/* Role Hierarchy Reference Card */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-4 bg-white border border-slate-200 rounded-xl text-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-900">Super Admin</span>
            <RoleBadge role="super_admin" />
          </div>
          <p className="text-slate-500 text-[11px] leading-relaxed">
            Full governance, security configuration, user management, and complete CRM access.
          </p>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-xl text-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-900">Admin</span>
            <RoleBadge role="admin" />
          </div>
          <p className="text-slate-500 text-[11px] leading-relaxed">
            School operations, staff assignments, leads oversight, and follow-up schedules.
          </p>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-xl text-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-900">Admissions Staff</span>
            <RoleBadge role="employee" />
          </div>
          <p className="text-slate-500 text-[11px] leading-relaxed">
            Manages assigned student inquiries, logs counselor calls, and follows up with prospects.
          </p>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-xl text-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-900">Trainer</span>
            <RoleBadge role="trainer" />
          </div>
          <p className="text-slate-500 text-[11px] leading-relaxed">
            Faculty batch schedules. Strictly no administrative or financial pages exposed.
          </p>
        </div>
      </div>

      {/* Team Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500">
            <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            Loading staff profiles from Supabase...
          </div>
        ) : team.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No profiles retrieved from database. Verify RLS permissions on the <code className="font-mono">profiles</code> table.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold text-[10px]">
                  <th className="py-3 px-4">Staff Member</th>
                  <th className="py-3 px-4">Assigned Role</th>
                  <th className="py-3 px-4">Contact</th>
                  <th className="py-3 px-4">Account Status</th>
                  <th className="py-3 px-4 text-right">Registered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {team.map((member) => (
                  <tr key={member.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900">
                        {member.full_name || 'Staff User'}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {member.email}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <RoleBadge role={member.role} />
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">
                      <span className="font-mono">{member.phone || '—'}</span>
                    </td>
                    <td className="py-3.5 px-4">
                      {member.is_active ? (
                        <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Active</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-rose-700 font-medium">
                          <XCircle className="w-3.5 h-3.5 text-rose-500" />
                          <span>Inactive</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right text-slate-500 tabular-nums">
                      {member.created_at ? new Date(member.created_at).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
