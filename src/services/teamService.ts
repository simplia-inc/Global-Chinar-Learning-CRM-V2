import { getSupabaseClient } from '../lib/supabase';
import type { Profile } from '../types/database';

export const teamService = {
  /**
   * Fetch team members from the profiles table
   */
  async getTeamMembers(): Promise<{ data: Profile[]; error: Error | null }> {
    const client = getSupabaseClient();
    if (!client) return { data: [], error: new Error('Supabase client not initialized') };

    try {
      const { data, error } = await client
        .from('profiles')
        .select('*')
        .order('full_name', { ascending: true });

      if (error) {
        console.warn('Error fetching team profiles:', error.message);
        return { data: [], error: new Error(error.message) };
      }

      return { data: (data as Profile[]) || [], error: null };
    } catch (err: any) {
      return { data: [], error: err };
    }
  },

  /**
   * Fetch active assignable employees/staff for lead assignment
   */
  async getAssignableStaff(): Promise<{ data: Profile[]; error: Error | null }> {
    const client = getSupabaseClient();
    if (!client) return { data: [], error: new Error('Supabase client not initialized') };

    try {
      const { data, error } = await client
        .from('profiles')
        .select('id, full_name, email, role, is_active')
        .eq('is_active', true)
        .in('role', ['super_admin', 'admin', 'employee', 'trainer'])
        .order('full_name', { ascending: true });

      if (error) {
        return { data: [], error: new Error(error.message) };
      }

      return { data: (data as Profile[]) || [], error: null };
    } catch (err: any) {
      return { data: [], error: err };
    }
  },
};
