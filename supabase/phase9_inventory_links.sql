-- ===========================================================================
-- Phase 9 — Inventory & Warehouse: connections, workflow integrity and
-- cross-module links.
--
-- 1. Stock views: v_product_stock gains supplier/price, new v_warehouse_stock
--    shows where each product's stock actually sits.
-- 2. Per-warehouse guard: an approved stock_out may never take a product
--    below zero AT THE WAREHOUSE IT NAMES (movements record quantities
--    within the relevant warehouse).
-- 3. fn_sales_stock rewrite: approved sales ship from the warehouses that
--    hold the stock — one movement row per warehouse (a single row in the
--    usual single-warehouse case), replaced only when something stock-
--    relevant changes (no churn on notes/refund updates).
-- 4. Data fix: dispatches are re-tagged to each product's receiving
--    warehouse so existing per-warehouse balances are coherent.
-- 5. Finance link: financial_entries.inventory_movement_id (manual link,
--    no automatic journal entries) + lookup_movement_refs().
-- 6. Customer Service consistency: a case linked to a sale picks up the
--    sale's product automatically; renaming a product updates the
--    product_name stored on existing cases.
-- 7. products gains the import permission (bulk CSV import in the UI).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1a. Product-level view, with supplier and price for filters/valued stock
-- ---------------------------------------------------------------------------
create or replace view public.v_product_stock as
select
  p.id                  as product_id,
  p.sku,
  p.name,
  p.category,
  p.unit,
  p.unit_price,
  p.low_stock_threshold,
  p.supplier_id,
  s.name                as supplier_name,
  coalesce(m.qty, 0)::integer as quantity,
  case
    when coalesce(m.qty, 0) <= 0 then 'out_of_stock'
    when coalesce(m.qty, 0) <= p.low_stock_threshold then 'low_stock'
    else 'in_stock'
  end as stock_status
from public.products p
left join public.suppliers s on s.id = p.supplier_id
left join lateral (
  select sum(case when mov.movement_type = 'stock_in' then mov.quantity else -mov.quantity end) as qty
  from public.inventory_movements mov
  where mov.product_id = p.id
    and mov.approval_status = 'approved'
    and mov.deleted_at is null
) m on true
where p.deleted_at is null;

-- ---------------------------------------------------------------------------
-- 1b. Warehouse-level view: where the stock actually sits (non-zero rows)
-- ---------------------------------------------------------------------------
create or replace view public.v_warehouse_stock as
select
  w.id         as warehouse_id,
  w.code       as warehouse_code,
  w.name       as warehouse_name,
  p.id         as product_id,
  p.sku,
  p.name,
  p.unit,
  t.quantity
from (
  select
    m.warehouse_id,
    m.product_id,
    sum(case when m.movement_type = 'stock_in' then m.quantity else -m.quantity end)::integer as quantity
  from public.inventory_movements m
  where m.approval_status = 'approved'
    and m.deleted_at is null
  group by m.warehouse_id, m.product_id
) t
join public.warehouses w on w.id = t.warehouse_id and w.deleted_at is null
join public.products   p on p.id = t.product_id   and p.deleted_at is null
where t.quantity <> 0;

grant select on public.v_product_stock, public.v_warehouse_stock to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Per-warehouse stock guard (fires after fn_set_approval_status has run,
--    so head/admin inserts that are auto-approved are checked too)
-- ---------------------------------------------------------------------------
create or replace function public.fn_movements_stock_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_bal integer;
begin
  if NEW.approval_status = 'approved'
     and NEW.movement_type = 'stock_out'
     and NEW.deleted_at is null then
    select coalesce(
      sum(case when movement_type = 'stock_in' then quantity else -quantity end), 0)
    into v_bal
    from public.inventory_movements
    where product_id = NEW.product_id
      and warehouse_id = NEW.warehouse_id
      and approval_status = 'approved'
      and deleted_at is null
      and id <> NEW.id;
    if v_bal < NEW.quantity then
      raise exception 'Insufficient stock for this product in that warehouse.';
    end if;
  end if;
  return NEW;
end;
$$;

create or replace trigger trg_movements_stock_guard
  after insert or update on public.inventory_movements
  for each row execute function public.fn_movements_stock_guard();

