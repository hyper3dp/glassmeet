-- GlassMeet: options for the new event form. An internal note only the host sees, a limit on
-- meetings per day, and notice counted in minutes (so "30 minutes" can be saved). min_notice was
-- in hours; every event held 0 when this was written, so no stored value needs converting.
-- Run after 20261102120000_booking_emails.sql. Safe to run more than once.

alter table public.event_types
  add column if not exists note text,
  add column if not exists max_per_day integer;

alter table public.event_types drop constraint if exists event_types_note_len;
alter table public.event_types add constraint event_types_note_len
  check (note is null or char_length(note) <= 2000);

alter table public.event_types drop constraint if exists event_types_max_per_day_check;
alter table public.event_types add constraint event_types_max_per_day_check
  check (max_per_day is null or max_per_day between 1 and 100);

-- What guests may read: never the host's note, link or email, and never an email saved as a name
create or replace function public.public_event_type(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select (to_jsonb(e) - 'meeting_url' - 'host_email' - 'note')
    || case when e.host_name like '%@%' then jsonb_build_object('host_name', null) else '{}'::jsonb end
  from public.event_types e
  where e.id = p_id and e.active;
$$;
revoke execute on function public.public_event_type(uuid) from public;
grant execute on function public.public_event_type(uuid) to anon, authenticated;

-- Same as 20261026170000_repeat_templates.sql, plus: notice is in minutes, and a full day turns
-- away a new meeting (joining an existing group time doesn't add a meeting)
create or replace function public.guard_guest_booking()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  e public.event_types;
  overlapping int;
  joined int;
  tz text;
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

  -- min_notice is in minutes, max_future_days in days (as the booking page uses them); an event
  -- with its own end is bookable up to that end
  if new.start_time < now() + make_interval(mins => coalesce(e.min_notice, 0))
     or (e.schedule <> 'dates' and e.end_date is null
         and new.start_time > now() + make_interval(days => coalesce(e.max_future_days, 60) + 1)) then
    raise exception 'That time can no longer be booked.' using errcode = 'P0001';
  end if;

  -- the meeting starts on a day the event runs, on the host's calendar
  tz := coalesce(nullif(e.host_timezone, ''), 'UTC');
  if not public.event_runs_on(e, (new.start_time at time zone tz)::date) then
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

  if e.max_per_day is not null
     and not exists (
       select 1 from public.bookings b
       where b.event_type_id = e.id and b.start_time = new.start_time
         and b.status <> 'cancelled' and b.approval_status <> 'declined')
     and (select count(distinct b.start_time) from public.bookings b
          where b.event_type_id = e.id
            and b.status <> 'cancelled' and b.approval_status <> 'declined'
            and (b.start_time at time zone tz)::date = (new.start_time at time zone tz)::date) >= e.max_per_day then
    raise exception 'That day is fully booked.' using errcode = 'P0001';
  end if;

  if (select count(*) from public.bookings
      where host_id = new.host_id and created_date > now() - interval '1 hour') >= 30 then
    raise exception 'Too many bookings right now. Please try again later.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;
revoke execute on function public.guard_guest_booking() from public, anon, authenticated;
