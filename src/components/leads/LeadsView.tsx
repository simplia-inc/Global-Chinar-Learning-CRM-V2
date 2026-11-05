import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Filter,
  Plus,
  RefreshCw,
  Phone,
  Mail,
  User,
  Clock,
  ChevronRight,
  Sparkles,
  SlidersHorizontal,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { leadService } from '../../services/leadService';
import type { Lead, LeadStatus, LeadPriority } from '../../types/database';
import { StatusBadge, PriorityBadge } from '../common/Badge';
import { EmptyState } from '../common/EmptyState';

interface LeadsViewProps {
  onSelectLead: (lead: Lead) => void;
  onOpenCreateLead: () => void;
  onEditLead: (lead: Lead) => void;
}

export const LeadsView: React.FC<LeadsViewProps> = ({
  onSelectLead,
  onOpenCreateLead,
  onEditLead,
}) => {
  const { role } = useAuth();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');

  const fetchLeads = async () => {
    setLoading(true);
    setErrorMsg(null);

    const { data, error } = await leadService.getLeads({
      status: statusFilter,
      priority: priorityFilter,
      search: searchQuery,
    });

    setLoading(false);

    if (error) {
      setErrorMsg(error.message);
    } else {
      setLeads(data);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, [statusFilter, priorityFilter]);

  // Client side debounce or search trigger
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchLeads();
  };

  const filteredLeads = useMemo(() => {
    if (!searchQuery.trim()) return leads;
    const q = searchQuery.toLowerCase().trim();
    return leads.filter((l) => {
      const name = l.full_name?.toLowerCase() || '';
      const email = l.email?.toLowerCase() || '';
      const phone = l.phone?.toLowerCase() || '';
      const course = l.course_interest?.toLowerCase() || '';
      return name.includes(q) || email.includes(q) || phone.includes(q) || course.includes(q);
    });
  }, [leads, searchQuery]);

  const formatDate = (isoString?: string) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return '—';
    }
  };

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            {role === 'employee' ? 'My Assigned Leads' : 'Admissions Pipeline & Student Leads'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage inquiries, assign admissions staff, and track student enrollment progress.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchLeads}
            disabled={loading}
            className="p-2 text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
            title="Refresh leads from database"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {role !== 'trainer' && (
            <button
              type="button"
              onClick={onOpenCreateLead}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Student Lead</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
        <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row gap-3">
          {/* Search box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by student name, email, or phone number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-xs placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-teal-600 focus:border-transparent"
            />
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-600"
            >
              <option value="all">All Statuses</option>
              <option value="new">New Inquiries</option>
              <option value="contacted">Contacted</option>
              <option value="in_progress">In Progress</option>
              <option value="qualified">Qualified</option>
              <option value="converted">Converted / Enrolled</option>
              <option value="lost">Lost</option>
              <option value="archived">Archived</option>
            </select>

            {/* Priority Filter */}
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-600"
            >
              <option value="all">All Priorities</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>

            <button
              type="submit"
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              Search
            </button>
          </div>
        </form>

        {/* Lead Count Status Line */}
        <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
          <div className="flex items-center gap-2">
            <span>Showing <strong className="text-slate-800 tabular-nums">{filteredLeads.length}</strong> student inquiries</span>
            {(statusFilter !== 'all' || priorityFilter !== 'all' || searchQuery) && (
              <button
                type="button"
                onClick={() => {
                  setStatusFilter('all');
                  setPriorityFilter('all');
                  setSearchQuery('');
                }}
                className="text-teal-700 hover:underline cursor-pointer"
              >
                Clear all filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Error message */}
      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs">
          {errorMsg}
        </div>
      )}

      {/* Leads Table Container */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500">
            <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            Loading leads from database...
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={SlidersHorizontal}
              title={leads.length === 0 ? 'No leads in pipeline yet' : 'No matching leads found'}
              description={
                leads.length === 0
                  ? 'Get started by creating your first student lead record.'
                  : 'Try adjusting your search criteria or resetting the filters.'
              }
              actionText={role !== 'trainer' ? '+ Add New Lead' : undefined}
              onAction={role !== 'trainer' ? onOpenCreateLead : undefined}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold text-[10px]">
                  <th className="py-3 px-4">Student Prospect</th>
                  <th className="py-3 px-4">Contact Details</th>
                  <th className="py-3 px-4">Course Interest</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Priority</th>
                  <th className="py-3 px-4">Source</th>
                  <th className="py-3 px-4 text-right">Registered</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLeads.map((lead) => (
                  <tr
                    key={lead.id}
                    onClick={() => onSelectLead(lead)}
                    className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                  >
                    <td className="py-3.5 px-4 font-semibold text-slate-900 group-hover:text-teal-700 transition-colors">
                      {lead.full_name}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-mono text-slate-800">{lead.phone}</span>
                        {lead.email && <span className="text-slate-400 text-[11px]">{lead.email}</span>}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-800 font-medium">
                      {lead.course_interest || 'General DM Masterclass'}
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusBadge status={lead.status} />
                    </td>
                    <td className="py-3.5 px-4">
                      <PriorityBadge priority={lead.priority} />
                    </td>
                    <td className="py-3.5 px-4 text-slate-500">
                      {lead.source || 'Website'}
                    </td>
                    <td className="py-3.5 px-4 text-right text-slate-500 tabular-nums">
                      {formatDate(lead.created_at)}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectLead(lead);
                        }}
                        className="p-1 text-slate-400 group-hover:text-slate-700 rounded-md transition-colors inline-flex items-center gap-1 font-medium text-xs text-teal-700"
                      >
                        <span>View</span>
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
    </div>
  );
};
