-- ============================================================================
-- SmartERP - complete database schema, rebuilt from the application contract.
-- Matches every table / column / function the frontend in src/ actually uses.
-- Safe to re-run: all objects use "if not exists" / "create or replace".
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ----------------------------------------------------------------------------
-- Sequences for human-readable record numbers
-- ----------------------------------------------------------------------------
create sequence if not exists public.customers_customer_no_seq;
create sequence if not exists public.sales_transactions_transaction_no_seq;
create sequence if not exists public.financial_entries_entry_no_seq;
create sequence if not exists public.service_cases_case_no_seq;

-- ----------------------------------------------------------------------------
-- Profiles (a row per signed-in user; id = auth.users.id)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  employee_no         text not null unique,
  employee_id         text unique,
  email               text not null unique,
  full_name           text not null,
  role                text not null default 'staff'
                      check (role in ('admin', 'department_head', 'staff')),
  functional_area     text
                      check (functional_area in ('human_resources','finance_accounting',
                                                 'inventory_warehouse','sales_marketing',
                                                 'customer_service')),
  avatar_url          text,
  is_active           boolean not null default true,
  must_change_password boolean not null default false,
  created_at          timestamptz not null default now()
);

create table if not exists public.resource_catalog (
  resource text primary key,
  label    text not null
);

create table if not exists public.permissions (
  id              uuid primary key default gen_random_uuid(),
  role            text not null check (role in ('admin','department_head','staff')),
  functional_area text check (functional_area in ('human_resources','finance_accounting',
                                                  'inventory_warehouse','sales_marketing',
                                                  'customer_service')),
  resource        text not null,
  can_view        boolean not null default false,
  can_create      boolean not null default false,
  can_update      boolean not null default false,
  can_delete      boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique nulls not distinct (role, functional_area, resource)
);

