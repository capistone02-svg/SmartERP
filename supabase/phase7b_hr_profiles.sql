-- =====================================================================
-- Phase 7B - employee profiles, documents, history, onboarding
-- (adapted from 11_hr_profiles.sql for this schema: text functional_area,
--  profiles.employee_id = employee_no text, service_cases.assigned_to =
--  employee_no text, trigger trg_audit_permissions, no functional_area enum)
-- Run in the Supabase SQL Editor. Existing records are kept.
--
--  * Personal details (birth date, emergency contact, government numbers) live in
--    their own table that only HR, the Admin and the employee can open.
--  * Document records + a private file bucket "employee-documents".
--  * Employment history written automatically when a position, area or status changes.
--  * Functions for the HR dashboard, the onboarding checklist, the work profile
--    a Department Head sees, and the team list.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Helpers this schema does not have yet (Phase 7A baseline)
-- ---------------------------------------------------------------------
create or replace function public.has_perm(p_resource text, p_action text)
returns boolean
language sql stable security definer set search_path = public as
$$
  select coalesce((
    select case p_action
             when 'view'   then can_view
             when 'create' then can_create
             when 'update' then can_update
             when 'delete' then can_delete
             else false
           end
    from public.permissions pm
    join public.profiles pr on pr.role = pm.role
    where pr.id = auth.uid()
      and pm.resource = p_resource
      and (pm.functional_area is null or pm.functional_area = pr.functional_area)
    limit 1
  ), false)
$$;

create or replace function public.auth_role() returns text
language sql stable security definer set search_path = public as
$$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.auth_area() returns text
language sql stable security definer set search_path = public as
$$ select functional_area from public.profiles where id = auth.uid() $$;

-- The signed-in person's employee row (uuid). profiles.employee_id stores the
-- employee_no text, so resolve through employees.
create or replace function public.my_employee_id() returns uuid
language sql stable security definer set search_path = public as
$$
  select e.id
  from public.employees e
  join public.profiles p on p.employee_id = e.employee_no
  where p.id = auth.uid()
$$;

alter table public.resource_catalog add column if not exists owner_area text;
alter table public.resource_catalog add column if not exists sensitivity text not null default 'normal';

-- ---------------------------------------------------------------------
-- 1) Work-related additions to employees (visible to the department, not personal)
-- ---------------------------------------------------------------------
alter table public.employees
  add column if not exists employment_type text not null default 'regular',
  add column if not exists probation_end   date;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'employees_type_chk') then
    alter table public.employees
      add constraint employees_type_chk check (employment_type in ('regular', 'probationary', 'contractual', 'seasonal'));
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2) Personal details (HR, Admin, and the employee only)
-- ---------------------------------------------------------------------
create table public.employee_personal (
  employee_id        uuid primary key references public.employees(id) on delete cascade,
  birth_date         date,
  civil_status       text check (civil_status is null or civil_status in ('single', 'married', 'widowed', 'separated')),
  emergency_name     text,
  emergency_relation text,
  emergency_phone    text,
  sss_no             text,
  philhealth_no      text,
  pagibig_no         text,
  tin_no             text,
  updated_by         uuid default auth.uid(),
  updated_at         timestamptz not null default now()
);
alter table public.employee_personal enable row level security;

create policy ep_select on public.employee_personal for select to authenticated
  using (public.has_perm('employee_personal', 'view') or employee_id = public.my_employee_id());
create policy ep_insert on public.employee_personal for insert to authenticated
  with check (public.has_perm('employee_personal', 'create'));
create policy ep_update on public.employee_personal for update to authenticated
  using (public.has_perm('employee_personal', 'update')) with check (public.has_perm('employee_personal', 'update'));

create or replace function public.touch_personal() returns trigger language plpgsql as
$$ begin new.updated_at := now(); new.updated_by := auth.uid(); return new; end $$;
create trigger trg_touch_personal before update on public.employee_personal
  for each row execute function public.touch_personal();

