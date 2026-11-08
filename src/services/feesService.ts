import { getSupabaseClient } from '../lib/supabase';

export type DeliveryMode = 'online' | 'offline' | 'hybrid';
export type FeeStatus = 'paid' | 'partial' | 'unpaid' | 'no_fee';
export type PaymentMethod = 'cash' | 'upi' | 'bank_transfer' | 'card' | 'other';

export interface BatchFilters { month?: string; mode?: string; courseId?: string; batchId?: string; includeWithdrawn?: boolean }

export interface BatchOverviewRow {
  batch_id: string; name: string; code: string | null; delivery_mode: DeliveryMode; status: string;
  start_date: string | null; end_date: string | null; course_id: string | null; course_name: string | null;
  capacity: number | null; enrolled: number; seats_left: number | null; trainer_names: string | null;
  net_fee_total: number | null; collected: number | null; outstanding: number | null;
}
export interface RosterRow {
  enrollment_id: string; batch_id: string; batch_name: string; batch_code: string | null; delivery_mode: DeliveryMode;
  batch_start: string | null; course_name: string | null; student_id: string; student_code: string | null; student_name: string;
  phone: string | null; enrollment_status: string; enrolled_at: string;
  agreed_fee: number | null; discount: number | null; net_fee: number | null; invoiced: number | null; paid: number | null;
  outstanding: number | null; fee_status: FeeStatus | null; next_due: string | null; last_payment_at: string | null;
}
export interface PaymentRow {
  id: string; invoice_number: string; entry_type: 'payment' | 'reversal'; amount: number; method: string;
  reference_number: string | null; payment_date: string; notes: string | null; reversal_reason: string | null; is_reversed: boolean;
}

const monthToDate = (m?: string) => (m && /^\d{4}-\d{2}$/.test(m) ? `${m}-01` : null);
const orNull = (v?: string) => (v && v !== 'all' ? v : null);
const fail = (e: { message: string }) => new Error(e.message);

export const feesService = {
  async overview(f: BatchFilters): Promise<BatchOverviewRow[]> {
    const db = getSupabaseClient(); if (!db) throw new Error('Supabase is not configured.');
    const { data, error } = await db.rpc('batch_overview', { p_month: monthToDate(f.month), p_mode: orNull(f.mode), p_course: orNull(f.courseId) });
    if (error) throw fail(error);
    return (data || []) as BatchOverviewRow[];
  },
  async roster(f: BatchFilters): Promise<RosterRow[]> {
    const db = getSupabaseClient(); if (!db) throw new Error('Supabase is not configured.');
    const { data, error } = await db.rpc('batch_fee_roster', {
      p_batch: orNull(f.batchId), p_month: monthToDate(f.month), p_mode: orNull(f.mode), p_course: orNull(f.courseId), p_include_withdrawn: !!f.includeWithdrawn,
    });
    if (error) throw fail(error);
    return (data || []) as RosterRow[];
  },
  async enroll(p: { studentId: string; batchId: string; agreedFee: number; discount: number; dueDate?: string; createInvoice: boolean }): Promise<void> {
    const db = getSupabaseClient(); if (!db) throw new Error('Supabase is not configured.');
    const { error } = await db.rpc('enroll_student', {
      p_student: p.studentId, p_batch: p.batchId, p_agreed_fee: p.agreedFee, p_discount: p.discount, p_due_date: p.dueDate || null, p_create_invoice: p.createInvoice,
    });
    if (error) throw fail(error);
  },
  async recordPayment(p: { enrollmentId: string; amount: number; method: PaymentMethod; reference?: string; paidAt?: string; notes?: string }): Promise<void> {
    const db = getSupabaseClient(); if (!db) throw new Error('Supabase is not configured.');
    const { error } = await db.rpc('record_enrollment_payment', {
      p_enrollment: p.enrollmentId, p_amount: p.amount, p_method: p.method, p_reference: p.reference || null,
      p_paid_at: p.paidAt ? new Date(p.paidAt).toISOString() : null, p_notes: p.notes || null,
    });
    if (error) throw fail(error);
  },
  async reversePayment(paymentId: string, reason: string): Promise<void> {
    const db = getSupabaseClient(); if (!db) throw new Error('Supabase is not configured.');
    const { error } = await db.rpc('reverse_payment', { p_payment: paymentId, p_reason: reason });
    if (error) throw fail(error);
  },
  async payments(enrollmentId: string): Promise<PaymentRow[]> {
    const db = getSupabaseClient(); if (!db) throw new Error('Supabase is not configured.');
    const { data, error } = await db.rpc('enrollment_payments', { p_enrollment: enrollmentId });
    if (error) throw fail(error);
    return (data || []) as PaymentRow[];
  },
  async listCourses(): Promise<Array<{ id: string; name: string; fee_amount: number }>> {
    const db = getSupabaseClient(); if (!db) return [];
    const { data, error } = await db.from('school_courses').select('id,name,fee_amount').order('name');
    if (error) throw fail(error);
    return (data || []) as Array<{ id: string; name: string; fee_amount: number }>;
  },
  async listStudents(): Promise<Array<{ id: string; student_code: string | null; full_name: string; phone: string | null; status: string }>> {
    const db = getSupabaseClient(); if (!db) return [];
    const { data, error } = await db.from('students').select('id,student_code,full_name,phone,status').in('status', ['active', 'paused']).order('full_name').limit(2000);
    if (error) throw fail(error);
    return (data || []) as Array<{ id: string; student_code: string | null; full_name: string; phone: string | null; status: string }>;
  },
};

export const money = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
export const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '—';
export const monthLabel = (iso?: string | null) =>
  iso ? new Date(`${iso}T00:00:00+05:30`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }) : 'Start date not set';
export const MODE_LABEL: Record<DeliveryMode, string> = { online: 'Online', offline: 'Offline', hybrid: 'Hybrid' };
