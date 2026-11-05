import React, { useState, useEffect } from 'react';
import { Sparkles, RefreshCw, AlertCircle, PlusCircle, Calendar } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { leadService } from '../../services/leadService';
import type { Lead, FollowUp, DashboardStats } from '../../types/database';
import { StatCards } from './StatCards';
import { RecentLeadsTable } from './RecentLeadsTable';
import { UpcomingFollowUps } from './UpcomingFollowUps';
import { RoleBadge } from '../common/Badge';

interface DashboardViewProps {
  onViewLead: (lead: Lead) => void;
  onViewLeadById: (leadId: string) => void;
  onOpenCreateLead: () => void;
  onNavigateToLeads: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onViewLead,
  onViewLeadById,
  onOpenCreateLead,
  onNavigateToLeads,
}) => {
  const { profile, user, role } = useAuth();

  const [stats, setStats] = useState<DashboardStats>({
    totalLeads: 0,
    newLeads: 0,
    contactedLeads: 0,
    pendingFollowUps: 0,
    qualifiedLeads: 0,
    convertedLeads: 0,
  });
  const [recentLeads, setRecentLeads] = useState<Lead[]>([]);
  const [upcomingFollowUps, setUpcomingFollowUps] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadDashboardData = async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      const [statsRes, leadsRes, followUpsRes] = await Promise.all([
        leadService.getDashboardStats(),
        leadService.getLeads({ limit: 6 }),
        leadService.getUpcomingFollowUps(5),
      ]);

      if (statsRes.error) {
        console.warn('Dashboard stats error:', statsRes.error.message);
      } else {
        setStats(statsRes.stats);
      }

      if (leadsRes.error) {
        console.warn('Leads fetch error:', leadsRes.error.message);
        // Note: Under RLS, if an employee has 0 assigned leads or table is empty, this is normal
        setErrorMsg(`Notice: ${leadsRes.error.message}`);
      } else {
        setRecentLeads(leadsRes.data);
      }

      if (followUpsRes.data) {
        setUpcomingFollowUps(followUpsRes.data);
      }
    } catch (err: any) {
      console.error('Error fetching dashboard payload:', err);
      setErrorMsg('Failed to sync live data from Supabase. Check your connection.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  const handleCompleteFollowUp = async (id: string) => {
    const { error } = await leadService.updateFollowUpStatus(id, 'completed', 'Completed from dashboard');
    if (!error) {
      // Optimistically update
      setUpcomingFollowUps((prev) => prev.filter((f) => f.id !== id));
      setStats((prev) => ({
        ...prev,
        pendingFollowUps: Math.max(0, prev.pendingFollowUps - 1),
      }));
    }
  };

  const currentDateFormatted = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="space-y-6">
      {/* Welcome & Role Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">
              Welcome back, {profile?.full_name || user?.email?.split('@')[0]}
            </h2>
            <RoleBadge role={role || 'employee'} />
          </div>
          <p className="text-xs text-slate-500 flex items-center gap-2">
            <span>Global Chinar Digital Marketing School CRM</span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span>{currentDateFormatted}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadDashboardData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh dashboard data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Sync</span>
          </button>

          {role !== 'trainer' && (
            <button
              type="button"
              onClick={onOpenCreateLead}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>New Lead</span>
            </button>
          )}
        </div>
      </div>

      {/* RLS / Permission Notice if applicable */}
      {errorMsg && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-amber-800 hover:text-amber-950 font-semibold underline text-[11px]"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Primary KPI Metric Cards */}
      <StatCards stats={stats} loading={loading} />

      {/* Main Grid: 2 Columns on desktop (60% Leads, 40% Follow-ups) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Recent Inquiries */}
        <div className="lg:col-span-7">
          <RecentLeadsTable
            leads={recentLeads}
            loading={loading}
            onViewLead={onViewLead}
            onViewAllLeads={onNavigateToLeads}
            onCreateLead={onOpenCreateLead}
          />
        </div>

        {/* Right Column: Upcoming Follow-ups */}
        <div className="lg:col-span-5">
          <UpcomingFollowUps
            followUps={upcomingFollowUps}
            loading={loading}
            onComplete={handleCompleteFollowUp}
            onViewLead={onViewLeadById}
          />
        </div>
      </div>
    </div>
  );
};