-- ---------------------------------------------------------------------
-- 3) Documents
-- ---------------------------------------------------------------------
create table public.document_types (
  code        text primary key,
  label       text not null,
  required    boolean not null default false,
  has_expiry  boolean not null default false,
  sort        int not null default 0
);
insert into public.document_types (code, label, required, has_expiry, sort) values
  ('valid_id',          'Valid government ID',            true,  true,  1),
  ('sss',               'SSS number proof (E-1 or ID)',    true,  false, 2),
  ('philhealth',        'PhilHealth ID or MDR',            true,  false, 3),
  ('pagibig',           'Pag-IBIG MID',                    true,  false, 4),
  ('tin',               'TIN ID or BIR Form 1902',         true,  false, 5),
  ('birth_certificate', 'PSA birth certificate',           true,  false, 6),
  ('nbi_clearance',     'NBI or police clearance',         true,  true,  7),
  ('contract',          'Signed employment contract',      true,  false, 8),
  ('medical',           'Medical certificate',             false, true,  9),
  ('diploma',           'Diploma or transcript',           false, false, 10),
  ('resume',            'Resume',                          false, false, 11),
  ('other',             'Other document',                  false, false, 12);
alter table public.document_types enable row level security;
create policy dt_select on public.document_types for select to authenticated using (true);

create table public.employee_documents (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.employees(id) on delete cascade,
  doc_type     text not null references public.document_types(code),
  file_path    text,                      -- empty = paper copy received in person
  file_name    text,
  file_size    int,
  mime         text,
  issue_date   date,
  expiry_date  date,
  status       text not null default 'on_file' check (status in ('on_file', 'verified', 'rejected')),
  note         text,
  uploaded_by  uuid default auth.uid(),
  uploaded_at  timestamptz not null default now(),
  verified_by  uuid,
  verified_at  timestamptz,
  deleted_at   timestamptz
);
create index employee_documents_emp_idx on public.employee_documents (employee_id) where deleted_at is null;
alter table public.employee_documents enable row level security;

create policy ed_select on public.employee_documents for select to authenticated
  using (deleted_at is null and (public.has_perm('employee_documents', 'view') or employee_id = public.my_employee_id()));
create policy ed_insert on public.employee_documents for insert to authenticated
  with check (public.has_perm('employee_documents', 'create'));
create policy ed_update on public.employee_documents for update to authenticated
  using (public.has_perm('employee_documents', 'update')) with check (public.has_perm('employee_documents', 'update'));

create or replace function public.stamp_document() returns trigger language plpgsql as
$$
begin
  if new.status = 'verified' and (tg_op = 'INSERT' or old.status is distinct from 'verified') then
    new.verified_by := auth.uid(); new.verified_at := now();
  end if;
  return new;
end $$;
create trigger trg_stamp_document before insert or update on public.employee_documents
  for each row execute function public.stamp_document();

-- ---------------------------------------------------------------------
-- 4) Employment history (written by the system)
-- ---------------------------------------------------------------------
create table public.employee_history (
  id               uuid primary key default gen_random_uuid(),
  employee_id      uuid not null references public.employees(id) on delete cascade,
  kind             text not null check (kind in ('hired', 'position', 'transfer', 'status', 'separation', 'type')),
  summary          text not null,
  from_value       text,
  to_value         text,
  effective_date   date not null default current_date,
  recorded_by      uuid default auth.uid(),
  recorded_by_name text,
  created_at       timestamptz not null default now()
);
create index employee_history_emp_idx on public.employee_history (employee_id, effective_date desc);
alter table public.employee_history enable row level security;
create policy eh_select on public.employee_history for select to authenticated
  using (public.has_perm('employee_history', 'view') or employee_id = public.my_employee_id());