-- ---------------------------------------------------------------------------
-- 3. Sales → stock: ship from the warehouses that hold the stock.
--    Replaces the previous single-row logic (first warehouse wins). The
--    movement set for a sale is rebuilt only when a stock-relevant field
--    changes, so refund/notes updates leave movements untouched.
-- ---------------------------------------------------------------------------
create or replace function public.fn_sales_stock() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_wh        uuid;
  v_bal       integer;
  v_remaining integer;
  v_take      integer;
begin
  if NEW.approval_status = 'approved' and NEW.deleted_at is null then
    if TG_OP = 'INSERT'
       or NEW.approval_status is distinct from OLD.approval_status
       or NEW.quantity       is distinct from OLD.quantity
       or NEW.product_id     is distinct from OLD.product_id
       or NEW.transaction_date is distinct from OLD.transaction_date
       or NEW.transaction_no   is distinct from OLD.transaction_no then

      -- give back whatever this sale had, then re-check what is available
      update public.inventory_movements set deleted_at = now()
      where sale_id = NEW.id and deleted_at is null;

      select coalesce(
        sum(case when movement_type = 'stock_in' then quantity else -quantity end), 0)
      into v_bal
      from public.inventory_movements
      where product_id = NEW.product_id
        and approval_status = 'approved'
        and deleted_at is null;

      if v_bal < NEW.quantity then
        raise exception 'Insufficient stock for this product.';
      end if;

      -- one stock_out row per warehouse it ships from, richest stock first
      v_remaining := NEW.quantity;
      for v_wh, v_bal in
        select w.id,
               coalesce(sum(case when m.movement_type = 'stock_in'
                                then m.quantity else -m.quantity end), 0)
        from public.warehouses w
        left join public.inventory_movements m
          on m.warehouse_id = w.id
         and m.product_id = NEW.product_id
         and m.approval_status = 'approved'
         and m.deleted_at is null
        where w.deleted_at is null
        group by w.id
        order by 2 desc, w.created_at, w.id
      loop
        exit when v_remaining = 0;
        if v_bal > 0 then
          v_take := least(v_bal, v_remaining);
          insert into public.inventory_movements
            (movement_type, quantity, movement_date, warehouse_id, product_id,
             reference_no, remarks, approval_status, sale_id)
          values ('stock_out', v_take, NEW.transaction_date, v_wh, NEW.product_id,
                  NEW.transaction_no, 'Stock deducted for sale ' || NEW.transaction_no,
                  'approved', NEW.id);
          v_remaining := v_remaining - v_take;
        end if;
      end loop;

      if v_remaining > 0 then
        raise exception 'Insufficient stock for this product.';
      end if;
    end if;
  else
    -- un-approved, rejected or deleted: give the stock back
    update public.inventory_movements set deleted_at = now()
    where sale_id = NEW.id and deleted_at is null;
  end if;

  return NEW;
end;
$$;

create or replace trigger trg_sales_stock after insert or update on public.sales_transactions
  for each row execute function public.fn_sales_stock();

-- ---------------------------------------------------------------------------
-- 4. Data fix: every dispatch moves to the warehouse that received the
--    product (each product has a single stock_in). Runs under the new guard,
--    so a bad re-tag would fail loudly. Global balances do not change.
-- ---------------------------------------------------------------------------
update public.inventory_movements m
set warehouse_id = h.warehouse_id, updated_at = now()
from (
  select distinct on (m2.product_id) m2.product_id, m2.warehouse_id
  from public.inventory_movements m2
  where m2.movement_type = 'stock_in'
    and m2.deleted_at is null
  order by m2.product_id, m2.movement_date, m2.created_at
) h
where m.product_id = h.product_id
  and m.movement_type = 'stock_out'
  and m.deleted_at is null
  and m.warehouse_id is distinct from h.warehouse_id;

-- ---------------------------------------------------------------------------
-- 5. Finance ↔ Inventory: a journal entry can be linked to the stock
--    movement it accounts for (receiving costs, write-offs). No entries are
--    created automatically — Finance staff link them by hand, so there are
--    no duplicate or inconsistent postings.
-- ---------------------------------------------------------------------------
alter table public.financial_entries
  add column if not exists inventory_movement_id uuid;

