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
