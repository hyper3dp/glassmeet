-- GlassMeet: meeting links stay private until someone books, and calendar-feed links are
-- made by the server. Run after 20261026090000_hardening.sql. Safe to run more than once.

-- ── 1. public booking pages read events through a function without private fields ──
-- Before, anyone could read event_types directly, including the meeting link (and host email)
-- before booking. Now only the owner reads the table; booking pages get the public fields.
create or replace function public.public_event_type(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select to_jsonb(e) - 'meeting_url' - 'host_email'
  from public.event_types e
  where e.id = p_id and e.active;
$$;
revoke execute on function public.public_event_type(uuid) from public;
grant execute on function public.public_event_type(uuid) to anon, authenticated;

drop policy if exists event_types_read on public.event_types;
create policy event_types_read on public.event_types for select to authenticated
  using ((select auth.uid()) = created_by_id);

-- The guest insert policy checked event_types as the guest, who can no longer read it; the
-- same check now runs in a function that can.
create or replace function public.event_accepts_booking(p_event uuid, p_host uuid, p_approval text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.event_types e
    where e.id = p_event and e.active and e.created_by_id = p_host
      and (not e.requires_approval or p_approval = 'pending')
  );
$$;
revoke execute on function public.event_accepts_booking(uuid, uuid, text) from public;
grant execute on function public.event_accepts_booking(uuid, uuid, text) to anon, authenticated;

drop policy if exists bookings_insert_guest on public.bookings;
create policy bookings_insert_guest on public.bookings for insert to anon, authenticated
  with check (public.event_accepts_booking(event_type_id, host_id, approval_status));

-- ── 2. the guest gets the meeting link once booked ──────────────────────────
-- Only someone who knows the booking id (the guest who just made it, or the host) can ask,
-- only for a confirmed, approved booking, and only for a day after it was made.
-- Requests waiting for approval get the link when the host confirms on WhatsApp.
create or replace function public.booking_meeting_link(p_booking uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(b.meeting_url, ''), e.meeting_url)
  from public.bookings b
  left join public.event_types e on e.id = b.event_type_id
  where b.id = p_booking
    and b.status = 'confirmed' and b.approval_status = 'approved'
    and b.created_date > now() - interval '1 day';
$$;
revoke execute on function public.booking_meeting_link(uuid) from public;
grant execute on function public.booking_meeting_link(uuid) to anon, authenticated;

-- ── 3. calendar-feed links are random values made by the server ─────────────
-- Before, "Reset link" generated the new token in the browser and saved whatever it was sent.
create or replace function public.rotate_cal_feed()
returns text language plpgsql security definer set search_path = '' as $$
declare
  fresh text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  insert into public.cal_feeds (owner, token, rotated_at)
  values ((select auth.uid()), fresh, now())
  on conflict (owner) do update set token = excluded.token, rotated_at = excluded.rotated_at;
  return fresh;
end;
$$;
revoke execute on function public.rotate_cal_feed() from public, anon;
grant execute on function public.rotate_cal_feed() to authenticated;

-- signed-in users may create their own feed row (the token comes from the column default)
-- but can no longer write a token themselves
drop policy if exists cal_feeds_update_own on public.cal_feeds;
revoke insert, update on public.cal_feeds from authenticated;
grant insert (owner) on public.cal_feeds to authenticated;
