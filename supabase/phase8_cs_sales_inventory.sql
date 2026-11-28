-- ============================================================================
-- Phase 8: Customer Service business rules, refund <-> Sales, Sales <-> Stock,
--          complaint categories, area login activity.
--
-- Runs once on the live database. Mirrored into schema.sql for fresh installs.
--
--  1. Complaint category field (complaints are not only about products).
--  2. Refund rules enforced IN THE DATABASE:
--       - a refund must link a sale, amount > 0 and <= the sale's amount
--       - only the Customer Service Department Head may approve / deny
--       - denying requires a reason
--       - completion (resolved) only from "approved", by the Head
--       - decided refunds freeze amount + sale link
--  3. Staff can edit cases assigned to them (RLS update policy fix).
--  4. Automatic case timeline (creation, assignment, status, decisions).
--  5. Approved refunds are reflected on the Sales record
--       (sales_transactions.refund_state / refunded_amount).
--  6. Approved sales deduct stock through inventory_movements (stock_out),
--     never below zero; deleting/rejecting a sale returns the stock.
--  7. area_login_activity(): sign-in activity for a Head's own department
--     (HR and Customer Service "Sign-ins" tabs).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Columns
-- ----------------------------------------------------------------------------
alter table public.service_cases
  add column if not exists category text
  check (category is null or category in ('product','service','billing','delivery','staff','other'));

alter table public.sales_transactions
  add column if not exists refund_state text not null default 'none'
    check (refund_state in ('none','approved','completed')),
  add column if not exists refunded_amount numeric(14,2) not null default 0
    check (refunded_amount >= 0);

alter table public.inventory_movements
  add column if not exists sale_id uuid references public.sales_transactions (id) on delete set null;
create index if not exists idx_inventory_movements_sale on public.inventory_movements (sale_id);

-- ----------------------------------------------------------------------------
-- 2) Refund validation (insert AND update) - fn_case_refs, extended
-- ----------------------------------------------------------------------------
create or replace function public.fn_case_refs() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_sale_amount numeric(14,2);
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

-- ----------------------------------------------------------------------------
-- 3) Refund decision rules (update only): who may approve/deny/complete
-- ----------------------------------------------------------------------------
create or replace function public.fn_service_cases_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_role text; v_area text;
begin
  -- Approve / deny: only refunds, only the Customer Service Head.
  if NEW.status in ('approved','denied') and NEW.status is distinct from OLD.status then
    if NEW.case_type <> 'refund' then
      raise exception 'Only refund cases can be approved or denied.';
    end if;
    select role, functional_area into v_role, v_area
    from public.profiles where id = auth.uid();
    if v_role is distinct from 'department_head' or v_area is distinct from 'customer_service' then
      raise exception using errcode = '42501',
        message = 'Only the Customer Service Department Head can approve or deny refunds.';
    end if;
    if not exists (select 1 from public.permissions
                   where role = 'department_head' and functional_area = 'customer_service'
                     and resource = 'service_cases' and can_update) then
      raise exception using errcode = '42501',
        message = 'You do not have permission to decide on refunds.';
    end if;
  end if;

  -- Completion: an approved refund, completed by the same Head.
  if NEW.case_type = 'refund' and NEW.status = 'resolved'
     and NEW.status is distinct from OLD.status then
    if OLD.status <> 'approved' then
      raise exception 'A refund can only be marked completed after it has been approved.';
    end if;
    select role, functional_area into v_role, v_area
    from public.profiles where id = auth.uid();
    if v_role is distinct from 'department_head' or v_area is distinct from 'customer_service' then
      raise exception using errcode = '42501',
        message = 'Only the Customer Service Department Head can complete an approved refund.';
    end if;
  end if;

  return NEW;
end;
$$;

create or replace trigger trg_service_cases_guard before update on public.service_cases
  for each row execute function public.fn_service_cases_guard();

