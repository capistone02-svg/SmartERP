-- Phase 7C: admin logs + import/export permission columns
-- Source: /tmp/arena-coding-uploads/13_admin_logs_permissions.sql, adapted to this schema:
--   * permissions audit trigger is trg_audit_permissions (05_audit.sql names it that)
--   * audit_logs has no actor_id/actor_area/record_id; login_logs has no user_id
--   * log_immutable() existed in 05_audit.sql but no triggers were ever attached
--     to audit_logs/login_logs -- attach them here so the archive-delete RPC's
--     app.log_purge bypass is the only way to remove a log row
--   * internal helpers revoked from authenticated too (default privileges had
--     left log_write_activity callable, i.e. forgeable audit entries)
--   * admin_no_import constraint guarded so re-running is safe
-- Run ONCE after 05_audit.sql / 07_hire_onboard.sql.

alter table public.permissions disable trigger trg_audit_permissions;
alter table public.permissions
  add column if not exists can_import boolean not null default false,
  add column if not exists can_export boolean not null default false;

-- Admins manage import/export through the Permissions screen; they never import.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'admin_no_import') then
    alter table public.permissions add constraint admin_no_import check (not (role = 'admin' and can_import));
  end if;
end $$;

update public.permissions set can_export = true
where can_export = false and resource in (
  'employees', 'inventory_movements', 'financial_entries', 'sales_transactions', 'service_cases');
update public.permissions set can_import = true
where can_import = false and role = 'department_head'
  and functional_area = 'sales_marketing' and resource = 'sales_transactions';

alter table public.permissions enable trigger trg_audit_permissions;

-- The year buckets an archive export covers; the same predicate selects rows.
create function public.log_year_start(p_year integer) returns timestamptz
language sql immutable as $$
  select make_timestamptz(p_year, 1, 1, 0, 0, 0, 'Asia/Manila')
$$;

create function public.log_table_of(p_type text) returns text
language sql immutable as $$
  select case when p_type = 'activity' then 'audit_logs'
              when p_type = 'login' then 'login_logs'
              else null end
$$;

create or replace function public.log_immutable() returns trigger
language plpgsql as $$
begin
  -- app.log_purge is set only while an admin archive delete runs.
  if current_setting('app.log_purge', true) = 'on' then
    return old;
  end if;
  raise exception 'log rows are immutable: deletion happens only through the Archive page';
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_audit_logs_immutable') then
    create trigger trg_audit_logs_immutable before delete on public.audit_logs
      for each row execute function public.log_immutable();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_login_logs_immutable') then
    create trigger trg_login_logs_immutable before delete on public.login_logs
      for each row execute function public.log_immutable();
  end if;
end $$;

create table if not exists public.log_archives (
  id uuid primary key default gen_random_uuid(),
  log_type text not null check (log_type in ('activity', 'login')),
  year int not null,
  months int not null default 0,
  created_by uuid not null default auth.uid(),
  created_by_employee_no text not null,
  created_at timestamptz not null default now()
);
alter table public.log_archives enable row level security;

drop policy if exists log_archives_select on public.log_archives;
create policy log_archives_select on public.log_archives for select to authenticated
  using (public.auth_role()::text = 'admin');
revoke all on public.log_archives from anon, authenticated;
grant select on public.log_archives to authenticated;

-- Records that an archive year no longer holds, written by the delete below.
create function public.log_write_activity(p_action text, p_module text, p_label text, p_details text) returns void
language plpgsql security definer set search_path = public as $$
declare a record;
begin
  select employee_no, full_name, role into a from public.profiles where id = auth.uid();
  insert into public.audit_logs (actor_employee_no, actor_name, actor_role, action, module, record_label, details)
  values (a.employee_no, coalesce(a.full_name, 'Unknown user'), a.role, p_action, p_module, p_label, p_details);
end $$;

create function public.log_archive_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if public.auth_role()::text is distinct from 'admin' then raise exception 'Not authorized'; end if;
  return (
    select coalesce(jsonb_agg(x order by x.year desc, x.type), '[]'::jsonb) from (
      select l.log_type as type, extract(year from l.occurred_at at time zone 'Asia/Manila')::int as year,
             count(*)::int as rows_count, count(distinct actor_employee_no)::int as people,
             null::text as device, count(*)::int as months
      from public.audit_logs l
      where not exists (select 1 from public.log_archives a where a.log_type = 'activity'
                        and a.year = extract(year from l.occurred_at at time zone 'Asia/Manila'))
      group by 2
      union all
      select 'login' as type, extract(year from l.occurred_at at time zone 'Asia/Manila')::int as year,
             count(*)::int as rows_count, count(distinct employee_no)::int as people,
             null::text as device, count(*)::int as months
      from public.login_logs l
      where not exists (select 1 from public.log_archives a where a.log_type = 'login'
                        and a.year = extract(year from l.occurred_at at time zone 'Asia/Manila'))
      group by 2
      union all
      select a.log_type as type, a.year as year, 0::int as rows_count, 0::int as people,
             null::text as device, a.months as months
      from public.log_archives a) x);
