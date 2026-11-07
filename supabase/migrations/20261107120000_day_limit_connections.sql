-- GlassMeet: a limit on a host's meetings per day, across all their events, and connections to
-- Zoom and Microsoft (Outlook and Teams). Tokens live in a table only the connections edge function
-- (service role) can touch; everything cascades from auth.users, so delete_my_account() still
-- removes it all. Run after 20261106130000_booking_emails_grant.sql. Safe to run more than once.

-- ── 1. meetings per day ─────────────────────────────────────────────────────
alter table public.profiles add column if not exists max_per_day integer;
alter table public.profiles drop constraint if exists profiles_max_per_day_check;
alter table public.profiles add constraint profiles_max_per_day_check
  check (max_per_day is null or max_per_day between 1 and 100);

-- Booking pages need the limit but can't read profiles, so it comes with the event
create or replace function public.public_event_type(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select (to_jsonb(e) - 'meeting_url' - 'host_email' - 'note')
    || case when e.host_name like '%@%' then jsonb_build_object('host_name', null) else '{}'::jsonb end
    || jsonb_build_object('host_max_per_day', (select p.max_per_day from public.profiles p where p.id = e.created_by_id))
  from public.event_types e
  where e.id = p_id and e.active;
$$;
revoke execute on function public.public_event_type(uuid) from public;
grant execute on function public.public_event_type(uuid) to anon, authenticated;

-- A full day turns away a new guest meeting. A group session is one meeting however many join, so
-- joining one doesn't count. A host adding their own booking is trusted, but it counts.
create or replace function public.guard_host_day_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  day_limit int;
  tz text;
begin
  if (select auth.uid()) is not distinct from new.host_id then
    return new;
  end if;
  select p.max_per_day, coalesce(nullif(e.host_timezone, ''), nullif(p.timezone, ''), 'UTC')
    into day_limit, tz
  from public.profiles p
  left join public.event_types e on e.id = new.event_type_id
  where p.id = new.host_id;
  if day_limit is null then
    return new;
  end if;

  -- the lock guard_guest_booking() takes: two guests can't both get the day's last meeting
  perform pg_advisory_xact_lock(hashtextextended(new.host_id::text, 0));

  if exists (
    select 1 from public.bookings b
    where b.event_type_id = new.event_type_id and b.start_time = new.start_time
      and b.status <> 'cancelled' and b.approval_status <> 'declined'
  ) then
    return new;
  end if;
  if (select count(distinct (b.event_type_id, b.start_time)) from public.bookings b
      where b.host_id = new.host_id
        and b.status <> 'cancelled' and b.approval_status <> 'declined'
        and (b.start_time at time zone tz)::date = (new.start_time at time zone tz)::date) >= day_limit then
    raise exception 'That day is fully booked.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_host_day_limit() from public, anon, authenticated;

drop trigger if exists bookings_guard_limit on public.bookings;
create trigger bookings_guard_limit before insert on public.bookings
  for each row execute function public.guard_host_day_limit();

-- ── 2. the connections (visible to their owner) ─────────────────────────────
create table if not exists public.connections (
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('zoom', 'microsoft')),
  email text,
  -- Microsoft only: the account can make Teams meetings (work and school accounts)
  teams boolean not null default false,
  auto_sync boolean not null default true,
  -- false once the provider stops accepting the refresh token: reconnect
  connected boolean not null default true,
  synced_date timestamptz,
  connected_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  primary key (user_id, provider)
);

alter table public.connections enable row level security;

drop policy if exists connections_select_own on public.connections;
create policy connections_select_own on public.connections for select to authenticated
  using ((select auth.uid()) = user_id);

drop trigger if exists connections_touch on public.connections;
create trigger connections_touch before update on public.connections
  for each row execute function public.touch_updated_date();

revoke all on public.connections from anon, authenticated;
grant select on public.connections to authenticated;
grant select, insert, update, delete on public.connections to service_role;

-- ── 3. the tokens (service role only) ───────────────────────────────────────
-- RLS on with no policies, and no grants: nothing but the service role can read a token.
create table if not exists public.connection_tokens (
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('zoom', 'microsoft')),
  refresh_token text not null,
  access_token text,
  expires_at timestamptz,
  updated_date timestamptz not null default now(),
  primary key (user_id, provider)
);

alter table public.connection_tokens enable row level security;

drop trigger if exists connection_tokens_touch on public.connection_tokens;
create trigger connection_tokens_touch before update on public.connection_tokens
  for each row execute function public.touch_updated_date();

revoke all on public.connection_tokens from public, anon, authenticated;
grant select, insert, update, delete on public.connection_tokens to service_role;

-- ── 4. bookings remember what was made for them ─────────────────────────────
alter table public.bookings add column if not exists ms_event_id text;
alter table public.bookings add column if not exists ms_hash text;
alter table public.bookings add column if not exists zoom_id text;

-- Only the edge function sets these, so nobody can point a booking at another meeting of the host's
create or replace function public.keep_connection_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.ms_event_id := null;
      new.ms_hash := null;
      new.zoom_id := null;
    else
      new.ms_event_id := old.ms_event_id;
      new.ms_hash := old.ms_hash;
      new.zoom_id := old.zoom_id;
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.keep_connection_fields() from public, anon, authenticated;

drop trigger if exists bookings_connection_fields on public.bookings;
create trigger bookings_connection_fields before insert or update on public.bookings
  for each row execute function public.keep_connection_fields();

revoke truncate, references, trigger on public.connections, public.connection_tokens from anon, authenticated;