-- ----------------------------------------------------------------------------
-- 4) Automatic case timeline
-- ----------------------------------------------------------------------------
create or replace function public.fn_service_cases_timeline() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_name  text;
  v_body  text;
  v_kind  text;
begin
  select full_name into v_name from public.profiles where id = v_actor;

  if TG_OP = 'INSERT' then
    insert into public.case_events (case_id, kind, body, actor_id, actor_name)
    values (NEW.id, 'system',
      'Case created (' || case NEW.case_type
        when 'complaint' then 'Complaint'
        when 'refund' then 'Refund / Return'
        when 'inquiry' then 'Product inquiry'
        when 'feedback' then 'Feedback'
        else 'Service request' end || ')',
      v_actor, v_name);
    if NEW.assigned_to is not null then
      select full_name into v_body from public.profiles where employee_id = NEW.assigned_to;
      insert into public.case_events (case_id, kind, body, actor_id, actor_name)
      values (NEW.id, 'system', 'Assigned to ' || coalesce(v_body, NEW.assigned_to), v_actor, v_name);
    end if;
    return NEW;
  end if;

  -- Assignment
  if NEW.assigned_to is distinct from OLD.assigned_to then
    if NEW.assigned_to is null then
      v_body := 'Assignment cleared';
    else
      select full_name into v_body from public.profiles where employee_id = NEW.assigned_to;
      v_body := 'Assigned to ' || coalesce(v_body, NEW.assigned_to);
    end if;
    insert into public.case_events (case_id, kind, body, actor_id, actor_name)
    values (NEW.id, 'system', v_body, v_actor, v_name);
  end if;

  -- Status changes (decisions get their own wording and kind)
  if NEW.status is distinct from OLD.status then
    v_kind := 'system';
    v_body := 'Status changed from ' ||
      case OLD.status when 'open' then 'Open' when 'in_progress' then 'In progress'
        when 'for_review' then 'Head review' when 'approved' then 'Approved'
        when 'denied' then 'Denied' when 'resolved' then 'Resolved' else 'Closed' end ||
      ' to ' ||
      case NEW.status when 'open' then 'Open' when 'in_progress' then 'In progress'
        when 'for_review' then 'Head review' when 'approved' then 'Approved'
        when 'denied' then 'Denied' when 'resolved' then 'Resolved' else 'Closed' end;
    if NEW.case_type = 'refund' then
      if NEW.status = 'approved' then
        v_kind := 'decision'; v_body := 'Refund approved';
      elsif NEW.status = 'denied' then
        v_kind := 'decision';
        v_body := 'Refund denied' ||
          case when coalesce(btrim(NEW.resolution_details), '') = '' then ''
               else ': ' || btrim(NEW.resolution_details) end;
      elsif NEW.status = 'resolved' then
        v_kind := 'decision'; v_body := 'Refund completed';
      end if;
    end if;
    insert into public.case_events (case_id, kind, body, actor_id, actor_name)
    values (NEW.id, v_kind, v_body, v_actor, v_name);
  elsif NEW.resolution_details is distinct from OLD.resolution_details
        and coalesce(btrim(NEW.resolution_details), '') <> '' then
    insert into public.case_events (case_id, kind, body, actor_id, actor_name)
    values (NEW.id, 'system', 'Resolution note updated', v_actor, v_name);
  end if;

  -- Other important updates
  if NEW.severity is distinct from OLD.severity and NEW.severity is not null then
    insert into public.case_events (case_id, kind, body, actor_id, actor_name)
    values (NEW.id, 'system', 'Severity set to ' || NEW.severity, v_actor, v_name);
  end if;
  if NEW.case_type = 'refund' and NEW.refund_amount is distinct from OLD.refund_amount
     and NEW.refund_amount is not null then
    insert into public.case_events (case_id, kind, body, actor_id, actor_name)
    values (NEW.id, 'system',
      'Refund amount set to PHP ' || to_char(NEW.refund_amount, 'FM999,999,990.00'),
      v_actor, v_name);
  end if;

  return NEW;
