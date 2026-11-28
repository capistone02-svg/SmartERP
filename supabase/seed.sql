-- ============================================================================
-- SmartERP - seed data: sign-in accounts, permissions, employees and a small
-- demo dataset (kept deliberately small). Customer Service cases are added
-- afterwards by reset_customer_service.sql.
-- Safe to re-run: user/employee/data inserts are guarded.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Resource catalog (labels for the permissions matrix)
-- ----------------------------------------------------------------------------
insert into public.resource_catalog (resource, label) values
  ('employees',           'Employees'),
  ('user_accounts',       'User accounts'),
  ('financial_entries',   'Financial entries'),
  ('products',            'Products'),
  ('suppliers',           'Suppliers'),
  ('warehouses',          'Warehouses'),
  ('inventory_movements', 'Inventory movements'),
  ('inventory_balances',  ' Stock balances'),
  ('sales_transactions',  'Sales transactions'),
  ('customers',           'Customers'),
  ('promotions',          'Promotions'),
  ('marketing_activities','Marketing activities'),
  ('service_cases',       'Service cases')
on conflict (resource) do nothing;

-- ----------------------------------------------------------------------------
-- Permissions
--   admin            -> every resource, view only (the UI and the database
--                       both keep administrators read-only on business data)
--   department_head  -> the resources of their own area
--   staff            -> same rows; owners edit their own records
-- Delete stays off by default; an admin can switch it on per role+area.
-- ----------------------------------------------------------------------------
insert into public.permissions
  (role, functional_area, resource, can_view, can_create, can_update, can_delete)
select 'admin', null, resource_catalog.resource, true, false, false, false
from public.resource_catalog
on conflict do nothing;

insert into public.permissions
  (role, functional_area, resource, can_view, can_create, can_update, can_delete)
values
  -- Human Resources
  ('department_head', 'human_resources',   'employees',      true, true,  true,  false),
  ('department_head', 'human_resources',   'user_accounts',  true, true,  true,  false),
  ('staff',           'human_resources',   'employees',      true, true,  true,  false),
  ('staff',           'human_resources',   'user_accounts',  true, false, false, false),
  -- Finance
  ('department_head', 'finance_accounting','financial_entries', true, true, true, false),
  ('staff',           'finance_accounting','financial_entries', true, true, true, false),
  -- Inventory
  ('department_head', 'inventory_warehouse','products',           true, true, true, true),
  ('department_head', 'inventory_warehouse','suppliers',          true, true, true, false),
  ('department_head', 'inventory_warehouse','warehouses',         true, true, true, false),
  ('department_head', 'inventory_warehouse','inventory_movements',true, true, true, false),
  ('department_head', 'inventory_warehouse','inventory_balances', true, false,false,false),
  ('staff',           'inventory_warehouse','products',           true, true, true, true),
  ('staff',           'inventory_warehouse','suppliers',          true, true, true, false),
  ('staff',           'inventory_warehouse','warehouses',         true, true, true, false),
  ('staff',           'inventory_warehouse','inventory_movements',true, true, true, false),
  ('staff',           'inventory_warehouse','inventory_balances', true, false,false,false),
  -- Sales and Marketing
  ('department_head', 'sales_marketing','sales_transactions',  true, true, true, false),
  ('department_head', 'sales_marketing','customers',           true, true, true, false),
  ('department_head', 'sales_marketing','promotions',          true, true, true, false),
  ('department_head', 'sales_marketing','marketing_activities',true, true, true, false),
  ('staff',           'sales_marketing','sales_transactions',  true, true, true, false),
  ('staff',           'sales_marketing','customers',           true, true, true, false),
  ('staff',           'sales_marketing','promotions',          true, true, true, false),
  ('staff',           'sales_marketing','marketing_activities',true, true, true, false),
  -- Customer Service
  ('department_head', 'customer_service','service_cases', true, true, true, false),
  ('staff',           'customer_service','service_cases', true, true, true, false)
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- Sign-in accounts (login is employee_no @ erp.example.com)
-- ----------------------------------------------------------------------------
create or replace function public.seed_user(
  p_employee_no text,
  p_full_name text,
  p_password text,
  p_role text,
  p_area text
) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid   uuid;
  v_email text := lower(p_employee_no) || '@erp.example.com';
  v_hash  text := extensions.crypt(p_password, extensions.gen_salt('bf'));
