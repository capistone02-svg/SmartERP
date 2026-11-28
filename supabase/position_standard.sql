-- =====================================================================
-- Position standard: every employee's position is one of exactly
--   'Admin' | 'Department Head' | 'Staff'
-- Heads and staff are identified by their department; the system
-- administrator is 'Admin'. Run once on an existing database (fresh
-- installs already get these values from seed.sql and the CHECK in
-- schema.sql). Safe to run twice (the UPDATE skips standard values).
-- =====================================================================
update public.employees e
set position = case
  when exists (select 1 from public.profiles p where p.employee_id = e.employee_no and p.role = 'admin') then 'Admin'
  when exists (select 1 from public.profiles p where p.employee_id = e.employee_no and p.role = 'department_head') then 'Department Head'
  else 'Staff'
end
where e.deleted_at is null
  and e.position not in ('Admin', 'Department Head', 'Staff');

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'employees_position_std') then
    alter table public.employees
      add constraint employees_position_std check (position in ('Admin', 'Department Head', 'Staff'));
  end if;
end $$;

select employee_no, position from public.employees where deleted_at is null order by position, employee_no;
