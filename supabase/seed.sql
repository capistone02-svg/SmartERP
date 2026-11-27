-- Seed a realistic ERP profile map for demo and Supabase-backed auth.
-- These rows mirror the local demo users used in the app and can be linked to auth.users
-- once a real sign-up/auth flow is enabled.

with department_ids as (
  select name, id from public.departments
),
role_ids as (
  select name, id from public.roles
)
insert into public.profiles (
  user_id,
  employee_id,
  full_name,
  department_id,
  role_id,
  is_active
)
select
  null::uuid,
  '26-47605',
  'Maria Dela Cruz',
  d.id,
  r.id,
  true
from department_ids d
join role_ids r on r.name = 'admin'
where d.name = 'System Administration'
on conflict (employee_id) do nothing;

with department_ids as (
  select name, id from public.departments
),
role_ids as (
  select name, id from public.roles
)
insert into public.profiles (
  user_id,
  employee_id,
  full_name,
  department_id,
  role_id,
  is_active
)
select
  null::uuid,
  '26-47012',
  'Ramon Santos',
  d.id,
  r.id,
  true
from department_ids d
join role_ids r on r.name = 'department_head'
where d.name = 'Finance'
on conflict (employee_id) do nothing;

with department_ids as (
  select name, id from public.departments
),
role_ids as (
  select name, id from public.roles
)
insert into public.profiles (
  user_id,
  employee_id,
  full_name,
  department_id,
  role_id,
  is_active
)
select
  null::uuid,
  '26-48200',
  'Alicia Reyes',
  d.id,
  r.id,
  true
from department_ids d
join role_ids r on r.name = 'staff'
where d.name = 'Inventory'
on conflict (employee_id) do nothing;

with profile_map as (
  select id as profile_id, employee_id from public.profiles
)
insert into public.user_credentials (profile_id, password_hash)
select pm.profile_id, encode(digest('admin123', 'sha256'), 'hex')
from profile_map pm
where pm.employee_id = '26-47605'
on conflict (profile_id) do update set password_hash = excluded.password_hash;

with profile_map as (
  select id as profile_id, employee_id from public.profiles
)
insert into public.user_credentials (profile_id, password_hash)
select pm.profile_id, encode(digest('head123', 'sha256'), 'hex')
from profile_map pm
where pm.employee_id = '26-47012'
on conflict (profile_id) do update set password_hash = excluded.password_hash;

with profile_map as (
  select id as profile_id, employee_id from public.profiles
)
insert into public.user_credentials (profile_id, password_hash)
select pm.profile_id, encode(digest('staff123', 'sha256'), 'hex')
from profile_map pm
where pm.employee_id = '26-48200'
on conflict (profile_id) do update set password_hash = excluded.password_hash;

-- Optional: update the app's profile snapshot in a real auth-backed deployment once the auth.users table is populated.
-- Example mapping, after user creation:
-- insert into public.profiles (user_id, employee_id, full_name, department_id, role_id, is_active)
-- values (
--   'auth-user-id',
--   '26-47605',
--   'Maria Dela Cruz',
--   (select id from public.departments where name = 'System Administration'),
--   (select id from public.roles where name = 'admin'),
--   true
-- );