end $$;

-- Copies one type/year of log rows into a CSV and records who exported it.
create function public.log_export_record(p_type text, p_year int, p_month int default 0)
returns text language plpgsql security definer set search_path = public as $$
declare
  a record; tbl text; yr int; mn int; v_year timestamptz; v_next timestamptz; sql text;
  fname text; total int := 0; body text := '';
  v_row record; v_line text; v_first boolean := true; v_val text; v_c text;
begin
  if public.auth_role()::text is distinct from 'admin' then raise exception 'Not authorized'; end if;
  select employee_no, full_name, role into a from public.profiles where id = auth.uid();
  tbl := public.log_table_of(p_type);
  if tbl is null then raise exception 'unknown log type'; end if;

  if p_type = 'activity' then
    if p_month between 1 and 12 then
      yr := p_year; mn := p_month;
      v_year := public.log_year_start(yr) + make_interval(months => mn - 1);
      v_next := v_year + interval '1 month';
      fname := format('activity_log_%d-%02d.csv', yr, mn);
    else
      yr := p_year; mn := 0;
      v_year := public.log_year_start(yr);
      v_next := v_year + interval '1 year';
      fname := format('activity_log_%d.csv', yr);
    end if;
  else
    if p_month between 1 and 12 then
      yr := p_year; mn := p_month;
      v_year := public.log_year_start(yr) + make_interval(months => mn - 1);
      v_next := v_year + interval '1 month';
      fname := format('login_log_%d-%02d.csv', yr, mn);
    else
      yr := p_year; mn := 0;
      v_year := public.log_year_start(yr);
      v_next := v_year + interval '1 year';
      fname := format('login_log_%d.csv', yr);
    end if;
  end if;

  if p_type = 'activity' then
    sql := format('select id, occurred_at, actor_name, actor_employee_no, actor_role, action, module, record_label, changes, details from public.audit_logs where occurred_at >= %L and occurred_at < %L order by occurred_at, id',
                  v_year, v_next);
  else
    sql := format('select id, occurred_at, event, employee_no, user_agent from public.login_logs where occurred_at >= %L and occurred_at < %L order by occurred_at, id',
                  v_year, v_next);
  end if;

  for v_row in execute sql loop
    if v_first then v_first := false; else body := body || E'\n'; end if;
    v_line := '';
    for v_c in select unnest(array['id','occurred_at','actor_name','actor_employee_no','actor_role','action','module','record_label','changes','details','event','employee_no','user_agent']) loop
      if v_line <> '' then v_line := v_line || ','; end if;
      v_val := case when p_type = 'activity' then
        case v_c
          when 'id' then v_row.id::text
          when 'occurred_at' then to_char(v_row.occurred_at at time zone 'Asia/Manila', 'YYYY-MM-DD HH24:MI:SS')
          when 'actor_name' then v_row.actor_name
          when 'actor_employee_no' then v_row.actor_employee_no
          when 'actor_role' then v_row.actor_role
          when 'action' then v_row.action
          when 'module' then v_row.module
          when 'record_label' then v_row.record_label
          when 'changes' then v_row.changes
          when 'details' then v_row.details
        end
      else
        case v_c
          when 'id' then v_row.id::text
          when 'occurred_at' then to_char(v_row.occurred_at at time zone 'Asia/Manila', 'YYYY-MM-DD HH24:MI:SS')
          when 'event' then v_row.event
          when 'employee_no' then v_row.employee_no
          when 'user_agent' then v_row.user_agent
        end
      end;
      v_line := v_line || '"' || replace(coalesce(v_val, ''), '"', '""') || '"';
    end loop;
    body := body || v_line;
    total := total + 1;
  end loop;

  if total = 0 then raise exception 'no rows to export for that year/month'; end if;
  insert into public.log_archives (log_type, year, months, created_by_employee_no)
  values (p_type, yr, mn, a.employee_no);
  perform public.log_write_activity('log_exported', 'Administration',
    format('%s %s %s', p_type, p_year, case when mn = 0 then '' else lpad(mn::text, 2, '0') end),
    format('CSV with %s rows', total));
  return fname || '|' || body;
end $$;

-- Removes every log row of one type and one year (or a single month) and records
-- that removal in the activity log, then marks the range as gone.
create function public.log_archive_delete(p_type text, p_year int, p_month int default 0)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a record; tbl text; mn int; v_year timestamptz; v_next timestamptz; sql text; n bigint;
  removed jsonb; v_row jsonb; v_actor text := '';
