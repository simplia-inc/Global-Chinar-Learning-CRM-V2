import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal';
import { leadService } from '../../services/leadService';
import { teamService } from '../../services/teamService';
import { getSupabaseClient } from '../../lib/supabase';
import type { Lead, LeadStatus, LeadPriority, Profile } from '../../types/database';

interface LeadFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (lead: Lead) => void;
  initialLead?: Lead | null;
}

const SOURCES = [
  'Website Form',
  'Instagram DM / Ad',
  'Facebook Campaign',
  'Campus Walk-in',
  'Student Referral',
  'Google Search / Ad',
  'Direct Phone Call',
  'WhatsApp Inquiry',
];

export const LeadFormModal: React.FC<LeadFormModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialLead,
}) => {
  const isEditing = Boolean(initialLead);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [courseInterest, setCourseInterest] = useState('');
  const [courseOptions, setCourseOptions] = useState<string[]>([]);
  const [status, setStatus] = useState<LeadStatus>('new');
  const [priority, setPriority] = useState<LeadPriority>('normal');
  const [source, setSource] = useState(SOURCES[0]);
  const [notes, setNotes] = useState('');
  const [assignedTo, setAssignedTo] = useState<string>('');

  const [staffList, setStaffList] = useState<Profile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const db = getSupabaseClient();
    if (!db) return;
    void db.from('school_courses').select('name').eq('is_active', true).order('name').then(({ data }) => {
      setCourseOptions((data || []).map((c: { name: string }) => c.name));
    });
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      if (initialLead) {
        setFullName(initialLead.full_name);
        setEmail(initialLead.email || '');
        setPhone(initialLead.phone);
        setCourseInterest(initialLead.course_interest || '');
        setStatus(initialLead.status);
        setPriority(initialLead.priority);
        setSource(initialLead.source || SOURCES[0]);
        setNotes(initialLead.notes || '');
        setAssignedTo(initialLead.assigned_to || '');
      } else {
        setFullName('');
        setEmail('');
        setPhone('');
        setCourseInterest('');
        setStatus('new');
        setPriority('normal');
        setSource(SOURCES[0]);
        setNotes('');
        setAssignedTo('');
      }
      setErrorMsg(null);

      // Fetch staff members for assignment
      teamService.getAssignableStaff().then(({ data }) => {
        setStaffList(data);
      });
    }
  }, [isOpen, initialLead]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    if (!fullName.trim() || !phone.trim()) {
      setErrorMsg('Full Name and Phone Number are required.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const payload = {
        full_name: fullName.trim(),
        email: email.trim() || null,
        phone: phone.trim(),
        course_interest: courseInterest,
        status,
        priority,
        source,
        notes: notes.trim() || null,
        assigned_to: assignedTo || null,
      };

      const result = isEditing && initialLead
        ? await leadService.updateLead(initialLead.id, payload)
        : await leadService.createLead(payload);

      if (result.error) {
        setErrorMsg(result.error.message || 'Unable to save this lead.');
        return;
      }

      if (!result.data) {
        setErrorMsg('Supabase returned no saved lead. Refresh the Leads page and check before retrying.');
        return;
      }

      onSuccess(result.data);
      onClose();
    } catch (err: unknown) {
      console.error('Lead form submission failed:', err);
      setErrorMsg(err instanceof Error ? err.message : 'Unexpected error while saving the lead.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Student Lead' : 'Create New Student Lead'}
      subtitle="Register candidate in Global Chinar admissions pipeline"
      maxWidth="xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {errorMsg && (
          <div className="p-3 bg-rose-50 text-rose-700 rounded-lg border border-rose-200">
            {errorMsg}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block font-medium text-slate-700 mb-1">
              Full Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Aasif Mir"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-600 text-xs"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">
              Phone Number <span className="text-rose-500">*</span>
            </label>
            <input
              type="tel"
              required
              placeholder="e.g. +91 98765 43210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-600 font-mono text-xs"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block font-medium text-slate-700 mb-1">
              Email Address
            </label>
            <input
              type="email"
              placeholder="candidate@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-600 text-xs"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">
              Course Interest
            </label>
            <input
              list="course-options"
              value={courseInterest}
              onChange={(e) => setCourseInterest(e.target.value)}
              placeholder="Course the lead is interested in"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-600 text-xs bg-white"
            />
            <datalist id="course-options">
              {courseOptions.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block font-medium text-slate-700 mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as LeadStatus)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-600 text-xs bg-white"
            >
              <option value="new">New Lead</option>
              <option value="contacted">Contacted</option>
              <option value="follow_up">Follow-up</option>
              <option value="qualified">Qualified</option>
              <option value="converted">Converted</option>
              <option value="lost">Lost</option>
            </select>
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as LeadPriority)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-600 text-xs bg-white"
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </select>
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">Inquiry Source</label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-600 text-xs bg-white"
            >
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Assigned Staff Selection */}
        <div>
          <label className="block font-medium text-slate-700 mb-1">
            Assigned Admissions Officer / Staff
          </label>
          <select
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-600 text-xs bg-white"
          >
            <option value="">-- Unassigned (Admissions Pool) --</option>
            {staffList.map((staff) => (
              <option key={staff.id} value={staff.id}>
                {staff.full_name || staff.email} ({staff.role})
              </option>
            ))}
          </select>
        </div>

        {/* Notes */}
        <div>
          <label className="block font-medium text-slate-700 mb-1">
            Counselor Notes & Background
          </label>
          <textarea
            rows={3}
            placeholder="Career goals, preferred batch timings (Morning/Weekend), background in marketing..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-600 text-xs"
          />
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 rounded-lg font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2 bg-slate-900 text-white rounded-lg font-semibold hover:bg-slate-800 disabled:opacity-50"
          >
            {submitting ? 'Saving to Database...' : isEditing ? 'Update Lead' : 'Create Lead'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
