/**
 * Global Chinar Digital Marketing School CRM Database Schema Types
 * Matches the Supabase project 'global-chinar-crm'
 */

export type UserRole = 'super_admin' | 'admin' | 'employee' | 'trainer';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  is_active: boolean;
  phone?: string | null;
  avatar_url?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'follow_up'
  | 'qualified'
  | 'converted'
  | 'lost';

export type LeadPriority = 'low' | 'normal' | 'high';

export interface Lead {
  id: string;
  full_name: string;
  email: string | null;
  phone: string;
  course_interest: string | null;
  status: LeadStatus;
  priority: LeadPriority;
  source: string | null;
  notes: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at?: string;
  next_follow_up_at?: string | null;
  // Derived client-side from completed follow-ups
  last_contact_at?: string | null;
  // Joined relation helper
  assigned_profile?: Profile | null;
}

export interface LeadAssignment {
  id: string;
  lead_id: string;
  assigned_to: string;
  assigned_by: string | null;
  notes: string | null;
  created_at: string;
  assigned_profile?: Profile | null;
  assigned_by_profile?: Profile | null;
}

// 'overdue' is derived in the UI (pending and scheduled_at in the past); it is not stored.
export type FollowUpStatus = 'pending' | 'completed' | 'cancelled' | 'overdue';
export type ContactMethod = 'call' | 'whatsapp' | 'email' | 'in_person';

export interface FollowUp {
  id: string;
  lead_id: string;
  scheduled_at: string;
  completed_at: string | null;
  status: FollowUpStatus;
  contact_method: ContactMethod;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  // Joined relations
  lead?: Lead | null;
  creator_profile?: Profile | null;
}

export interface DashboardStats {
  totalLeads: number;
  newLeads: number;
  contactedLeads: number;
  pendingFollowUps: number;
  qualifiedLeads: number;
  convertedLeads: number;
}
