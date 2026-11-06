-- Title Brew portal, part 2: Loyverse sales, recipes and stock.
-- Run AFTER schema.sql: Supabase > SQL Editor > New query > paste this whole file > Run.
-- Safe to run again. No tokens, keys or PINs in this file.
set client_min_messages = warning;

-- ---------------------------------------------------------------- one shop now, more later
alter table public.counts add column if not exists location_id text not null default 'business-bay';
alter table public.count_sessions add column if not exists location_id text not null default 'business-bay';
alter table public.orders add column if not exists location_id text not null default 'business-bay';
alter table public.waste add column if not exists location_id text not null default 'business-bay';
-- Sheet counts send waste too: this key stops a re-send from counting it twice.
alter table public.waste add column if not exists source_key text;
create unique index if not exists waste_source_key on public.waste (source_key);

-- Counts sent by the Google Sheet bridge (service role) are allowed after 5pm.
create or replace function public.enforce_shift1_lock() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  local_now timestamp := now() at time zone 'Asia/Dubai';
  lock_at timestamp := new.business_date + time '17:00';
begin
  if new.shift = 1 and local_now >= lock_at and not public.is_owner()
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Shift 1 is locked after 5pm. Ask the owner to change it.';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- ingredients, recipes, modifier rules
create table if not exists public.ingredients (
  id text primary key,
  location_id text not null default 'business-bay',
  name text not null,
  unit text not null check (unit in ('g', 'ml', 'pcs')),
  count_from text not null default '',
  limit_pct numeric not null default 5,
  note text,
  active boolean not null default true,
  sort int not null default 0,
  updated_by text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.recipes (
  id text primary key,
  location_id text not null default 'business-bay',
  item_name text not null,
  lines jsonb not null default '[]',
  takeaway jsonb not null default '[]',
  ignore_groups jsonb not null default '[]',
  note text,
  updated_by text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.modifier_rules (
  id text primary key,
  location_id text not null default 'business-bay',
  grp text not null,
  opt text not null,
  effects jsonb not null default '[]',
  note text,
  updated_by text not null default '',
  updated_at timestamptz not null default now()
);

-- Who changed what and when, for recipes, modifier rules and ingredients.
create table if not exists public.recipe_changes (
  id uuid primary key default gen_random_uuid(),
  location_id text not null default 'business-bay',
  kind text not null,
  target_id text not null,
  label text not null,
  before jsonb,
  after jsonb,
  changed_by text not null,
  changed_at timestamptz not null default now()
);
create index if not exists recipe_changes_target on public.recipe_changes (target_id, changed_at desc);

create or replace function public.log_recipe_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare k text := case tg_table_name when 'recipes' then 'recipe' when 'modifier_rules' then 'modifier' else 'ingredient' end;
begin
  insert into public.recipe_changes (location_id, kind, target_id, label, before, after, changed_by)
  values (
    new.location_id, k, new.id,
    case tg_table_name when 'recipes' then to_jsonb(new) ->> 'item_name' when 'modifier_rules' then (to_jsonb(new) ->> 'grp') || ': ' || (to_jsonb(new) ->> 'opt') else to_jsonb(new) ->> 'name' end,
    case when tg_op = 'UPDATE' then to_jsonb(old) end, to_jsonb(new), coalesce(nullif(new.updated_by, ''), 'Unknown')
  );
  return new;
end $$;

drop trigger if exists recipes_history on public.recipes;
create trigger recipes_history after insert or update on public.recipes for each row execute function public.log_recipe_change();
drop trigger if exists modifier_rules_history on public.modifier_rules;
create trigger modifier_rules_history after insert or update on public.modifier_rules for each row execute function public.log_recipe_change();
drop trigger if exists ingredients_history on public.ingredients;
create trigger ingredients_history after insert or update on public.ingredients for each row execute function public.log_recipe_change();

-- Sheet item names that differ from portal count item names.
create table if not exists public.count_item_aliases (
  name text primary key,
  item_id text not null references public.count_items (id) on delete cascade
);

-- ---------------------------------------------------------------- Loyverse copy (filled by the loyverse-sync function)
create table if not exists public.loyverse_categories (id text primary key, location_id text not null default 'business-bay', name text not null);
create table if not exists public.loyverse_stores (id text primary key, location_id text not null default 'business-bay', name text not null);
create table if not exists public.loyverse_employees (id text primary key, location_id text not null default 'business-bay', name text not null);
create table if not exists public.loyverse_modifiers (id text primary key, location_id text not null default 'business-bay', name text not null, options jsonb not null default '[]');
create table if not exists public.loyverse_items (
  id text primary key,
  location_id text not null default 'business-bay',
  name text not null,
  category_id text,
  is_composite boolean not null default false,
  components jsonb not null default '[]',
  modifier_ids jsonb not null default '[]',
  track_stock boolean not null default false,
  deleted_at timestamptz
);
create table if not exists public.loyverse_variants (
  variant_id text primary key,
  location_id text not null default 'business-bay',
  item_id text not null,
  name text,
  sku text,
  cost numeric,
  default_price numeric
);

create table if not exists public.receipts (
  receipt_number text primary key,
  location_id text not null default 'business-bay',
  store_id text,
  receipt_type text not null,
  refund_for text,
  created_at timestamptz not null,
  receipt_date timestamptz not null,
  updated_at timestamptz,
  business_date date not null,
  cancelled_at timestamptz,
  total_money numeric not null default 0,
  total_discount numeric not null default 0,
  employee_id text,
  dining_option text
);
create index if not exists receipts_receipt_date on public.receipts (receipt_date);
create index if not exists receipts_business_date on public.receipts (business_date);

create table if not exists public.receipt_lines (
  receipt_number text not null references public.receipts (receipt_number) on delete cascade,
  line_idx int not null,
  location_id text not null default 'business-bay',
  item_id text,
  variant_id text,
  item_name text not null,
  variant_name text,
  sku text,
  quantity numeric not null default 0,
  price numeric not null default 0,
  total_money numeric not null default 0,
  cost_total numeric,
  total_discount numeric not null default 0,
  line_note text,
  primary key (receipt_number, line_idx)
);

create table if not exists public.receipt_line_modifiers (
  receipt_number text not null,
  line_idx int not null,
  mod_idx int not null,
  location_id text not null default 'business-bay',
  modifier_option_id text,
  grp text not null default '',
  opt text not null default '',
  price numeric not null default 0,
  money_amount numeric not null default 0,
  primary key (receipt_number, line_idx, mod_idx),
  foreign key (receipt_number, line_idx) references public.receipt_lines (receipt_number, line_idx) on delete cascade
);

create table if not exists public.sync_state (key text primary key, value jsonb not null, updated_at timestamptz not null default now());

create table if not exists public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  location_id text not null default 'business-bay',
  kind text not null check (kind in ('loyverse', 'sheet')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  receipts int not null default 0,
  ok boolean not null default true,
  message text not null default '',
  details jsonb,
  latest_receipt_at timestamptz
);
create index if not exists sync_runs_started on public.sync_runs (kind, started_at desc);

-- ---------------------------------------------------------------- reading receipts (money only for the owner)
create or replace function public.receipt_bundle(p_from timestamptz, p_to timestamptz) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not public.is_member() then '[]'::jsonb else coalesce(jsonb_agg(x order by x ->> 'at'), '[]'::jsonb) end
  from (
    select jsonb_build_object(
      'number', r.receipt_number,
      'type', r.receipt_type,
      'at', to_char(r.receipt_date at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'businessDate', r.business_date,
      'dining', r.dining_option,
      'cancelled', r.cancelled_at is not null,
      'total', case when public.is_owner() then r.total_money end,
      'employee', e.name,
      'lines', coalesce((
        select jsonb_agg(jsonb_build_object(
          'idx', l.line_idx, 'itemId', l.item_id, 'itemName', l.item_name, 'variantName', l.variant_name, 'qty', l.quantity,
          'total', case when public.is_owner() then l.total_money end,
          'modifiers', coalesce((select jsonb_agg(jsonb_build_object('group', m.grp, 'option', m.opt) order by m.mod_idx)
                                 from public.receipt_line_modifiers m where m.receipt_number = l.receipt_number and m.line_idx = l.line_idx), '[]'::jsonb)
        ) order by l.line_idx) from public.receipt_lines l where l.receipt_number = r.receipt_number), '[]'::jsonb)
    ) x
    from public.receipts r left join public.loyverse_employees e on e.id = r.employee_id
    where r.receipt_date > p_from and r.receipt_date <= p_to
  ) q;
$$;
grant execute on function public.receipt_bundle(timestamptz, timestamptz) to authenticated;

-- Sales by day, hour, item and choice for a date range (business days). Owner only.
create or replace function public.sales_report(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.is_owner() then return null; end if;
  with r as (
    select *, case when receipt_type = 'REFUND' then -1 else 1 end as sgn
    from public.receipts where business_date between p_from and p_to and cancelled_at is null
  ), l as (
    select l.*, r.sgn from public.receipt_lines l join r using (receipt_number)
  )
  select jsonb_build_object(
    'totals', (select jsonb_build_object('receipts', count(*) filter (where sgn > 0), 'sales', coalesce(sum(sgn * total_money), 0),
               'items', coalesce((select sum(sgn * quantity) from l), 0)) from r),
    'byDay', coalesce((select jsonb_agg(jsonb_build_object('date', d, 'sales', s, 'receipts', c) order by d) from
               (select business_date d, sum(sgn * total_money) s, count(*) filter (where sgn > 0) c from r group by 1) x), '[]'),
    'byHour', coalesce((select jsonb_agg(jsonb_build_object('hour', h, 'sales', s, 'receipts', c) order by h) from
               (select extract(hour from receipt_date at time zone 'Asia/Dubai')::int h, sum(sgn * total_money) s, count(*) filter (where sgn > 0) c from r group by 1) x), '[]'),
    'byItem', coalesce((select jsonb_agg(jsonb_build_object('item', i, 'qty', q, 'sales', s) order by s desc) from
               (select item_name i, sum(sgn * quantity) q, sum(sgn * total_money) s from l group by 1) x), '[]'),
    'byModifier', coalesce((select jsonb_agg(jsonb_build_object('group', g, 'option', o, 'qty', q, 'sales', s) order by q desc) from
               (select m.grp g, m.opt o, sum(l.sgn * l.quantity) q, sum(l.sgn * m.money_amount) s
                from public.receipt_line_modifiers m join l on l.receipt_number = m.receipt_number and l.line_idx = m.line_idx group by 1, 2) x), '[]')
  ) into result;
  return result;
end $$;
grant execute on function public.sales_report(date, date) to authenticated;

-- ---------------------------------------------------------------- security (row level)
alter table public.ingredients enable row level security;
alter table public.recipes enable row level security;
alter table public.modifier_rules enable row level security;
alter table public.recipe_changes enable row level security;
alter table public.count_item_aliases enable row level security;
alter table public.loyverse_categories enable row level security;
alter table public.loyverse_stores enable row level security;
alter table public.loyverse_employees enable row level security;
alter table public.loyverse_modifiers enable row level security;
alter table public.loyverse_items enable row level security;
alter table public.loyverse_variants enable row level security;
alter table public.receipts enable row level security;
alter table public.receipt_lines enable row level security;
alter table public.receipt_line_modifiers enable row level security;
alter table public.sync_state enable row level security;
alter table public.sync_runs enable row level security;

do $$
declare t text;
begin
  for t in select unnest(array['ingredients','recipes','modifier_rules','recipe_changes','count_item_aliases','loyverse_categories','loyverse_stores',
    'loyverse_employees','loyverse_modifiers','loyverse_items','loyverse_variants','receipts','receipt_lines','receipt_line_modifiers','sync_runs']) loop
    execute format('drop policy if exists "members read" on public.%I', t);
    execute format('drop policy if exists "owner writes" on public.%I', t);
    execute format('drop policy if exists "owner reads" on public.%I', t);
  end loop;
end $$;

-- Setup the owner edits, everyone signed in reads.
create policy "members read" on public.ingredients for select to authenticated using (public.is_member());
create policy "owner writes" on public.ingredients for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "members read" on public.recipes for select to authenticated using (public.is_member());
create policy "owner writes" on public.recipes for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "members read" on public.modifier_rules for select to authenticated using (public.is_member());
create policy "owner writes" on public.modifier_rules for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "members read" on public.recipe_changes for select to authenticated using (public.is_member());
create policy "members read" on public.count_item_aliases for select to authenticated using (public.is_member());
create policy "owner writes" on public.count_item_aliases for all to authenticated using (public.is_owner()) with check (public.is_owner());
-- Loyverse menu: read only (the sync writes it).
create policy "members read" on public.loyverse_categories for select to authenticated using (public.is_member());
create policy "members read" on public.loyverse_stores for select to authenticated using (public.is_member());
create policy "members read" on public.loyverse_employees for select to authenticated using (public.is_member());
create policy "members read" on public.loyverse_modifiers for select to authenticated using (public.is_member());
create policy "members read" on public.loyverse_items for select to authenticated using (public.is_member());
create policy "members read" on public.loyverse_variants for select to authenticated using (public.is_member());
create policy "members read" on public.sync_runs for select to authenticated using (public.is_member());
-- Receipts with money: owner only. Staff see what was used through receipt_bundle (no money).
create policy "owner reads" on public.receipts for select to authenticated using (public.is_owner());
create policy "owner reads" on public.receipt_lines for select to authenticated using (public.is_owner());
create policy "owner reads" on public.receipt_line_modifiers for select to authenticated using (public.is_owner());
-- sync_state: no access from the app (only the sync function uses it).
