-- GlassMeet: event types can run at fixed start times ("3:00pm every Tuesday") instead of any
-- free time inside the host's hours. Run after 20261026210000_booking_hours_guard.sql.
-- Safe to run more than once.

-- ── 1. the start times, "HH:MM" in the host's zone; null or empty: use the host's hours ──
alter table public.event_types add column if not exists fixed_times text[];

alter table public.event_types drop constraint if exists event_types_fixed_times_format;
alter table public.event_types add constraint event_types_fixed_times_format check (
  fixed_times is null or (
    cardinality(fixed_times) <= 48
    and array_to_string(fixed_times, ',') ~ '^([01][0-9]|2[0-3]):[0-5][0-9](,([01][0-9]|2[0-3]):[0-5][0-9])*$'
  )
);

-- ── 2. guests book only times the booking page would offer ─────────────────
-- Mirrors generateSlots() in src/lib/Availability.js. With fixed times, the start must be one
-- of them and the meeting must stay clear of time blocked off that day (fixedStartsForDate());
-- the weekly hours don't apply. Otherwise: the 15-minute grid inside the host's open hours.
-- A host adding their own booking is trusted.
create or replace function public.guard_booking_hours()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  e public.event_types;
  tz text;
  local_start timestamp;
  host_day date;
  m numeric;
begin
  if (select auth.uid()) is not distinct from new.host_id then
    return new;
  end if;

  select * into e from public.event_types where id = new.event_type_id;
  if not found then
    raise exception 'This event is not taking bookings.' using errcode = 'P0001';
  end if;

  -- the guest's own zone is untrusted: notifications show the time in the host's zone
  tz := coalesce(nullif(e.host_timezone, ''), 'UTC');
  new.timezone := tz;

  local_start := new.start_time at time zone tz;
  host_day := local_start::date;
  m := extract(epoch from local_start - host_day::timestamp) / 60;

  if coalesce(cardinality(e.fixed_times), 0) > 0 then
    if m <> trunc(m)
      or not (to_char(local_start, 'HH24:MI') = any (e.fixed_times))
      or m + e.duration > 1440
      or exists (
        select 1 from public.availability_exceptions x
        where x.created_by_id = new.host_id and x.date = host_day and x.type = 'blocked'
          and m < coalesce((extract(epoch from x.end_time) / 60)::int, 1440)
          and coalesce((extract(epoch from x.start_time) / 60)::int, 0) < m + e.duration
      )
    then
      raise exception 'That time can no longer be booked.' using errcode = 'P0001';
    end if;
    return new;
  end if;

  if not exists (
    select 1 from public.host_open_intervals(new.host_id, host_day) iv
    where m = trunc(m)
      and m >= iv.start_min
      and m + e.duration <= iv.end_min
      and mod(m::int - iv.start_min, 15) = 0
  ) then
    raise exception 'That time can no longer be booked.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;
revoke execute on function public.guard_booking_hours() from public, anon, authenticated;