begin
  if exists (select 1 from auth.users u where lower(u.email) = v_email) then
    return;
  end if;

  v_uid := gen_random_uuid();

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
    v_uid, p_employee_no, p_employee_no, v_email, p_full_name, p_role,
    case when p_role = 'admin' then null else p_area end,
    true, false
  );
end;
$$;

select public.seed_user('26-47605', 'Maria Dela Cruz',   'admin123',  'admin',           null);
select public.seed_user('26-47012', 'Ramon Santos',      'head123',   'department_head', 'finance_accounting');
select public.seed_user('26-47110', 'Liza Torres',       'head123',   'department_head', 'customer_service');
select public.seed_user('26-47200', 'Patricia Go',       'head123',   'department_head', 'human_resources');
select public.seed_user('26-47300', 'Roberto Gomez',     'head123',   'department_head', 'inventory_warehouse');
select public.seed_user('26-47400', 'Elena Morales',     'head123',   'department_head', 'sales_marketing');
select public.seed_user('26-48010', 'Teresa Ramos',      'staff123',  'staff',           'finance_accounting');
select public.seed_user('26-48610', 'Victor Diaz',       'staff123',  'staff',           'human_resources');
select public.seed_user('26-48200', 'Alicia Reyes',      'staff123',  'staff',           'inventory_warehouse');
select public.seed_user('26-48310', 'Marco Santos',      'staff123',  'staff',           'customer_service');
select public.seed_user('26-48410', 'Daniel Cruz',       'staff123',  'staff',           'sales_marketing');

drop function public.seed_user(text, text, text, text, text);

