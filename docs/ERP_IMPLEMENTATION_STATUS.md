# Global Chinar School ERP — implementation status

## Product boundary
This is an internal staff and trainer system. Students are records managed by authorised staff; there is no student login or student portal.

## Current application audit (repository review)
- Authentication: Supabase email/password with profile lookup and role read from `public.profiles`.
- Existing roles: `super_admin`, `admin`, `employee`, `trainer`.
- Leads: existing list, create/edit, details, assignment and follow-up service paths.
- Dashboard: lead-centric summary; not yet a complete school operations dashboard.
- Team: profile directory only; full account provisioning and staff lifecycle are not implemented.
- Batches: current screen contains hardcoded demonstration cohorts and must not be treated as live operational data.
- Not yet implemented as connected modules: student records, course catalogue, enrolments, class sessions, attendance, invoices, payments, trainer payouts, operational reports and audit viewer.

## ERP database foundation
The additive migration at `supabase/migrations/202611050001_school_erp_foundation.sql` introduces tables for:
- Courses and student records
- Batches and trainer assignments
- Enrolments, class sessions and attendance
- Student invoices and payments
- Trainer payouts and audit-log storage

It enables RLS and adds role-scoped policies. Admin operations are restricted to active `super_admin` and `admin` profiles. Trainers can read assigned batches and their associated rosters, and manage attendance/class sessions only within assigned batches. Finance records remain admin-only. Employees do not receive broad student or finance access.

## Required deployment step — not automatic
1. Open the Supabase project connected to the production CRM.
2. Open SQL Editor and review the migration file in this repository.
3. Run the migration once in that project.
4. Confirm all eleven ERP tables exist and RLS is enabled.
5. Test with separate super_admin, admin, employee and trainer accounts before using real student or financial data.

The migration is additive and rerunnable; it does not drop or rewrite existing CRM tables. Do not run it against a different Supabase project.

## Verification status
- GitHub source change: committed.
- Supabase migration: committed as source only; not executed against the live database.
- Hostinger production deployment: not independently verified from this repository session.
- Production CRUD, role isolation, payment calculations and attendance workflows: not yet verified.
- No claim is made that the CRM is a finished ERP at this stage.

## Safe implementation order
1. Verify live auth and lead create/update against Supabase, using actual network responses and RLS.
2. Apply and verify the ERP schema.
3. Implement database-backed course, student, batch and enrolment CRUD.
4. Implement sessions and attendance with trainer scoping.
5. Implement invoices, payments and balance calculations with server/database-side validation.
6. Implement staff lifecycle, reports, notifications and audit history.
7. Run role-based acceptance tests and production smoke tests.

## Security invariants
- Never expose Supabase service-role credentials to browser code or `VITE_*` variables.
- Keep role assignment restricted to trusted administrators; do not allow users to update their own role.
- Keep RLS enabled on all student, batch, attendance and finance tables.
- Treat browser UI restrictions as usability only; database RLS is the security boundary.
