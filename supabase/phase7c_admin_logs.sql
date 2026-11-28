-- Phase 7C: admin logs + import/export permission columns
-- Source: /tmp/arena-coding-uploads/13_admin_logs_permissions.sql, adapted to THIS schema:
--   * permissions audit trigger is trg_audit_permissions (05_audit.sql names it that)
--   * audit_logs has no actor_id/actor_area/record_id; login_logs has no user_id
--   * log_immutable() existed in 05_audit.sql but no triggers were attached to
--     audit_logs/login_logs -- attach them here so the archive-delete RPC's
--     app.log_purge bypass is the only way to remove a log row
--   * internal helpers revoked from authenticated too (default privileges had
--     left log_write_activity callable, i.e. forgeable audit entries)
--   * admin_no_import constraint guarded so re-running is safe
--   * log_archive_list/log_export_record/log_archive_delete/login_summary are
--     create-or-replace, and stale signatures from an aborted run are dropped
-- Run AFTER 11_hr_profiles / Phase 7B. Existing data is kept.

-- ---------------------------------------------------------------------
-- 1) Import / Export permissions
-- ---------------------------------------------------------------------
alter table public.permissions disable trigger trg_audit_permissions;

alter table public.permissions
  add column if not exists can_import boolean not null default false,
  add column if not exists can_export boolean not null default false;

-- The Admin never imports (the Admin is read-only on records)
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'admin_no_import') then
    alter table public.permissions add constraint admin_no_import check (not (role = 'admin' and can_import));
  end if;
end $$;

-- Keep today's behaviour: Department Heads and the Admin can download their department reports;
-- whoever can add sales can import sales files.
update public.permissions set can_export = true
 where can_export = false and role in ('department_head', 'admin')
   and resource in ('employees', 'financial_entries', 'inventory_movements', 'sales_transactions', 'service_cases');
update public.permissions set can_import = can_create
 where can_import = false and role in ('department_head', 'staff') and resource = 'sales_transactions';

alter table public.permissions enable trigger trg_audit_permissions;

-- ---------------------------------------------------------------------
-- 2) Yearly log archive
-- ---------------------------------------------------------------------
-- (safe to re-run: an empty table from an aborted attempt is recreated)
drop table if exists public.log_archives;
create table public.log_archives (
  id                uuid primary key default gen_random_uuid(),
  log_type          text not null check (log_type in ('activity', 'login')),
  year              int  not null,
  row_count         int  not null,
  file_name         text,
  exported_at       timestamptz not null default now(),
  exported_by       uuid,
  exported_by_name  text,
  deleted_at        timestamptz,
  deleted_by        uuid,
  deleted_by_name   text,
  deleted_count     int
);
alter table public.log_archives enable row level security;
drop policy if exists log_archives_select on public.log_archives;
create policy log_archives_select on public.log_archives for select to authenticated
  using (public.auth_role()::text = 'admin');
revoke all on public.log_archives from anon, authenticated;
grant select on public.log_archives to authenticated;

-- The one exception to "log entries cannot be deleted": the archive function below.
create or replace function public.log_immutable() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' and coalesce(current_setting('app.log_purge', true), 'off') = 'on' then
    return old;
  end if;
  raise exception 'Log entries cannot be changed or deleted';
end $$;

-- Our 05_audit.sql created log_immutable() but never attached it -- attach now.
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_audit_logs_immutable') then
    create trigger trg_audit_logs_immutable before delete or update on public.audit_logs
      for each row execute function public.log_immutable();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_login_logs_immutable') then
    create trigger trg_login_logs_immutable before delete or update on public.login_logs
      for each row execute function public.log_immutable();
  end if;
end $$;

-- Calendar years are counted in Philippine time
create or replace function public.log_year_start(p_year int) returns timestamptz
language sql immutable as $$ select make_timestamptz(p_year, 1, 1, 0, 0, 0, 'Asia/Manila') $$;

create or replace function public.log_table_of(p_type text) returns text
language sql immutable as $$
  select case p_type when 'activity' then 'audit_logs' when 'login' then 'login_logs' else null end
