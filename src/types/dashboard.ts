export interface DashboardOverview {
  role: string | null;
  leads: { total: number; new: number; contacted: number; follow_up: number; qualified: number; converted: number; lost: number };
  followups: { due_today: number; overdue: number };
  students: { total: number; active: number };
  courses_active: number;
  batches_active: number;
  classes_today: number;
  attendance_today: { present: number; late: number; absent: number; excused: number; marked: number };
  admissions_30d: number;
  recent_leads: Array<{
    id: string; full_name: string; phone: string | null; email: string | null; interested_course: string | null;
    source: string | null; status: string; priority: string; created_at: string; assigned_name: string | null;
  }>;
  upcoming_followups: Array<{ id: string; lead_id: string; lead_name: string; scheduled_at: string; follow_up_type: string | null; is_overdue: boolean }>;
  recent_admissions: Array<{ id: string; full_name: string; student_code: string | null; admission_date: string; status: string; course_name: string | null }>;
  upcoming_classes: Array<{ id: string; title: string; starts_at: string; ends_at: string; batch_name: string; trainer_name: string | null }>;
  lead_sources: Array<{ source: string; count: number }>;
  // Present for Admin / Super Admin only.
  fees?: { collected_total: number; collected_month: number; outstanding: number };
  recent_payments?: Array<{ id: string; amount: number; entry_type: 'payment' | 'reversal'; method: string; payment_date: string; student_name: string; invoice_number: string }>;
  employee_performance?: Array<{ id: string; full_name: string | null; total: number; converted: number; open: number; overdue_followups: number }>;
}
