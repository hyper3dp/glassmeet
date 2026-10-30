-- GlassMeet: the booking page's own checks also hold for anyone calling the API directly, guests
-- are limited per network address as well as per phone/email (which they can make up), busy
-- times only answer for public hosts, and one sender can't switch bug reports off for everyone.
-- Run after 20261029110000_bug_reports.sql. Safe to run more than once.

-- ── 1. where a request came from, for rate limits ───────────────────────────
-- Cloudflare sets cf-connecting-ip in front of every Supabase project and a client can't
-- override it; the other headers are fallbacks. Only a hash is kept, never the address.
create or replace function public.request_ip_hash()
returns text language sql stable set search_path = '' as $$
  select encode(sha256(convert_to(ip, 'UTF8')), 'hex')
  from (
    select nullif(trim(coalesce(
      h ->> 'cf-connecting-ip',
      h ->> 'x-real-ip',
      split_part(h ->> 'x-forwarded-for', ',', 1)
    )), '') as ip
    from (select coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json as h) headers
  ) req
  where ip is not null;
$$;
revoke execute on function public.request_ip_hash() from public, anon, authenticated;

-- one row per accepted guest action; nobody reads it but the guards
create table if not exists public.guest_hits (
  ip_hash text not null,
  kind text not null check (kind in ('booking', 'bug')),
  host_id uuid,
  created_date timestamptz not null default now()
);
create index if not exists guest_hits_lookup_idx on public.guest_hits (kind, ip_hash, created_date);
alter table public.guest_hits enable row level security;
revoke all on public.guest_hits from anon, authenticated;

-- ── 2. guest bookings carry what the booking form asks for ──────────────────
-- The page checks these too; this stops a direct API call skipping them.
create or replace function public.guard_guest_fields()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  e public.event_types;
begin
  if (select auth.uid()) is not distinct from new.host_id then
    return new;
  end if;
  select * into e from public.event_types where id = new.event_type_id;
  if not found then
    return new; -- guard_guest_booking() turns this away
  end if;

  if coalesce(trim(new.guest_name), '') = '' then
    raise exception 'Enter your name.' using errcode = 'P0001';
  end if;
  -- the page sends the WhatsApp number with its country code, e.g. +44 7700 900123
  if regexp_replace(coalesce(new.guest_phone, ''), '[^0-9+]', '', 'g') !~ '^\+[0-9]{7,15}$' then
    raise exception 'Enter your WhatsApp number with the country code.' using errcode = 'P0001';
  end if;
  new.guest_email := nullif(lower(trim(coalesce(new.guest_email, ''))), '');
  if new.guest_email is not null and new.guest_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address.' using errcode = 'P0001';
  end if;
  if e.email_required and new.guest_email is null then
    raise exception 'Enter your email address.' using errcode = 'P0001';
  end if;
  -- answers come in the questions' order: [{question, answer}, ...]
  if exists (
    select 1 from jsonb_array_elements(case when jsonb_typeof(e.custom_questions) = 'array' then e.custom_questions else '[]'::jsonb end)
      with ordinality q(v, i)
    where coalesce((q.v ->> 'required')::boolean, false)
      and coalesce(trim(new.custom_answers -> (q.i::int - 1) ->> 'answer'), '') = ''
  ) then
    raise exception 'Please answer the required questions.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_guest_fields() from public, anon, authenticated;

drop trigger if exists bookings_guard_fields on public.bookings;
create trigger bookings_guard_fields before insert on public.bookings
  for each row execute function public.guard_guest_fields();

-- ── 3. one guest can't fill a host's calendar ───────────────────────────────
-- As in 20261027130000_privacy_rate_limits.sql (3 an hour per phone or email with one host),
-- plus limits per network address, which a script can't simply make up: 3 an hour with one
-- host, 6 an hour and 20 a day in all.
create or replace function public.guard_guest_rate()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  phone text := nullif(regexp_replace(coalesce(new.guest_phone, ''), '[^0-9]', '', 'g'), '');
  email text := nullif(lower(trim(coalesce(new.guest_email, ''))), '');
  ip text := public.request_ip_hash();
