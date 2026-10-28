-- GlassMeet: a temporary "Report a bug" button for the launch. Hosts and guests send a short
-- note with technical details (page, browser, recent errors); reports are read in the Supabase
-- dashboard (Table editor → bug_reports) and delete themselves after 30 days.
-- Run after 20261029090000_grants_policies_indexes.sql. Safe to run more than once.

create table if not exists public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  user_id uuid references auth.users (id) on delete cascade,
  email text check (char_length(email) <= 320),
  message text not null check (char_length(message) between 1 and 4000),
  page text check (char_length(page) <= 2000),
  details jsonb check (octet_length(details::text) <= 64000)
);
create index if not exists bug_reports_created_idx on public.bug_reports (created_date);
create index if not exists bug_reports_user_idx on public.bug_reports (user_id);

alter table public.bug_reports enable row level security;

-- anyone may send a report; nobody can read them through the API
revoke all on public.bug_reports from anon, authenticated;
grant insert on public.bug_reports to anon, authenticated;
drop policy if exists bug_reports_insert on public.bug_reports;
create policy bug_reports_insert on public.bug_reports for insert to anon, authenticated
  with check (user_id is not distinct from (select auth.uid()));

-- the sender is whoever is signed in, not what the browser claims; a few reports an hour per
-- person (and a cap for signed-out guests together); old reports are cleared on the way in
create or replace function public.guard_bug_report()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
begin
  new.user_id := uid;
  new.created_date := now();
  if (
    select count(*) from public.bug_reports r
    where r.created_date > now() - interval '1 hour'
      and (case when uid is null then r.user_id is null else r.user_id = uid end)
  ) >= (case when uid is null then 60 else 10 end) then
    raise exception 'Too many reports right now. Please try again later.' using errcode = 'P0001';
  end if;
  delete from public.bug_reports where created_date < now() - interval '30 days';
  return new;
end;
$$;
revoke execute on function public.guard_bug_report() from public, anon, authenticated;

drop trigger if exists bug_reports_guard on public.bug_reports;
create trigger bug_reports_guard before insert on public.bug_reports
  for each row execute function public.guard_bug_report();
