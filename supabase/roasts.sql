-- Title Brew Portal: real roast weights entered by the owner (11 Nov 2026).
-- A roast replaces the amount the Portal assumes from a big rise in a bean count.
-- Run once in the Supabase SQL Editor. Safe to run again.
create table if not exists public.roasts (
  id uuid primary key default gen_random_uuid(),
  date date not null,                        -- business date the roast was brought to the shop
  ingredient_id text not null,               -- for example bean-brazil, bean-ethiopia
  grams numeric not null check (grams > 0),
  entered_by text not null default 'Owner',
  entered_at timestamptz not null default now()
);

alter table public.roasts enable row level security;
drop policy if exists "members read" on public.roasts;
create policy "members read" on public.roasts for select to authenticated using (public.is_member());
drop policy if exists "owner writes" on public.roasts;
create policy "owner writes" on public.roasts for all to authenticated using (public.is_owner()) with check (public.is_owner());
grant select, insert, update, delete on public.roasts to authenticated;
