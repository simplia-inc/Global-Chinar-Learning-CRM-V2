import { getSupabaseClient } from '../lib/supabase';
import type { Lead, LeadAssignment, FollowUp, DashboardStats, LeadStatus, LeadPriority } from '../types/database';

export interface LeadFilterOptions {
  search?: string;
  status?: string;
  priority?: string;
  course?: string;
  limit?: number;
}

// The existing Supabase schema names this column "interested_course".
// The UI keeps its existing TypeScript property name "course_interest".
function mapLeadRow(row: any): Lead {
  if (!row) return row;
  return {
    ...row,
    course_interest: row.interested_course ?? row.course_interest ?? null,
  } as Lead;
}

// lead_assignments stores employee_id / assigned_at; the UI uses assigned_to / created_at.
function mapAssignmentRow(row: any): LeadAssignment {
  return { ...row, assigned_to: row.employee_id, created_at: row.assigned_at } as LeadAssignment;
}

// follow_ups stores the contact method in follow_up_type and the owner in employee_id.
function mapFollowUpRow(row: any): FollowUp {
  if (!row) return row;
  return {
    ...row,
    contact_method: row.contact_method ?? row.follow_up_type ?? 'call',
    created_by: row.created_by ?? row.employee_id ?? null,
    scheduled_at: row.scheduled_at ?? row.next_follow_up_at ?? row.created_at,
  } as FollowUp;
}

function mapLeadUpdates(updates: Partial<Lead>): Record<string, any> {
  const payload: Record<string, any> = { ...updates };
  if (Object.prototype.hasOwnProperty.call(payload, 'course_interest')) {
    payload.interested_course = payload.course_interest;
    delete payload.course_interest;
  }
  return payload;
}

