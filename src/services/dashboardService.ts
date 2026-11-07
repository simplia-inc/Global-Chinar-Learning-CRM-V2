import { getSupabaseClient } from '../lib/supabase';
import type { DashboardOverview } from '../types/dashboard';

export const dashboardService = {
  // One round-trip; the database function runs with the caller's RLS so every role sees only its own scope.
  async getOverview(): Promise<{ data: DashboardOverview | null; error: Error | null }> {
    const client = getSupabaseClient();
    if (!client) return { data: null, error: new Error('Supabase client not initialized') };
    const { data, error } = await client.rpc('dashboard_overview');
    if (error) return { data: null, error: new Error(error.message) };
    return { data: data as DashboardOverview, error: null };
  },
};
