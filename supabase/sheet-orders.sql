-- Title Brew Portal: a copy of the Google Sheet's Today's Orders tab (10 Nov 2026).
-- The sheet sends it every 10 minutes and after every count. The Portal's Orders page shows it as it is.
-- Run once in the Supabase SQL Editor. Safe to run again.
create table if not exists public.sheet_orders_now (
  id text primary key,
  location_id text not null default 'business-bay',
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.sheet_orders_now enable row level security;
drop policy if exists "members read" on public.sheet_orders_now;
create policy "members read" on public.sheet_orders_now for select to authenticated using (public.is_member());
grant select on public.sheet_orders_now to authenticated;
