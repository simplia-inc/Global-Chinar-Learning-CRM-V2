import { getSupabaseClient } from '../lib/supabase';
import type { Lead, LeadAssignment, FollowUp, DashboardStats, LeadStatus, LeadPriority } from '../types/database';

export interface LeadFilterOptions {
  search?: string;
  status?: string;
  priority?: string;
  course?: string;
  limit?: number;
}

export const leadService = {
  /**
   * Fetch leads with optional search and filters
   */
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
          course_interest,
          status,
          priority,
          source,
          notes,
          assigned_to,
          created_at,
          updated_at
        `)
        .order('created_at', { ascending: false });

      if (options.status && options.status !== 'all') {
        query = query.eq('status', options.status);
      }

      if (options.priority && options.priority !== 'all') {
        query = query.eq('priority', options.priority);
      }

      if (options.course && options.course !== 'all') {
        query = query.eq('course_interest', options.course);
      }

      if (options.limit) {
        query = query.limit(options.limit);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching leads:', error);
        return { data: [], error: new Error(error.message) };
      }

      let leadsList = (data as Lead[]) || [];

      // Client-side text search if needed (searches full_name, email, phone)
      if (options.search && options.search.trim()) {
        const q = options.search.toLowerCase().trim();
        leadsList = leadsList.filter((lead) => {
          const name = lead.full_name?.toLowerCase() || '';
          const email = lead.email?.toLowerCase() || '';
          const phone = lead.phone?.toLowerCase() || '';
          return name.includes(q) || email.includes(q) || phone.includes(q);
        });
      }

      return { data: leadsList, error: null };
    } catch (err: any) {
      return { data: [], error: err };
    }
  },

  /**
   * Fetch single lead with assignments and follow-ups
   */
  async getLeadById(id: string): Promise<{
    lead: Lead | null;
    assignments: LeadAssignment[];
    followUps: FollowUp[];
    error: Error | null;
  }> {
    const client = getSupabaseClient();
    if (!client) {
      return { lead: null, assignments: [], followUps: [], error: new Error('Supabase client not initialized') };
    }

    try {
      // 1. Fetch Lead
      const { data: leadData, error: leadError } = await client
        .from('leads')
        .select('*')
        .eq('id', id)
        .single();

      if (leadError) {
        return { lead: null, assignments: [], followUps: [], error: new Error(leadError.message) };
      }

      // 2. Fetch Assignments
      const { data: assignmentsData, error: assignError } = await client
        .from('lead_assignments')
        .select('*')
        .eq('lead_id', id)
        .order('created_at', { ascending: false });

      if (assignError) {
        console.warn('Assignments fetch warning:', assignError.message);
      }

      // 3. Fetch Follow-ups
      const { data: followUpsData, error: followError } = await client
        .from('follow_ups')
        .select('*')
        .eq('lead_id', id)
        .order('scheduled_at', { ascending: false });

      if (followError) {
        console.warn('Follow-ups fetch warning:', followError.message);
      }

      return {
        lead: leadData as Lead,
        assignments: (assignmentsData as LeadAssignment[]) || [],
        followUps: (followUpsData as FollowUp[]) || [],
        error: null,
      };
    } catch (err: any) {
      return { lead: null, assignments: [], followUps: [], error: err };
    }
  },

  /**
   * Create a new lead record
   */
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

    try {
      const payload: Record<string, any> = {
        full_name: leadInput.full_name.trim(),
        email: leadInput.email ? leadInput.email.trim() : null,
        phone: leadInput.phone.trim(),
        course_interest: leadInput.course_interest || null,
        status: leadInput.status || 'new',
        priority: leadInput.priority || 'medium',
        source: leadInput.source || 'Website',
        notes: leadInput.notes || null,
        assigned_to: leadInput.assigned_to || null,
      };

      const { data, error } = await client
        .from('leads')
        .insert([payload])
        .select()
        .single();

      if (error) {
        return { data: null, error: new Error(error.message) };
      }

      // If assigned_to is set, also create record in lead_assignments
      if (leadInput.assigned_to && data?.id) {
        const { data: authData } = await client.auth.getUser();
        await client.from('lead_assignments').insert([
          {
            lead_id: data.id,
            assigned_to: leadInput.assigned_to,
            assigned_by: authData?.user?.id || null,
            notes: 'Initial assignment upon lead creation',
          },
        ]);
      }

      return { data: data as Lead, error: null };
    } catch (err: any) {
      return { data: null, error: err };
    }
  },

  /**
   * Update lead details or status
   */
  async updateLead(
    id: string,
    updates: Partial<Lead>
  ): Promise<{ data: Lead | null; error: Error | null }> {
    const client = getSupabaseClient();
    if (!client) return { data: null, error: new Error('Supabase client not initialized') };

    try {
      const { data, error } = await client
        .from('leads')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        return { data: null, error: new Error(error.message) };
      }

      return { data: data as Lead, error: null };
    } catch (err: any) {
      return { data: null, error: err };
    }
  },

  /**
   * Assign lead to a team member
   */
  async assignLead(
    leadId: string,
    assignedToProfileId: string,
    notes?: string
  ): Promise<{ error: Error | null }> {
    const client = getSupabaseClient();
    if (!client) return { error: new Error('Supabase client not initialized') };

    try {
      const { data: authData } = await client.auth.getUser();
      const currentUserId = authData?.user?.id || null;

      // 1. Update lead's assigned_to column
      const { error: updateError } = await client
        .from('leads')
        .update({ assigned_to: assignedToProfileId })
        .eq('id', leadId);

      if (updateError) {
        return { error: new Error(updateError.message) };
      }

      // 2. Insert into lead_assignments audit table
      const { error: assignError } = await client.from('lead_assignments').insert([
        {
          lead_id: leadId,
          assigned_to: assignedToProfileId,
          assigned_by: currentUserId,
          notes: notes || null,
        },
      ]);

      if (assignError) {
        console.warn('Could not record assignment history:', assignError.message);
      }

      return { error: null };
    } catch (err: any) {
      return { error: err };
    }
  },

  /**
   * Add a follow-up record for a lead
   */
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

      const { data, error } = await client
        .from('follow_ups')
        .insert([
          {
            lead_id: payload.lead_id,
            scheduled_at: payload.scheduled_at,
            contact_method: payload.contact_method,
            notes: payload.notes || null,
            status: 'pending',
            created_by: authData?.user?.id || null,
          },
        ])
        .select()
        .single();

      if (error) {
        return { data: null, error: new Error(error.message) };
      }

      return { data: data as FollowUp, error: null };
    } catch (err: any) {
      return { data: null, error: err };
    }
  },

  /**
   * Update follow-up status (e.g. marked as completed)
   */
  async updateFollowUpStatus(
    followUpId: string,
    status: 'completed' | 'cancelled' | 'pending' | 'overdue',
    notes?: string
  ): Promise<{ error: Error | null }> {
    const client = getSupabaseClient();
    if (!client) return { error: new Error('Supabase client not initialized') };

    try {
      const updatePayload: Record<string, any> = { status };
      if (status === 'completed') {
        updatePayload.completed_at = new Date().toISOString();
      }
      if (notes) {
        updatePayload.notes = notes;
      }

      const { error } = await client
        .from('follow_ups')
        .update(updatePayload)
        .eq('id', followUpId);

      if (error) {
        return { error: new Error(error.message) };
      }

      return { error: null };
    } catch (err: any) {
      return { error: err };
    }
  },

  /**
   * Get upcoming follow-ups
   */
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
          contact_method,
          notes,
          created_by,
          created_at,
          lead:leads (
            id,
            full_name,
            phone,
            email,
            course_interest,
            status
          )
        `)
        .eq('status', 'pending')
        .order('scheduled_at', { ascending: true })
        .limit(limit);

      if (error) {
        // If join fails due to RLS or schema, fall back to simple select
        const fallback = await client
          .from('follow_ups')
          .select('*')
          .eq('status', 'pending')
          .order('scheduled_at', { ascending: true })
          .limit(limit);
        return { data: (fallback.data as unknown as FollowUp[]) || [], error: null };
      }

      const formatted = ((data as any[]) || []).map((row) => ({
        ...row,
        lead: Array.isArray(row.lead) ? row.lead[0] : row.lead,
      })) as FollowUp[];

      return { data: formatted, error: null };
    } catch (err: any) {
      return { data: [], error: err };
    }
  },

  /**
   * Calculate live dashboard statistics from database
   */
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
      // 1. Total leads count
      const totalPromise = client
        .from('leads')
        .select('*', { count: 'exact', head: true });

      // 2. New leads count
      const newPromise = client
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'new');

      // 3. Contacted leads count
      const contactedPromise = client
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'contacted');

      // 4. Pending follow-ups (Follow-up Required)
      const followUpsPromise = client
        .from('follow_ups')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      // 5. Qualified leads count
      const qualifiedPromise = client
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'qualified');

      // 6. Converted leads count
      const convertedPromise = client
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .in('status', ['converted', 'enrolled']);

      const [totalRes, newRes, contactedRes, followUpsRes, qualifiedRes, convertedRes] = await Promise.all([
        totalPromise,
        newPromise,
        contactedPromise,
        followUpsPromise,
        qualifiedPromise,
        convertedPromise,
      ]);

      const stats: DashboardStats = {
        totalLeads: totalRes.count || 0,
        newLeads: newRes.count || 0,
        contactedLeads: contactedRes.count || 0,
        pendingFollowUps: followUpsRes.count || 0,
        qualifiedLeads: qualifiedRes.count || 0,
        convertedLeads: convertedRes.count || 0,
      };

      return { stats, error: null };
    } catch (err: any) {
      console.warn('Error fetching live stats:', err);
      return { stats: defaultStats, error: err };
    }
  },
};
