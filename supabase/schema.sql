create extension if not exists pgcrypto;

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  employee_id text not null unique,
  full_name text not null,
  department_id uuid references public.departments(id),
  role_id uuid references public.roles(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.user_credentials (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.roles(id) on delete cascade,
  module_name text not null,
  can_view boolean not null default false,
  can_create boolean not null default false,
  can_update boolean not null default false,
  can_delete boolean not null default false,
  created_at timestamptz not null default now(),
  unique (role_id, module_name)
);

create table if not exists public.hr_employee_records (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  position text not null,
  status text not null default 'Active',
  tenure text,
  email text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.finance_records (
  id uuid primary key default gen_random_uuid(),
  department_id uuid references public.departments(id),
  record_name text not null,
  amount numeric(12,2) not null default 0,
  entry_type text not null default 'expense',
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_records (
  id uuid primary key default gen_random_uuid(),
  department_id uuid references public.departments(id),
  sku text not null,
  item_name text not null,
  stock_quantity integer not null default 0,
  reorder_level integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.sales_records (
  id uuid primary key default gen_random_uuid(),
  department_id uuid references public.departments(id),
  campaign_name text not null,
  revenue numeric(12,2) not null default 0,
  conversion_rate numeric(5,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_tickets (
  id uuid primary key default gen_random_uuid(),
  department_id uuid references public.departments(id),
  ticket_number text not null unique,
  customer_name text not null,
  status text not null default 'Open',
  priority text not null default 'Normal',
  created_at timestamptz not null default now()
);

insert into public.departments (name)
values
  ('System Administration'),
  ('Human Resource'),
  ('Finance'),
  ('Inventory'),
  ('Sales'),
  ('Customer Service')
on conflict (name) do nothing;

insert into public.roles (name)
values
  ('admin'),
  ('department_head'),
  ('staff')
on conflict (name) do nothing;

create or replace view public.vw_user_access as
select
  p.id,
  p.user_id,
  p.employee_id,
  p.full_name,
  p.is_active,
  r.name as role_name,
  d.name as department_name
from public.profiles p
left join public.roles r on p.role_id = r.id
left join public.departments d on p.department_id = d.id;

alter table public.departments enable row level security;
alter table public.roles enable row level security;
alter table public.profiles enable row level security;
alter table public.user_credentials enable row level security;
alter table public.permissions enable row level security;
alter table public.hr_employee_records enable row level security;
alter table public.finance_records enable row level security;
alter table public.inventory_records enable row level security;
alter table public.sales_records enable row level security;
alter table public.customer_tickets enable row level security;

create policy "Allow all authenticated users to read public tables for app metadata"
on public.departments for select
using (auth.role() = 'authenticated');

create policy "Allow admin role to manage profiles"
on public.profiles for all
using (
  exists (
    select 1
    from public.profiles profile
    join public.roles role on profile.role_id = role.id
    where profile.user_id = auth.uid()
      and role.name = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.profiles profile
    join public.roles role on profile.role_id = role.id
    where profile.user_id = auth.uid()
      and role.name = 'admin'
  )
);

create policy "Users can read their own profile"
on public.profiles for select
using (user_id = auth.uid());

create policy "Users can read their own credentials"
on public.user_credentials for select
using (
  profile_id in (
    select id from public.profiles where user_id = auth.uid()
  )
);

create policy "Department heads and staff can read same-department employee records"
on public.hr_employee_records for select
using (
  exists (
    select 1
    from public.profiles current_profile
    left join public.roles current_role on current_profile.role_id = current_role.id
    where current_profile.user_id = auth.uid()
      and (
        current_role.name = 'admin'
        or current_role.name = 'department_head'
        or current_profile.id = hr_employee_records.profile_id
      )
  )
);

create policy "Finance records are readable by authenticated users with access"
on public.finance_records for select
using (
  exists (
    select 1
    from public.profiles current_profile
    join public.roles current_role on current_profile.role_id = current_role.id
    where current_profile.user_id = auth.uid()
      and (
        current_role.name = 'admin'
        or current_role.name = 'department_head'
        or current_role.name = 'staff'
      )
  )
);

create policy "Inventory records are readable by authenticated users with access"
on public.inventory_records for select
using (
  exists (
    select 1
    from public.profiles current_profile
    join public.roles current_role on current_profile.role_id = current_role.id
    where current_profile.user_id = auth.uid()
      and (
        current_role.name = 'admin'
        or current_role.name = 'department_head'
        or current_role.name = 'staff'
      )
  )
);

create policy "Sales records read by authenticated users"
on public.sales_records for select
using (auth.role() = 'authenticated');

create policy "Customer tickets read by authenticated users"
on public.customer_tickets for select
using (auth.role() = 'authenticated');

create policy "Allow admin to manage permissions"
on public.permissions for all
using (
  exists (
    select 1
    from public.profiles current_profile
    join public.roles current_role on current_profile.role_id = current_role.id
    where current_profile.user_id = auth.uid()
      and current_role.name = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.profiles current_profile
    join public.roles current_role on current_profile.role_id = current_role.id
    where current_profile.user_id = auth.uid()
      and current_role.name = 'admin'
  )
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, employee_id, full_name, department_id, role_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'employee_id', 'EMP-' || substr(new.id::text, 1, 8)),
    coalesce(new.raw_user_meta_data ->> 'full_name', 'New Employee'),
    null,
    (select id from public.roles where name = 'staff' limit 1)
  )
  on conflict (employee_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute procedure public.handle_new_user();
