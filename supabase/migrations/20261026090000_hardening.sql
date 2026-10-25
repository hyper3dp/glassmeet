-- GlassMeet hardening: server-side booking rules, private busy times, storage limits and
-- tighter grants. Safe to run more than once.

-- ── 1. guest bookings are checked and normalised by the database ────────────
-- The public booking page can be bypassed (anyone can call the API with the publishable key),
-- so the rules the page applies are enforced here too: the time must still be bookable
-- (notice period, booking window, no overlap with buffers, group capacity), a guest can't set
-- status, approval, meeting link or length, and one host can't be flooded.
create or replace function public.guard_guest_booking()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  e public.event_types;
  overlapping int;
  joined int;
begin
  -- a host adding a booking to their own calendar is trusted
  if (select auth.uid()) is not distinct from new.host_id then
    return new;
  end if;

  select * into e from public.event_types where id = new.event_type_id and active;
  if not found or e.created_by_id <> new.host_id then
    raise exception 'This event is not taking bookings.' using errcode = 'P0001';
  end if;

  new.end_time        := new.start_time + make_interval(mins => e.duration);
  new.event_name      := e.name;
  new.meeting_url     := e.meeting_url;
  new.notes           := null;
  new.status          := 'confirmed';
  new.approval_status := case when e.requires_approval then 'pending' else 'approved' end;
  new.attendee_count  := 1;
  new.created_date    := now();
  new.updated_date    := now();

  -- min_notice is in hours, max_future_days in days (as the booking page uses them)
  if new.start_time < now() + make_interval(hours => coalesce(e.min_notice, 0))
     or new.start_time > now() + make_interval(days => coalesce(e.max_future_days, 60) + 1) then
    raise exception 'That time can no longer be booked.' using errcode = 'P0001';
  end if;

  -- one booking decision at a time per host, so two guests can't take the same slot at once
  perform pg_advisory_xact_lock(hashtextextended(new.host_id::text, 0));

  -- Buffers may overlap each other but never a meeting: the new meeting stays out of the
  -- buffers of this event's existing bookings, and its own buffers stay clear of any meeting.
  -- A group event's booking that isn't full only lets guests join at exactly its start.
  select count(*) into overlapping
  from public.bookings b
  where b.host_id = new.host_id
    and b.status <> 'cancelled' and b.approval_status <> 'declined'
    and not (e.booking_type = 'group' and b.event_type_id is not distinct from e.id and b.start_time = new.start_time)
    and (
      tstzrange(new.start_time - make_interval(mins => e.buffer_before), new.end_time + make_interval(mins => e.buffer_after))
        && tstzrange(b.start_time, b.end_time)
      or (b.event_type_id is not distinct from e.id
          and tstzrange(b.start_time - make_interval(mins => e.buffer_before), b.end_time + make_interval(mins => e.buffer_after))
            && tstzrange(new.start_time, new.end_time))
    );
  if overlapping > 0 then
    raise exception 'Sorry, that time was just taken.' using errcode = 'P0001';
  end if;

  if e.booking_type = 'group' then
    select count(*) into joined from public.bookings
    where event_type_id = e.id and start_time = new.start_time
      and status <> 'cancelled' and approval_status <> 'declined';
    if joined >= greatest(e.max_attendees, 1) then
      raise exception 'Sorry, that time is full.' using errcode = 'P0001';
    end if;
  end if;

  if (select count(*) from public.bookings
      where host_id = new.host_id and created_date > now() - interval '1 hour') >= 30 then
    raise exception 'Too many bookings right now. Please try again later.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;
revoke execute on function public.guard_guest_booking() from public, anon, authenticated;

drop trigger if exists bookings_guard on public.bookings;
create trigger bookings_guard before insert on public.bookings
  for each row execute function public.guard_guest_booking();

