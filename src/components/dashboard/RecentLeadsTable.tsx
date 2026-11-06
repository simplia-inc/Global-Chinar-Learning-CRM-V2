import React from 'react';
import { Users, ChevronRight, Phone, Mail, ArrowUpRight } from 'lucide-react';
import type { Lead } from '../../types/database';
import { StatusBadge, PriorityBadge } from '../common/Badge';
import { EmptyState } from '../common/EmptyState';

interface RecentLeadsTableProps {
  leads: Lead[];
  loading: boolean;
  onViewLead: (lead: Lead) => void;
  onViewAllLeads: () => void;
  onCreateLead: () => void;
}

export const RecentLeadsTable: React.FC<RecentLeadsTableProps> = ({
  leads,
  loading,
  onViewLead,
  onViewAllLeads,
  onCreateLead,
}) => {
  const formatDate = (isoString?: string) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return '—';
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col h-full">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Recent Student Inquiries</h3>
          <p className="text-xs text-slate-500 mt-0.5">Latest leads recorded in the admissions funnel</p>
        </div>
        <button
          type="button"
          onClick={onViewAllLeads}
          className="text-xs font-semibold text-teal-700 hover:text-teal-800 flex items-center gap-1 cursor-pointer"
        >
          <span>View All Leads</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {loading ? (
        <div className="space-y-3 py-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="animate-pulse h-12 bg-slate-50 rounded-lg" />
          ))}
        </div>
      ) : leads.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No student leads recorded yet"
          description="Begin by adding prospective students interested in Global Chinar Digital Marketing programs."
          actionText="+ Create First Lead"
          onAction={onCreateLead}
          className="border-0 bg-transparent py-8"
        />
      ) : (
        <div className="overflow-x-auto -mx-5 px-5">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 uppercase tracking-wider font-semibold text-[10px]">
                <th className="pb-2.5 font-medium">Student Prospect</th>
                <th className="pb-2.5 font-medium">Course Interest</th>
                <th className="pb-2.5 font-medium">Status</th>
                <th className="pb-2.5 font-medium">Priority</th>
                <th className="pb-2.5 font-medium text-right">Date</th>
                <th className="pb-2.5 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {leads.map((lead) => (
                <tr
                  key={lead.id}
                  onClick={() => onViewLead(lead)}
                  className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                >
                  <td className="py-3 pr-3">
                    <div className="font-semibold text-slate-900 group-hover:text-teal-700 transition-colors">
                      {lead.full_name}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                      <span className="font-mono">{lead.phone}</span>
                      {lead.email && (
                        <>
                          <span className="text-slate-300">·</span>
                          <span className="truncate max-w-[140px]">{lead.email}</span>
                        </>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-3 text-slate-700">
                    <span className="font-medium truncate max-w-[150px] inline-block">
                      {lead.course_interest || 'Not specified'}
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    <StatusBadge status={lead.status} />
                  </td>
                  <td className="py-3 px-3">
                    <PriorityBadge priority={lead.priority} />
                  </td>
                  <td className="py-3 px-3 text-right text-slate-500 tabular-nums">
                    {formatDate(lead.created_at)}
                  </td>
                  <td className="py-3 pl-3 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewLead(lead);
                      }}
                      className="p-1 text-slate-400 group-hover:text-slate-700 rounded-md transition-colors"
                      aria-label="View lead details"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