-- ----------------------------------------------------------------------------
-- Human Resources
-- ----------------------------------------------------------------------------
create table if not exists public.employees (
  id               uuid primary key default gen_random_uuid(),
  employee_no      text not null unique,
  first_name       text not null,
  last_name        text not null,
  email            text,
  phone            text,
  address          text,
  position         text not null
                   check (position in ('Admin','Department Head','Staff')),
  functional_area  text not null
                   check (functional_area in ('human_resources','finance_accounting',
                                              'inventory_warehouse','sales_marketing',
                                              'customer_service')),
  employment_status text not null default 'active'
                    check (employment_status in ('active','on_leave','resigned','terminated')),
  hire_date        date not null default current_date,
  separation_date  date,
  created_by       uuid references public.profiles (id),
  created_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

-- ----------------------------------------------------------------------------
-- Finance
-- ----------------------------------------------------------------------------
create table if not exists public.financial_entries (
  id                    uuid primary key default gen_random_uuid(),
  entry_no              text not null unique
                        default 'FIN-' || lpad(nextval('public.financial_entries_entry_no_seq')::text, 5, '0'),
  entry_date            date not null default current_date,
  entry_type            text not null default 'expense'
                        check (entry_type in ('revenue','expense')),
  category              text not null,
  description           text,
  amount                numeric(14,2) not null check (amount > 0),
  reference             text,
  sales_transaction_id  uuid references public.sales_transactions (id),
  created_by            uuid references public.profiles (id),
  approval_status       text check (approval_status in ('pending','approved','rejected')),
  review_note           text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz
);

-- ----------------------------------------------------------------------------
-- Inventory
-- ----------------------------------------------------------------------------
create table if not exists public.suppliers (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  contact_person text,
  email          text,
  phone          text,
  address        text,
  created_by     uuid references public.profiles (id),
  created_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

create table if not exists public.warehouses (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  name       text not null,
  location   text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.products (
  id                  uuid primary key default gen_random_uuid(),
  sku                 text not null unique,
  name                text not null,
  category            text not null,
  description         text,
  unit                text not null default 'pc',
  unit_price          numeric(14,2) not null default 0 check (unit_price >= 0),
  supplier_id         uuid references public.suppliers (id),
  low_stock_threshold integer not null default 20 check (low_stock_threshold >= 0),
  created_by          uuid references public.profiles (id),
  created_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

create table if not exists public.inventory_movements (
  id              uuid primary key default gen_random_uuid(),
  movement_type   text not null check (movement_type in ('stock_in','stock_out')),
  quantity        integer not null check (quantity > 0),
  movement_date   date not null default current_date,
  warehouse_id    uuid not null references public.warehouses (id),
  supplier_id     uuid references public.suppliers (id),
  product_id      uuid not null references public.products (id),
  reference_no    text,
  remarks         text,
  created_by      uuid references public.profiles (id),
  approval_status text check (approval_status in ('pending','approved','rejected')),
  review_note     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create or replace view public.v_product_stock as
select
  p.id                  as product_id,
  p.sku,
  p.name,
  p.category,
  p.unit,
  p.low_stock_threshold,
  coalesce(m.qty, 0)::integer as quantity,
  case
    when coalesce(m.qty, 0) <= 0 then 'out_of_stock'
    when coalesce(m.qty, 0) <= p.low_stock_threshold then 'low_stock'
    else 'in_stock'
  end as stock_status
from public.products p
left join lateral (
  select sum(case when mov.movement_type = 'stock_in' then mov.quantity else -mov.quantity end) as qty
  from public.inventory_movements mov
  where mov.product_id = p.id
    and mov.approval_status = 'approved'
    and mov.deleted_at is null
) m on true
where p.deleted_at is null;

-- ----------------------------------------------------------------------------
-- Sales and marketing
-- ----------------------------------------------------------------------------
create table if not exists public.customers (
  id          uuid primary key default gen_random_uuid(),
  customer_no text not null unique
              default 'CUS-' || lpad(nextval('public.customers_customer_no_seq')::text, 5, '0'),
  full_name   text not null,
  email       text,
  phone       text,
  address     text,
  card_type   text not null default 'none'
              check (card_type in ('none','loyalty','membership')),
  card_no     text,
  created_by  uuid references public.profiles (id),
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table if not exists public.sales_transactions (
  id              uuid primary key default gen_random_uuid(),
  transaction_no  text not null unique
                  default 'TXN-' || lpad(nextval('public.sales_transactions_transaction_no_seq')::text, 5, '0'),
  transaction_date date not null default current_date,
  product_id      uuid not null references public.products (id),
  customer_id     uuid references public.customers (id),
  quantity        integer not null default 1 check (quantity > 0),
  amount          numeric(14,2) not null default 0 check (amount >= 0),
  notes           text,
  created_by      uuid references public.profiles (id),
  approval_status text check (approval_status in ('pending','approved','rejected')),
  review_note     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create table if not exists public.promotions (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  start_date  date not null default current_date,
  end_date    date not null default current_date,
  status      text not null default 'planned'
              check (status in ('planned','active','ended','cancelled')),
  created_by  uuid references public.profiles (id),
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table if not exists public.marketing_activities (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text,
  activity_date date not null default current_date,
  status       text not null default 'planned'
               check (status in ('planned','ongoing','completed','cancelled')),
  channel      text,
  promotion_id uuid references public.promotions (id),
  created_by   uuid references public.profiles (id),
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

-- ----------------------------------------------------------------------------
-- Customer Service
-- ----------------------------------------------------------------------------
create table if not exists public.service_cases (
  id                  uuid primary key default gen_random_uuid(),
  case_no             text not null unique
                      default 'CS-' || lpad(nextval('public.service_cases_case_no_seq')::text, 5, '0'),
  case_type           text not null
                      check (case_type in ('complaint','refund','inquiry','feedback','service_request')),
  customer_id         uuid not null references public.customers (id),
  subject             text not null,
  description         text,
  date_submitted      date not null default current_date,
  status              text not null default 'open'
                      check (status in ('open','in_progress','for_review','approved','denied','resolved','closed')),
  assigned_to         text references public.profiles (employee_id),
  resolution_details  text,
  resolution_date     date,
  created_by          uuid references public.profiles (id),
  product_id          uuid references public.products (id),
  product_name        text,
  sales_transaction_id uuid references public.sales_transactions (id),
  sale_no             text,
  severity            text check (severity in ('high','medium','low')),
  due_date            date,
  refund_amount       numeric(14,2) check (refund_amount is null or refund_amount > 0),
  rating              integer check (rating is null or rating between 1 and 5),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

create index if not exists idx_service_cases_customer on public.service_cases (customer_id);
create index if not exists idx_service_cases_product   on public.service_cases (product_id);
create index if not exists idx_service_cases_sale      on public.service_cases (sales_transaction_id);
create index if not exists idx_service_cases_assigned  on public.service_cases (assigned_to);

create table if not exists public.case_events (
  id         uuid primary key default gen_random_uuid(),
  case_id    uuid not null references public.service_cases (id) on delete cascade,
  kind       text not null default 'note' check (kind in ('note','decision','system')),
  body       text not null,
  actor_id   uuid references public.profiles (id),
  actor_name text,
  created_at timestamptz not null default now()
);

create index if not exists idx_case_events_case on public.case_events (case_id);

-- ----------------------------------------------------------------------------
-- Logs
-- ----------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id                bigint generated always as identity primary key,
  occurred_at       timestamptz not null default now(),
  actor_name        text,
  actor_employee_no text,
  actor_role        text,
  action            text not null,
  module            text not null,
  record_label      text,
  changes           jsonb,
  details           text
);

create index if not exists idx_audit_logs_occurred on public.audit_logs (occurred_at desc);

create table if not exists public.login_logs (
  id           bigint generated always as identity primary key,
  occurred_at  timestamptz not null default now(),
  event        text not null check (event in ('login','logout','login_failed')),
  employee_no  text,
  user_agent   text
);

create index if not exists idx_login_logs_occurred on public.login_logs (occurred_at desc);

-- ============================================================================
-- Helper functions (used by RLS policies)
-- ============================================================================
create or replace function public.fn_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.fn_caller_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.fn_caller_area() returns text
language sql stable security definer set search_path = public as $$
  select functional_area from public.profiles where id = auth.uid();
$$;

-- ============================================================================
-- Triggers
-- ============================================================================

-- created_by = the signed-in user (unless already provided)
create or replace function public.fn_set_created_by() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if NEW.created_by is null then
    NEW.created_by := auth.uid();
  end if;
  return NEW;
end;
$$;

create or replace trigger trg_employees_created_by before insert on public.employees
  for each row execute function public.fn_set_created_by();
create or replace trigger trg_financial_entries_created_by before insert on public.financial_entries
  for each row execute function public.fn_set_created_by();
create or replace trigger trg_inventory_movements_created_by before insert on public.inventory_movements
  for each row execute function public.fn_set_created_by();
create or replace trigger trg_suppliers_created_by before insert on public.suppliers
  for each row execute function public.fn_set_created_by();
create or replace trigger trg_warehouses_created_by before insert on public.warehouses
  for each row execute function public.fn_set_created_by();
create or replace trigger trg_products_created_by before insert on public.products
  for each row execute function public.fn_set_created_by();
create or replace trigger trg_customers_created_by before insert on public.customers
  for each row execute function public.fn_set_created_by();
create or replace trigger trg_sales_transactions_created_by before insert on public.sales_transactions
  for each row execute function public.fn_set_created_by();
create or replace trigger trg_promotions_created_by before insert on public.promotions
  for each row execute function public.fn_set_created_by();
create or replace trigger trg_marketing_activities_created_by before insert on public.marketing_activities
  for each row execute function public.fn_set_created_by();
create or replace trigger trg_service_cases_created_by before insert on public.service_cases
  for each row execute function public.fn_set_created_by();

-- Staff submissions wait for approval; Department Head / Admin records are
-- approved straight away. Explicit values (seeds) are respected.
create or replace function public.fn_set_approval_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role text;
begin
  if NEW.approval_status is null then
    select role into v_role from public.profiles where id = auth.uid();
    if v_role in ('department_head', 'admin') then
      NEW.approval_status := 'approved';
    else
      NEW.approval_status := 'pending';
    end if;
  end if;
  return NEW;
end;
$$;

create or replace trigger trg_financial_entries_approval before insert on public.financial_entries
  for each row execute function public.fn_set_approval_status();
create or replace trigger trg_inventory_movements_approval before insert on public.inventory_movements
  for each row execute function public.fn_set_approval_status();
create or replace trigger trg_sales_transactions_approval before insert on public.sales_transactions
  for each row execute function public.fn_set_approval_status();

-- Keep product_name / sale_no in sync and default the complaint due date.
create or replace function public.fn_case_refs() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if NEW.product_id is null then
    NEW.product_name := null;
  else
    select name into NEW.product_name from public.products where id = NEW.product_id;
  end if;

  if NEW.sales_transaction_id is null then
    NEW.sale_no := null;
  else
    select transaction_no into NEW.sale_no
    from public.sales_transactions where id = NEW.sales_transaction_id;
  end if;

  if NEW.case_type = 'complaint' and NEW.due_date is null and NEW.severity is not null then
    NEW.due_date := NEW.date_submitted + (case NEW.severity
      when 'high' then 2 when 'medium' then 5 else 10 end);
  end if;

  NEW.updated_at := now();
  return NEW;
end;
$$;

create or replace trigger trg_service_cases_refs before insert or update on public.service_cases
  for each row execute function public.fn_case_refs();

-- ============================================================================
-- Audit log (written by the database for every module change)
-- ============================================================================
create or replace function public.fn_audit_log() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  v_prof    public.profiles%rowtype;
  v_label_col text;
  v_label   text;
  v_action  text;
  v_changes jsonb := '{}'::jsonb;
  v_old     jsonb;
  v_new     jsonb;
  v_k       text;
begin
  if v_uid is null then
    return case when TG_OP = 'DELETE' then OLD else NEW end;
  end if;

  select * into v_prof from public.profiles where id = v_uid;

  v_label_col := case TG_TABLE_NAME
    when 'employees'           then 'employee_no'
    when 'profiles'            then 'employee_no'
    when 'permissions'         then 'resource'
    when 'suppliers'           then 'name'
    when 'warehouses'          then 'code'
    when 'products'            then 'sku'
    when 'customers'           then 'customer_no'
    when 'sales_transactions'  then 'transaction_no'
    when 'promotions'          then 'name'
    when 'marketing_activities' then 'name'
    when 'financial_entries'   then 'entry_no'
    when 'inventory_movements' then 'reference_no'
    when 'service_cases'       then 'case_no'
    else null
  end;

  if v_label_col is not null then
    if TG_OP = 'DELETE' then
      v_label := to_jsonb(OLD) ->> v_label_col;
    else
      v_label := to_jsonb(NEW) ->> v_label_col;
    end if;
  end if;

  if TG_OP = 'INSERT' then
    v_new := to_jsonb(NEW);
    for v_k in select jsonb_object_keys(v_new) loop
      if v_k in ('id','created_at','updated_at','deleted_at') then continue; end if;
      if v_new ->> v_k is not null and (v_new ->> v_k) <> '' then
        v_changes := v_changes || jsonb_build_object(v_k, v_new -> v_k);
      end if;
    end loop;
    v_action := 'create';
  elsif TG_OP = 'UPDATE' then
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    for v_k in select jsonb_object_keys(v_new) loop
      if v_k in ('created_at','updated_at','deleted_at') then continue; end if;
      if (v_old -> v_k) is distinct from (v_new -> v_k) then
        v_changes := v_changes || jsonb_build_object(
          v_k, jsonb_build_object('from', v_old -> v_k, 'to', v_new -> v_k));
      end if;
    end loop;
    if OLD.deleted_at is null and NEW.deleted_at is not null then
      v_action := 'delete';
      v_changes := '{}'::jsonb;
    elsif OLD.approval_status = 'pending' and NEW.approval_status = 'approved' then
      v_action := 'approve';
    elsif OLD.approval_status = 'pending' and NEW.approval_status = 'rejected' then
      v_action := 'reject';
    else
      v_action := 'update';
    end if;
    if v_changes = '{}'::jsonb and v_action = 'update' then
      return NEW;
    end if;
  else
    v_old := to_jsonb(OLD);
    for v_k in select jsonb_object_keys(v_old) loop
      if v_k in ('id','created_at','updated_at','deleted_at') then continue; end if;
      if v_old ->> v_k is not null and (v_old ->> v_k) <> '' then
        v_changes := v_changes || jsonb_build_object(v_k, v_old -> v_k);
      end if;
    end loop;
    v_action := 'delete';
  end if;

  insert into public.audit_logs
    (actor_name, actor_employee_no, actor_role, action, module, record_label, changes)
  values
    (v_prof.full_name, v_prof.employee_no, v_prof.role, v_action, TG_TABLE_NAME, v_label, v_changes);

  return case when TG_OP = 'DELETE' then OLD else NEW end;
end;
$$;

create or replace trigger trg_audit_employees after insert or update or delete on public.employees
  for each row execute function public.fn_audit_log();
create or replace trigger trg_audit_profiles after insert or update or delete on public.profiles
  for each row execute function public.fn_audit_log();
create or replace trigger trg_audit_permissions after insert or update or delete on public.permissions
  for each row execute function public.fn_audit_log();
create or replace trigger trg_audit_suppliers after insert or update or delete on public.suppliers
  for each row execute function public.fn_audit_log();
create or replace trigger trg_audit_warehouses after insert or update or delete on public.warehouses
  for each row execute function public.fn_audit_log();
create or replace trigger trg_audit_products after insert or update or delete on public.products
  for each row execute function public.fn_audit_log();
create or replace trigger trg_audit_inventory_movements after insert or update or delete on public.inventory_movements
  for each row execute function public.fn_audit_log();
create or replace trigger trg_audit_customers after insert or update or delete on public.customers
  for each row execute function public.fn_audit_log();
create or replace trigger trg_audit_sales_transactions after insert or update or delete on public.sales_transactions
  for each row execute function public.fn_audit_log();
create or replace trigger trg_audit_promotions after insert or update or delete on public.promotions
  for each row execute function public.fn_audit_log();
create or replace trigger trg_audit_marketing_activities after insert or update or delete on public.marketing_activities
  for each row execute function public.fn_audit_log();
create or replace trigger trg_audit_financial_entries after insert or update or delete on public.financial_entries
  for each row execute function public.fn_audit_log();
create or replace trigger trg_audit_service_cases after insert or update or delete on public.service_cases
  for each row execute function public.fn_audit_log();

-- Successful sign-ins (written by the database; the sign-in page has no device)
create or replace function public.fn_log_login() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_email text;
  v_emp   text;
begin
  select email into v_email from auth.users where id = NEW.user_id;
  v_emp := split_part(coalesce(v_email, ''), '@', 1);
  if v_emp is null or v_emp = '' then
    return NEW;
  end if;
  -- Ignore session refreshes that happen within five minutes of a sign-in.
  if exists (
    select 1 from public.login_logs
    where event = 'login' and employee_no = v_emp
      and occurred_at > now() - interval '5 minutes'
  ) then
    return NEW;
  end if;
  insert into public.login_logs (event, employee_no) values ('login', v_emp);
  return NEW;
end;
$$;

drop trigger if exists trg_log_login on auth.sessions;
create trigger trg_log_login after insert on auth.sessions
  for each row execute function public.fn_log_login();

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.profiles            enable row level security;
alter table public.resource_catalog    enable row level security;
alter table public.permissions         enable row level security;
alter table public.employees           enable row level security;
alter table public.financial_entries   enable row level security;
alter table public.suppliers           enable row level security;
alter table public.warehouses          enable row level security;
alter table public.products            enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.customers           enable row level security;
alter table public.sales_transactions  enable row level security;
alter table public.promotions          enable row level security;
alter table public.marketing_activities enable row level security;
alter table public.service_cases       enable row level security;
alter table public.case_events         enable row level security;
alter table public.audit_logs          enable row level security;
alter table public.login_logs          enable row level security;

-- profiles: read your own or (admin: everything); only admins update
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.fn_is_admin());
create policy profiles_update on public.profiles for update
  using (public.fn_is_admin()) with check (public.fn_is_admin());

-- reference data
create policy resource_catalog_select on public.resource_catalog for select using (true);
create policy permissions_select on public.permissions for select using (true);
create policy permissions_update on public.permissions for update
  using (public.fn_is_admin()) with check (public.fn_is_admin());

-- reads are open to signed-in users; writes are area-based and never admin
create policy employees_select on public.employees for select using (true);
create policy employees_insert on public.employees for insert
  with check (public.fn_caller_role() is not null and public.fn_caller_role() <> 'admin'
              and public.fn_caller_area() = 'human_resources');
create policy employees_update on public.employees for update
  using (public.fn_caller_role() = 'department_head' and public.fn_caller_area() = 'human_resources'
         or (public.fn_caller_role() = 'staff' and created_by = auth.uid()))
  with check (true);

create policy financial_entries_select on public.financial_entries for select using (true);
create policy financial_entries_insert on public.financial_entries for insert
  with check (public.fn_caller_role() = 'department_head' and public.fn_caller_area() = 'finance_accounting'
              or (public.fn_caller_role() = 'staff' and public.fn_caller_area() = 'finance_accounting'));
create policy financial_entries_update on public.financial_entries for update
  using (public.fn_caller_role() = 'department_head' and public.fn_caller_area() = 'finance_accounting'
         or (public.fn_caller_role() = 'staff' and created_by = auth.uid()))
  with check (true);

create policy suppliers_select on public.suppliers for select using (true);
create policy suppliers_insert on public.suppliers for insert
  with check (public.fn_caller_role() is not null and public.fn_caller_role() <> 'admin'
              and public.fn_caller_area() = 'inventory_warehouse');
create policy suppliers_update on public.suppliers for update
  using (public.fn_caller_role() is not null and public.fn_caller_role() <> 'admin'
         and public.fn_caller_area() = 'inventory_warehouse') with check (true);

create policy warehouses_select on public.warehouses for select using (true);
create policy warehouses_insert on public.warehouses for insert
  with check (public.fn_caller_role() is not null and public.fn_caller_role() <> 'admin'
              and public.fn_caller_area() = 'inventory_warehouse');
create policy warehouses_update on public.warehouses for update
  using (public.fn_caller_role() is not null and public.fn_caller_role() <> 'admin'
         and public.fn_caller_area() = 'inventory_warehouse') with check (true);

create policy products_select on public.products for select using (true);
create policy products_insert on public.products for insert
  with check (public.fn_caller_role() is not null and public.fn_caller_role() <> 'admin'
              and public.fn_caller_area() = 'inventory_warehouse');
create policy products_update on public.products for update
  using (public.fn_caller_role() is not null and public.fn_caller_role() <> 'admin'
         and public.fn_caller_area() = 'inventory_warehouse') with check (true);

create policy inventory_movements_select on public.inventory_movements for select using (true);
create policy inventory_movements_insert on public.inventory_movements for insert
  with check (public.fn_caller_role() is not null and public.fn_caller_role() <> 'admin'
              and public.fn_caller_area() = 'inventory_warehouse');
create policy inventory_movements_update on public.inventory_movements for update
  using (public.fn_caller_role() = 'department_head' and public.fn_caller_area() = 'inventory_warehouse'
         or (public.fn_caller_role() = 'staff' and created_by = auth.uid()))
  with check (true);

create policy customers_select on public.customers for select using (true);
create policy customers_insert on public.customers for insert
  with check (public.fn_caller_role() is not null and public.fn_caller_role() <> 'admin'
              and public.fn_caller_area() in ('sales_marketing','customer_service'));
create policy customers_update on public.customers for update
  using (public.fn_caller_role() is not null and public.fn_caller_role() <> 'admin'
         and public.fn_caller_area() in ('sales_marketing','customer_service')) with check (true);

create policy sales_transactions_select on public.sales_transactions for select using (true);
create policy sales_transactions_insert on public.sales_transactions for insert
  with check (public.fn_caller_role() is not null and public.fn_caller_role() <> 'admin'
              and public.fn_caller_area() = 'sales_marketing');
create policy sales_transactions_update on public.sales_transactions for update
  using (public.fn_caller_role() = 'department_head' and public.fn_caller_area() = 'sales_marketing'
         or (public.fn_caller_role() = 'staff' and created_by = auth.uid()))
  with check (true);

create policy promotions_select on public.promotions for select using (true);
create policy promotions_insert on public.promotions for insert
  with check (public.fn_caller_role() is not null and public.fn_caller_role() <> 'admin'
              and public.fn_caller_area() = 'sales_marketing');
create policy promotions_update on public.promotions for update
  using (public.fn_caller_role() is not null and public.fn_caller_role() <> 'admin'
         and public.fn_caller_area() = 'sales_marketing') with check (true);

create policy marketing_activities_select on public.marketing_activities for select using (true);
create policy marketing_activities_insert on public.marketing_activities for insert
  with check (public.fn_caller_role() is not null and public.fn_caller_role() <> 'admin'
              and public.fn_caller_area() = 'sales_marketing');
create policy marketing_activities_update on public.marketing_activities for update
  using (public.fn_caller_role() is not null and public.fn_caller_role() <> 'admin'
         and public.fn_caller_area() = 'sales_marketing') with check (true);

create policy service_cases_select on public.service_cases for select using (true);
create policy service_cases_insert on public.service_cases for insert
  with check (public.fn_caller_role() is not null and public.fn_caller_role() <> 'admin'
              and public.fn_caller_area() = 'customer_service');
create policy service_cases_update on public.service_cases for update
  using (public.fn_caller_role() = 'department_head' and public.fn_caller_area() = 'customer_service'
         or (public.fn_caller_role() = 'staff' and created_by = auth.uid()))
  with check (true);

-- timeline notes: the CS Head may note any case; Staff only their own cases
create policy case_events_select on public.case_events for select using (true);
create policy case_events_insert on public.case_events for insert
  with check (
    public.fn_caller_role() is not null and public.fn_caller_role() <> 'admin'
    and public.fn_caller_area() = 'customer_service'
    and (
      public.fn_caller_role() = 'department_head'
      or exists (
        select 1 from public.service_cases sc
        where sc.id = case_id
          and (sc.created_by = auth.uid()
               or sc.assigned_to = (select employee_id from public.profiles where id = auth.uid()))
      )
    )
  );

-- logs: admins only
create policy audit_logs_select on public.audit_logs for select using (public.fn_is_admin());
create policy login_logs_select on public.login_logs for select using (public.fn_is_admin());

-- ============================================================================
-- Functions (RPCs used by the application)
-- ============================================================================

-- Employees of the caller's department (heads assign cases; admin: everyone).
create or replace function public.area_colleagues()
returns table (employee_id text, full_name text)
language sql stable security definer set search_path = public as $$
  select p.employee_id, p.full_name
  from public.profiles p
  where p.is_active
    and p.employee_id is not null
    and (public.fn_is_admin() or p.functional_area = public.fn_caller_area())
  order by p.full_name;
$$;

-- User ids of the caller's department (staff pick their own submissions).
create or replace function public.area_user_names()
returns table (user_id uuid, full_name text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name
  from public.profiles p
  where p.is_active
    and (public.fn_is_admin() or p.functional_area = public.fn_caller_area())
  order by p.full_name;
$$;

-- Years that appear anywhere in the operational data.
create or replace function public.available_years()
returns integer[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct y order by y desc), array[]::integer[])
  from (
    select extract(year from hire_date)::integer as y from public.employees where deleted_at is null
    union all
    select extract(year from entry_date)::integer from public.financial_entries where deleted_at is null
    union all
    select extract(year from movement_date)::integer from public.inventory_movements where deleted_at is null
    union all
    select extract(year from transaction_date)::integer from public.sales_transactions where deleted_at is null
    union all
    select extract(year from date_submitted)::integer from public.service_cases where deleted_at is null
  ) t;
$$;

-- After the Password Gate, the user may keep their new password.
create or replace function public.clear_must_change_password() returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set must_change_password = false where id = auth.uid();
end;
$$;

-- Lookups used by the Customer Service pickers.
create or replace function public.cs_lookup(p_kind text, p_q text default '', p_id uuid default null)
returns table (id uuid, label text, sub text)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_kind = 'customer' then
    if p_id is not null then
      return query
        select c.id, c.full_name, c.customer_no
        from public.customers c
        where c.id = p_id and c.deleted_at is null
        limit 1;
    else
      return query
        select c.id, c.full_name, c.customer_no
        from public.customers c
        where c.deleted_at is null
          and (p_q = ''
               or c.full_name ilike '%' || p_q || '%'
               or c.customer_no ilike '%' || p_q || '%')
        order by c.full_name
        limit 50;
    end if;
  elsif p_kind = 'product' then
    if p_id is not null then
      return query
        select p.id, p.sku || ' - ' || p.name, p.category
        from public.products p
        where p.id = p_id and p.deleted_at is null
        limit 1;
    else
      return query
        select p.id, p.sku || ' - ' || p.name, p.category
        from public.products p
        where p.deleted_at is null
          and (p_q = ''
               or p.name ilike '%' || p_q || '%'
               or p.sku ilike '%' || p_q || '%')
        order by p.name
        limit 50;
    end if;
  elsif p_kind = 'sale' then
    if p_id is not null then
      return query
        select st.id, st.transaction_no,
               to_char(st.transaction_date, 'Mon DD, YYYY') || ' - ' ||
               to_char(st.amount, 'FM999,999,990.00')
        from public.sales_transactions st
        where st.id = p_id and st.deleted_at is null
        limit 1;
    else
      return query
        select st.id, st.transaction_no,
               to_char(st.transaction_date, 'Mon DD, YYYY') || ' - ' ||
               to_char(st.amount, 'FM999,999,990.00')
        from public.sales_transactions st
        where st.deleted_at is null
          and (p_q = '' or st.transaction_no ilike '%' || p_q || '%')
        order by st.transaction_date desc, st.created_at desc
        limit 50;
    end if;
  end if;
  return;
end;
$$;

-- Drawer: everything the Customer tab shows about one customer.
create or replace function public.cs_customer_snapshot(p_customer uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', c.full_name,
    'customer_no', c.customer_no,
    'phone', c.phone,
    'email', c.email,
    'purchases', coalesce(s.cnt, 0),
    'spent', coalesce(s.spent, 0),
    'cases', coalesce(k.cnt, 0),
    'recent_purchases', coalesce(s.recent, '[]'::jsonb),
    'recent_cases', coalesce(k.recent, '[]'::jsonb)
  )
  from public.customers c
  left join lateral (
    select count(*)::int as cnt,
           coalesce(sum(st.amount), 0) as spent,
           (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'transaction_no', t.transaction_no,
                      'transaction_date', t.transaction_date,
                      'product', coalesce(p.name, ''),
                      'amount', t.amount
                    ) order by t.transaction_date desc, t.created_at desc), '[]'::jsonb)
             from (
               select * from public.sales_transactions
               where customer_id = c.id
                 and approval_status = 'approved'
                 and deleted_at is null
               order by transaction_date desc, created_at desc
               limit 5
             ) t
             left join public.products p on p.id = t.product_id
           ) as recent
    from public.sales_transactions st
    where st.customer_id = c.id
      and st.approval_status = 'approved'
      and st.deleted_at is null
  ) s on true
  left join lateral (
    select count(*)::int as cnt,
           (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'case_no', x.case_no,
                      'case_type', x.case_type,
                      'subject', x.subject,
                      'status', x.status,
                      'date_submitted', x.date_submitted
                    ) order by x.date_submitted desc, x.created_at desc), '[]'::jsonb)
             from (
               select * from public.service_cases
               where customer_id = c.id and deleted_at is null
               order by date_submitted desc, created_at desc
               limit 5
             ) x
           ) as recent
    from public.service_cases k
    where k.customer_id = c.id and k.deleted_at is null
  ) k on true
  where c.id = p_customer
    and c.deleted_at is null;
$$;

-- Drawer: stock + complaint signals for one product.
create or replace function public.cs_product_snapshot(p_product uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', v.name,
    'sku', v.sku,
    'category', v.category,
    'stock', v.quantity,
    'low_threshold', v.low_stock_threshold,
    'complaints_12m', coalesce(c.cnt, 0),
    'open_cases', coalesce(o.cnt, 0)
  )
  from public.v_product_stock v
  left join lateral (
    select count(*)::int as cnt
    from public.service_cases sc
    where sc.product_id = v.product_id
      and sc.case_type = 'complaint'
      and sc.deleted_at is null
      and sc.date_submitted >= current_date - interval '12 months'
  ) c on true
  left join lateral (
    select count(*)::int as cnt
    from public.service_cases sc
    where sc.product_id = v.product_id
      and sc.deleted_at is null
      and sc.status in ('open','in_progress','for_review','approved')
  ) o on true
  where v.product_id = p_product;
$$;

-- Customer Service dashboard (one round trip for the whole page).
create or replace function public.cs_dashboard()
returns jsonb
language sql stable security definer set search_path = public as $$
with c as (
  select * from public.service_cases where deleted_at is null
)
select jsonb_build_object(
  'total', (select count(*) from c),
  'pending', (select count(*) from c
              where status in ('open','in_progress','for_review','approved')),
  'overdue', (select count(*) from c
              where status in ('open','in_progress','for_review','approved')
                and due_date < current_date),
  'unassigned', (select count(*) from c
                 where status in ('open','in_progress','for_review','approved')
                   and assigned_to is null),
  'refunds_waiting', (select count(*) from c
                      where case_type = 'refund' and status in ('open','for_review')),
  'refund_approved_amount', (select coalesce(sum(refund_amount), 0) from c
                             where case_type = 'refund'
                               and status in ('approved','resolved')
                               and date_submitted >= current_date - interval '12 months'),
  'avg_days', coalesce((select round(avg(resolution_date - date_submitted), 1) from c
                        where resolution_date is not null
                          and date_submitted >= current_date - interval '12 months'), 0),
  'avg_rating', (select round(avg(rating), 1) from c
                 where case_type = 'feedback'
                   and rating is not null
                   and date_submitted >= current_date - interval '12 months'),
  'by_type', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'type', t, 'pending', p, 'total', tot) order by t), '[]'::jsonb)
    from (select case_type as t,
                 count(*) filter (where status in ('open','in_progress','for_review','approved'))::int as p,
                 count(*)::int as tot
          from c
          group by case_type) x),
  'workload', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'name', name, 'open_cases', open_cases, 'overdue', overdue)
             order by open_cases desc), '[]'::jsonb)
    from (select coalesce(p.full_name, sc.assigned_to) as name,
                 count(*)::int as open_cases,
                 count(*) filter (where sc.due_date < current_date)::int as overdue
          from c sc
          left join public.profiles p on p.employee_id = sc.assigned_to
          where sc.assigned_to is not null
            and sc.status in ('open','in_progress','for_review','approved')
          group by 1) w),
  'top_products', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'name', name, 'cases', cases) order by cases desc), '[]'::jsonb)
    from (select product_name as name, count(*)::int as cases
          from c
          where case_type = 'complaint'
            and product_name is not null
            and date_submitted >= current_date - interval '12 months'
          group by product_name
          order by count(*) desc
          limit 5) t),
  'trend', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'period', to_char(d, 'YYYY-MM'), 'cases', coalesce(n, 0)) order by d), '[]'::jsonb)
    from generate_series(date_trunc('month', current_date) - interval '5 months',
                         date_trunc('month', current_date),
                         interval '1 month') d
    left join lateral (
      select count(*)::int as n
      from c
      where to_char(c.date_submitted, 'YYYY-MM') = to_char(d, 'YYYY-MM')
    ) x on true),
  'attention', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', id, 'case_no', case_no, 'type', case_type, 'subject', subject,
             'status', status, 'due_date', due_date, 'reason', reason, 'assignee', assignee)
             order by case reason when 'overdue' then 0 when 'unassigned' then 1 else 2 end,
                      due_date nulls last), '[]'::jsonb)
    from (select sc.id, sc.case_no, sc.case_type, sc.subject, sc.status, sc.due_date,
                 case
                   when sc.due_date < current_date then 'overdue'
                   when sc.assigned_to is null then 'unassigned'
                   else 'waiting'
                 end as reason,
                 (select p.full_name from public.profiles p
                  where p.employee_id = sc.assigned_to) as assignee
          from c sc
          where sc.status in ('open','in_progress','for_review','approved')
            and ((sc.due_date is not null and sc.due_date < current_date)
                 or sc.assigned_to is null
                 or (sc.case_type = 'refund' and sc.status in ('open','for_review')))) a)
);
$$;

