-- GlassMeet: when an event type runs. Run after 20261026120000_private_links.sql. Safe to run more than once.
--   schedule 'weekly': repeats every week on `days` (0 = Sunday; null = every day with hours),
--                      optionally only from start_date to end_date
--   schedule 'dates':  only on the listed `dates`
-- Hours on each day still come from the host's availability. Booking pages read these through
-- public_event_type(), which already returns every public column.

alter table public.event_types
  add column if not exists schedule text not null default 'weekly',
  add column if not exists days smallint[],
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists dates date[];

alter table public.event_types drop constraint if exists event_types_schedule_check;
alter table public.event_types add constraint event_types_schedule_check
  check (schedule in ('weekly', 'dates'));

alter table public.event_types drop constraint if exists event_types_days_check;
alter table public.event_types add constraint event_types_days_check
  check (days is null or days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]);

alter table public.event_types drop constraint if exists event_types_date_range_check;
alter table public.event_types add constraint event_types_date_range_check
  check (start_date is null or end_date is null or end_date >= start_date);

alter table public.event_types drop constraint if exists event_types_dates_check;
alter table public.event_types add constraint event_types_dates_check
  check (schedule <> 'dates' or cardinality(dates) between 1 and 366);

-- ── guest bookings follow the event's dates ─────────────────────────────────
-- Same as 20261026090000_hardening.sql, plus: the booking window ends at the event's own end
-- (specific dates, or an end date) instead of max_future_days, and the meeting must start on a
-- day the event runs, on the host's calendar (as the booking page's eventRunsOn() checks).
create or replace function public.guard_guest_booking()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  e public.event_types;
  overlapping int;
  joined int;
  host_day date;
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

  -- min_notice is in hours, max_future_days in days (as the booking page uses them); an event
  -- with its own end is bookable up to that end
  if new.start_time < now() + make_interval(hours => coalesce(e.min_notice, 0))
     or (e.schedule <> 'dates' and e.end_date is null
         and new.start_time > now() + make_interval(days => coalesce(e.max_future_days, 60) + 1)) then
    raise exception 'That time can no longer be booked.' using errcode = 'P0001';
  end if;

  host_day := (new.start_time at time zone coalesce(nullif(e.host_timezone, ''), 'UTC'))::date;
  if (e.schedule = 'dates' and not (host_day = any (coalesce(e.dates, '{}'))))
     or (e.schedule <> 'dates' and (
          host_day < e.start_date or host_day > e.end_date
          or (cardinality(e.days) > 0 and not (extract(dow from host_day)::smallint = any (e.days))))) then
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