end;
$$;

create or replace trigger trg_service_cases_timeline after insert or update on public.service_cases
  for each row execute function public.fn_service_cases_timeline();

-- ----------------------------------------------------------------------------
-- 5) Approved refunds are reflected on the Sales record
-- ----------------------------------------------------------------------------
create or replace function public.fn_sync_sale_refund() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_sale uuid := NEW.sales_transaction_id;
begin
  if v_sale is null or NEW.case_type <> 'refund' then
    return NEW;
  end if;

  if TG_OP = 'INSERT' then
    if NEW.status = 'approved' then
      update public.sales_transactions
        set refund_state = 'approved', refunded_amount = NEW.refund_amount, updated_at = now()
        where id = v_sale;
    elsif NEW.status = 'resolved' then
      update public.sales_transactions
        set refund_state = 'completed', refunded_amount = NEW.refund_amount, updated_at = now()
        where id = v_sale;
    elsif NEW.status = 'denied' then
      update public.sales_transactions
        set refund_state = 'none', refunded_amount = 0, updated_at = now()
        where id = v_sale;
    end if;
    return NEW;
  end if;

  if NEW.status is distinct from OLD.status then
    if NEW.status = 'approved' then
      update public.sales_transactions
        set refund_state = 'approved', refunded_amount = NEW.refund_amount, updated_at = now()
        where id = v_sale;
    elsif NEW.status = 'resolved' and OLD.status = 'approved' then
      update public.sales_transactions
        set refund_state = 'completed', refunded_amount = NEW.refund_amount, updated_at = now()
        where id = v_sale;
    elsif NEW.status = 'denied' then
      update public.sales_transactions
        set refund_state = 'none', refunded_amount = 0, updated_at = now()
        where id = v_sale;
    elsif OLD.status in ('approved','denied','resolved') then
      -- the Head reopened the case: the sale no longer carries the decision
      update public.sales_transactions
        set refund_state = 'none', refunded_amount = 0, updated_at = now()
        where id = v_sale;
    end if;
  end if;
  return NEW;
end;
$$;

create or replace trigger trg_service_cases_refund_sale after insert or update on public.service_cases
  for each row execute function public.fn_sync_sale_refund();

-- ----------------------------------------------------------------------------
-- 6) Sales <-> stock: an approved sale deducts stock through
--    inventory_movements (stock_out, approved), never below zero.
--    Rejecting / deleting a sale returns the stock.
-- ----------------------------------------------------------------------------
create or replace function public.fn_sales_stock() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_wh    uuid;
  v_mv    uuid;
  v_mv_pr uuid;
  v_bal   integer;