-- Overview dashboard (one round trip for the whole page).
create or replace function public.overview_kpis(p_year integer default null)
returns jsonb
language sql stable security definer set search_path = public as $$
select jsonb_build_object(
  'year', p_year,
  'hr', jsonb_build_object(
    'total', (select count(*) from public.employees
              where deleted_at is null
                and (p_year is null or hire_date <= make_date(p_year, 12, 31))),
    'active', (select count(*) from public.employees
               where deleted_at is null
                 and (p_year is null or hire_date <= make_date(p_year, 12, 31))
                 and (separation_date is null
                      or separation_date > coalesce(make_date(p_year, 12, 31), current_date))),
    'by_area', (
      select coalesce(jsonb_object_agg(functional_area, cnt), '{}'::jsonb)
      from (select functional_area, count(*)::int as cnt
            from public.employees
            where deleted_at is null
              and (p_year is null or hire_date <= make_date(p_year, 12, 31))
              and (separation_date is null
                   or separation_date > coalesce(make_date(p_year, 12, 31), current_date))
            group by functional_area) x)),
  'finance', jsonb_build_object(
    'revenue', (select coalesce(sum(amount), 0) from public.financial_entries
                where approval_status = 'approved' and deleted_at is null
                  and entry_type = 'revenue'
                  and (p_year is null or extract(year from entry_date)::integer = p_year)),
    'expenses', (select coalesce(sum(amount), 0) from public.financial_entries
                 where approval_status = 'approved' and deleted_at is null
                   and entry_type = 'expense'
                   and (p_year is null or extract(year from entry_date)::integer = p_year)),
    'entries', (select count(*) from public.financial_entries
                where approval_status = 'approved' and deleted_at is null
                  and (p_year is null or extract(year from entry_date)::integer = p_year))),
  'inventory', jsonb_build_object(
    'products', (select count(*) from public.products where deleted_at is null),
    'suppliers', (select count(*) from public.suppliers where deleted_at is null),
    'total_stock', (select coalesce(sum(quantity), 0) from public.v_product_stock),
    'low_stock', (select count(*) from public.v_product_stock
                  where stock_status in ('low_stock', 'out_of_stock')),
    'stock_in', (select coalesce(sum(quantity), 0) from public.inventory_movements
                 where approval_status = 'approved' and deleted_at is null
                   and movement_type = 'stock_in'
                   and (p_year is null or extract(year from movement_date)::integer = p_year)),
    'stock_out', (select coalesce(sum(quantity), 0) from public.inventory_movements
                  where approval_status = 'approved' and deleted_at is null
                    and movement_type = 'stock_out'
                    and (p_year is null or extract(year from movement_date)::integer = p_year))),
  'sales', jsonb_build_object(
    'total_sales', (select coalesce(sum(amount), 0) from public.sales_transactions
                    where approval_status = 'approved' and deleted_at is null
                      and (p_year is null or extract(year from transaction_date)::integer = p_year)),
    'transactions', (select count(*) from public.sales_transactions
                     where approval_status = 'approved' and deleted_at is null
                       and (p_year is null or extract(year from transaction_date)::integer = p_year)),
    'top_products', (
      select coalesce(jsonb_agg(jsonb_build_object('name', name, 'amount', amt)
                                order by amt desc), '[]'::jsonb)
      from (select coalesce(p.name, 'Unknown product') as name, sum(st.amount) as amt
            from public.sales_transactions st
            left join public.products p on p.id = st.product_id
            where st.approval_status = 'approved' and st.deleted_at is null
              and (p_year is null or extract(year from st.transaction_date)::integer = p_year)
            group by coalesce(p.name, 'Unknown product')
            order by sum(st.amount) desc
            limit 5) x)),
  'customer_service', jsonb_build_object(
    'total', (select count(*) from public.service_cases
              where deleted_at is null
                and (p_year is null or extract(year from date_submitted)::integer = p_year)),
    'pending', (select count(*) from public.service_cases
                where deleted_at is null
                  and status in ('open','in_progress','for_review','approved')
                  and (p_year is null or extract(year from date_submitted)::integer = p_year)),
    'resolved', (select count(*) from public.service_cases
                 where deleted_at is null
                   and status in ('resolved','closed')
                   and (p_year is null or extract(year from date_submitted)::integer = p_year)),
    'by_type', (
      select coalesce(jsonb_object_agg(case_type, cnt), '{}'::jsonb)
      from (select case_type, count(*)::int as cnt
            from public.service_cases
            where deleted_at is null
              and (p_year is null or extract(year from date_submitted)::integer = p_year)
            group by case_type) x)),
  'trend', jsonb_build_object(
    'sales', (
      select coalesce(jsonb_agg(jsonb_build_object('period', per, 'amount', amt, 'transactions', cnt)
                                order by per), '[]'::jsonb)
      from (select to_char(transaction_date, case when p_year is null then 'YYYY' else 'YYYY-MM' end) as per,
                   coalesce(sum(amount), 0) as amt,
                   count(*)::int as cnt
            from public.sales_transactions
            where approval_status = 'approved' and deleted_at is null
              and (p_year is null or extract(year from transaction_date)::integer = p_year)
            group by 1) x),
    'finance', (
      select coalesce(jsonb_agg(jsonb_build_object('period', per,
                                                   'revenue', coalesce(rev, 0),
                                                   'expenses', coalesce(exp, 0))
                                order by per), '[]'::jsonb)
      from (select to_char(entry_date, case when p_year is null then 'YYYY' else 'YYYY-MM' end) as per,
                   sum(amount) filter (where entry_type = 'revenue') as rev,
                   sum(amount) filter (where entry_type = 'expense') as exp
            from public.financial_entries
            where approval_status = 'approved' and deleted_at is null
              and (p_year is null or extract(year from entry_date)::integer = p_year)
            group by 1) x),
    'cases', (
      select coalesce(jsonb_agg(jsonb_build_object('period', per, 'cases', cnt)
                                order by per), '[]'::jsonb)
      from (select to_char(date_submitted, case when p_year is null then 'YYYY' else 'YYYY-MM' end) as per,
                   count(*)::int as cnt
            from public.service_cases
            where deleted_at is null
              and (p_year is null or extract(year from date_submitted)::integer = p_year)
            group by 1) x)
  )
);
$$;

