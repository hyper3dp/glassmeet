-- GlassMeet: guests can only book inside the host's working hours, on the 15-minute grid the
-- booking page offers; a guest booking's time zone is the host's; and default hours are seeded
-- once per host. Run after 20261026200000_booking_links.sql. Safe to run more than once.

-- ── 1. a host's open hours on one of their calendar days ───────────────────
-- Mirrors intervalsForDate() in src/lib/Availability.js: date-specific 'available' hours (with a
-- start and end) replace that weekday's rules (day_of_week 0 = Sunday) for the day; either set
-- is merged like mergeIntervals(). Every 'blocked' exception on
-- the day is then cut out (a missing start/end means the start/end of the day). Minutes from the
-- host's midnight; '24:00' ends at 1440.
create or replace function public.host_open_intervals(p_host uuid, p_day date)
returns table (start_min int, end_min int) language plpgsql stable security definer set search_path = '' as $$
declare
  custom boolean;
  starts int[] := '{}';
  ends int[] := '{}';
  next_starts int[];
  next_ends int[];
  r record;
  i int;
  bs int;
  be int;
begin
  custom := exists (
    select 1 from public.availability_exceptions x
    where x.created_by_id = p_host and x.date = p_day and x.type = 'available'
      and x.start_time is not null and x.end_time is not null
  );
  -- merge overlapping or touching ranges, like mergeIntervals()
  for r in
    select (extract(epoch from t.start_time) / 60)::int as s, (extract(epoch from t.end_time) / 60)::int as e
    from (
      select x.start_time, x.end_time from public.availability_exceptions x
      where custom and x.created_by_id = p_host and x.date = p_day and x.type = 'available'
        and x.start_time is not null and x.end_time is not null
      union all
      select a.start_time, a.end_time from public.availability_rules a
      where not custom and a.created_by_id = p_host and a.day_of_week = extract(dow from p_day)
    ) t
    order by 1
  loop
    if cardinality(starts) > 0 and r.s <= ends[cardinality(ends)] then
      ends[cardinality(ends)] := greatest(ends[cardinality(ends)], r.e);
    else
      starts := starts || r.s;
      ends := ends || r.e;
    end if;
  end loop;

  -- cut out each blocked range, like subtractInterval()
  for r in
    select x.start_time, x.end_time from public.availability_exceptions x
    where x.created_by_id = p_host and x.date = p_day and x.type = 'blocked'
  loop
    bs := coalesce((extract(epoch from r.start_time) / 60)::int, 0);
    be := coalesce((extract(epoch from r.end_time) / 60)::int, 1440);
    next_starts := '{}';
    next_ends := '{}';
    for i in 1 .. coalesce(cardinality(starts), 0) loop
      if be <= starts[i] or bs >= ends[i] then
        next_starts := next_starts || starts[i];
        next_ends := next_ends || ends[i];
      else
        if bs > starts[i] then
          next_starts := next_starts || starts[i];
          next_ends := next_ends || bs;
        end if;
        if be < ends[i] then
          next_starts := next_starts || be;
          next_ends := next_ends || ends[i];
        end if;
      end if;
    end loop;
    starts := next_starts;
    ends := next_ends;
  end loop;

  for i in 1 .. coalesce(cardinality(starts), 0) loop
    start_min := starts[i];
    end_min := ends[i];
    return next;
  end loop;
end;
$$;
revoke execute on function public.host_open_intervals(uuid, date) from public, anon, authenticated;

-- ── 2. guests book only times the booking page would offer ─────────────────
-- generateSlots() steps 15 minutes from each open range's start and needs the whole meeting
-- inside that range on one host day. A host adding their own booking is trusted.
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

drop trigger if exists bookings_guard_hours on public.bookings;
create trigger bookings_guard_hours before insert on public.bookings
  for each row execute function public.guard_booking_hours();

-- ── 3. default hours are seeded once, so a host can turn every day off ──────
alter table public.profiles add column if not exists hours_seeded boolean not null default false;

-- hosts who already have hours or events were seeded (or set up) before: never seed them again
update public.profiles p set hours_seeded = true
where not p.hours_seeded
  and (exists (select 1 from public.availability_rules r where r.created_by_id = p.id)
    or exists (select 1 from public.event_types e where e.created_by_id = p.id));