$$;

create or replace function public.log_write_activity(p_action text, p_module text, p_label text, p_details text) returns void
language plpgsql security definer set search_path = public as $$
declare a record;
begin
  select employee_no, full_name, role into a from public.profiles where id = auth.uid();
  insert into public.audit_logs (actor_employee_no, actor_name, actor_role, action, module, record_label, details)
  values (a.employee_no, coalesce(a.full_name, 'Unknown user'), a.role, p_action, p_module, p_label, p_details);
end $$;

-- What years exist, how many entries each has, and whether they were exported
create or replace function public.log_archive_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb; v_now int := extract(year from now() at time zone 'Asia/Manila')::int;
begin
  if public.auth_role()::text is distinct from 'admin' then raise exception 'Not authorized'; end if;
  with a as (
    select 'activity'::text as t, extract(year from occurred_at at time zone 'Asia/Manila')::int as y, count(*)::int as c,
           min(occurred_at) as f, max(occurred_at) as l from public.audit_logs group by 2
    union all
    select 'login', extract(year from occurred_at at time zone 'Asia/Manila')::int, count(*)::int, min(occurred_at), max(occurred_at)
    from public.login_logs group by 2
  )
  select jsonb_build_object(
    'current_year', v_now,
    'years', coalesce((select jsonb_agg(x order by x.year desc, x.type) from (
        select a.t as type, a.y as year, a.c as rows, a.f as first_at, a.l as last_at,
               (e.id is not null) as exported, e.exported_at, e.exported_by_name, e.file_name,
               (a.y < v_now and e.id is not null) as can_delete
        from a left join lateral (
          select x.* from public.log_archives x
          where x.log_type = a.t and x.year = a.y and x.deleted_at is null and x.row_count = a.c
          order by x.exported_at desc limit 1) e on true) x), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(h order by h.exported_at desc) from (
        select log_type as type, year, row_count, file_name, exported_at, exported_by_name,
               deleted_at, deleted_by_name, deleted_count
        from public.log_archives order by exported_at desc limit 30) h), '[]'::jsonb)
  ) into r;
  return r;
end $$;

-- Called after the CSV was downloaded. The row count must match, so a partial file cannot count as an export.
create or replace function public.log_export_record(p_type text, p_year int, p_rows int, p_file text) returns void
language plpgsql security definer set search_path = public as $$
declare v_table text := public.log_table_of(p_type); v_count int; v_name text;
begin
  if public.auth_role()::text is distinct from 'admin' then raise exception 'Not authorized'; end if;
  if v_table is null then raise exception 'Unknown log'; end if;
  execute format('select count(*) from public.%I where occurred_at >= $1 and occurred_at < $2', v_table)
    into v_count using public.log_year_start(p_year), public.log_year_start(p_year + 1);
  if v_count = 0 then raise exception 'There are no entries for % in this log', p_year; end if;
  if p_rows <> v_count then
    raise exception 'The file has % entries but the log has %. Please export again.', p_rows, v_count;
  end if;
  select full_name into v_name from public.profiles where id = auth.uid();
  insert into public.log_archives (log_type, year, row_count, file_name, exported_by, exported_by_name)
  values (p_type, p_year, v_count, p_file, auth.uid(), v_name);
  perform public.log_write_activity('log_exported', v_table,
    (case p_type when 'activity' then 'Activity log ' else 'Login log ' end) || p_year,
    v_count || ' entries exported to ' || coalesce(p_file, 'a CSV file'));
end $$;

-- Removes one finished year from the database. Needs a matching export first.
create or replace function public.log_archive_delete(p_type text, p_year int) returns int
language plpgsql security definer set search_path = public as $$
declare v_table text := public.log_table_of(p_type); v_now int := extract(year from now() at time zone 'Asia/Manila')::int;
        v_count int; v_arch uuid; v_deleted int; v_name text;