create or replace function public.employee_history_log() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  select full_name into v_name from public.profiles where id = auth.uid();
  v_name := coalesce(v_name, case when auth.uid() is null then 'System' else 'Unknown user' end);

  if tg_op = 'INSERT' then
    insert into public.employee_history (employee_id, kind, summary, to_value, effective_date, recorded_by_name)
    values (new.id, 'hired', 'Hired as ' || new.position, new.position, new.hire_date, v_name);
    return new;
  end if;

  if new.position is distinct from old.position then
    insert into public.employee_history (employee_id, kind, summary, from_value, to_value, recorded_by_name)
    values (new.id, 'position', 'Position changed from ' || old.position || ' to ' || new.position, old.position, new.position, v_name);
  end if;
  if new.functional_area is distinct from old.functional_area then
    insert into public.employee_history (employee_id, kind, summary, from_value, to_value, recorded_by_name)
    values (new.id, 'transfer',
            'Transferred from ' || replace(old.functional_area, '_', ' ') || ' to ' || replace(new.functional_area, '_', ' '),
            old.functional_area, new.functional_area, v_name);
  end if;
  if new.employment_status is distinct from old.employment_status then
    insert into public.employee_history (employee_id, kind, summary, from_value, to_value, effective_date, recorded_by_name)
    values (new.id,
            case when new.employment_status in ('resigned', 'terminated') then 'separation' else 'status' end,
            'Status changed from ' || replace(old.employment_status, '_', ' ') || ' to ' || replace(new.employment_status, '_', ' '),
            old.employment_status, new.employment_status,
            coalesce(new.separation_date, current_date), v_name);
  end if;
  if new.employment_type is distinct from old.employment_type then
    insert into public.employee_history (employee_id, kind, summary, from_value, to_value, recorded_by_name)
    values (new.id, 'type', 'Employment type changed from ' || old.employment_type || ' to ' || new.employment_type,
            old.employment_type, new.employment_type, v_name);
  end if;
  return new;
end $$;
create trigger trg_employee_history after insert or update on public.employees
  for each row execute function public.employee_history_log();

-- Existing employees get a "Hired" line
insert into public.employee_history (employee_id, kind, summary, to_value, effective_date, recorded_by_name)
select e.id, 'hired', 'Hired as ' || e.position, e.position, e.hire_date, 'System'
from public.employees e
where not exists (select 1 from public.employee_history h where h.employee_id = e.id and h.kind = 'hired');

-- ---------------------------------------------------------------------
-- 5) Permissions (the Admin can change these in Administration > Permissions)
-- ---------------------------------------------------------------------
alter table public.permissions disable trigger trg_audit_permissions;
insert into public.resource_catalog (resource, label, owner_area, sensitivity) values
  ('employee_personal',  'Employee personal details (HR)',  'human_resources', 'high'),
  ('employee_documents', 'Employee documents (HR)',         'human_resources', 'high'),
  ('employee_history',   'Employment history (HR)',         'human_resources', 'medium');

insert into public.permissions (role, functional_area, resource, can_view, can_create, can_update, can_delete) values
  ('admin',           null,              'employee_personal',  true, false, false, false),
  ('admin',           null,              'employee_documents', true, false, false, false),
  ('admin',           null,              'employee_history',   true, false, false, false),
  ('department_head', 'human_resources', 'employee_personal',  true, true,  true,  false),
  ('department_head', 'human_resources', 'employee_documents', true, true,  true,  false),
  ('department_head', 'human_resources', 'employee_history',   true, false, false, false),
  ('staff',           'human_resources', 'employee_personal',  true, false, false, false),
  ('staff',           'human_resources', 'employee_documents', true, true,  true,  false),
  ('staff',           'human_resources', 'employee_history',   true, false, false, false);
alter table public.permissions enable trigger trg_audit_permissions;

grant select, insert, update on public.employee_personal, public.employee_documents to authenticated;
grant select on public.document_types, public.employee_history to authenticated;