begin
  if NEW.approval_status = 'approved' and NEW.deleted_at is null then
    select id into v_wh from public.warehouses
    where deleted_at is null order by created_at, id limit 1;
    if v_wh is null then
      raise exception 'No warehouse is set up yet, so stock cannot be tracked.';
    end if;

    select id, product_id into v_mv, v_mv_pr from public.inventory_movements
    where sale_id = NEW.id and movement_type = 'stock_out' and deleted_at is null
    limit 1;

    -- Product changed on the sale: drop the old deduction, make a new one.
    if v_mv is not null and v_mv_pr is distinct from NEW.product_id then
      update public.inventory_movements set deleted_at = now() where id = v_mv;
      v_mv := null;
    end if;

    if v_mv is null then
      select coalesce(sum(case when movement_type = 'stock_in' then quantity else -quantity end), 0)
      into v_bal from public.inventory_movements
      where product_id = NEW.product_id and approval_status = 'approved' and deleted_at is null;
      if v_bal - NEW.quantity < 0 then
        raise exception 'Insufficient stock for this product.';
      end if;
      insert into public.inventory_movements
        (movement_type, quantity, movement_date, warehouse_id, product_id,
         reference_no, remarks, approval_status, sale_id)
      values ('stock_out', NEW.quantity, NEW.transaction_date, v_wh, NEW.product_id,
              NEW.transaction_no, 'Stock deducted for sale ' || NEW.transaction_no,
              'approved', NEW.id);
    elsif NEW.quantity is distinct from OLD.quantity
          or NEW.transaction_date is distinct from OLD.transaction_date then
      select coalesce(sum(case when movement_type = 'stock_in' then quantity else -quantity end), 0)
      into v_bal from public.inventory_movements
      where product_id = NEW.product_id and approval_status = 'approved'
        and deleted_at is null and id <> v_mv;
      if v_bal - NEW.quantity < 0 then
        raise exception 'Insufficient stock for this product.';
      end if;
      update public.inventory_movements
        set quantity = NEW.quantity, movement_date = NEW.transaction_date, updated_at = now()
        where id = v_mv;
    end if;
  elsif TG_OP = 'UPDATE'
        and (NEW.approval_status is distinct from 'approved' or NEW.deleted_at is not null) then
    -- no longer an approved live sale: give the stock back
    update public.inventory_movements set deleted_at = now()
    where sale_id = NEW.id and deleted_at is null;
  end if;

  return NEW;
end;
$$;

create or replace trigger trg_sales_stock after insert or update on public.sales_transactions
  for each row execute function public.fn_sales_stock();

-- Deleting a sale returns its stock BEFORE the row (and the FK link) goes away.
create or replace function public.fn_sales_stock_unlink() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.inventory_movements set deleted_at = now()
  where sale_id = OLD.id and deleted_at is null;
  return OLD;
end;
$$;

create or replace trigger trg_sales_stock_unlink before delete on public.sales_transactions
  for each row execute function public.fn_sales_stock_unlink();

-- ----------------------------------------------------------------------------
-- 7) Case assignment: Staff may update cases assigned to them (not only the
--    ones they created), within their own department and permissions.
-- ----------------------------------------------------------------------------
drop policy if exists service_cases_update on public.service_cases;
create policy service_cases_update on public.service_cases for update
  using (
    (public.fn_caller_role() = 'department_head'
     and public.fn_caller_area() = 'customer_service'
     and exists (select 1 from public.permissions p
                 where p.role = 'department_head' and p.functional_area = 'customer_service'
                   and p.resource = 'service_cases' and p.can_update))
    or
    (public.fn_caller_role() = 'staff'
     and public.fn_caller_area() = 'customer_service'
     and exists (select 1 from public.permissions p
                 where p.role = 'staff' and p.functional_area = 'customer_service'
                   and p.resource = 'service_cases' and p.can_update)
     and (created_by = auth.uid()
          or assigned_to = (select employee_id from public.profiles where id = auth.uid())))
  )
  with check (true);

-- ----------------------------------------------------------------------------
-- 8) Login activity for a department (HR / Customer Service "Sign-ins" tabs).
--    Heads see their own area; Admin sees everything. Uses login_logs, the
--    same activity tracking the Administration Login Log uses.
-- ----------------------------------------------------------------------------
create or replace function public.area_login_activity(p_days integer default 7)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_role text; v_area text;
  v_days int := greatest(1, least(coalesce(p_days, 7), 90));
  v_today date := (now() at time zone 'Asia/Manila')::date;
