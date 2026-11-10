-- Sheet rows without a name are imported under a placeholder; later syncs keep any name staff set in the CRM.
create or replace function public.apply_sheet_rows(p_run uuid, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_conn uuid; x record; l record; d record;
  n_new int := 0; n_upd int := 0; n_same int := 0; n_dup int := 0; n_inv int := 0; n_fail int := 0;
  v_status text; v_priority text; v_phone_norm text;
begin
  perform public.sheet_guard();
  select connection_id into v_conn from public.sheet_sync_runs where id = p_run and status = 'running';
  if v_conn is null then raise exception 'Sync run is not active' using errcode = 'P0002'; end if;

  for x in select * from jsonb_to_recordset(p_rows) as t(
      row_number int, key text, full_name text, name_placeholder boolean, email text, phone text, course text,
      source text, notes text, status text, priority text, hash text)
  loop
    begin
      if x.key is null or length(trim(x.key)) = 0 or x.full_name is null or length(trim(x.full_name)) = 0
         or (coalesce(trim(x.phone), '') = '' and coalesce(trim(x.email), '') = '') then
        n_inv := n_inv + 1;
        insert into public.sheet_sync_errors(run_id, connection_id, row_number, error_type, message)
        values (p_run, v_conn, x.row_number, 'invalid', 'Missing name, or neither phone nor email, or no usable identifier');
        continue;
      end if;

      select id, sheet_row_hash, notes, sheet_notes into l
        from public.leads where sheet_connection_id = v_conn and external_key = x.key;

      if found then
        if l.sheet_row_hash is not distinct from x.hash then
          update public.leads set sheet_synced_at = now(), sheet_row_number = x.row_number where id = l.id;
          n_same := n_same + 1;
        else
          -- Only sheet-owned contact fields change. Status, priority, assignment and follow-ups are CRM-managed.
          update public.leads set
            -- A placeholder name (sheet row had no name) never overwrites a name staff entered in the CRM.
            full_name = case when coalesce(x.name_placeholder, false) then full_name else trim(x.full_name) end,
            email = nullif(trim(x.email), ''),
            phone = nullif(trim(x.phone), ''),
            interested_course = nullif(trim(x.course), ''),
            source = coalesce(nullif(trim(x.source), ''), source),
            notes = case when notes is not distinct from sheet_notes then nullif(trim(x.notes), '') else notes end,
            sheet_notes = nullif(trim(x.notes), ''),
            sheet_row_hash = x.hash, sheet_row_number = x.row_number, sheet_synced_at = now()
          where id = l.id;
          n_upd := n_upd + 1;
        end if;
      else
        v_phone_norm := public.norm_phone(x.phone);
        select id into d from public.leads
         where (length(v_phone_norm) >= 7 and public.norm_phone(phone) = v_phone_norm)
            or (coalesce(trim(x.email), '') <> '' and lower(email) = lower(trim(x.email)))
         limit 1;
        if found then
          n_dup := n_dup + 1;
          insert into public.sheet_sync_errors(run_id, connection_id, row_number, error_type, message, existing_lead_id)
          values (p_run, v_conn, x.row_number, 'duplicate', 'Phone or email matches an existing CRM lead; not imported. Review the existing lead.', d.id);
        else
          v_status := case when x.status in ('new','contacted','follow_up','qualified','converted','lost') then x.status else 'new' end;
          v_priority := case when x.priority in ('low','normal','high') then x.priority else 'normal' end;
          insert into public.leads(full_name, email, phone, interested_course, source, notes, status, priority,
                                   created_by, sheet_connection_id, external_key, sheet_row_number, sheet_row_hash, sheet_notes, sheet_synced_at)
          values (trim(x.full_name), nullif(trim(x.email), ''), nullif(trim(x.phone), ''), nullif(trim(x.course), ''),
                  coalesce(nullif(trim(x.source), ''), 'Google Sheet'), nullif(trim(x.notes), ''), v_status, v_priority,
                  auth.uid(), v_conn, x.key, x.row_number, x.hash, nullif(trim(x.notes), ''), now());
          n_new := n_new + 1;
        end if;
      end if;
    exception when others then
      n_fail := n_fail + 1;
      insert into public.sheet_sync_errors(run_id, connection_id, row_number, error_type, message)
      values (p_run, v_conn, x.row_number, 'failed', left(sqlerrm, 300));
    end;
  end loop;
  return jsonb_build_object('new', n_new, 'updated', n_upd, 'unchanged', n_same, 'duplicates', n_dup, 'invalid', n_inv, 'failed', n_fail);
end $$;

revoke all on function public.apply_sheet_rows(uuid, jsonb) from public, anon;
grant execute on function public.apply_sheet_rows(uuid, jsonb) to authenticated, service_role;
