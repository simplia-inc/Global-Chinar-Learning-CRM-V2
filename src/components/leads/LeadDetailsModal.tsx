import React, { useState, useEffect } from 'react';
import {
  Phone,
  Mail,
  Calendar,
  Clock,
  User,
  Plus,
  CheckCircle,
  AlertCircle,
  MessageSquare,
  MapPin,
  Edit2,
  Share2,
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { StatusBadge, PriorityBadge, FollowUpStatusBadge } from '../common/Badge';
import { leadService } from '../../services/leadService';
import { teamService } from '../../services/teamService';
import type { Lead, LeadAssignment, FollowUp, LeadStatus, Profile, ContactMethod } from '../../types/database';

interface LeadDetailsModalProps {
  isOpen: boolean;
  leadId: string | null;
  onClose: () => void;
  onEditLead: (lead: Lead) => void;
  onLeadUpdated: () => void;
}

export const LeadDetailsModal: React.FC<LeadDetailsModalProps> = ({
  isOpen,
  leadId,
  onClose,
  onEditLead,
  onLeadUpdated,
}) => {
  const [lead, setLead] = useState<Lead | null>(null);
  const [assignments, setAssignments] = useState<LeadAssignment[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Quick status update state
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Follow-up form state
  const [showFollowUpForm, setShowFollowUpForm] = useState(false);
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpTime, setFollowUpTime] = useState('10:00');
  const [followUpMethod, setFollowUpMethod] = useState<ContactMethod>('call');
  const [followUpNotes, setFollowUpNotes] = useState('');
  const [savingFollowUp, setSavingFollowUp] = useState(false);

  // Quick Assign state
  const [staffList, setStaffList] = useState<Profile[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);

  const loadLeadData = async () => {
    if (!leadId) return;
    setLoading(true);
    setErrorMsg(null);

    try {
      const result = await leadService.getLeadById(leadId);
      if (result.error) {
        setErrorMsg(result.error.message);
      } else {
        setLead(result.lead);
        setAssignments(result.assignments);
        setFollowUps(result.followUps);
        if (result.lead?.assigned_to) {
          setSelectedStaffId(result.lead.assigned_to);
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load lead details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && leadId) {
      loadLeadData();
      teamService.getAssignableStaff().then(({ data }) => setStaffList(data));
      setShowFollowUpForm(false);
    }
  }, [isOpen, leadId]);

  const handleStatusChange = async (newStatus: LeadStatus) => {
    if (!lead) return;
    setIsUpdatingStatus(true);
    const { data, error } = await leadService.updateLead(lead.id, { status: newStatus });
    setIsUpdatingStatus(false);

    if (error) {
      setErrorMsg(error.message);
    } else if (data) {
      setLead(data);
      onLeadUpdated();
    }
  };

  const handleCreateFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lead || !followUpDate) return;

    setSavingFollowUp(true);
    const scheduledIso = new Date(`${followUpDate}T${followUpTime}:00`).toISOString();

    const { data, error } = await leadService.addFollowUp({
      lead_id: lead.id,
      scheduled_at: scheduledIso,
      contact_method: followUpMethod,
      notes: followUpNotes.trim() || null,
    });

    setSavingFollowUp(false);

    if (error) {
      setErrorMsg(error.message);
    } else if (data) {
      setFollowUps((prev) => [data, ...prev]);
      setShowFollowUpForm(false);
      setFollowUpNotes('');
      onLeadUpdated();
    }
  };

  const handleCompleteFollowUp = async (followUpId: string) => {
    const { error } = await leadService.updateFollowUpStatus(followUpId, 'completed');
    if (!error) {
      setFollowUps((prev) =>
        prev.map((f) =>
          f.id === followUpId ? { ...f, status: 'completed', completed_at: new Date().toISOString() } : f
        )
      );
      onLeadUpdated();
    }
  };

  const handleAssignStaff = async () => {
    if (!lead || !selectedStaffId) return;
    setIsAssigning(true);
    const { error } = await leadService.assignLead(lead.id, selectedStaffId, 'Re-assigned from lead drawer');
    setIsAssigning(false);

    if (error) {
      setErrorMsg(error.message);
    } else {
      setLead((prev) => (prev ? { ...prev, assigned_to: selectedStaffId } : null));
      loadLeadData();
      onLeadUpdated();
    }
  };

  const formatDateTime = (isoString?: string) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={lead ? lead.full_name : 'Lead Details'}
      subtitle="Admissions candidate dossier"
      maxWidth="3xl"
    >
      {loading ? (
        <div className="py-12 text-center text-slate-500 text-xs">
          <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          Loading lead record from Supabase...
        </div>
      ) : errorMsg && !lead ? (
        <div className="p-4 bg-rose-50 text-rose-700 rounded-xl border border-rose-200 text-xs">
          {errorMsg}
        </div>
      ) : lead ? (
        <div className="space-y-6 text-xs text-slate-700">
          {/* Header Card */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-base font-bold text-slate-900">{lead.full_name}</span>
                <StatusBadge status={lead.status} />
                <PriorityBadge priority={lead.priority} />
              </div>
              <p className="text-slate-600 font-medium">{lead.course_interest || 'Digital Marketing Masterclass'}</p>
              <div className="flex items-center gap-4 text-[11px] text-slate-500 pt-1">
                <span className="flex items-center gap-1 font-mono">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  {lead.phone}
                </span>
                {lead.email && (
                  <span className="flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    {lead.email}
                  </span>
                )}
                <span>Source: {lead.source || 'Website'}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  onEditLead(lead);
                  onClose();
                }}
                className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 rounded-lg font-medium shadow-2xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Edit Lead</span>
              </button>
            </div>
          </div>

          {/* Quick Status & Assignee Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-white border border-slate-200 rounded-xl">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Update Admissions Status
              </label>
              <select
                disabled={isUpdatingStatus}
                value={lead.status}
                onChange={(e) => handleStatusChange(e.target.value as LeadStatus)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-slate-50/50 font-medium text-slate-900 focus:ring-2 focus:ring-teal-600"
              >
                <option value="new">New Lead</option>
                <option value="contacted">Contacted</option>
                <option value="in_progress">In Progress</option>
                <option value="qualified">Qualified</option>
                <option value="converted">Converted / Enrolled</option>
                <option value="lost">Lost</option>
                <option value="archived">Archived</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Assigned Staff Member
              </label>
              <div className="flex gap-2">
                <select
                  value={selectedStaffId}
                  onChange={(e) => setSelectedStaffId(e.target.value)}
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-xs bg-slate-50/50 text-slate-900 focus:ring-2 focus:ring-teal-600"
                >
                  <option value="">-- Unassigned --</option>
                  {staffList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name || s.email} ({s.role})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleAssignStaff}
                  disabled={isAssigning || selectedStaffId === lead.assigned_to}
                  className="px-3 py-2 bg-slate-900 text-white font-medium rounded-lg hover:bg-slate-800 disabled:opacity-40 transition-colors cursor-pointer"
                >
                  {isAssigning ? '...' : 'Assign'}
                </button>
              </div>
            </div>
          </div>

          {/* Counselor Notes */}
          {lead.notes && (
            <div className="p-4 bg-amber-50/60 border border-amber-200/60 rounded-xl">
              <h4 className="text-[11px] font-semibold text-amber-900 uppercase tracking-wider mb-1">
                Background & Student Notes
              </h4>
              <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">{lead.notes}</p>
            </div>
          )}

          {/* Follow-Ups Section */}
          <div className="border border-slate-200 rounded-xl p-4 bg-white">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h4 className="text-sm font-semibold text-slate-900">Follow-Up Schedule & History</h4>
                <p className="text-[11px] text-slate-500">Track student touches across phone, WhatsApp, and in-person counseling</p>
              </div>
              <button
                type="button"
                onClick={() => setShowFollowUpForm(!showFollowUpForm)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Schedule Follow-Up</span>
              </button>
            </div>

            {/* Schedule Follow-up Form */}
            {showFollowUpForm && (
              <form onSubmit={handleCreateFollowUp} className="mb-4 p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                <h5 className="font-semibold text-slate-800 text-xs">New Touchpoint Appointment</h5>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">Date</label>
                    <input
                      type="date"
                      required
                      value={followUpDate}
                      onChange={(e) => setFollowUpDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">Time</label>
                    <input
                      type="time"
                      required
                      value={followUpTime}
                      onChange={(e) => setFollowUpTime(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">Method</label>
                    <select
                      value={followUpMethod}
                      onChange={(e) => setFollowUpMethod(e.target.value as ContactMethod)}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white"
                    >
                      <option value="call">Phone Call</option>
                      <option value="whatsapp">WhatsApp Message</option>
                      <option value="email">Email</option>
                      <option value="in_person">In-Person Campus Visit</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Discussion Agenda / Notes</label>
                  <input
                    type="text"
                    placeholder="e.g. Discuss batch fees and curriculum details"
                    value={followUpNotes}
                    onChange={(e) => setFollowUpNotes(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowFollowUpForm(false)}
                    className="px-3 py-1 border border-slate-300 rounded-md text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingFollowUp}
                    className="px-4 py-1 bg-teal-700 text-white rounded-md font-semibold hover:bg-teal-800 disabled:opacity-50"
                  >
                    {savingFollowUp ? 'Saving...' : 'Save Follow-Up'}
                  </button>
                </div>
              </form>
            )}

            {/* Follow-up list */}
            {followUps.length === 0 ? (
              <p className="text-center py-6 text-slate-400 text-xs">
                No follow-ups logged for this lead yet.
              </p>
            ) : (
              <div className="space-y-2">
                {followUps.map((fu) => (
                  <div
                    key={fu.id}
                    className="p-3 rounded-lg border border-slate-100 bg-slate-50/60 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0">
                        {fu.contact_method === 'call' && <Phone className="w-3.5 h-3.5 text-blue-600" />}
                        {fu.contact_method === 'whatsapp' && <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />}
                        {fu.contact_method === 'email' && <Mail className="w-3.5 h-3.5 text-purple-600" />}
                        {fu.contact_method === 'in_person' && <MapPin className="w-3.5 h-3.5 text-amber-600" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900 capitalize">{fu.contact_method}</span>
                          <FollowUpStatusBadge status={fu.status} />
                        </div>
                        {fu.notes && <p className="text-[11px] text-slate-600 mt-0.5">{fu.notes}</p>}
                        <p className="text-[10px] text-slate-400 tabular-nums mt-0.5">
                          Scheduled: {formatDateTime(fu.scheduled_at)}
                        </p>
                      </div>
                    </div>

                    {fu.status === 'pending' && (
                      <button
                        type="button"
                        onClick={() => handleCompleteFollowUp(fu.id)}
                        className="px-2.5 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50 rounded-md border border-emerald-200 transition-colors"
                      >
                        Mark Done
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Assignment History (reads from lead_assignments) */}
          {assignments.length > 0 && (
            <div className="border border-slate-200 rounded-xl p-4 bg-white">
              <h4 className="text-sm font-semibold text-slate-900 mb-2">Assignment Audit Trail</h4>
              <div className="space-y-2">
                {assignments.map((a) => (
                  <div key={a.id} className="flex items-center justify-between text-[11px] text-slate-600 py-1.5 border-b border-slate-100 last:border-0">
                    <span className="font-medium text-slate-800">
                      Assigned to profile <span className="font-mono text-slate-500">{a.assigned_to.slice(0, 8)}...</span>
                    </span>
                    <span className="text-slate-400 tabular-nums">{formatDateTime(a.created_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </Modal>
  );
};
