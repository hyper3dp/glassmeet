-- GlassMeet: Google Calendar connection. One Google account per host: hosts read their own
-- connection and may change only which calendar is used and whether new bookings sync. The
-- OAuth tokens live in a separate table only the google-calendar edge function (service role)
-- can touch. Bookings remember the Google event they were copied to. Everything cascades from
-- auth.users, so delete_my_account() still removes it all. Run after
-- 20261029090000_grants_policies_indexes.sql. Safe to run more than once.

-- ── 1. the connection (visible to its owner) ────────────────────────────────
create table if not exists public.google_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  calendar_id text not null default 'primary',
  calendar_name text,
  auto_sync boolean not null default true,
  -- false once Google stops accepting the refresh token (revoked, password change): reconnect
  connected boolean not null default true,
  synced_date timestamptz,
  connected_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

alter table public.google_accounts enable row level security;

drop policy if exists google_accounts_select_own on public.google_accounts;
create policy google_accounts_select_own on public.google_accounts for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists google_accounts_update_own on public.google_accounts;
create policy google_accounts_update_own on public.google_accounts for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop trigger if exists google_accounts_touch on public.google_accounts;
create trigger google_accounts_touch before update on public.google_accounts
  for each row execute function public.touch_updated_date();

-- rows are created and removed by the edge function only; owners change two settings
revoke all on public.google_accounts from anon, authenticated;
grant select on public.google_accounts to authenticated;
grant update (calendar_id, auto_sync) on public.google_accounts to authenticated;
grant select, insert, update, delete on public.google_accounts to service_role;

-- ── 2. the tokens (service role only) ───────────────────────────────────────
-- RLS on with no policies, and no grants: nothing but the service role can read a token.
create table if not exists public.google_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  refresh_token text not null,
  access_token text,
  expires_at timestamptz,
  updated_date timestamptz not null default now()
);

alter table public.google_tokens enable row level security;

drop trigger if exists google_tokens_touch on public.google_tokens;
create trigger google_tokens_touch before update on public.google_tokens
  for each row execute function public.touch_updated_date();

revoke all on public.google_tokens from public, anon, authenticated;
grant select, insert, update, delete on public.google_tokens to service_role;

-- ── 3. bookings remember their Google event ─────────────────────────────────
-- google_event_id: the event's id; google_cal: the calendar it is in; google_hash: a digest of
-- what was sent, so a sync only rewrites events whose booking changed.
alter table public.bookings add column if not exists google_event_id text;
alter table public.bookings add column if not exists google_cal text;
alter table public.bookings add column if not exists google_hash text;

-- Only the edge function sets these. A guest inserting a booking or a host editing one through
-- the API can't point a booking at some other event in the host's calendar.
create or replace function public.keep_google_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.google_event_id := null;
      new.google_cal := null;
      new.google_hash := null;
    else
      new.google_event_id := old.google_event_id;
      new.google_cal := old.google_cal;
      new.google_hash := old.google_hash;
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.keep_google_fields() from public, anon, authenticated;

drop trigger if exists bookings_google_fields on public.bookings;
create trigger bookings_google_fields before insert or update on public.bookings
  for each row execute function public.keep_google_fields();

-- the edge function reads a host's bookings and writes the three columns back
grant select, update on public.bookings to service_role;
grant select on public.event_types to service_role;

-- ── 4. no TRUNCATE / TRIGGER / REFERENCES for app roles ─────────────────────
revoke truncate, references, trigger on public.google_accounts, public.google_tokens from anon, authenticated;