begin
  select role, functional_area into v_role, v_area from public.profiles where id = auth.uid();
  if v_role is null or v_role not in ('department_head', 'admin') then
    raise exception using errcode = '42501', message = 'Not authorized.';
  end if;

  return jsonb_build_object(
    'signins_today', (
      select count(*) from public.login_logs l
      join public.profiles p on p.employee_id = l.employee_no
      where l.event = 'login'
        and (l.occurred_at at time zone 'Asia/Manila')::date = v_today
        and (v_role = 'admin' or p.functional_area = v_area)),
    'failed_today', (
      select count(*) from public.login_logs l
      join public.profiles p on p.employee_id = l.employee_no
      where l.event = 'login_failed'
        and (l.occurred_at at time zone 'Asia/Manila')::date = v_today
        and (v_role = 'admin' or p.functional_area = v_area)),
    'active_7d', (
      select count(distinct l.employee_no) from public.login_logs l
      join public.profiles p on p.employee_id = l.employee_no
      where l.event = 'login' and l.occurred_at >= now() - interval '7 days'
        and (v_role = 'admin' or p.functional_area = v_area)),
    'events', coalesce((select jsonb_agg(x order by x.occurred_at desc) from (
      select l.occurred_at, l.event, l.employee_no, l.user_agent, p.full_name
      from public.login_logs l
      join public.profiles p on p.employee_id = l.employee_no
      where l.occurred_at >= now() - make_interval(days => v_days)
        and (v_role = 'admin' or p.functional_area = v_area)
      order by l.occurred_at desc
      limit 200) x), '[]'::jsonb),
    'never_signed_in', coalesce((select jsonb_agg(x order by x.full_name) from (
      select p.employee_no, p.full_name
      from public.profiles p
      where p.is_active
        and (v_role = 'admin' or p.functional_area = v_area)
        and not exists (select 1 from public.login_logs l
                        where l.employee_no = p.employee_id and l.event = 'login')
      ) x), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.area_login_activity(integer) to authenticated;

-- ----------------------------------------------------------------------------
-- 9) Backfill: existing approved sales get their stock deduction (only where
--    stock allows it, so this can never push a product below zero).
-- ----------------------------------------------------------------------------
do $$
declare st record; v_bal integer; v_wh uuid;
begin
  select id into v_wh from public.warehouses
  where deleted_at is null order by created_at, id limit 1;
  if v_wh is null then
    return;
  end if;
  for st in
    select s.* from public.sales_transactions s
    where s.approval_status = 'approved' and s.deleted_at is null
      and not exists (select 1 from public.inventory_movements m
                      where m.sale_id = s.id and m.deleted_at is null)
  loop
    select coalesce(sum(case when movement_type = 'stock_in' then quantity else -quantity end), 0)
    into v_bal from public.inventory_movements
    where product_id = st.product_id and approval_status = 'approved' and deleted_at is null;
    if v_bal - st.quantity >= 0 then
      insert into public.inventory_movements
        (movement_type, quantity, movement_date, warehouse_id, product_id,
         reference_no, remarks, approval_status, sale_id)
      values ('stock_out', st.quantity, st.transaction_date, v_wh, st.product_id,
              st.transaction_no, 'Stock deducted for sale ' || st.transaction_no,
              'approved', st.id);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- fn_audit_log hardening (bug found while probing case updates: the UPDATE
-- branch read OLD.approval_status / OLD.deleted_at as record fields, which
-- crashes on every authenticated update of tables that lack those columns —
-- service_cases, employees, customers, products, permissions, profiles, ...).
-- jsonb lookups are null-safe on tables without the columns. Also mirrored in
-- schema.sql (both definitions).
-- ---------------------------------------------------------------------------
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
    -- jsonb lookups: not every audited table has these columns
    if (v_old ->> 'deleted_at') is null and (v_new ->> 'deleted_at') is not null then
      v_action := 'delete';
      v_changes := '{}'::jsonb;
    elsif (v_old ->> 'approval_status') = 'pending' and (v_new ->> 'approval_status') = 'approved' then
      v_action := 'approve';
    elsif (v_old ->> 'approval_status') = 'pending' and (v_new ->> 'approval_status') = 'rejected' then
      v_action := 'reject';
    elsif TG_TABLE_NAME = 'profiles'
          and (v_old ->> 'must_change_password') = 'false'
          and (v_new ->> 'must_change_password') = 'true' then
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
