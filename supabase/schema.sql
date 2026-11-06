-- Title Brew portal database.
-- Paste this whole file into Supabase > SQL Editor > New query, then click Run.
-- It is safe to run again: it only creates what is missing.
set client_min_messages = warning;
-- No passwords, PINs or keys live in this file. Staff PINs are Supabase Auth passwords.

-- ---------------------------------------------------------------- people
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null,
  role text not null default 'staff' check (role in ('owner', 'staff')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- The first person ever added becomes the owner. Everyone after is staff.
-- Display name: from the user's metadata "display_name", otherwise the part of the email before @.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), initcap(split_part(new.email, '@', 1))),
    case when exists (select 1 from public.profiles where role = 'owner') then 'staff' else 'owner' end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'owner' and active);
$$;

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active);
$$;

-- Names shown on the staff login screen (no PINs, no emails of the owner).
create or replace function public.staff_login_list()
returns table (display_name text, email text)
language sql stable security definer set search_path = public as $$
  select display_name, email from public.profiles where role = 'staff' and active order by display_name;
$$;
grant execute on function public.staff_login_list() to anon, authenticated;

-- ---------------------------------------------------------------- setup tables
create table if not exists public.count_items (
  id text primary key,
  area text not null check (area in ('Bar', 'Kitchen', 'Weekly')),
  section text not null,
  name text not null,
  unit text not null,
  hint text,
  sort int not null default 0,
  has_batches boolean not null default false,
  has_frozen boolean not null default false,
  active boolean not null default true
);

create table if not exists public.suppliers (
  id text primary key,
  name text not null,
  how text not null,
  email text,
  cutoff text not null default '',
  delivery text not null default '',
  lead_days int not null default 1,
  no_delivery_days int[] not null default '{}',
  open_text text not null default 'Hello',
  close_text text,
  min_order numeric,
  free_delivery numeric,
  notes text,
  weekly boolean not null default false,
  uses_lpo boolean not null default false,
  delivery_time text,
  sat_delivery_time text,
  sort int not null default 0
);

-- Added later: contact line printed on The Bakery LPO.
alter table public.suppliers add column if not exists lpo_contact text;

create table if not exists public.rules (
  id text primary key,
  supplier_id text references public.suppliers (id) on delete set null,
  order_item text not null,
  count_from text not null,
  rule text not null check (rule in ('TARGET', 'TOPUP', 'FIXED', 'TRACK')),
  order_unit text not null default 'pcs',
  pack_size numeric not null default 1,
  est_daily_use numeric,
  fixed_target numeric,
  sat_target numeric,
  extra_days numeric not null default 1,
  min_level numeric,
  max_level numeric,
  fixed_qty numeric,
  price numeric,
  active boolean not null default true,
  sort int not null default 0
);

create table if not exists public.settings (
  key text primary key,
  value jsonb not null
);
insert into public.settings (key, value) values ('lpo_next', '557') on conflict (key) do nothing;

-- ---------------------------------------------------------------- daily work
create table if not exists public.counts (
  business_date date not null,
  shift smallint not null check (shift in (1, 2)),
  item_id text not null references public.count_items (id) on delete cascade,
  qty numeric,
  old_qty numeric,
  new_qty numeric,
  frozen_qty numeric,
  exp_old date,
  exp_new date,
  counted_by text not null,
  saved_at timestamptz not null default now(),
  primary key (business_date, shift, item_id)
);

create table if not exists public.count_sessions (
  business_date date not null,
  shift smallint not null check (shift in (1, 2)),
  area text not null,
  saved_by text not null,
  saved_at timestamptz not null default now(),
  done int not null,
  total int not null,
  primary key (business_date, shift, area)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  business_date date not null,
  supplier_id text not null references public.suppliers (id),
  lines jsonb not null,
  message text not null,
  lpo_number int,
  sent_by text not null,
  sent_at timestamptz not null default now(),
  received_at timestamptz,
  received_by text,
  received jsonb
);

