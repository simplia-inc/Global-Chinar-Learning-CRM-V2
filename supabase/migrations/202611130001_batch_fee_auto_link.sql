-- Keep batch fees in step with students automatically.
-- * A student with exactly one active batch enrolment: every invoice (and its payments) is attached to that batch.
-- * Admin can assign a student to a batch; the course/fee agreed on the student's fee record is used.
-- Additive. Existing invoices are only linked when a student is assigned to a batch.

create or replace function public.attach_invoice_to_student_batch() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_count int; v_enr uuid;
begin
  if new.enrollment_id is null and new.status <> 'void' then
    select count(*) into v_count from public.enrollments where student_id = new.student_id and status = 'active';
    if v_count = 1 then
      select id into v_enr from public.enrollments where student_id = new.student_id and status = 'active';
      new.enrollment_id := v_enr;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists invoices_attach_batch on public.student_invoices;
create trigger invoices_attach_batch before insert on public.student_invoices
for each row execute function public.attach_invoice_to_student_batch();

create or replace function public.attach_invoices_on_enrolment() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  select count(*) into v_count from public.enrollments where student_id = new.student_id and status = 'active';
  if v_count = 1 then
    update public.student_invoices set enrollment_id = new.id
     where student_id = new.student_id and enrollment_id is null and status <> 'void';
  end if;
  return null;
end $$;
drop trigger if exists enrollments_attach_invoices on public.enrollments;
create trigger enrollments_attach_invoices after insert on public.enrollments
for each row execute function public.attach_invoices_on_enrolment();

revoke all on function public.attach_invoice_to_student_batch(), public.attach_invoices_on_enrolment() from public, anon, authenticated;

-- Admin assigns a student to a batch. Fee comes from the student's fee record; falls back to the batch's course fee.
create or replace function public.assign_student_to_batch(p_student uuid, p_batch uuid) returns uuid
language plpgsql security invoker set search_path = public as $$
declare v_fee numeric := 0; v_disc numeric := 0; v_enr uuid;
begin
  if not public.is_school_admin() then raise exception 'Only Admin can assign students to batches' using errcode = '42501'; end if;
  if not exists (select 1 from public.students where id = p_student) then raise exception 'Student not found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.school_batches where id = p_batch and status <> 'cancelled') then
    raise exception 'That batch is cancelled or does not exist' using errcode = '22023';
  end if;
  select coalesce(a.total_fee, 0), coalesce(a.discount_amount, 0) into v_fee, v_disc
    from (select 1) x left join public.student_fee_accounts a on a.student_id = p_student;
  if v_fee <= 0 then
    select coalesce(c.fee_amount, 0) into v_fee
      from public.school_batches b join public.school_courses c on c.id = b.course_id where b.id = p_batch;
    v_disc := 0;
  end if;
  insert into public.enrollments(student_id, batch_id, agreed_fee, discount_amount, created_by)
  values (p_student, p_batch, v_fee, least(v_disc, v_fee), auth.uid())
  returning id into v_enr;
  return v_enr;
end $$;

revoke all on function public.assign_student_to_batch(uuid, uuid) from public, anon;
grant execute on function public.assign_student_to_batch(uuid, uuid) to authenticated;