-- declared as an ALTER because financial_entries is created BEFORE
-- inventory_movements in schema.sql (forward reference otherwise)
alter table public.financial_entries
  drop constraint if exists financial_entries_inventory_movement_id_fkey;
alter table public.financial_entries
  add constraint financial_entries_inventory_movement_id_fkey
  foreign key (inventory_movement_id) references public.inventory_movements (id);

create index if not exists idx_financial_entries_movement
  on public.financial_entries (inventory_movement_id);

create or replace function public.lookup_movement_refs()
returns table (
  id             uuid,
  reference_no   text,
  movement_date  date,
  movement_type  text,
  quantity       integer,
  product_label  text
)
language sql stable set search_path = public as $$
  select m.id, m.reference_no, m.movement_date, m.movement_type, m.quantity,
         p.sku || ' - ' || p.name as product_label
  from public.inventory_movements m
  join public.products p on p.id = m.product_id
  where m.deleted_at is null
    and m.approval_status = 'approved'
  order by m.movement_date desc, m.created_at desc
  limit 200;
$$;

grant execute on function public.lookup_movement_refs() to authenticated;

-- ---------------------------------------------------------------------------
-- 6a. Customer Service: a case linked to a sale picks up that sale's
--     product when none was chosen (keeps product reports complete).
-- ---------------------------------------------------------------------------
create or replace function public.fn_case_refs() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_sale_amount numeric(14,2);
begin
  -- take the product from the linked sale when the case has none
  if NEW.sales_transaction_id is not null and NEW.product_id is null then
    select st.product_id into NEW.product_id
    from public.sales_transactions st
    where st.id = NEW.sales_transaction_id;
  end if;

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

  -- Refunds: linked sale, valid amount, never more than the sale allows.
  if NEW.case_type = 'refund' then
    if NEW.sales_transaction_id is null then
      raise exception 'A refund must be linked to the sale being refunded.';
    end if;
    if NEW.refund_amount is null or NEW.refund_amount <= 0 then
      raise exception 'A refund amount is required.';
    end if;
    select amount into v_sale_amount from public.sales_transactions where id = NEW.sales_transaction_id;
    if not found then
      raise exception 'The linked sale no longer exists.';
    end if;
    if NEW.refund_amount > v_sale_amount then
      raise exception 'Refund amount (%) cannot exceed the eligible amount of the sale (%).',
        NEW.refund_amount, v_sale_amount;
    end if;
  end if;

  -- Denying a refund always carries a reason.
  if NEW.case_type = 'refund' and NEW.status = 'denied'
     and coalesce(btrim(NEW.resolution_details), '') = '' then
    raise exception 'A reason is required when a refund is denied.';
  end if;

  -- A decided refund is frozen: amount and sale link can no longer change.
  if TG_OP = 'UPDATE' and OLD.case_type = 'refund'
     and OLD.status in ('approved','denied','resolved') then
    if NEW.refund_amount is distinct from OLD.refund_amount
       or NEW.sales_transaction_id is distinct from OLD.sales_transaction_id then
      raise exception 'This refund has been decided and can no longer be changed.';
    end if;
  end if;

  NEW.updated_at := now();
  return NEW;
end;
$$;

create or replace trigger trg_service_cases_refs before insert or update on public.service_cases
  for each row execute function public.fn_case_refs();

-- ---------------------------------------------------------------------------
-- 6b. Renaming a product updates the product_name kept on existing cases,
--     so Customer Service reports never show a stale product name.
-- ---------------------------------------------------------------------------
create or replace function public.fn_products_rename_cases() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if NEW.name is distinct from OLD.name and NEW.deleted_at is null then
    update public.service_cases
    set product_name = NEW.name, updated_at = now()
    where product_id = NEW.id
      and product_name is distinct from NEW.name;
  end if;
  return NEW;
end;
$$;

create or replace trigger trg_products_rename
  after update on public.products
  for each row execute function public.fn_products_rename_cases();

-- ---------------------------------------------------------------------------
-- 7. Bulk product import: heads and staff may import (admin never can —
--    enforced by the admin_no_import check from phase 7C).
-- ---------------------------------------------------------------------------
update public.permissions
set can_import = true, updated_at = now()
where resource = 'products'
  and role in ('department_head', 'staff');
