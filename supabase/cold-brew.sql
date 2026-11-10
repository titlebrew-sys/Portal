-- Title Brew Portal: cold brew answers from the staff app (11 Nov 2026).
-- "Yes" = one batch made, 180 g of Ethiopia beans. "Not made" = 0 g. Nobody answering counts as Not made.
-- Run once in the Supabase SQL Editor. Safe to run again.
create table if not exists public.cold_brew_log (
  id text primary key,                       -- business date | shift, so re-sending replaces instead of adding
  business_date date not null,
  shift int not null,
  answer text not null,
  grams numeric not null default 0,
  saved_by text not null default 'Staff',
  at timestamptz not null,                   -- one minute before the count of that shift
  location_id text not null default 'business-bay'
);

alter table public.cold_brew_log enable row level security;
drop policy if exists "members read" on public.cold_brew_log;
create policy "members read" on public.cold_brew_log for select to authenticated using (public.is_member());
grant select on public.cold_brew_log to authenticated;