begin
  if (select auth.uid()) is not distinct from new.host_id then
    return new;
  end if;
  if (
    select count(*) from public.bookings b
    where b.host_id = new.host_id
      and b.created_date > now() - interval '1 hour'
      and ((phone is not null and regexp_replace(coalesce(b.guest_phone, ''), '[^0-9]', '', 'g') = phone)
        or (email is not null and lower(trim(coalesce(b.guest_email, ''))) = email))
  ) >= 3 then
    raise exception 'Too many bookings right now. Please try again later.' using errcode = 'P0001';
  end if;
  if ip is not null then
    if (select count(*) filter (where h.host_id = new.host_id and h.created_date > now() - interval '1 hour') >= 3
            or count(*) filter (where h.created_date > now() - interval '1 hour') >= 6
            or count(*) >= 20
        from public.guest_hits h
        where h.kind = 'booking' and h.ip_hash = ip and h.created_date > now() - interval '1 day') then
      raise exception 'Too many bookings right now. Please try again later.' using errcode = 'P0001';
    end if;
    -- rolled back with the booking if a later check turns it away, so only real bookings count
    insert into public.guest_hits (ip_hash, kind, host_id) values (ip, 'booking', new.host_id);
    delete from public.guest_hits where created_date < now() - interval '1 day';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_guest_rate() from public, anon, authenticated;

-- ── 4. busy times: only for hosts with a public booking page ────────────────
-- Same rule as host_availability(); and no further ahead than any booking page can show.
create or replace function public.busy_times(p_host uuid, p_from timestamptz, p_to timestamptz)
returns table (event_type_id uuid, start_time timestamptz, end_time timestamptz, status text)
language sql stable security definer set search_path = '' as $$
  select b.event_type_id, b.start_time, b.end_time, b.status
  from public.bookings b
  where b.host_id = p_host
    and exists (select 1 from public.event_types e where e.created_by_id = p_host and e.active)
    and b.status <> 'cancelled' and b.approval_status <> 'declined'
    and b.end_time > greatest(p_from, now() - interval '1 day')
    and b.start_time < least(p_to, now() + interval '400 days');
$$;
revoke execute on function public.busy_times(uuid, timestamptz, timestamptz) from public;
grant execute on function public.busy_times(uuid, timestamptz, timestamptz) to anon, authenticated;

-- ── 5. bug reports: a few per signed-out sender, not one cap for all of them ─
create or replace function public.guard_bug_report()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  ip text := public.request_ip_hash();
begin
  new.user_id := uid;
  new.created_date := now();
  if uid is not null then
    if (select count(*) from public.bug_reports r
        where r.created_date > now() - interval '1 hour' and r.user_id = uid) >= 10 then
      raise exception 'Too many reports right now. Please try again later.' using errcode = 'P0001';
    end if;
  else
    if ip is not null and (select count(*) from public.guest_hits h
        where h.kind = 'bug' and h.ip_hash = ip and h.created_date > now() - interval '1 hour') >= 5 then
      raise exception 'Too many reports right now. Please try again later.' using errcode = 'P0001';
    end if;
    -- still a ceiling for all signed-out senders together, well above what one address can send
    if (select count(*) from public.bug_reports r
        where r.created_date > now() - interval '1 hour' and r.user_id is null) >= 300 then
      raise exception 'Too many reports right now. Please try again later.' using errcode = 'P0001';
    end if;
    if ip is not null then
      insert into public.guest_hits (ip_hash, kind) values (ip, 'bug');
    end if;
  end if;
  delete from public.bug_reports where created_date < now() - interval '30 days';
  return new;
end;
$$;
revoke execute on function public.guard_bug_report() from public, anon, authenticated;