-- Refund picker: the most recent approved sales.
create or replace function public.lookup_sales_refs()
returns table (id uuid, transaction_no text, transaction_date date, amount numeric)
language sql stable set search_path = public as $$
  select st.id, st.transaction_no, st.transaction_date, st.amount
  from public.sales_transactions st
  where st.deleted_at is null
    and st.approval_status = 'approved'
  order by st.transaction_date desc, st.created_at desc
  limit 200;
$$;

-- Accounts page: one row per employee account (admins have no functional area).
create or replace function public.hr_list_accounts()
returns table (id uuid, employee_no text, full_name text, role text, functional_area text,
               is_active boolean, must_change_password boolean, last_sign_in_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.employee_no, p.full_name, p.role, p.functional_area,
         p.is_active, p.must_change_password, u.last_sign_in_at
  from public.profiles p
  left join auth.users u on u.id = p.id
  where p.functional_area is not null
  order by p.full_name;
$$;

-- Employees without an account yet (HR "Add Account" dialog).
create or replace function public.hr_unregistered_employees()
returns table (id uuid, employee_no text, full_name text, job_position text, functional_area text)
language sql stable security definer set search_path = public as $$
  select e.id, e.employee_no, e.first_name || ' ' || e.last_name,
         e.position, e.functional_area
  from public.employees e
  where e.deleted_at is null
    and e.employment_status in ('active', 'on_leave')
    and not exists (select 1 from public.profiles p where p.employee_no = e.employee_no)
  order by e.last_name, e.first_name;
$$;

-- Enable/disable an employee account (HR Head or Admin).
create or replace function public.hr_set_account_status(p_user uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_role text;
  v_area text;
begin
  select role, functional_area into v_role, v_area
  from public.profiles where id = auth.uid();

  if not (v_role = 'admin'
          or (v_role = 'department_head' and v_area = 'human_resources')) then
    raise exception using errcode = '42501',
      message = 'You do not have permission to change accounts.';
  end if;

  update public.profiles set is_active = p_active where id = p_user;
end;
$$;

-- Anonymous: the sign-in page records a wrong password before auth exists.
create or replace function public.log_failed_login(p_employee_no text, p_user_agent text) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.login_logs (event, employee_no, user_agent)
  values ('login_failed', p_employee_no, p_user_agent);
end;
$$;

-- Sign-out records the session (the client cannot write the database directly).
create or replace function public.log_logout(p_user_agent text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_emp text;
begin
  select employee_no into v_emp from public.profiles where id = auth.uid();
  if v_emp is null then
    select split_part(coalesce(u.email, ''), '@', 1) into v_emp
    from auth.users u where u.id = auth.uid();
  end if;
  insert into public.login_logs (event, employee_no, user_agent)
  values ('logout', v_emp, p_user_agent);
end;
$$;

-- Approvals page: a Department Head decides a pending record.
-- Insufficient stock raises P0001 "Insufficient stock for this product."
create or replace function public.review_record(p_table text, p_id uuid, p_decision text, p_note text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_role  text;
  v_area  text;
  v_expected_area text;
  v_label_col text;
  v_label text;
  v_movement_type text;
  v_quantity integer;
  v_product_id uuid;
  v_balance integer;
begin
  select role, functional_area into v_role, v_area
  from public.profiles where id = auth.uid();

  if p_table not in ('financial_entries', 'inventory_movements', 'sales_transactions') then
    raise exception using errcode = '42501',
      message = 'That record cannot be approved here.';
  end if;

  v_expected_area := case p_table
    when 'financial_entries' then 'finance_accounting'
    when 'inventory_movements' then 'inventory_warehouse'
    else 'sales_marketing'
  end;

  if v_role <> 'department_head' or v_area <> v_expected_area then
    raise exception using errcode = '42501',
      message = 'You do not have permission to review these records.';
  end if;

  if not exists (
    select 1 from public.permissions
    where role = v_role and functional_area = v_area
      and resource = p_table and can_update
  ) then
    raise exception using errcode = '42501',
      message = 'You do not have permission to review these records.';
  end if;

  if p_decision not in ('approve', 'reject') then
    raise exception 'Unknown decision.';
  end if;

  -- Stock out may not take the product below zero.
  if p_table = 'inventory_movements' then
    select movement_type, quantity, product_id
    into v_movement_type, v_quantity, v_product_id
    from public.inventory_movements
    where id = p_id and deleted_at is null;

    if not found then
      raise exception 'That movement no longer exists.';
    end if;

    if p_decision = 'approve' and v_movement_type = 'stock_out' then
      select coalesce(sum(case when movement_type = 'stock_in' then quantity else -quantity end), 0)
      into v_balance
      from public.inventory_movements
      where product_id = v_product_id
        and approval_status = 'approved'
        and deleted_at is null;

      if v_balance - v_quantity < 0 then
        raise exception 'Insufficient stock for this product.';
      end if;
    end if;
  end if;

  v_label_col := case p_table
    when 'financial_entries' then 'entry_no'
    when 'inventory_movements' then 'reference_no'
    else 'transaction_no'
  end;
  execute format('select %I from public.%I where id = $1', v_label_col, p_table)
    into v_label using p_id;

  execute format(
    'update public.%I set approval_status = $1, review_note = $2, updated_at = now() where id = $3',
    p_table)
    using case when p_decision = 'approve' then 'approved' else 'rejected' end,
          p_note, p_id;
end;
$$;

-- Delete a record: permission + ownership are checked here, then the row is
-- removed, so it disappears from lists and reports (foreign keys protect links).
create or replace function public.soft_delete_record(p_table text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_role text;
  v_area text;
begin
  select role, functional_area into v_role, v_area
  from public.profiles where id = auth.uid();

  if v_role is null or v_role = 'admin' then
    raise exception using errcode = '42501',
      message = 'You do not have permission to delete records.';
  end if;

  if p_table not in ('employees', 'financial_entries', 'inventory_movements', 'suppliers',
                     'warehouses', 'products', 'sales_transactions', 'customers',
                     'promotions', 'marketing_activities', 'service_cases') then
    raise exception using errcode = '42501',
      message = 'That record cannot be deleted here.';
  end if;

  if not exists (
    select 1 from public.permissions
    where role = v_role and functional_area = v_area
      and resource = p_table and can_delete
  ) then
    raise exception using errcode = '42501',
      message = 'You do not have permission to delete records.';
  end if;

  -- Staff may only delete their own records; a Head may delete any in the
  -- department that the permission row covers.
  execute format(
    'delete from public.%I where id = $1 and ($2 = ''department_head'' or created_by = auth.uid())',
    p_table)
    using p_id, v_role;
end;
$$;

-- Backend for the smart-action edge function: create an account or reset a
-- password. Runs with the caller's JWT, so it can write auth.users directly.
-- Returns {"error": null} on success or {"error": "..."} with a user-facing
-- message; it never raises.
create or replace function public.admin_action(
  p_action text,
  p_employee_no text default null,
  p_full_name text default null,
  p_password text default null,
  p_user_id uuid default null,
  p_role text default null,
  p_functional_area text default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_caller public.profiles%rowtype;
  v_target public.profiles%rowtype;
  v_emp    public.employees%rowtype;
  v_email  text;
  v_uid    uuid;
  v_hash   text;
  v_role   text;
begin
  select * into v_caller from public.profiles where id = auth.uid();

  if v_caller.id is null or v_caller.role not in ('admin', 'department_head') then
    return jsonb_build_object('error', 'You are not allowed to manage accounts.');
  end if;

  v_role := coalesce(p_role, 'staff');

  if p_action = 'create' then
    if p_employee_no is null or p_password is null then
      return jsonb_build_object('error', 'An employee number and password are required.');
    end if;
    if length(p_password) < 8 then
      return jsonb_build_object('error', 'The password must be at least 8 characters.');
    end if;

    if v_role = 'admin' then
      if v_caller.role <> 'admin' then
        return jsonb_build_object('error', 'Only an administrator can create another administrator.');
      end if;
      if p_full_name is null or btrim(p_full_name) = '' then
        return jsonb_build_object('error', 'A name is required.');
      end if;
      p_functional_area := null;
    else
      if v_caller.role <> 'admin' and v_caller.functional_area <> 'human_resources' then
        return jsonb_build_object('error', 'You are not allowed to create employee accounts.');
      end if;
      select * into v_emp
      from public.employees
      where employee_no = p_employee_no and deleted_at is null;
      if v_emp.id is null then
        return jsonb_build_object('error', 'No active employee was found with that employee number.');
      end if;
      p_full_name := v_emp.first_name || ' ' || v_emp.last_name;
      p_functional_area := v_emp.functional_area;
    end if;

    if exists (select 1 from public.profiles where employee_no = p_employee_no) then
      return jsonb_build_object('error', 'An account already exists for this employee.');
    end if;

    v_email := lower(p_employee_no) || '@erp.example.com';
    if exists (select 1 from auth.users u where lower(u.email) = v_email) then
      return jsonb_build_object('error', 'That sign-in address is already taken.');
    end if;

    v_uid  := gen_random_uuid();
    v_hash := extensions.crypt(p_password, extensions.gen_salt('bf'));

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, is_sso_user, is_anonymous
    ) values (
      '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
      v_email, v_hash, now(),
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      jsonb_build_object('full_name', p_full_name, 'employee_no', p_employee_no),
      now(), now(), false, false
    );

    insert into auth.identities (
      id, user_id, provider, provider_id, identity_data,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_uid, 'email', v_uid::text,
      jsonb_build_object('sub', v_uid, 'email', v_email, 'email_verified', true),
      now(), now(), now()
    );

    insert into public.profiles (
      id, employee_no, employee_id, email, full_name, role, functional_area,
      is_active, must_change_password
    ) values (
      v_uid, p_employee_no, p_employee_no, v_email, p_full_name, v_role, p_functional_area,
      true, true
    );

    return jsonb_build_object('error', null, 'user_id', v_uid);
  end if;

  if p_action = 'reset_password' then
    if p_user_id is null or p_password is null then
      return jsonb_build_object('error', 'No account was selected.');
    end if;
    if length(p_password) < 8 then
      return jsonb_build_object('error', 'The password must be at least 8 characters.');
    end if;

    select * into v_target from public.profiles where id = p_user_id;
    if v_target.id is null then
      return jsonb_build_object('error', 'That account no longer exists.');
    end if;

    if v_caller.role <> 'admin'
       and not (v_caller.functional_area = 'human_resources' and v_target.role = 'staff') then
      return jsonb_build_object('error', 'You are not allowed to reset that password.');
    end if;

    update auth.users
    set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
        updated_at = now()
    where id = p_user_id;

    update public.profiles set must_change_password = true where id = p_user_id;

    return jsonb_build_object('error', null);
  end if;

  return jsonb_build_object('error', 'Unknown account action.');
end;
$$;

-- Password reset marks the profile, so the audit trail names the action.
create or replace function public.fn_audit_log() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  v_prof    public.profiles%rowtype;
  v_label_col text;
  v_label   text;
  v_action  text;
  v_changes jsonb := '{}'::jsonb;
  v_old     jsonb;
  v_new     jsonb;
  v_k       text;
begin
  if v_uid is null then
    return case when TG_OP = 'DELETE' then OLD else NEW end;
  end if;

  select * into v_prof from public.profiles where id = v_uid;

  v_label_col := case TG_TABLE_NAME
    when 'employees'           then 'employee_no'
    when 'profiles'            then 'employee_no'
    when 'permissions'         then 'resource'
    when 'suppliers'           then 'name'
    when 'warehouses'          then 'code'
    when 'products'            then 'sku'
    when 'customers'           then 'customer_no'
    when 'sales_transactions'  then 'transaction_no'
    when 'promotions'          then 'name'
    when 'marketing_activities' then 'name'
    when 'financial_entries'   then 'entry_no'
    when 'inventory_movements' then 'reference_no'
    when 'service_cases'       then 'case_no'
    else null
  end;

  if v_label_col is not null then
    if TG_OP = 'DELETE' then
      v_label := to_jsonb(OLD) ->> v_label_col;
    else
      v_label := to_jsonb(NEW) ->> v_label_col;
    end if;
  end if;

  if TG_OP = 'INSERT' then
    v_new := to_jsonb(NEW);
    for v_k in select jsonb_object_keys(v_new) loop
      if v_k in ('id','created_at','updated_at','deleted_at') then continue; end if;
      if v_new ->> v_k is not null and (v_new ->> v_k) <> '' then
        v_changes := v_changes || jsonb_build_object(v_k, v_new -> v_k);
      end if;
    end loop;
    v_action := 'create';
  elsif TG_OP = 'UPDATE' then
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    for v_k in select jsonb_object_keys(v_new) loop
      if v_k in ('created_at','updated_at','deleted_at') then continue; end if;
      if (v_old -> v_k) is distinct from (v_new -> v_k) then
        v_changes := v_changes || jsonb_build_object(
          v_k, jsonb_build_object('from', v_old -> v_k, 'to', v_new -> v_k));
      end if;
    end loop;
    if OLD.deleted_at is null and NEW.deleted_at is not null then
      v_action := 'delete';
      v_changes := '{}'::jsonb;
    elsif OLD.approval_status = 'pending' and NEW.approval_status = 'approved' then
      v_action := 'approve';
    elsif OLD.approval_status = 'pending' and NEW.approval_status = 'rejected' then
      v_action := 'reject';
    elsif TG_TABLE_NAME = 'profiles'
          and OLD.must_change_password = false
          and NEW.must_change_password = true then
      v_action := 'password_reset';
    else
      v_action := 'update';
    end if;
    if v_changes = '{}'::jsonb and v_action = 'update' then
      return NEW;
    end if;
  else
    v_old := to_jsonb(OLD);
    for v_k in select jsonb_object_keys(v_old) loop
      if v_k in ('id','created_at','updated_at','deleted_at') then continue; end if;
      if v_old ->> v_k is not null and (v_old ->> v_k) <> '' then
        v_changes := v_changes || jsonb_build_object(v_k, v_old -> v_k);
      end if;
    end loop;
    v_action := 'delete';
  end if;

  insert into public.audit_logs
    (actor_name, actor_employee_no, actor_role, action, module, record_label, changes)
  values
    (v_prof.full_name, v_prof.employee_no, v_prof.role, v_action, TG_TABLE_NAME, v_label, v_changes);

  return case when TG_OP = 'DELETE' then OLD else NEW end;
end;
$$;

-- ============================================================================
-- Grants (PostgREST connects as these roles)
-- ============================================================================
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
grant execute on all functions in schema public to anon;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant select on tables to anon;
alter default privileges in schema public
  grant usage, select on sequences to authenticated;
alter default privileges in schema public
  grant execute on functions to authenticated, anon;

-- Failed sign-ins happen before sign-in, so anonymous callers need this one.
grant execute on function public.log_failed_login(text, text) to anon;
grant execute on function public.admin_action(text, text, text, text, uuid, text, text) to authenticated;
