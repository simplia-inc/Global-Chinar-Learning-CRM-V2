import React from 'react';
import { GraduationCap, Clock, Calendar, CheckCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const BatchesView: React.FC = () => {
  const { profile } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Trainer Portal & Batches</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Assigned training cohorts and lecture schedules for {profile?.full_name || 'Faculty Member'}.
        </p>
      </div>

      <div className="p-6 bg-white border border-slate-200 rounded-xl shadow-xs space-y-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-700 shrink-0">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Faculty Schedule & Cohort Access</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-xl leading-relaxed">
              As a trainer, your access is scoped strictly to student cohorts and training sessions. Financial ledgers and administrative configurations are restricted per security policy.
            </p>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Current Program</span>
            <h4 className="text-xs font-bold text-slate-800 mt-1">Digital Marketing Masterclass (Batch 2026-A)</h4>
            <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-2">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                10:00 AM – 12:30 PM
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                Mon, Wed, Fri
              </span>
            </div>
          </div>

          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Upcoming Program</span>
            <h4 className="text-xs font-bold text-slate-800 mt-1">Performance Marketing & Meta Ads (Batch 2026-B)</h4>
            <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-2">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                02:00 PM – 04:30 PM
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                Weekend Special
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