export const leadService = {
  async getLeads(options: LeadFilterOptions = {}): Promise<{ data: Lead[]; error: Error | null }> {
    const client = getSupabaseClient();
    if (!client) return { data: [], error: new Error('Supabase client not initialized') };

    try {
      let query = client
        .from('leads')
        .select(`
          id,
          full_name,
          email,
          phone,
          course_interest:interested_course,
          status,
          priority,
          source,
          notes,
          assigned_to,
          next_follow_up_at,
          created_at,
          updated_at
        `)
        .order('created_at', { ascending: false })
        .limit(options.limit ?? 1000);

      if (options.status && options.status !== 'all') query = query.eq('status', options.status);
      if (options.priority && options.priority !== 'all') query = query.eq('priority', options.priority);
      if (options.course && options.course !== 'all') query = query.eq('interested_course', options.course);
      const { data, error } = await query;
      if (error) {
        console.error('Error fetching leads:', error);
        return { data: [], error: new Error(error.message) };
      }

      let leadsList = ((data as any[]) || []).map(mapLeadRow);
      // Last contact = most recent completed follow-up (RLS limits this to follow-ups the user may see).
      if (leadsList.length > 0 && !options.limit) {
        const { data: done } = await client.from('follow_ups').select('lead_id, completed_at').eq('status', 'completed').not('completed_at', 'is', null);
        const latest = new Map<string, string>();
        for (const f of (done as Array<{ lead_id: string; completed_at: string }>) || []) {
          if (!latest.has(f.lead_id) || f.completed_at > latest.get(f.lead_id)!) latest.set(f.lead_id, f.completed_at);
        }
        leadsList = leadsList.map((l) => ({ ...l, last_contact_at: latest.get(l.id) ?? null }));
      }
      if (options.search?.trim()) {
        const q = options.search.toLowerCase().trim();
        leadsList = leadsList.filter((lead) =>
          (lead.full_name || '').toLowerCase().includes(q) ||
          (lead.email || '').toLowerCase().includes(q) ||
          (lead.phone || '').toLowerCase().includes(q)
        );
      }
      return { data: leadsList, error: null };
    } catch (err: any) {
      return { data: [], error: err };
    }
  },

  async getLeadById(id: string): Promise<{
    lead: Lead | null;
    assignments: LeadAssignment[];
    followUps: FollowUp[];
    error: Error | null;
  }> {
    const client = getSupabaseClient();
    if (!client) return { lead: null, assignments: [], followUps: [], error: new Error('Supabase client not initialized') };

    try {
      const { data: leadData, error: leadError } = await client
        .from('leads')
        .select('*, course_interest:interested_course')
        .eq('id', id)
        .single();

      if (leadError) return { lead: null, assignments: [], followUps: [], error: new Error(leadError.message) };

      const { data: assignmentsData, error: assignError } = await client
        .from('lead_assignments')
        .select('*')
        .eq('lead_id', id)
        .order('assigned_at', { ascending: false });
      if (assignError) console.warn('Assignments fetch warning:', assignError.message);

      const { data: followUpsData, error: followError } = await client
        .from('follow_ups')
        .select('*')
        .eq('lead_id', id)
        .order('scheduled_at', { ascending: false });
      if (followError) console.warn('Follow-ups fetch warning:', followError.message);

      return {
        lead: mapLeadRow(leadData),
        assignments: ((assignmentsData as any[]) || []).map(mapAssignmentRow),
        followUps: ((followUpsData as any[]) || []).map(mapFollowUpRow),
        error: null,
      };
    } catch (err: any) {
      return { lead: null, assignments: [], followUps: [], error: err };
    }
  },

  async createLead(leadInput: {
    full_name: string;
    email?: string | null;
    phone: string;
    course_interest?: string | null;
    status?: LeadStatus;
    priority?: LeadPriority;
    source?: string | null;
    notes?: string | null;
    assigned_to?: string | null;
  }): Promise<{ data: Lead | null; error: Error | null }> {
    const client = getSupabaseClient();
    if (!client) return { data: null, error: new Error('Supabase client not initialized') };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    try {
      // RLS requires created_by to equal the signed-in user.
      const { data: authData } = await client.auth.getUser();
      const currentUserId = authData?.user?.id;
      if (!currentUserId) {
        return { data: null, error: new Error('You must be signed in to create a lead.') };
      }

      const payload: Record<string, any> = {
        created_by: currentUserId,
        full_name: leadInput.full_name.trim(),
        email: leadInput.email ? leadInput.email.trim() : null,
        phone: leadInput.phone.trim(),
        interested_course: leadInput.course_interest || null,
        status: leadInput.status || 'new',
        priority: leadInput.priority || 'normal',
        source: leadInput.source || 'Manual entry',
        notes: leadInput.notes || null,
        assigned_to: leadInput.assigned_to || null,
      };

      const { data, error } = await client
        .from('leads')
        .insert([payload])
        .select('*, course_interest:interested_course')
        .abortSignal(controller.signal)
        .single();

      if (error) {
        const message = controller.signal.aborted
          ? 'Saving timed out after 20 seconds. Please check your internet connection and Supabase database/RLS policies, then refresh Leads before trying again.'
          : error.message;
        return { data: null, error: new Error(message) };
      }

      // The lead is already saved. Record assignment history separately so a
      // secondary history failure cannot leave the Add Lead form stuck.
      if (leadInput.assigned_to && data?.id) {
        void (async () => {
          try {
            const { error: assignmentError } = await client.from('lead_assignments').insert([{
              lead_id: data.id,
              employee_id: leadInput.assigned_to,
              assigned_by: currentUserId,
              notes: 'Initial assignment upon lead creation',
            }]);
            if (assignmentError) console.warn('Lead saved, but assignment history failed:', assignmentError.message);
          } catch (assignmentErr) {
            console.warn('Lead saved, but assignment history failed:', assignmentErr);
          }
        })();
      }

      return { data: mapLeadRow(data), error: null };
    } catch (err: any) {
      const message = controller.signal.aborted
        ? 'Saving timed out after 20 seconds. Please check your internet connection and Supabase database/RLS policies, then refresh Leads before trying again.'
        : (err?.message || 'Unable to save lead.');
      return { data: null, error: new Error(message) };
    } finally {
      clearTimeout(timeoutId);
    }
  },

  // After a lead is converted, the database creates (or links) the student. Returns it so the UI can confirm.
  async getStudentForLead(leadId: string): Promise<{ student_code: string | null; full_name: string } | null> {
    const client = getSupabaseClient();
    if (!client) return null;
    const { data } = await client.from('students').select('student_code, full_name').eq('source_lead_id', leadId).maybeSingle();
    return (data as { student_code: string | null; full_name: string } | null) ?? null;
  },

  // Admin only (enforced in the database). Follow-ups and assignment history are deleted with the lead; a linked student is kept.
  async deleteLeads(leadIds: string[]): Promise<{ deleted: number; error: Error | null }> {
    const client = getSupabaseClient();
    if (!client) return { deleted: 0, error: new Error('Supabase client not initialized') };
    const { data, error } = await client.rpc('delete_leads', { p_ids: leadIds });
    if (error) return { deleted: 0, error: new Error(error.message) };
    return { deleted: Number(data) || 0, error: null };
  },

  async updateLead(id: string, updates: Partial<Lead>): Promise<{ data: Lead | null; error: Error | null }> {
    const client = getSupabaseClient();
    if (!client) return { data: null, error: new Error('Supabase client not initialized') };

    try {
      const { data, error } = await client
        .from('leads')
        .update(mapLeadUpdates(updates))
        .eq('id', id)
        .select('*, course_interest:interested_course')
        .single();
      if (error) return { data: null, error: new Error(error.message) };
      return { data: mapLeadRow(data), error: null };
    } catch (err: any) {
      return { data: null, error: err };
    }
  },

  // Bulk assignment (Admin / Super Admin; enforced by RLS). Records one assignment history row per lead.
  async bulkAssign(leadIds: string[], employeeId: string): Promise<{ error: Error | null }> {
    const client = getSupabaseClient();
    if (!client) return { error: new Error('Supabase client not initialized') };
    if (leadIds.length === 0) return { error: null };
    const { data: authData } = await client.auth.getUser();
    const me = authData?.user?.id;
    if (!me) return { error: new Error('You must be signed in.') };
    const { data: updated, error: updErr } = await client.from('leads').update({ assigned_to: employeeId }).in('id', leadIds).select('id');
    if (updErr) return { error: new Error(updErr.message) };
    const ids = (updated || []).map((r: { id: string }) => r.id);
    if (ids.length === 0) return { error: new Error('No leads were updated. You may not have permission.') };
    const { error: histErr } = await client.from('lead_assignments').insert(ids.map((id) => ({ lead_id: id, employee_id: employeeId, assigned_by: me, notes: 'Bulk assignment' })));
    if (histErr) return { error: new Error(`Leads were assigned, but history could not be saved: ${histErr.message}`) };
    return { error: null };
  },

  // Schedules the same follow-up for several leads.
  async bulkScheduleFollowUp(leadIds: string[], scheduledAt: string, method: string, notes?: string): Promise<{ error: Error | null }> {
    const client = getSupabaseClient();
    if (!client) return { error: new Error('Supabase client not initialized') };
    const { data: authData } = await client.auth.getUser();
    const me = authData?.user?.id;
    if (!me) return { error: new Error('You must be signed in.') };
    const rows = leadIds.map((id) => ({
      lead_id: id, employee_id: me, follow_up_type: method, scheduled_at: scheduledAt, next_follow_up_at: scheduledAt,
      notes: notes?.trim() || 'Follow-up scheduled', status: 'pending',
    }));
    const { error } = await client.from('follow_ups').insert(rows);
    if (error) return { error: new Error(error.message) };
    await client.from('leads').update({ next_follow_up_at: scheduledAt }).in('id', leadIds);
    return { error: null };
  },

  async assignLead(leadId: string, assignedToProfileId: string, notes?: string): Promise<{ error: Error | null }> {
    const client = getSupabaseClient();
    if (!client) return { error: new Error('Supabase client not initialized') };

    try {
      const { data: authData } = await client.auth.getUser();
      const currentUserId = authData?.user?.id || null;
      const { error: updateError } = await client
        .from('leads')
        .update({ assigned_to: assignedToProfileId })
        .eq('id', leadId);
      if (updateError) return { error: new Error(updateError.message) };

      const { error: assignError } = await client.from('lead_assignments').insert([{
        lead_id: leadId,
        employee_id: assignedToProfileId,
        assigned_by: currentUserId,
        notes: notes || null,
      }]);
      if (assignError) console.warn('Could not record assignment history:', assignError.message);
      return { error: null };
    } catch (err: any) {
      return { error: err };
    }
  },

  async addFollowUp(payload: {
    lead_id: string;
    scheduled_at: string;
    contact_method: 'call' | 'whatsapp' | 'email' | 'in_person';
    notes?: string | null;
  }): Promise<{ data: FollowUp | null; error: Error | null }> {
    const client = getSupabaseClient();
    if (!client) return { data: null, error: new Error('Supabase client not initialized') };

    try {
      const { data: authData } = await client.auth.getUser();
      const userId = authData?.user?.id;
      if (!userId) return { data: null, error: new Error('You must be signed in to schedule a follow-up.') };
      const { data, error } = await client.from('follow_ups').insert([{
        lead_id: payload.lead_id,
        employee_id: userId,
        follow_up_type: payload.contact_method,
        scheduled_at: payload.scheduled_at,
        next_follow_up_at: payload.scheduled_at,
        notes: payload.notes?.trim() || 'Follow-up scheduled',
        status: 'pending',
      }]).select().single();
      if (error) return { data: null, error: new Error(error.message) };
      // Keep the lead's next follow-up date in step (best effort; RLS limits this to the owner/admin).
      const { error: nextError } = await client.from('leads').update({ next_follow_up_at: payload.scheduled_at }).eq('id', payload.lead_id);
      if (nextError) console.warn('Follow-up saved, but lead next follow-up date was not updated:', nextError.message);
      return { data: mapFollowUpRow(data), error: null };
    } catch (err: any) {
      return { data: null, error: err };
    }
  },

  async updateFollowUpStatus(
    followUpId: string,
    status: 'completed' | 'cancelled' | 'pending' | 'overdue',
    notes?: string
  ): Promise<{ error: Error | null }> {
    const client = getSupabaseClient();
    if (!client) return { error: new Error('Supabase client not initialized') };

    try {
      // 'overdue' is derived from pending + scheduled_at, never stored.
      const storedStatus = status === 'overdue' ? 'pending' : status;
      const updatePayload: Record<string, any> = { status: storedStatus };
      if (storedStatus === 'completed') updatePayload.completed_at = new Date().toISOString();
      if (notes) updatePayload.outcome = notes;
      const { error } = await client.from('follow_ups').update(updatePayload).eq('id', followUpId);
      if (error) return { error: new Error(error.message) };
      return { error: null };
    } catch (err: any) {
      return { error: err };
    }
  },

  async getUpcomingFollowUps(limit: number = 6): Promise<{ data: FollowUp[]; error: Error | null }> {
    const client = getSupabaseClient();
    if (!client) return { data: [], error: new Error('Supabase client not initialized') };

    try {
      const { data, error } = await client
        .from('follow_ups')
        .select(`
          id,
          lead_id,
          scheduled_at,
          completed_at,
          status,
          contact_method:follow_up_type,
          notes,
          created_by:employee_id,
          created_at,
          lead:leads (
            id,
            full_name,
            phone,
            email,
            course_interest:interested_course,
            status
          )
        `)
        .eq('status', 'pending')
        .order('scheduled_at', { ascending: true })
        .limit(limit);

      if (error) {
        console.error('Error fetching follow-ups:', error);
        return { data: [], error: new Error(error.message) };
      }

      const formatted = ((data as any[]) || []).map((row) => ({
        ...row,
        lead: Array.isArray(row.lead) ? mapLeadRow(row.lead[0]) : mapLeadRow(row.lead),
      })) as FollowUp[];
      return { data: formatted, error: null };
    } catch (err: any) {
      return { data: [], error: err };
    }
  },

  async getDashboardStats(): Promise<{ stats: DashboardStats; error: Error | null }> {
    const defaultStats: DashboardStats = {
      totalLeads: 0,
      newLeads: 0,
      contactedLeads: 0,
      pendingFollowUps: 0,
      qualifiedLeads: 0,
      convertedLeads: 0,
    };

    const client = getSupabaseClient();
    if (!client) return { stats: defaultStats, error: new Error('Supabase client not initialized') };

    try {
      const [totalRes, newRes, contactedRes, followUpsRes, qualifiedRes, convertedRes] = await Promise.all([
        client.from('leads').select('*', { count: 'exact', head: true }),
        client.from('leads').select('*', { count: 'exact', head: true }).eq('status', 'new'),
        client.from('leads').select('*', { count: 'exact', head: true }).eq('status', 'contacted'),
        client.from('follow_ups').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        client.from('leads').select('*', { count: 'exact', head: true }).eq('status', 'qualified'),
        client.from('leads').select('*', { count: 'exact', head: true }).eq('status', 'converted'),
      ]);

      if (totalRes.error) return { stats: defaultStats, error: new Error(totalRes.error.message) };
      if (newRes.error) return { stats: defaultStats, error: new Error(newRes.error.message) };
      if (contactedRes.error) return { stats: defaultStats, error: new Error(contactedRes.error.message) };
      if (followUpsRes.error) return { stats: defaultStats, error: new Error(followUpsRes.error.message) };
      if (qualifiedRes.error) return { stats: defaultStats, error: new Error(qualifiedRes.error.message) };
      if (convertedRes.error) return { stats: defaultStats, error: new Error(convertedRes.error.message) };

      return {
        stats: {
          totalLeads: totalRes.count || 0,
          newLeads: newRes.count || 0,
          contactedLeads: contactedRes.count || 0,
          pendingFollowUps: followUpsRes.count || 0,
          qualifiedLeads: qualifiedRes.count || 0,
          convertedLeads: convertedRes.count || 0,
        },
        error: null,
      };
    } catch (err: any) {
      console.warn('Error fetching live stats:', err);
      return { stats: defaultStats, error: err };
    }
  },
};
