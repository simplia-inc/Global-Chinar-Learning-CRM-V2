# Global Chinar School ERP — implementation status

_Last updated: 2026-11-06. Internal staff/trainer system; no student portal, no multi-branch._

## Database (Supabase project `global-chinar-crm`)
Applied to the live project, in order:
1. `school_erp_foundation` — `supabase/migrations/202611050001_school_erp_foundation.sql`
2. `erp_hardening` — `supabase/migrations/202611060001_erp_hardening.sql`
3. `function_grants_and_follow_up_scheduling` — function EXECUTE lockdown; adds `scheduled_at`, `completed_at`, `status` to `follow_ups`

The earlier duplicate `202611050001_school_erp_core.sql` was removed: it defined conflicting tables (`courses`, `batches`) and over-broad read policies. Do not re-add it.

### Guarantees enforced in the database (tested)
- RLS on all 15 public tables; `anon` has no access.
- Finance is admin-only. Payments are insert-only; corrections are `reversal` rows with a reason. Invoice status is derived by trigger; overpayment is rejected.
- No DELETE grant on students, enrolments, invoices, payments, payouts, sessions, attendance or audit logs.
- Audit trigger records inserts/updates/deletes (with old/new values) on students, enrolments, courses, batches, trainers, sessions, invoices, payments, payouts, leads, assignments and profiles.
- Batch capacity is enforced on enrolment. One student per source lead.
- Admins cannot promote themselves or anyone to `super_admin`, and cannot modify a `super_admin`.
- Trainers see only assigned batches, their rosters and attendance. Employees see only students they created or from leads they can access.

## Batches, enrolments and fees (added 2026-11-08)
- Batches have a delivery mode (online / offline / hybrid) and are grouped by start month. Seats, trainers and finance totals come from `batch_overview()`.
- `batch_fee_roster()` lists every enrolled student with net fee, paid, outstanding, status and next due date. Filters: month, mode, course, batch.
- `enroll_student()`, `record_enrollment_payment()`, `reverse_payment()` run as the caller (RLS applies). Payments are never edited or deleted; reversals are separate rows with a reason.
- Money columns are NULL for non-admin callers. The Batch Fees page is Admin / Super Admin only.

## Lead conversion and student fee automation (added 2026-11-09)
- A database trigger on `leads` creates (or links) exactly one student when a lead becomes Converted (also when a lead is inserted as Converted). It is idempotent: re-converting never duplicates, never overwrites staff edits, and never deletes lead data. An existing unlinked student with the same name and phone is linked instead of duplicated.
- A trigger on `students` creates a `student_fee_accounts` row for every new student (manual add, lead conversion, import).
- Fee management is per student: fee + discount on the fee account (0 = use batch enrolment fees), installments = invoices, payments and reversals = existing payment ledger. Admin / Super Admin only.

## Application
Working against the live schema: auth, leads (create/edit/assign/status), follow-ups, courses CRUD, batches (create/status/trainer), students (list/create).

Not yet implemented as connected screens: student edit/archive/detail, enrolments and lead conversion, class sessions, attendance, invoices/payments UI, trainer payouts, staff provisioning (needs a server-side Auth admin call), reports, notifications, audit viewer, Google Sheets sync.

## Verification
- `npm run lint` and `npm run build` pass locally.
- Role matrix tested against the live database in a rolled-back transaction (super admin, admin, employee, trainer, anon).
- Not verified: browser/UI testing, mobile layout, Hostinger deployment.

## Security invariants
- Never expose service-role keys in browser code or `VITE_*` variables.
- Browser restrictions are usability only; RLS is the security boundary.
