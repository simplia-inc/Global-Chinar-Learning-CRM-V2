import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, RefreshCw, SlidersHorizontal, ChevronLeft, ChevronRight, UserPlus, CalendarPlus, X, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { leadService } from '../../services/leadService';
import { teamService } from '../../services/teamService';
import type { Lead, Profile } from '../../types/database';
import { StatusBadge, PriorityBadge } from '../common/Badge';
import { EmptyState } from '../common/EmptyState';

interface LeadsViewProps {
  onSelectLead: (lead: Lead) => void;
  onOpenCreateLead: () => void; // kept for API compatibility; the single "Add Lead" action lives in the top bar
  onEditLead: (lead: Lead) => void;
}

const PAGE_SIZE = 25;
const sel = 'px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-600 min-w-0';
const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '—');
const fmtDateTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '—');

export const LeadsView: React.FC<LeadsViewProps> = ({ onSelectLead }) => {
  const { role } = useAuth();
  const isAdmin = role === 'super_admin' || role === 'admin';

  const [leads, setLeads] = useState<Lead[]>([]);
  const [staff, setStaff] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [courseFilter, setCourseFilter] = useState('all');
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAssignee, setBulkAssignee] = useState('');
  const [fuOpen, setFuOpen] = useState(false);
  const [fuWhen, setFuWhen] = useState('');
  const [fuMethod, setFuMethod] = useState('call');
  const [fuNotes, setFuNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    const [res, staffRes] = await Promise.all([
      leadService.getLeads({ status: statusFilter, priority: priorityFilter }),
      teamService.getAssignableStaff(),
    ]);
    setLoading(false);
    if (res.error) setErrorMsg(res.error.message); else setLeads(res.data);
    setStaff(staffRes.data || []);
    setSelected(new Set());
  }, [statusFilter, priorityFilter]);

  useEffect(() => { void fetchLeads(); }, [fetchLeads]);

  const staffName = useMemo(() => new Map(staff.map((p) => [p.id, p.full_name || p.email])), [staff]);
  const sources = useMemo(() => [...new Set(leads.map((l) => (l.source || '').trim()).filter(Boolean))].sort(), [leads]);
  const courses = useMemo(() => [...new Set(leads.map((l) => (l.course_interest || '').trim()).filter(Boolean))].sort(), [leads]);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const from = dateFrom ? new Date(`${dateFrom}T00:00:00+05:30`).getTime() : null;
    const to = dateTo ? new Date(`${dateTo}T23:59:59+05:30`).getTime() : null;
    return leads.filter((l) => {
      if (q && !(`${l.full_name} ${l.email || ''} ${l.phone || ''} ${l.course_interest || ''}`.toLowerCase().includes(q))) return false;
      if (sourceFilter !== 'all' && (l.source || '').trim() !== sourceFilter) return false;
      if (courseFilter !== 'all' && (l.course_interest || '').trim() !== courseFilter) return false;
      if (employeeFilter === 'unassigned' && l.assigned_to) return false;
      if (employeeFilter !== 'all' && employeeFilter !== 'unassigned' && l.assigned_to !== employeeFilter) return false;
      const t = new Date(l.created_at).getTime();
      if (from !== null && t < from) return false;
      if (to !== null && t > to) return false;
      return true;
    });
  }, [leads, searchQuery, sourceFilter, courseFilter, employeeFilter, dateFrom, dateTo]);

  useEffect(() => { setPage(1); }, [searchQuery, sourceFilter, courseFilter, employeeFilter, dateFrom, dateTo, statusFilter, priorityFilter]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const allOnPage = pageRows.length > 0 && pageRows.every((l) => selected.has(l.id));
  const filtersActive = [statusFilter, priorityFilter, sourceFilter, courseFilter, employeeFilter].some((v) => v !== 'all') || searchQuery || dateFrom || dateTo;

  const clearFilters = () => {
    setStatusFilter('all'); setPriorityFilter('all'); setSourceFilter('all'); setCourseFilter('all'); setEmployeeFilter('all');
    setSearchQuery(''); setDateFrom(''); setDateTo('');
  };
  const toggle = (id: string) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const togglePage = () => setSelected((prev) => { const n = new Set(prev); pageRows.forEach((l) => (allOnPage ? n.delete(l.id) : n.add(l.id))); return n; });

  const doBulkAssign = async () => {
    if (!bulkAssignee || selected.size === 0) return;
    if (!window.confirm(`Assign ${selected.size} lead${selected.size === 1 ? '' : 's'} to ${staffName.get(bulkAssignee) || 'this person'}? Existing assignments will be replaced and recorded in the history.`)) return;
    setBusy(true); setErrorMsg(null);
    const { error } = await leadService.bulkAssign([...selected], bulkAssignee);
    setBusy(false);
    if (error) setErrorMsg(error.message); else setNotice(`${selected.size} lead${selected.size === 1 ? '' : 's'} assigned.`);
    setBulkAssignee(''); await fetchLeads();
  };

  const doBulkDelete = async () => {
    if (selected.size === 0) return;
    const n = selected.size;
    if (!window.confirm(`Permanently delete ${n} lead${n === 1 ? '' : 's'}?\n\nTheir follow-ups and assignment history are deleted too. Any student already created from a lead is kept. Leads that came from Google Sheets will not be imported again.\n\nThis cannot be undone.`)) return;
    setBusy(true); setErrorMsg(null);
    const { deleted, error } = await leadService.deleteLeads([...selected]);
    setBusy(false);
    if (error) setErrorMsg(error.message); else setNotice(`${deleted} lead${deleted === 1 ? '' : 's'} deleted.`);
    await fetchLeads();
  };

  const doBulkFollowUp = async () => {
    if (!fuWhen || selected.size === 0) return;
    setBusy(true); setErrorMsg(null);
    const { error } = await leadService.bulkScheduleFollowUp([...selected], new Date(fuWhen).toISOString(), fuMethod, fuNotes);
    setBusy(false);
    if (error) setErrorMsg(error.message); else { setNotice(`Follow-up scheduled for ${selected.size} lead${selected.size === 1 ? '' : 's'}.`); setFuOpen(false); setFuWhen(''); setFuNotes(''); }
    await fetchLeads();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">{role === 'employee' ? 'My Assigned Leads' : 'Leads & Admissions Pipeline'}</h2>
          <p className="text-xs text-slate-500 mt-0.5">Manage inquiries, assign admissions staff and track follow-ups. Leads synced from Google Sheets appear here automatically.</p>
        </div>
        <button type="button" onClick={() => void fetchLeads()} disabled={loading} title="Refresh leads"
          className="p-2 text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input type="search" placeholder="Search by name, email, phone or course…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-xs placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-teal-600" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
          <select aria-label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={sel}>
            <option value="all">All statuses</option><option value="new">New</option><option value="contacted">Contacted</option><option value="follow_up">Follow-up</option>
            <option value="qualified">Qualified</option><option value="converted">Converted</option><option value="lost">Lost</option>
          </select>
          <select aria-label="Priority" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className={sel}>
            <option value="all">All priorities</option><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option>
          </select>
          <select aria-label="Source" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className={sel}>
            <option value="all">All sources</option>{sources.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select aria-label="Course" value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)} className={sel}>
            <option value="all">All courses</option>{courses.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select aria-label="Employee" value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)} className={sel}>
            <option value="all">All employees</option><option value="unassigned">Unassigned</option>
            {staff.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
          </select>
          <input aria-label="Created from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={sel} />
          <input aria-label="Created to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={sel} />
          {filtersActive && <button type="button" onClick={clearFilters} className="text-xs text-teal-700 hover:underline cursor-pointer text-left px-1">Clear filters</button>}
        </div>
        <div className="text-xs text-slate-500">Showing <strong className="text-slate-800 tabular-nums">{filtered.length}</strong> of {leads.length} leads</div>
      </div>

      {notice && (
        <div role="status" className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs flex justify-between">
          <span>{notice}</span><button type="button" onClick={() => setNotice(null)} className="font-semibold underline cursor-pointer">Dismiss</button>
        </div>
      )}
      {errorMsg && <div role="alert" className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs">{errorMsg}</div>}

      {selected.size > 0 && (
        <div className="sticky top-16 z-20 flex flex-wrap items-center gap-3 p-3 bg-slate-900 text-white rounded-xl shadow-lg text-xs">
          <span className="font-semibold">{selected.size} selected</span>
          {isAdmin && (
            <span className="flex items-center gap-2">
              <select aria-label="Assign to" value={bulkAssignee} onChange={(e) => setBulkAssignee(e.target.value)} className="px-2 py-1.5 rounded-md text-slate-900 text-xs">
                <option value="">Assign to…</option>{staff.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
              </select>
              <button type="button" onClick={() => void doBulkAssign()} disabled={!bulkAssignee || busy} className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold rounded-md cursor-pointer disabled:opacity-50"><UserPlus className="w-3.5 h-3.5" />Assign</button>
            </span>
          )}
          <button type="button" onClick={() => setFuOpen((v) => !v)} className="inline-flex items-center gap-1 px-3 py-1.5 bg-teal-600 hover:bg-teal-500 font-semibold rounded-md cursor-pointer"><CalendarPlus className="w-3.5 h-3.5" />Schedule follow-up</button>
          {isAdmin && (
            <button type="button" onClick={() => void doBulkDelete()} disabled={busy} className="inline-flex items-center gap-1 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 font-semibold rounded-md cursor-pointer disabled:opacity-50"><Trash2 className="w-3.5 h-3.5" />Delete</button>
          )}
          <button type="button" onClick={() => setSelected(new Set())} className="ml-auto inline-flex items-center gap-1 text-slate-300 hover:text-white cursor-pointer"><X className="w-3.5 h-3.5" />Clear</button>
          {fuOpen && (
            <div className="w-full flex flex-wrap items-center gap-2 pt-2 border-t border-slate-700">
              <input aria-label="Follow-up date and time" type="datetime-local" value={fuWhen} onChange={(e) => setFuWhen(e.target.value)} className="px-2 py-1.5 rounded-md text-slate-900 text-xs" />
              <select aria-label="Method" value={fuMethod} onChange={(e) => setFuMethod(e.target.value)} className="px-2 py-1.5 rounded-md text-slate-900 text-xs">
                <option value="call">Call</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="in_person">In person</option>
              </select>
              <input aria-label="Note" value={fuNotes} onChange={(e) => setFuNotes(e.target.value)} placeholder="Note (optional)" className="flex-1 min-w-40 px-2 py-1.5 rounded-md text-slate-900 text-xs" />
              <button type="button" onClick={() => void doBulkFollowUp()} disabled={!fuWhen || busy} className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold rounded-md cursor-pointer disabled:opacity-50">Schedule</button>
            </div>
          )}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500"><div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />Loading leads…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8">
            <EmptyState icon={SlidersHorizontal} title={leads.length === 0 ? 'No leads in the pipeline yet' : 'No matching leads'}
              description={leads.length === 0 ? 'Use Add Lead in the top bar, or connect a Google Sheet to import leads automatically.' : 'Try adjusting the search or clearing the filters.'} />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs min-w-[1100px]">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold text-[10px]">
                    <th className="py-3 pl-4 w-8"><input type="checkbox" aria-label="Select all on this page" checked={allOnPage} onChange={togglePage} className="accent-teal-600" /></th>
                    <th className="py-3 px-3">Lead</th><th className="py-3 px-3">Contact</th><th className="py-3 px-3">Course</th><th className="py-3 px-3">Source</th>
                    <th className="py-3 px-3">Assigned to</th><th className="py-3 px-3">Status</th><th className="py-3 px-3">Priority</th>
                    <th className="py-3 px-3">Last contact</th><th className="py-3 px-3">Next follow-up</th><th className="py-3 px-3 text-right">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pageRows.map((lead) => {
                    const overdue = lead.next_follow_up_at && new Date(lead.next_follow_up_at).getTime() < Date.now() && lead.status !== 'converted' && lead.status !== 'lost';
                    return (
                      <tr key={lead.id} onClick={() => onSelectLead(lead)} className="hover:bg-slate-50/80 cursor-pointer group">
                        <td className="py-3 pl-4" onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`Select ${lead.full_name}`} checked={selected.has(lead.id)} onChange={() => toggle(lead.id)} className="accent-teal-600" /></td>
                        <td className="py-3 px-3 font-semibold text-slate-900 group-hover:text-teal-700">{lead.full_name}</td>
                        <td className="py-3 px-3"><div className="font-mono text-slate-800">{lead.phone || '—'}</div>{lead.email && <div className="text-slate-400 text-[11px]">{lead.email}</div>}</td>
                        <td className="py-3 px-3 text-slate-800">{lead.course_interest || 'Not specified'}</td>
                        <td className="py-3 px-3 text-slate-500">{lead.source || '—'}</td>
                        <td className="py-3 px-3 text-slate-700">{lead.assigned_to ? staffName.get(lead.assigned_to) || 'Assigned' : <span className="text-slate-400">Unassigned</span>}</td>
                        <td className="py-3 px-3"><StatusBadge status={lead.status} /></td>
                        <td className="py-3 px-3"><PriorityBadge priority={lead.priority} /></td>
                        <td className="py-3 px-3 text-slate-500 whitespace-nowrap">{fmtDate(lead.last_contact_at)}</td>
                        <td className={`py-3 px-3 whitespace-nowrap ${overdue ? 'text-rose-600 font-semibold' : 'text-slate-500'}`}>{fmtDateTime(lead.next_follow_up_at)}</td>
                        <td className="py-3 px-3 text-right text-slate-500 tabular-nums whitespace-nowrap">{fmtDate(lead.created_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-xs text-slate-500">
              <span>Page {page} of {pages}</span>
              <div className="flex items-center gap-1">
                <button type="button" aria-label="Previous page" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded-md border border-slate-200 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"><ChevronLeft className="w-4 h-4" /></button>
                <button type="button" aria-label="Next page" onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page === pages} className="p-1.5 rounded-md border border-slate-200 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"><ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
