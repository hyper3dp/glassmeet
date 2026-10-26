-- GlassMeet: how often an event repeats, and event templates. Run after
-- 20261026150000_event_dates.sql. Safe to run more than once.

-- ── 1. repeat every N days, weeks or months ─────────────────────────────────
-- freq/every apply to schedule 'weekly' (the repeating schedule). Counting starts at start_date:
--   day:   every `every` days
--   week:  on `days`, every `every` weeks (weeks start on Sunday)
--   month: on start_date's day of the month (the last day in shorter months), every `every` months
alter table public.event_types
  add column if not exists freq text not null default 'week',
  add column if not exists every smallint not null default 1;

alter table public.event_types drop constraint if exists event_types_freq_check;
alter table public.event_types add constraint event_types_freq_check
  check (freq in ('day', 'week', 'month'));
alter table public.event_types drop constraint if exists event_types_every_check;
alter table public.event_types add constraint event_types_every_check
  check (every between 1 and 52);
-- counting needs a first date
alter table public.event_types drop constraint if exists event_types_repeat_start_check;
alter table public.event_types add constraint event_types_repeat_start_check
  check (schedule = 'dates' or (freq = 'week' and every = 1) or start_date is not null);

-- Whether an event runs on a day of the host's calendar; mirrors eventRunsOn() in
-- src/lib/Availability.js.
create or replace function public.event_runs_on(e public.event_types, d date)
returns boolean language sql immutable set search_path = '' as $$
  select case
    when e.schedule = 'dates' then d = any (coalesce(e.dates, '{}'))
    when d < e.start_date or d > e.end_date then false
    when e.freq = 'day' then e.start_date is null or (d - e.start_date) % e.every = 0
    when e.freq = 'month' then e.start_date is not null
      and ((extract(year from d) - extract(year from e.start_date)) * 12
           + extract(month from d) - extract(month from e.start_date))::int % e.every = 0
      and extract(day from d) = least(extract(day from e.start_date),
                                      extract(day from (date_trunc('month', d) + interval '1 month - 1 day')))
    else (coalesce(cardinality(e.days), 0) = 0 or extract(dow from d)::smallint = any (e.days))
      and (e.every = 1 or e.start_date is null
           or (((d - extract(dow from d)::int) - (e.start_date - extract(dow from e.start_date)::int)) / 7) % e.every = 0)
  end;
$$;
revoke execute on function public.event_runs_on(public.event_types, date) from public, anon, authenticated;

-- guest bookings: same as 20261026150000_event_dates.sql, with the day check moved into
-- event_runs_on() so it covers the repeat rules too
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

  -- min_notice is in hours, max_future_days in days (as the booking page uses them); an event
  -- with its own end is bookable up to that end
  if new.start_time < now() + make_interval(hours => coalesce(e.min_notice, 0))
     or (e.schedule <> 'dates' and e.end_date is null
         and new.start_time > now() + make_interval(days => coalesce(e.max_future_days, 60) + 1)) then
    raise exception 'That time can no longer be booked.' using errcode = 'P0001';
  end if;

  -- the meeting starts on a day the event runs, on the host's calendar
  if not public.event_runs_on(e, (new.start_time at time zone coalesce(nullif(e.host_timezone, ''), 'UTC'))::date) then
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

-- ── 2. event templates (each host's own; the built-in ones live in the app) ─
create table if not exists public.event_templates (
  id uuid primary key default gen_random_uuid(),
  created_by_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  data jsonb not null default '{}'::jsonb,
  created_date timestamptz not null default now()
);
create index if not exists event_templates_owner_idx on public.event_templates (created_by_id);
alter table public.event_templates enable row level security;
drop policy if exists event_templates_own on public.event_templates;
create policy event_templates_own on public.event_templates for all to authenticated
  using ((select auth.uid()) = created_by_id) with check ((select auth.uid()) = created_by_id);
grant select, insert, update, delete on public.event_templates to authenticated;