-- ---------------------------------------------------------------------
-- 7) Who may open which part of an employee's profile
--    personnel file: HR, the Admin, the employee.   work profile: the Admin, the
--    Department Head of the same area, the employee. HR sees no task lists of others.
--    p_employee accepts an employee uuid OR an employee_no (links use either).
-- ---------------------------------------------------------------------
create or replace function public.employee_access(p_employee text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_role text := public.auth_role();
  v_area text := public.auth_area();
  e record;
  v_id uuid := null;
  v_self boolean := false;
begin
  if p_employee ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_id := p_employee::uuid;
  else
    select id into v_id from public.employees where employee_no = p_employee and deleted_at is null;
  end if;
  if v_id is not null then
    v_self := v_id = public.my_employee_id();
  end if;

  select id, first_name || ' ' || last_name as name, position, functional_area as area,
         employment_status as status, employee_no
    into e from public.employees where id = v_id and deleted_at is null;
  if not found then
    return jsonb_build_object('found', false, 'personnel', false, 'work', false, 'self', false);
  end if;
  return jsonb_build_object(
    'found', true, 'id', e.id, 'self', v_self, 'name', e.name, 'position', e.position, 'area', e.area,
    'status', e.status, 'employee_no', e.employee_no,
    'personnel', v_self or v_role = 'admin' or (v_area = 'human_resources' and public.has_perm('employee_documents', 'view')),
    'work',      v_self or v_role = 'admin' or (v_role = 'department_head' and v_area = e.area));
end $$;

-- The work profile: what a Department Head sees about their own staff
create or replace function public.work_profile(p_employee text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  acc jsonb := public.employee_access(p_employee);
  e record; v_uid uuid; r jsonb := '{}'::jsonb;
begin
  if not coalesce((acc ->> 'work')::boolean, false) then raise exception 'Not authorized'; end if;
  select * into e from public.employees where id = (acc ->> 'id')::uuid;
  select id into v_uid from public.profiles where employee_id = e.employee_no;

  r := jsonb_build_object(
    'name', e.first_name || ' ' || e.last_name, 'employee_no', e.employee_no, 'position', e.position,
    'area', e.functional_area, 'status', e.employment_status, 'hire_date', e.hire_date,
    'employment_type', e.employment_type, 'probation_end', e.probation_end,
    'email', e.email, 'phone', e.phone,
    'tenure_months', (extract(year from age(current_date, e.hire_date)) * 12 + extract(month from age(current_date, e.hire_date)))::int,
    'has_account', v_uid is not null);

  if e.functional_area = 'customer_service' then
    r := r || jsonb_build_object('kind', 'cases',
      'open', (select count(*) from public.service_cases c where c.assigned_to = e.employee_no and c.deleted_at is null
               and c.status in ('open', 'in_progress', 'for_review', 'approved')),
      'overdue', (select count(*) from public.service_cases c where c.assigned_to = e.employee_no and c.deleted_at is null
                  and c.status in ('open', 'in_progress', 'for_review', 'approved') and c.due_date < current_date),
      'done_month', (select count(*) from public.service_cases c where c.assigned_to = e.employee_no and c.deleted_at is null
                     and c.resolution_date >= date_trunc('month', current_date)::date),
      'avg_days', (select coalesce(round(avg(c.resolution_date - c.date_submitted)::numeric, 1), 0)
                   from public.service_cases c where c.assigned_to = e.employee_no and c.deleted_at is null and c.resolution_date is not null),
      'recent', coalesce((select jsonb_agg(x) from (
          select c.case_no, c.case_type as type, c.subject, c.status, c.due_date
          from public.service_cases c where c.assigned_to = e.employee_no and c.deleted_at is null
          order by (c.status in ('open', 'in_progress', 'for_review', 'approved')) desc, c.date_submitted desc limit 8) x), '[]'::jsonb));
  elsif e.functional_area = 'finance_accounting' then
    r := r || jsonb_build_object('kind', 'submissions', 'noun', 'entries',
      'pending',  (select count(*) from public.financial_entries t where t.created_by = v_uid and t.deleted_at is null and t.approval_status = 'pending'),
      'rejected', (select count(*) from public.financial_entries t where t.created_by = v_uid and t.deleted_at is null and t.approval_status = 'rejected'),
      'approved', (select count(*) from public.financial_entries t where t.created_by = v_uid and t.deleted_at is null and t.approval_status = 'approved'),
      'recent', coalesce((select jsonb_agg(x) from (select t.entry_no as label, t.approval_status as status, t.created_at
          from public.financial_entries t where t.created_by = v_uid and t.deleted_at is null order by t.created_at desc limit 8) x), '[]'::jsonb));
  elsif e.functional_area = 'inventory_warehouse' then
    r := r || jsonb_build_object('kind', 'submissions', 'noun', 'movements',
      'pending',  (select count(*) from public.inventory_movements t where t.created_by = v_uid and t.deleted_at is null and t.approval_status = 'pending'),
      'rejected', (select count(*) from public.inventory_movements t where t.created_by = v_uid and t.deleted_at is null and t.approval_status = 'rejected'),
      'approved', (select count(*) from public.inventory_movements t where t.created_by = v_uid and t.deleted_at is null and t.approval_status = 'approved'),
      'recent', coalesce((select jsonb_agg(x) from (select coalesce(t.reference_no, 'Movement') as label, t.approval_status as status, t.created_at
          from public.inventory_movements t where t.created_by = v_uid and t.deleted_at is null order by t.created_at desc limit 8) x), '[]'::jsonb));
  elsif e.functional_area = 'sales_marketing' then
    r := r || jsonb_build_object('kind', 'submissions', 'noun', 'sales',
      'pending',  (select count(*) from public.sales_transactions t where t.created_by = v_uid and t.deleted_at is null and t.approval_status = 'pending'),
      'rejected', (select count(*) from public.sales_transactions t where t.created_by = v_uid and t.deleted_at is null and t.approval_status = 'rejected'),
      'approved', (select count(*) from public.sales_transactions t where t.created_by = v_uid and t.deleted_at is null and t.approval_status = 'approved'),
      'recent', coalesce((select jsonb_agg(x) from (select t.transaction_no as label, t.approval_status as status, t.created_at
          from public.sales_transactions t where t.created_by = v_uid and t.deleted_at is null order by t.created_at desc limit 8) x), '[]'::jsonb));
  else
    r := r || jsonb_build_object('kind', 'none');
  end if;
  return r;
end $$;

-- The Head's team list with how much each person is carrying
create or replace function public.team_overview(p_area text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_role text := public.auth_role(); v_area text; r jsonb;
begin
  if v_role = 'admin' then v_area := p_area;
  elsif v_role = 'department_head' then v_area := public.auth_area();
  else raise exception 'Not authorized'; end if;
  if v_area is null then raise exception 'Choose a department'; end if;

  select coalesce(jsonb_agg(x order by x.name), '[]'::jsonb) into r from (
    select e.id, e.first_name || ' ' || e.last_name as name, e.employee_no, e.position,
           e.employment_status as status, e.hire_date,
           exists (select 1 from public.profiles p where p.employee_id = e.employee_no) as has_account,
           case v_area
             when 'customer_service' then (select count(*) from public.service_cases c where c.assigned_to = e.employee_no and c.deleted_at is null
                                           and c.status in ('open', 'in_progress', 'for_review', 'approved'))
             when 'finance_accounting' then (select count(*) from public.financial_entries t join public.profiles p on p.id = t.created_by
                                             where p.employee_id = e.employee_no and t.deleted_at is null and t.approval_status = 'pending')
             when 'inventory_warehouse' then (select count(*) from public.inventory_movements t join public.profiles p on p.id = t.created_by
                                              where p.employee_id = e.employee_no and t.deleted_at is null and t.approval_status = 'pending')
             when 'sales_marketing' then (select count(*) from public.sales_transactions t join public.profiles p on p.id = t.created_by
                                          where p.employee_id = e.employee_no and t.deleted_at is null and t.approval_status = 'pending')
             else 0 end as open_work,
           case v_area
             when 'customer_service' then (select count(*) from public.service_cases c where c.assigned_to = e.employee_no and c.deleted_at is null
                                           and c.status in ('open', 'in_progress', 'for_review', 'approved') and c.due_date < current_date)
             when 'finance_accounting' then (select count(*) from public.financial_entries t join public.profiles p on p.id = t.created_by
                                             where p.employee_id = e.employee_no and t.deleted_at is null and t.approval_status = 'rejected')
             when 'inventory_warehouse' then (select count(*) from public.inventory_movements t join public.profiles p on p.id = t.created_by
                                              where p.employee_id = e.employee_no and t.deleted_at is null and t.approval_status = 'rejected')
             when 'sales_marketing' then (select count(*) from public.sales_transactions t join public.profiles p on p.id = t.created_by
                                          where p.employee_id = e.employee_no and t.deleted_at is null and t.approval_status = 'rejected')
             else 0 end as flagged
    from public.employees e
    where e.functional_area = v_area and e.deleted_at is null and e.employment_status in ('active', 'on_leave')) x;
  return r;
end $$;

-- ---------------------------------------------------------------------
-- 8) HR: onboarding checklist, dashboard, and a proper "add employee"
-- ---------------------------------------------------------------------
create or replace function public.hr_compliance_rows()
returns table (id uuid, employee_no text, name text, job_position text, area text, hire_date date,
               employment_type text, required_total int, on_file int, missing jsonb, expiring int,
               expired int, has_account boolean, has_personal boolean, complete boolean)
language sql stable security definer set search_path = public as $$
  with ok as (
    select e.id as eid, t.code, t.label, t.sort,
           exists (select 1 from public.employee_documents d
                   where d.employee_id = e.id and d.doc_type = t.code and d.deleted_at is null
                     and d.status <> 'rejected' and (d.expiry_date is null or d.expiry_date >= current_date)) as have
    from public.employees e cross join public.document_types t
    where t.required and e.deleted_at is null and e.employment_status in ('active', 'on_leave')
  ), base as (
    select e.id, e.employee_no, e.first_name || ' ' || e.last_name as name, e.position as job_position,
           e.functional_area as area, e.hire_date, e.employment_type,
           (select count(*) from ok where ok.eid = e.id)::int as required_total,
           (select count(*) from ok where ok.eid = e.id and ok.have)::int as on_file,
           coalesce((select jsonb_agg(ok.label order by ok.sort) from ok where ok.eid = e.id and not ok.have), '[]'::jsonb) as missing,
           (select count(*) from public.employee_documents d where d.employee_id = e.id and d.deleted_at is null
              and d.expiry_date between current_date and current_date + 30)::int as expiring,
           (select count(*) from public.employee_documents d where d.employee_id = e.id and d.deleted_at is null
              and d.expiry_date < current_date)::int as expired,
           exists (select 1 from public.profiles p where p.employee_id = e.employee_no) as has_account,
           exists (select 1 from public.employee_personal pe where pe.employee_id = e.id) as has_personal
    from public.employees e
    where e.deleted_at is null and e.employment_status in ('active', 'on_leave')
  )
  select b.id, b.employee_no, b.name, b.job_position, b.area, b.hire_date, b.employment_type, b.required_total, b.on_file,
         b.missing, b.expiring, b.expired, b.has_account, b.has_personal,
         (b.on_file = b.required_total and b.expired = 0 and b.has_personal) as complete  -- a system account is optional (not every employee signs in)
  from base b
$$;

create or replace function public.hr_compliance() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_perm('employee_documents', 'view') then raise exception 'Not authorized'; end if;
  return coalesce((select jsonb_agg(to_jsonb(c) order by c.complete, c.hire_date desc) from public.hr_compliance_rows() c), '[]'::jsonb);
end $$;

create or replace function public.hr_dashboard() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not (public.auth_role() = 'admin' or public.auth_area() = 'human_resources') then raise exception 'Not authorized'; end if;
  if not public.has_perm('employees', 'view') then raise exception 'Not authorized'; end if;
  select jsonb_build_object(
    'headcount',   (select count(*) from public.employees e where e.deleted_at is null and e.employment_status in ('active', 'on_leave')),
    'on_leave',    (select count(*) from public.employees e where e.deleted_at is null and e.employment_status = 'on_leave'),
    'new_hires',   (select count(*) from public.employees e where e.deleted_at is null and e.hire_date >= current_date - 90),
    'incomplete_onboarding', (select count(*) from public.hr_compliance_rows() c where not c.complete and c.hire_date >= current_date - 90),
    'missing_docs',  (select count(*) from public.hr_compliance_rows() c where c.on_file < c.required_total),
    'expiring_docs', (select coalesce(sum(c.expiring + c.expired), 0) from public.hr_compliance_rows() c),
    'no_account',  (select count(*) from public.hr_compliance_rows() c where not c.has_account),
    'by_area', coalesce((select jsonb_agg(x) from (
        select e.functional_area as area, count(*) as employees from public.employees e
        where e.deleted_at is null and e.employment_status in ('active', 'on_leave') group by 1 order by 1) x), '[]'::jsonb),
    'by_type', coalesce((select jsonb_agg(x) from (
        select e.employment_type as type, count(*) as employees from public.employees e
        where e.deleted_at is null and e.employment_status in ('active', 'on_leave') group by 1 order by 2 desc) x), '[]'::jsonb),
    'years', coalesce((select jsonb_agg(x order by x.year) from (
        select y as year,
               (select count(*) from public.employees e where e.deleted_at is null and extract(year from e.hire_date) = y) as hires,
               (select count(*) from public.employees e where e.deleted_at is null and e.separation_date is not null and extract(year from e.separation_date) = y) as separations
        from generate_series(extract(year from current_date)::int - 7, extract(year from current_date)::int) y) x), '[]'::jsonb),
    'probation_ending', coalesce((select jsonb_agg(x) from (
        select e.id, e.first_name || ' ' || e.last_name as name, e.position, e.probation_end
        from public.employees e where e.deleted_at is null and e.probation_end between current_date and current_date + 30
        order by e.probation_end limit 8) x), '[]'::jsonb),
    'expiring_list', coalesce((select jsonb_agg(x) from (
        select e.id, e.first_name || ' ' || e.last_name as name, t.label as document, d.expiry_date
        from public.employee_documents d join public.employees e on e.id = d.employee_id
        join public.document_types t on t.code = d.doc_type
        where d.deleted_at is null and e.deleted_at is null and e.employment_status in ('active', 'on_leave')
          and d.expiry_date <= current_date + 30
        order by d.expiry_date limit 8) x), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(x) from (
        select h.employee_id as id, e.first_name || ' ' || e.last_name as name, h.kind, h.summary, h.effective_date
        from public.employee_history h join public.employees e on e.id = h.employee_id
        order by h.effective_date desc, h.created_at desc limit 8) x), '[]'::jsonb)
  ) into r;
  return r;
end $$;

-- Adds the employee and the personal details together, or neither
create or replace function public.hr_add_employee(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_type text := coalesce(nullif(p ->> 'employment_type', ''), 'regular');
        v_hire date := (p ->> 'hire_date')::date; v_probation date := nullif(p ->> 'probation_end', '')::date;
begin
  if not public.has_perm('employees', 'create') then raise exception 'Not authorized'; end if;
  if coalesce(btrim(p ->> 'employee_no'), '') = '' or coalesce(btrim(p ->> 'first_name'), '') = ''
     or coalesce(btrim(p ->> 'last_name'), '') = '' or coalesce(btrim(p ->> 'position'), '') = '' then
    raise exception 'Employee ID, name and position are required';
  end if;
  if v_type = 'probationary' and v_probation is null then v_probation := v_hire + interval '6 months'; end if;

  begin
    insert into public.employees (employee_no, first_name, last_name, email, phone, address, position,
                                  functional_area, employment_status, hire_date, employment_type, probation_end)
    values (btrim(p ->> 'employee_no'), btrim(p ->> 'first_name'), btrim(p ->> 'last_name'),
            nullif(btrim(p ->> 'email'), ''), nullif(btrim(p ->> 'phone'), ''), nullif(btrim(p ->> 'address'), ''),
            btrim(p ->> 'position'), p ->> 'functional_area', 'active', v_hire, v_type, v_probation)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Employee ID % already exists', btrim(p ->> 'employee_no');
  end;

  if public.has_perm('employee_personal', 'create') then
    insert into public.employee_personal (employee_id, birth_date, civil_status, emergency_name, emergency_relation,
                                          emergency_phone, sss_no, philhealth_no, pagibig_no, tin_no)
    values (v_id, nullif(p ->> 'birth_date', '')::date, nullif(p ->> 'civil_status', ''),
            nullif(btrim(p ->> 'emergency_name'), ''), nullif(btrim(p ->> 'emergency_relation'), ''),
            nullif(btrim(p ->> 'emergency_phone'), ''), nullif(btrim(p ->> 'sss_no'), ''),
            nullif(btrim(p ->> 'philhealth_no'), ''), nullif(btrim(p ->> 'pagibig_no'), ''), nullif(btrim(p ->> 'tin_no'), ''));
  end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- 9) Who may call what
-- ---------------------------------------------------------------------
revoke all on function public.my_employee_id(), public.employee_access(text), public.work_profile(text),
  public.team_overview(text), public.hr_compliance_rows(), public.hr_compliance(), public.hr_dashboard(),
  public.hr_add_employee(jsonb), public.has_perm(text, text), public.auth_role(), public.auth_area() from public, anon;
revoke execute on function public.hr_compliance_rows() from authenticated;  -- internal: only the functions above call it
grant execute on function public.my_employee_id(), public.employee_access(text), public.work_profile(text),
  public.team_overview(text), public.hr_compliance(), public.hr_dashboard(), public.hr_add_employee(jsonb),
  public.has_perm(text, text), public.auth_role(), public.auth_area() to authenticated;

select 'phase7b hr core ok' as status;
