-- Calendar subscription feeds: one secret token per host.
-- The calendar-feed edge function looks the token up (service role) and serves the host's
-- meetings as an .ics feed that calendar apps poll. Hosts manage only their own row.

create table if not exists public.cal_feeds (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null unique references auth.users (id) on delete cascade default auth.uid(),
  token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);

alter table public.cal_feeds enable row level security;

drop policy if exists cal_feeds_select_own on public.cal_feeds;
create policy cal_feeds_select_own on public.cal_feeds
  for select to authenticated
  using ((select auth.uid()) = owner);

drop policy if exists cal_feeds_insert_own on public.cal_feeds;
create policy cal_feeds_insert_own on public.cal_feeds
  for insert to authenticated
  with check ((select auth.uid()) = owner);

drop policy if exists cal_feeds_update_own on public.cal_feeds;
create policy cal_feeds_update_own on public.cal_feeds
  for update to authenticated
  using ((select auth.uid()) = owner)
  with check ((select auth.uid()) = owner);

drop policy if exists cal_feeds_delete_own on public.cal_feeds;
create policy cal_feeds_delete_own on public.cal_feeds
  for delete to authenticated
  using ((select auth.uid()) = owner);

-- anon never reads tokens; the feed is served by the edge function with the service role.
revoke all on public.cal_feeds from anon;
grant select, insert, update, delete on public.cal_feeds to authenticated;