-- size limits on what guests type
alter table public.bookings drop constraint if exists bookings_guest_name_len;
alter table public.bookings add constraint bookings_guest_name_len check (char_length(guest_name) between 1 and 120);
alter table public.bookings drop constraint if exists bookings_guest_email_len;
alter table public.bookings add constraint bookings_guest_email_len check (guest_email is null or char_length(guest_email) <= 254);
alter table public.bookings drop constraint if exists bookings_guest_phone_len;
alter table public.bookings add constraint bookings_guest_phone_len check (guest_phone is null or char_length(guest_phone) <= 32);
alter table public.bookings drop constraint if exists bookings_guest_notes_len;
alter table public.bookings add constraint bookings_guest_notes_len check (char_length(coalesce(guest_notes, '')) <= 2000);
alter table public.bookings drop constraint if exists bookings_answers_size;
alter table public.bookings add constraint bookings_answers_size check (pg_column_size(custom_answers) <= 16384);
alter table public.bookings drop constraint if exists bookings_attendees_pos;
alter table public.bookings add constraint bookings_attendees_pos check (attendee_count >= 1);

-- ── 2. busy times: one host and a date range, times only ────────────────────
-- The busy_slots view let anyone list every host's meeting times at once.
create or replace function public.busy_times(p_host uuid, p_from timestamptz, p_to timestamptz)
returns table (event_type_id uuid, start_time timestamptz, end_time timestamptz, status text)
language sql stable security definer set search_path = '' as $$
  select b.event_type_id, b.start_time, b.end_time, b.status
  from public.bookings b
  where b.host_id = p_host
    and b.status <> 'cancelled' and b.approval_status <> 'declined'
    and b.end_time > greatest(p_from, now() - interval '1 day')
    and b.start_time < least(p_to, now() + interval '800 days');
$$;
revoke execute on function public.busy_times(uuid, timestamptz, timestamptz) from public;
grant execute on function public.busy_times(uuid, timestamptz, timestamptz) to anon, authenticated;
revoke select on public.busy_slots from anon, authenticated;

-- ── 3. event types: only switched-on ones are public ────────────────────────
drop policy if exists event_types_read on public.event_types;
create policy event_types_read on public.event_types for select to anon, authenticated
  using (active or (select auth.uid()) = created_by_id);

-- ── 4. sane values ──────────────────────────────────────────────────────────
alter table public.availability_rules drop constraint if exists availability_rules_order;
alter table public.availability_rules add constraint availability_rules_order check (end_time > start_time);
alter table public.availability_exceptions drop constraint if exists availability_exceptions_order;
alter table public.availability_exceptions add constraint availability_exceptions_order
  check (start_time is null or end_time is null or end_time > start_time);
alter table public.event_types drop constraint if exists event_types_buffers;
alter table public.event_types add constraint event_types_buffers
  check (buffer_before between 0 and 1440 and buffer_after between 0 and 1440);
alter table public.event_types drop constraint if exists event_types_window;
alter table public.event_types add constraint event_types_window
  check (min_notice >= 0 and max_future_days between 1 and 730);
alter table public.event_types drop constraint if exists event_types_price;
alter table public.event_types add constraint event_types_price check (price >= 0);
alter table public.event_types drop constraint if exists event_types_capacity;
alter table public.event_types add constraint event_types_capacity check (max_attendees between 1 and 1000);

-- calendar feed tokens are long random hex (the app makes 48 characters)
alter table public.cal_feeds drop constraint if exists cal_feeds_token_fmt;
alter table public.cal_feeds add constraint cal_feeds_token_fmt check (token ~ '^[a-f0-9]{48}$');

-- ── 5. profile photos: images only, 5 MB ────────────────────────────────────
update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
where id = 'avatars';

-- ── 6. profiles: deleting a user removes their profile; tidy policies ───────
alter table public.profiles drop constraint if exists profiles_id_fkey;
alter table public.profiles add constraint profiles_id_fkey
  foreign key (id) references auth.users (id) on delete cascade;

drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- the sign-up trigger already uses schema-qualified names; pin its search path
alter function public.handle_new_user() set search_path = '';
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ── 7. grants nobody needs ──────────────────────────────────────────────────
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
revoke insert, update, delete on public.profiles from anon;
