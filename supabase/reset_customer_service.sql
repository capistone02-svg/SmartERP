-- ============================================================================
-- SmartERP — Customer Service reset + small demo dataset
-- ----------------------------------------------------------------------------
-- Run this in the Supabase SQL Editor (SQL -> New query -> paste -> Run).
-- It is safe to re-run. In one pass it:
--
--   1. Adds the loyalty/membership card columns to public.customers
--   2. Enforces "every customer-service case must have a customer"
--      (complaints are NOT required to be about a product)
--   3. Wipes the Customer Service data (service_cases + case_events)
--   4. Seeds a SMALL dataset: 6 customers (3 with cards -> priority)
--      and 15 cases (5 complaints, 4 inquiries, 3 feedback, 3 refunds)
--
-- Nothing outside the Customer Service module is deleted. case_no,
-- customer_no and transaction_no are left to the database defaults,
-- exactly like the app does.
--
-- The script runs in TWO transactions on purpose: the card columns are
-- committed first, so even if the wipe/seed part fails, the app keeps
-- working (it always reads those columns).
-- ============================================================================

-- ============================================================================
-- TRANSACTION 1: schema the updated app needs (committed first, on its own)
-- ============================================================================
begin;

-- ----------------------------------------------------------------------------
-- 1) Card (loyalty / membership) on customers
-- ----------------------------------------------------------------------------
alter table public.customers
  add column if not exists card_type text not null default 'none';

alter table public.customers
  add column if not exists card_no text;

update public.customers set card_type = 'none' where card_type is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'customers_card_type_check'
      and conrelid = 'public.customers'::regclass
  ) then
    alter table public.customers
      add constraint customers_card_type_check
      check (card_type in ('none', 'loyalty', 'membership'));
  end if;
end $$;

commit;

-- ============================================================================
-- TRANSACTION 2: reset + small seed (all-or-nothing)
-- ============================================================================
begin;

-- ----------------------------------------------------------------------------
-- 2) Every customer-service case must have a customer
--    (the product stays optional: a complaint is not always about a product)
-- ----------------------------------------------------------------------------
delete from public.case_events
where case_id in (select id from public.service_cases where customer_id is null);

delete from public.service_cases where customer_id is null;

alter table public.service_cases alter column customer_id set not null;

-- ----------------------------------------------------------------------------
-- 3) Reset the Customer Service data
-- ----------------------------------------------------------------------------
delete from public.case_events;
delete from public.service_cases;

-- The cases that carried refund decisions are gone: clear the refund state
-- that fn_sync_sale_refund had written onto the Sales records.
update public.sales_transactions
set refund_state = 'none', refunded_amount = 0
where refund_state <> 'none' or refunded_amount <> 0;

-- ----------------------------------------------------------------------------
-- 4) Small seed - customers (only people who contact Customer Service)
--    Only inserted when their e-mail is not already stored, so re-runs
--    never create duplicates.
-- ----------------------------------------------------------------------------
insert into public.customers (full_name, email, phone, address, card_type, card_no)
select v.full_name, v.email, v.phone, v.address, v.card_type, v.card_no
from (values
  ('Maricel Ramos',      'maricel.ramos@demo.ph',   '09171234501', 'Batangas City',      'membership', 'SM-10021'),
  ('Jason Lim',          'jason.lim@demo.ph',       '09171234502', 'Lipa City',          'loyalty',    'SM-20045'),
  ('Eleanor Cruz',       'eleanor.cruz@demo.ph',    '09171234503', 'Batangas City',      'none',       null::text),
  ('Marco Villanueva',   'marco.villanueva@demo.ph','09171234504', 'Tanauan City',       'loyalty',    'SM-20078'),
  ('Teresa Aquino',      'teresa.aquino@demo.ph',   '09171234505', 'Sto. Tomas City',    'none',       null::text),
  ('Paolo Reyes',        'paolo.reyes@demo.ph',     '09171234506', 'Batangas City',      'membership', 'SM-10099')
) as v(full_name, email, phone, address, card_type, card_no)
where not exists (
  select 1 from public.customers c where c.email = v.email
);