begin
  if public.auth_role()::text is distinct from 'admin' then raise exception 'Not authorized'; end if;
  select employee_no, full_name, role into a from public.profiles where id = auth.uid();
  tbl := public.log_table_of(p_type);
  if tbl is null then raise exception 'unknown log type'; end if;
  mn := case when p_month between 1 and 12 then p_month else 0 end;
  v_year := public.log_year_start(p_year) + case when mn > 0 then make_interval(months => mn - 1) else interval '0' end;
  v_next := v_year + case when mn > 0 then interval '1 month' else interval '1 year' end;

  -- Guard: the same range must already have been exported (months match too).
  if not exists (select 1 from public.log_archives a2
                 where a2.log_type = p_type and a2.year = p_year and a2.months = mn) then
    raise exception 'export this year/month first';
  end if;

  -- Guard: never the current year, and never a range someone is exporting right now.
  if p_year >= extract(year from now() at time zone 'Asia/Manila')::int then
    raise exception 'cannot remove the current year';
  end if;
  if exists (select 1 from public.log_archives b
             where b.log_type = p_type and b.year = p_year and b.months = mn and b.created_at > now() - interval '1 hour') then
    raise exception 'someone exported this range recently - try again later';
  end if;

  if p_type = 'activity' then
    sql := format('select jsonb_agg(to_jsonb(x)) from (select * from public.audit_logs where occurred_at >= %L and occurred_at < %L) x', v_year, v_next);
  else
    sql := format('select jsonb_agg(to_jsonb(x)) from (select * from public.login_logs where occurred_at >= %L and occurred_at < %L) x', v_year, v_next);
  end if;
  execute sql into removed;
  if removed is null then raise exception 'no rows to remove'; end if;

  sql := format('delete from public.audit_logs where occurred_at >= %L and occurred_at < %L', v_year, v_next);
  if p_type = 'login' then
    sql := format('delete from public.login_logs where occurred_at >= %L and occurred_at < %L', v_year, v_next);
  end if;
  execute sql;
  get diagnostics n = row_count;

  -- Mark the range as gone and record who removed it, with the counts.
  if p_type = 'activity' then
    select string_agg(distinct actor_name, ', ') into v_actor from jsonb_array_elements(removed) x;
    if v_actor is null then v_actor := ''; end if;
    perform public.log_write_activity('log_removed', 'Administration',
      format('activity %s %s', p_year, case when mn = 0 then '' else lpad(mn::text, 2, '0') end),
      format('%s rows by %s (%s)', n, v_actor, a.employee_no));
  else
    select string_agg(distinct coalesce(employee_no, ''), ', ') into v_actor from jsonb_array_elements(removed) x;
    if v_actor is null then v_actor := ''; end if;
    perform public.log_write_activity('log_removed', 'Administration',
      format('login %s %s', p_year, case when mn = 0 then '' else lpad(mn::text, 2, '0') end),
      format('%s rows by %s (%s)', n, v_actor, a.employee_no));
  end if;
  update public.log_archives set months = greatest(months, mn) where log_type = p_type and year = p_year;
  return removed;
end $$;

-- Sign-in summary for the Login Log page.
create function public.login_summary() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb; v_today date := (now() at time zone 'Asia/Manila')::date;
begin
  if public.auth_role()::text is distinct from 'admin' then raise exception 'Not authorized'; end if;
  select jsonb_build_object(
    'signins_today', (select count(*) from public.login_logs where event = 'login' and (occurred_at at time zone 'Asia/Manila')::date = v_today),
    'failed_today',  (select count(*) from public.login_logs where event = 'login_failed' and (occurred_at at time zone 'Asia/Manila')::date = v_today),
    'users_7d',      (select count(distinct employee_no) from public.login_logs where event = 'login' and occurred_at >= now() - interval '7 days'),
    'flagged', coalesce((select jsonb_agg(x) from (
        select ll.employee_no, count(ll.id) as attempts, max(ll.occurred_at) as last_attempt,
               max(p.id) is not null as is_account
        from public.login_logs ll
        left join public.profiles p on p.employee_id = ll.employee_no
        where ll.event = 'login_failed' and ll.occurred_at >= now() - interval '24 hours' and ll.employee_no is not null
        group by ll.employee_no having count(ll.id) >= 3 order by count(ll.id) desc limit 8) x), '[]'::jsonb),
    'by_day', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
      select (occurred_at at time zone 'Asia/Manila')::date as day,
             count(*) filter (where event = 'login')::int as signins,
             count(*) filter (where event = 'login_failed')::int as failures
      from public.login_logs where occurred_at >= now() - interval '6 days'
      group by 1 order by 1) x)
  ) into r;
  return r;
end $$;

-- The page's four RPCs, callable by any signed-in user; the functions themselves
-- check auth_role() and return only what the page shows.
grant execute on function public.log_archive_list(), public.log_export_record(text,int,int),
  public.log_archive_delete(text,int,int), public.login_summary() to authenticated;

-- Internal helpers stay server-side: default privileges had left them callable,
-- and log_write_activity would let any signed-in user write a forged audit entry.
revoke all on function public.log_year_start(integer), public.log_table_of(text),
  public.log_write_activity(text,text,text,text) from public, anon, authenticated;