begin
  if public.auth_role()::text is distinct from 'admin' then raise exception 'Not authorized'; end if;
  if v_table is null then raise exception 'Unknown log'; end if;
  if p_year >= v_now then raise exception 'Only completed years can be removed'; end if;

  execute format('select count(*) from public.%I where occurred_at >= $1 and occurred_at < $2', v_table)
    into v_count using public.log_year_start(p_year), public.log_year_start(p_year + 1);
  select id into v_arch from public.log_archives
   where log_type = p_type and year = p_year and deleted_at is null and row_count = v_count
   order by exported_at desc limit 1;
  if v_arch is null then raise exception 'Export % first. The file must contain every entry of the year.', p_year; end if;

  perform set_config('app.log_purge', 'on', true);
  execute format('delete from public.%I where occurred_at >= $1 and occurred_at < $2', v_table)
    using public.log_year_start(p_year), public.log_year_start(p_year + 1);
  get diagnostics v_deleted = row_count;
  perform set_config('app.log_purge', 'off', true);

  select full_name into v_name from public.profiles where id = auth.uid();
  update public.log_archives set deleted_at = now(), deleted_by = auth.uid(), deleted_by_name = v_name, deleted_count = v_deleted
   where id = v_arch;
  perform public.log_write_activity('log_removed', v_table,
    (case p_type when 'activity' then 'Activity log ' else 'Login log ' end) || p_year,
    v_deleted || ' entries removed after export');
  return v_deleted;
end $$;

-- ---------------------------------------------------------------------
-- 3) Login summary
-- ---------------------------------------------------------------------
create or replace function public.login_summary() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb; v_today date := (now() at time zone 'Asia/Manila')::date;
begin
  if public.auth_role()::text is distinct from 'admin' then raise exception 'Not authorized'; end if;
  select jsonb_build_object(
    'signins_today', (select count(*) from public.login_logs where event = 'login' and (occurred_at at time zone 'Asia/Manila')::date = v_today),
    'failed_today',  (select count(*) from public.login_logs where event = 'login_failed' and (occurred_at at time zone 'Asia/Manila')::date = v_today),
    -- our login_logs has no user_id: distinct IDs = distinct employee_no
    'users_7d',      (select count(distinct employee_no) from public.login_logs where event = 'login' and occurred_at >= now() - interval '7 days'),
    'flagged', coalesce((select jsonb_agg(x) from (
        select l.employee_no, count(l.id) as attempts, max(l.occurred_at) as last_attempt,
               max(p.id) is not null as is_account
        from public.login_logs l
        left join public.profiles p on p.employee_id = l.employee_no
        where l.event = 'login_failed' and l.occurred_at >= now() - interval '24 hours' and l.employee_no is not null
        group by l.employee_no having count(l.id) >= 3 order by count(l.id) desc limit 8) x), '[]'::jsonb),
    'by_day', coalesce((select jsonb_agg(x order by x.day) from (
        select d::date as day,
               (select count(*) from public.login_logs l where l.event = 'login' and (l.occurred_at at time zone 'Asia/Manila')::date = d::date) as signins,
               (select count(*) from public.login_logs l where l.event = 'login_failed' and (l.occurred_at at time zone 'Asia/Manila')::date = d::date) as failed
        from generate_series(v_today - 13, v_today, interval '1 day') d) x), '[]'::jsonb)
  ) into r;
  return r;
end $$;

-- ---------------------------------------------------------------------
-- 4) Who may call what
-- ---------------------------------------------------------------------
-- Drop any stale signature left by an aborted earlier attempt, then set grants.
drop function if exists public.log_export_record(text, int, int);
drop function if exists public.log_archive_delete(text, int, int);

revoke all on function public.log_year_start(int), public.log_table_of(text),
  public.log_write_activity(text, text, text, text),
  public.log_archive_list(), public.log_export_record(text, int, int, text),
  public.log_archive_delete(text, int), public.login_summary()
  from public, anon, authenticated;
grant execute on function public.log_archive_list(), public.log_export_record(text, int, int, text),
  public.log_archive_delete(text, int), public.login_summary() to authenticated;