-- ----------------------------------------------------------------------------
-- 5) If Sales has no transactions at all, add two tiny ones so the seeded
--    refunds have a sale to link to. Skipped when Sales already has data.
-- ----------------------------------------------------------------------------
do $$
declare
  v_product  uuid;
  v_customer uuid;
  v_profile  uuid;
begin
  if exists (select 1 from public.sales_transactions) then
    return;
  end if;

  select id into v_product   from public.products    order by id limit 1;
  if v_product is null then
    return; -- no products yet: refunds will simply have no sale link
  end if;

  select id into v_customer  from public.customers   order by id limit 1;
  select id into v_profile   from public.profiles    order by id limit 1;

  -- The Sales <-> stock rule deducts approved sales from stock: only seed the
  -- demo sales when the first product has the 3 units the two of them need.
  if (select coalesce(quantity, 0) from public.v_product_stock where product_id = v_product) < 3 then
    return;
  end if;

  insert into public.sales_transactions
    (transaction_date, product_id, customer_id, quantity, amount, notes, created_by)
  values
    ((current_date - 20)::date, v_product, v_customer, 1, 1500.00, 'Seed sale for refund demos', v_profile),
    ((current_date - 8)::date,  v_product, v_customer, 2, 2000.00, 'Seed sale for refund demos', v_profile);

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sales_transactions'
      and column_name = 'approval_status'
  ) then
    update public.sales_transactions
    set approval_status = 'approved'
    where notes = 'Seed sale for refund demos';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 6) Small seed - 15 cases, every one with a customer
--    with_product = only for cases that really are about a product
--    sale_off     = which sale a refund links to (0 = newest)
-- ----------------------------------------------------------------------------
insert into public.service_cases (
  case_type, customer_id, subject, description, date_submitted, status,
  assigned_to, resolution_details, resolution_date, created_by,
  product_id, product_name, sales_transaction_id, sale_no,
  severity, due_date, refund_amount, rating
)
select
  v.case_type,
  cust.id,
  v.subject,
  v.description,
  (current_date - v.days_ago)::date,
  v.status,
  (select employee_id from public.profiles
    where functional_area = 'customer_service' and employee_id is not null
    order by id limit 1),
  v.resolution,
  case when v.resolution is not null then (current_date - v.days_ago + 1)::date else null end,
  (select id from public.profiles order by id limit 1),
  prod.id,
  prod.name,
  sale.id,
  sale.transaction_no,
  v.severity,
  case when v.due_in is not null then (current_date - v.days_ago + v.due_in)::date else null end,
  v.refund_amount,
  v.rating