-- ----------------------------------------------------------------------------
-- Employees (9 total; Ben Villanueva and Grace Lim have no account yet, so
-- HR's "Add Account" dialog has something to offer)
-- ----------------------------------------------------------------------------
insert into public.employees
  (employee_no, first_name, last_name, email, phone, address,
   position, functional_area, employment_status, hire_date)
select * from (values
  ('26-47605', 'Maria',   'Dela Cruz', 'maria.delacruz@erp.example.com',  '+63 917 555 0101', 'Ibaan, Batangas',
   'Admin',                        'human_resources',    'active', date '2021-03-01'),
  ('26-47012', 'Ramon',   'Santos',    'ramon.santos@erp.example.com',    '+63 917 555 0102', 'Batangas City, Batangas',
   'Department Head',              'finance_accounting', 'active', date '2022-03-15'),
  ('26-47110', 'Liza',    'Torres',    'liza.torres@erp.example.com',     '+63 917 555 0103', 'Ibaan, Batangas',
   'Department Head',              'customer_service',   'active', date '2021-07-01'),
  ('26-47200', 'Patricia', 'Go',       'patricia.go@erp.example.com',     '+63 917 555 0104', 'Batangas City, Batangas',
   'Department Head',              'human_resources',    'active', date '2022-01-10'),
  ('26-47300', 'Roberto',  'Gomez',    'roberto.gomez@erp.example.com',    '+63 917 555 0110', 'Ibaan, Batangas',
   'Department Head',              'inventory_warehouse','active', date '2022-05-10'),
  ('26-47400', 'Elena',    'Morales',  'elena.morales@erp.example.com',    '+63 917 555 0111', 'Batangas City, Batangas',
   'Department Head',              'sales_marketing',    'active', date '2022-08-15'),
  ('26-48010', 'Teresa',   'Ramos',    'teresa.ramos@erp.example.com',     '+63 917 555 0112', 'Lipa City, Batangas',
   'Staff',                        'finance_accounting', 'active', date '2024-03-01'),
  ('26-48610', 'Victor',   'Diaz',     'victor.diaz@erp.example.com',      '+63 917 555 0113', 'San Jose, Batangas',
   'Staff',                        'human_resources',    'active', date '2024-04-15'),
  ('26-48100', 'Ben',     'Villanueva','ben.villanueva@erp.example.com',  '+63 917 555 0105', 'Taysan, Batangas',
   'Staff',                        'inventory_warehouse','active', date '2023-05-22'),
  ('26-48200', 'Alicia',  'Reyes',     'alicia.reyes@erp.example.com',    '+63 917 555 0106', 'Rosario, Batangas',
   'Staff',                        'inventory_warehouse','active', date '2024-02-05'),
  ('26-48310', 'Marco',   'Santos',    'marco.santos@erp.example.com',    '+63 917 555 0107', 'Ibaan, Batangas',
   'Staff',                        'customer_service',   'active', date '2024-06-12'),
  ('26-48410', 'Daniel',  'Cruz',      'daniel.cruz@erp.example.com',     '+63 917 555 0108', 'Batangas City, Batangas',
   'Staff',                        'sales_marketing',    'active', date '2023-09-18'),
  ('26-48510', 'Grace',   'Lim',       'grace.lim@erp.example.com',       '+63 917 555 0109', 'Padre Garcia, Batangas',
   'Staff',                        'sales_marketing',    'active', date '2025-01-07')
) as v(employee_no, first_name, last_name, email, phone, address,
       position, functional_area, employment_status, hire_date)
where not exists (select 1 from public.employees e where e.employee_no = v.employee_no);

-- ----------------------------------------------------------------------------
-- Suppliers and warehouses
-- ----------------------------------------------------------------------------
insert into public.suppliers (name, contact_person, email, phone, address)
select * from (values
  ('Alpha Distribution', 'Juan Dela Cruz', 'sales@alphadist.example.com', '+63 918 111 2222', 'Lipa City, Batangas'),
  ('Prime Wholesale Inc', 'Anna Reyes',     'orders@primewholesale.example.com', '+63 918 333 4444', 'Calamba, Laguna'),
  ('Global Traders',      'Mark Tan',       'hello@globaltraders.example.com', '+63 918 555 6666', 'Taguig, Metro Manila')
) as v(name, contact_person, email, phone, address)
where not exists (select 1 from public.suppliers s where s.name = v.name);

insert into public.warehouses (code, name, location)
select * from (values
  ('MAIN', 'Main Warehouse', 'Ibaan, Batangas'),
  ('RET1', 'Retail Store',   'Batangas City, Batangas')
) as v(code, name, location)
where not exists (select 1 from public.warehouses w where w.code = v.code);

-- ----------------------------------------------------------------------------
-- Products (low thresholds chosen so two items sit at low stock for the demo)
-- ----------------------------------------------------------------------------
insert into public.products
  (sku, name, category, description, unit, unit_price, supplier_id, low_stock_threshold)
select v.sku, v.name, v.category, v.description, v.unit, v.price, s.id, v.threshold
from (values
  ('CHR-001', 'Ergonomic Office Chair', 'Furniture',   'Mesh back, adjustable height',        'pc',  2500.00, 'Alpha Distribution',  10),
  ('DSK-001', 'Standing Desk',          'Furniture',   '120cm electric standing desk',        'pc', 12000.00, 'Prime Wholesale Inc',  5),
  ('MSE-001', 'Wireless Mouse',         'Electronics', '2.4GHz silent click mouse',           'pc',   850.00, 'Alpha Distribution',  15),
  ('PRN-001', 'Laser Printer',          'Electronics', 'Mono laser printer with Wi-Fi',       'pc',  9500.00, 'Global Traders',       4),
  ('PPR-001', 'A4 Paper Ream',          'Supplies',    '70gsm, 500 sheets',                   'ream', 120.00, 'Prime Wholesale Inc', 80),
  ('TNR-001', 'Toner Cartridge',        'Supplies',    'Compatible with PRN-001',             'pc',  2200.00, 'Global Traders',      15)
) as v(sku, name, category, description, unit, price, supplier, threshold)
join public.suppliers s on s.name = v.supplier
where not exists (select 1 from public.products p where p.sku = v.sku);

-- ----------------------------------------------------------------------------
-- Customers (three carry a loyalty / membership card)
-- ----------------------------------------------------------------------------
insert into public.customers
  (full_name, email, phone, address, card_type, card_no)
select * from (values
  ('Bianca Cruz',    'bianca.cruz@example.com',    '+63 917 123 4567', 'Ibaan, Batangas',        'none',      null),
  ('Joel Reyes',     'joel.reyes@example.com',     '+63 918 234 5678', 'Batangas City, Batangas','none',      null),
  ('Kim Santos',     'kim.santos@example.com',     '+63 919 345 6789', 'San Jose, Batangas',     'none',      null),
  ('Andres Lim',     'andres.lim@example.com',     '+63 920 456 7890', 'Rosario, Batangas',      'membership','2026-001'),
  ('Nora Bautista',  'nora.bautista@example.com',  '+63 921 567 8901', 'Taysan, Batangas',       'loyalty',   '1001'),
  ('Carlo Mendoza',  'carlo.mendoza@example.com',  '+63 922 678 9012', 'Padre Garcia, Batangas', 'none',      null)
) as v(full_name, email, phone, address, card_type, card_no)
where not exists (select 1 from public.customers c where c.email = v.email);

-- ----------------------------------------------------------------------------
-- Financial entries (approved; two months of activity for the trend charts)
-- ----------------------------------------------------------------------------
insert into public.financial_entries
  (entry_date, entry_type, category, description, amount, reference, approval_status)
select * from (values
  (date '2026-10-01', 'revenue', 'Sales Income', 'Product sales - October',            42000.00, 'OCT-SALES',   'approved'),
  (date '2026-10-05', 'expense', 'Rent',         'Office and warehouse rent - October', 15000.00, 'RENT-OCT',    'approved'),
  (date '2026-10-15', 'expense', 'Utilities',    'Electricity and water - October',      3200.00, 'UTIL-OCT',    'approved'),
  (date '2026-11-01', 'revenue', 'Sales Income', 'Product sales - November to date',    28500.00, 'NOV-SALES',   'approved'),
  (date '2026-11-05', 'expense', 'Salaries',     'Staff salaries - November',           22000.00, 'PAYROLL-NOV', 'approved'),
  (date '2026-11-10', 'expense', 'Marketing',    'Social media ads - Holiday campaign',  2500.00, 'ADS-NOV',     'approved'),
  (date '2026-11-15', 'expense', 'Repairs',      'Printer servicing',                     850.00, 'REP-001',     'approved'),
  (date '2026-11-20', 'revenue', 'Service Income','Assembly and delivery fees',          1600.00, 'SVC-NOV',     'approved')
) as v(entry_date, entry_type, category, description, amount, reference, approval_status)
where not exists (
  select 1 from public.financial_entries f
  where f.entry_date = v.entry_date and f.amount = v.amount and f.category = v.category
);

-- ----------------------------------------------------------------------------
-- Inventory movements (approved; keeps every product above zero, two at low)
-- ----------------------------------------------------------------------------
insert into public.inventory_movements
  (movement_type, quantity, movement_date, warehouse_id, supplier_id, product_id,
   reference_no, remarks, approval_status)
select v.movement_type, v.qty, v.m_date, w.id, s.id, p.id,
       v.ref, v.remarks, 'approved'
from (values
  ('stock_in',  30, date '2026-10-02', 'MAIN', 'Alpha Distribution', 'CHR-001', 'RCPT-0001', 'Opening stock - chairs'),
  ('stock_in',  10, date '2026-10-02', 'MAIN', 'Prime Wholesale Inc','DSK-001', 'RCPT-0002', 'Opening stock - desks'),
  ('stock_in',  50, date '2026-10-03', 'MAIN', 'Alpha Distribution', 'MSE-001', 'RCPT-0003', 'Opening stock - mice'),
  ('stock_in',   8, date '2026-10-03', 'MAIN', 'Global Traders',     'PRN-001', 'RCPT-0004', 'Opening stock - printers'),
  ('stock_in', 100, date '2026-10-04', 'RET1','Prime Wholesale Inc','PPR-001', 'RCPT-0005', 'Opening stock - paper'),
  ('stock_in',  20, date '2026-10-04', 'RET1','Global Traders',     'TNR-001', 'RCPT-0006', 'Opening stock - toner'),
  ('stock_out',  5, date '2026-10-12', 'MAIN', 'Alpha Distribution', 'CHR-001', 'DR-0001',    'Delivered to clients'),
  ('stock_out',  2, date '2026-10-28', 'MAIN', 'Prime Wholesale Inc','DSK-001', 'DR-0002',    'Delivered to clients'),
  ('stock_out', 12, date '2026-11-08', 'MAIN', 'Alpha Distribution', 'MSE-001', 'DR-0003',    'Walk-in sales'),
  ('stock_out',  3, date '2026-11-14', 'RET1', 'Global Traders',     'TNR-001', 'DR-0004',    'Walk-in sales'),
  ('stock_out', 25, date '2026-11-20', 'RET1', 'Prime Wholesale Inc','PPR-001', 'DR-0005',    'Bulk paper sales'),
  ('stock_out',  6, date '2026-11-22', 'RET1', 'Global Traders',     'TNR-001', 'DR-0006',    'Walk-in sales')
) as v(movement_type, qty, m_date, wh, supplier, sku, ref, remarks)
join public.warehouses w on w.code = v.wh
join public.products p on p.sku = v.sku
left join public.suppliers s on s.name = v.supplier
where not exists (
  select 1 from public.inventory_movements m
  where m.reference_no = v.ref
);

-- ----------------------------------------------------------------------------
-- Sales (approved so dashboards and reports show them)
-- ----------------------------------------------------------------------------
insert into public.sales_transactions
  (transaction_date, product_id, customer_id, quantity, amount, notes, approval_status)
select v.txn_date, p.id, c.id, v.qty, v.amount, v.notes, 'approved'
from (values
  (date '2026-09-18', 'CHR-001', 'kim.santos@example.com',    3,  7500.00, 'Bulk order for new office'),
  (date '2026-09-25', 'PRN-001', 'andres.lim@example.com',    1,  9500.00, null),
  (date '2026-10-05', 'CHR-001', 'bianca.cruz@example.com',   2,  5000.00, null),
  (date '2026-10-12', 'PRN-001', 'joel.reyes@example.com',    1,  9500.00, 'Includes setup'),
  (date '2026-10-20', 'MSE-001', 'kim.santos@example.com',    4,  3400.00, null),
  (date '2026-10-28', 'DSK-001', 'andres.lim@example.com',    1, 12000.00, 'Member discount applied'),
  (date '2026-11-03', 'PPR-001', 'nora.bautista@example.com',10,  1200.00, null),
  (date '2026-11-08', 'CHR-001', 'carlo.mendoza@example.com', 1,  2500.00, null),
  (date '2026-11-14', 'TNR-001', 'joel.reyes@example.com',    2,  4400.00, null),
  (date '2026-11-19', 'MSE-001', 'bianca.cruz@example.com',   2,  1700.00, null)
) as v(txn_date, sku, cust_email, qty, amount, notes)
join public.products p on p.sku = v.sku
join public.customers c on c.email = v.cust_email
where not exists (
  select 1 from public.sales_transactions st
  where st.transaction_date = v.txn_date and st.quantity = v.qty and st.amount = v.amount
);

-- ----------------------------------------------------------------------------
-- Promotions and marketing activities
-- ----------------------------------------------------------------------------
insert into public.promotions (name, description, start_date, end_date, status)
select * from (values
  ('Holiday Sale 2026',    '10% off on furniture bundles',           date '2026-11-01', date '2026-12-31', 'active'),
  ('Back to School Promo', 'Discounts on supplies for students',     date '2026-08-01', date '2026-09-15', 'ended'),
  ('Year-End Clearance',   'Clearance of selected electronics',      date '2026-12-20', date '2027-01-05', 'planned')
) as v(name, description, start_date, end_date, status)
where not exists (select 1 from public.promotions pr where pr.name = v.name);

insert into public.marketing_activities
  (name, description, activity_date, status, channel, promotion_id)
select v.name, v.description, v.act_date, v.status, v.channel, pr.id
from (values
  ('Facebook Holiday Ads',   'Two-week boosted post campaign',   date '2026-11-10', 'ongoing',  'Social Media', 'Holiday Sale 2026'),
  ('Back to School Flyers',  'Leaflet drop near schools',        date '2026-08-05', 'completed','Print',        'Back to School Promo'),
  ('Store Opening Promo',    'Opening-weekend discounts',        date '2026-06-15', 'completed','In-store',     null)
) as v(name, description, act_date, status, channel, promo)
left join public.promotions pr on pr.name = v.promo
where not exists (select 1 from public.marketing_activities m where m.name = v.name);

-- ----------------------------------------------------------------------------
-- That's it: run supabase/reset_customer_service.sql next for the Customer
-- Service demo cases.
-- ----------------------------------------------------------------------------
select 'seed complete' as result,
       (select count(*) from public.profiles) as profiles,
       (select count(*) from public.employees) as employees,
       (select count(*) from public.products) as products,
       (select count(*) from public.customers) as customers,
       (select count(*) from public.sales_transactions) as sales,
       (select count(*) from public.financial_entries) as entries,
       (select count(*) from public.inventory_movements) as movements,
       (select count(*) from public.permissions) as permissions;