create table if not exists public.waste (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  item text not null,
  qty numeric not null,
  reason text not null check (reason in ('Expired', 'Damaged', 'Not sold')),
  logged_by text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.sales_items (
  item text primary key,
  cat text not null default '',
  qty numeric not null default 0,
  net numeric not null default 0,
  gp numeric not null default 0,
  m numeric not null default 0,
  disc numeric not null default 0,
  tax numeric not null default 0
);

-- ---------------------------------------------------------------- shop clock rules
-- Asia/Dubai. New business day at 4am. Shift 1 locks at 5pm: only the owner can change it after.
create or replace function public.dubai_business_date() returns date
language sql stable as $$
  select ((now() at time zone 'Asia/Dubai') - interval '4 hours')::date;
$$;

create or replace function public.enforce_shift1_lock() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  local_now timestamp := now() at time zone 'Asia/Dubai';
  lock_at timestamp := new.business_date + time '17:00';
begin
  -- The owner, and counts sent by the Google Sheet bridge, may still change it.
  if new.shift = 1 and local_now >= lock_at and not public.is_owner()
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Shift 1 is locked after 5pm. Ask the owner to change it.';
  end if;
  return new;
end $$;

drop trigger if exists counts_shift1_lock on public.counts;
create trigger counts_shift1_lock before insert or update on public.counts
  for each row execute function public.enforce_shift1_lock();

-- Kitchen rows: the saved quantity is always old batch + new batch + frozen.
create or replace function public.counts_kitchen_total() returns trigger
language plpgsql as $$
begin
  if new.old_qty is not null or new.new_qty is not null or new.frozen_qty is not null then
    new.qty := coalesce(new.old_qty, 0) + coalesce(new.new_qty, 0) + coalesce(new.frozen_qty, 0);
  end if;
  return new;
end $$;

drop trigger if exists counts_kitchen_total on public.counts;
create trigger counts_kitchen_total before insert or update on public.counts
  for each row execute function public.counts_kitchen_total();

-- Hands out the next LPO number and moves the counter on, in one step.
create or replace function public.take_lpo_number() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_member() then raise exception 'Not signed in'; end if;
  update public.settings set value = to_jsonb((value::text)::int + 1)
    where key = 'lpo_next'
    returning (value::text)::int - 1 into n;
  return n;
end $$;
grant execute on function public.take_lpo_number() to authenticated;

-- ---------------------------------------------------------------- security (row level)
alter table public.profiles enable row level security;
alter table public.count_items enable row level security;
alter table public.suppliers enable row level security;
alter table public.rules enable row level security;
alter table public.settings enable row level security;
alter table public.counts enable row level security;
alter table public.count_sessions enable row level security;
alter table public.orders enable row level security;
alter table public.waste enable row level security;
alter table public.sales_items enable row level security;

do $$
declare t text;
begin
  -- Drop and recreate policies so re-running the file stays clean.
  for t in select unnest(array['profiles','count_items','suppliers','rules','settings','counts','count_sessions','orders','waste','sales_items']) loop
    execute format('drop policy if exists "members read" on public.%I', t);
    execute format('drop policy if exists "owner writes" on public.%I', t);
    execute format('drop policy if exists "members write" on public.%I', t);
    execute format('drop policy if exists "members update" on public.%I', t);
    execute format('drop policy if exists "owner reads" on public.%I', t);
  end loop;
end $$;

-- Setup: everyone signed in reads, only the owner changes.
create policy "members read" on public.profiles for select to authenticated using (public.is_member());
create policy "owner writes" on public.profiles for update to authenticated using (public.is_owner()) with check (public.is_owner());

create policy "members read" on public.count_items for select to authenticated using (public.is_member());
create policy "owner writes" on public.count_items for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "members read" on public.suppliers for select to authenticated using (public.is_member());
create policy "owner writes" on public.suppliers for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "members read" on public.rules for select to authenticated using (public.is_member());
create policy "owner writes" on public.rules for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "members read" on public.settings for select to authenticated using (public.is_member());
create policy "owner writes" on public.settings for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- Daily work: staff and owner read and write.
create policy "members read" on public.counts for select to authenticated using (public.is_member());
create policy "members write" on public.counts for insert to authenticated with check (public.is_member());
create policy "members update" on public.counts for update to authenticated using (public.is_member()) with check (public.is_member());
create policy "members read" on public.count_sessions for select to authenticated using (public.is_member());
create policy "members write" on public.count_sessions for insert to authenticated with check (public.is_member());
create policy "members update" on public.count_sessions for update to authenticated using (public.is_member()) with check (public.is_member());
create policy "members read" on public.orders for select to authenticated using (public.is_member());
create policy "members write" on public.orders for insert to authenticated with check (public.is_member());
create policy "members update" on public.orders for update to authenticated using (public.is_member()) with check (public.is_member());
create policy "members read" on public.waste for select to authenticated using (public.is_member());
create policy "members write" on public.waste for insert to authenticated with check (public.is_member());

-- Sales: owner only.
create policy "owner reads" on public.sales_items for select to authenticated using (public.is_owner());
create policy "owner writes" on public.sales_items for all to authenticated using (public.is_owner()) with check (public.is_owner());