from (values
  -- complaints (5): two without any product link, one overdue
  ('complaint', 'maricel.ramos@demo.ph',    'Aircon not working at the food court',
     'The dining area has been warm since yesterday. Mall operations was informed.',
     3, 'in_progress', null::text, false, 'high',   2, null::numeric, null::int, null::int),
  ('complaint', 'jason.lim@demo.ph',        'Escalator out of service near the north entrance',
     'Escalator 2 stopped mid-morning; customers are using the stairs.',
     6, 'open',       null::text, true,  'high',   2, null::numeric, null::int, null::int),
  ('complaint', 'eleanor.cruz@demo.ph',     'Parking lane congestion every weekend',
     'Cars are double-parked along the drop-off lane on Saturdays.',
     10, 'resolved',  'Security now manages the lane during peak hours; signage added.',
     false, 'medium', 5, null::numeric, null::int, null::int),
  ('complaint', 'marco.villanueva@demo.ph', 'Damaged item returned at the cashier',
     'A glass container was cracked when opened at home.',
     1, 'open',      null::text, true,  'medium', 5, null::numeric, null::int, null::int),
  ('complaint', 'teresa.aquino@demo.ph',    'WiFi drops inside the north wing',
     'Connection drops every few minutes near the cinema hallway.',
     12, 'closed',   'Access point replaced and channel reconfigured.', false, 'low', 10,
     null::numeric, null::int, null::int),

  -- inquiries (4): questions from customers, product only when relevant
  ('inquiry', 'paolo.reyes@demo.ph',        'Availability of the store opening this month',
     'Is the new lifestyle store opening on the 15th as announced?',
     2, 'open',      null::text, false, null::text, null::int, null::numeric, null::int, null::int),
  ('inquiry', 'maricel.ramos@demo.ph',      'Is the LED TV on promo this week?',
     'Customer asked about the promo price of the 55-inch LED TV.',
     4, 'resolved',  'Yes - 15% off until Sunday, subject to stock availability.',
     true, null::text, null::int, null::numeric, null::int, null::int),
  ('inquiry', 'teresa.aquino@demo.ph',      'Operating hours during the holiday',
     'Asked whether the mall opens earlier during the holidays.',
     7, 'closed',    'Open 10:00 AM to 9:00 PM for the whole holiday period.',
     false, null::text, null::int, null::numeric, null::int, null::int),
  ('inquiry', 'jason.lim@demo.ph',          'Can I pre-order the limited sneakers?',
     'Customer wants to reserve a pair before the release date.',
     1, 'open',      null::text, true, null::text, null::int, null::numeric, null::int, null::int),

  -- feedback (3): ratings feed the satisfaction score
  ('feedback', 'eleanor.cruz@demo.ph',      'Cleanliness rating for level 2 restrooms',
     'Restrooms were clean but the queue was long.', 5, 'resolved', null::text,
     false, null::text, null::int, null::numeric, 4, null::int),
  ('feedback', 'marco.villanueva@demo.ph',  'Great staff at the service desk',
     'The attendant was friendly and solved the concern quickly.', 9, 'resolved', null::text,
     false, null::text, null::int, null::numeric, 5, null::int),
  ('feedback', 'paolo.reyes@demo.ph',       'Food court seating is limited',
     'Hard to find a table during lunch hours.', 14, 'open', null::text,
     false, null::text, null::int, null::numeric, 2, null::int),

  -- refunds (3): always tied to a sale; Head approves or denies
  ('refund', 'maricel.ramos@demo.ph',       'Return of defective blender - refund request',
     'Unit stopped working after two days; receipt presented.',
     2, 'for_review', null::text, false, null::text, null::int, 1500.00, null::int, 0),
  ('refund', 'jason.lim@demo.ph',           'Wrong size exchanged for refund',
     'Bought the wrong size; item unused with tag.',
     8, 'resolved', 'Refunded to the card used for payment.', false, null::text, null::int,
     980.00, null::int, 1),
  ('refund', 'teresa.aquino@demo.ph',       'Receipt missing - refund request',
     'No official receipt presented for the purchased item.',
     4, 'denied', 'No official receipt; store policy does not allow a refund.',
     false, null::text, null::int, 450.00, null::int, 0)
) as v(
  case_type, email, subject, description, days_ago, status, resolution,
  with_product, severity, due_in, refund_amount, rating, sale_off
)
join public.customers cust on cust.email = v.email
left join lateral (
  select p.id, p.name
  from public.products p
  order by p.id
  limit 1
) prod on v.with_product
left join lateral (
  select s.id, s.transaction_no
  from public.sales_transactions s
  order by s.transaction_date desc, s.id desc
  offset coalesce(v.sale_off, 0)
  limit 1
) sale on v.case_type = 'refund';

commit;

-- If this returns rows, everything applied. The app should now work.
select
  (select count(*) from public.service_cases)                 as cases_seeded,
  (select count(*) from public.service_cases
     where customer_id is null)                                as cases_without_customer,
  (select count(*) from public.customers
     where card_type <> 'none')                                as priority_customers;

-- Done: 6 customers (3 priority), 15 cases. Re-run any time to start over.
