-- GlassMeet: booking pages read a host's hours through a function instead of the tables (which
-- exposed every host's date-specific labels, like "Hospital"), one guest can't fill a host's
-- calendar, holiday-clash notices use the event's zone, and the calendar feed can read
-- holidays. Run after 20261027120000_fixed_times.sql. Safe to run more than once.

-- ── 1. a host's hours for their booking pages, without private labels ───────
-- Only for hosts with an active event type: the same people whose booking pages are public.
create or replace function public.host_availability(p_host uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'rules', coalesce((
      select jsonb_agg(jsonb_build_object('day_of_week', r.day_of_week, 'start_time', r.start_time, 'end_time', r.end_time))
      from public.availability_rules r where r.created_by_id = p_host
    ), '[]'::jsonb),
    'exceptions', coalesce((
      select jsonb_agg(jsonb_build_object('date', x.date, 'type', x.type, 'start_time', x.start_time, 'end_time', x.end_time))
      from public.availability_exceptions x where x.created_by_id = p_host and x.date >= current_date - 1
    ), '[]'::jsonb)
  )
  where exists (select 1 from public.event_types e where e.created_by_id = p_host and e.active);
$$;
revoke execute on function public.host_availability(uuid) from public;
grant execute on function public.host_availability(uuid) to anon, authenticated;

-- hosts read and change only their own rows now
drop policy if exists availability_rules_read on public.availability_rules;
create policy availability_rules_read on public.availability_rules for select to authenticated
  using ((select auth.uid()) = created_by_id);
drop policy if exists availability_exceptions_read on public.availability_exceptions;
create policy availability_exceptions_read on public.availability_exceptions for select to authenticated
  using ((select auth.uid()) = created_by_id);

-- ── 2. one guest can't fill a host's calendar ───────────────────────────────
-- On top of the per-host cap in guard_guest_booking(): at most 3 bookings an hour with one host
-- from the same WhatsApp number or email. A host adding their own booking is trusted.
create index if not exists bookings_host_created_idx on public.bookings (host_id, created_date);

create or replace function public.guard_guest_rate()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  phone text := nullif(regexp_replace(coalesce(new.guest_phone, ''), '[^0-9]', '', 'g'), '');
  email text := nullif(lower(trim(coalesce(new.guest_email, ''))), '');
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
  return new;
end;
$$;
revoke execute on function public.guard_guest_rate() from public, anon, authenticated;

drop trigger if exists bookings_guard_rate on public.bookings;
create trigger bookings_guard_rate before insert on public.bookings
  for each row execute function public.guard_guest_rate();

-- ── 3. holiday-clash notices use the zone the booking checks use ────────────
create or replace function public.notify_holiday_clash()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (created_by_id, type, title, message, link)
  select b.host_id, 'holiday_clash', 'Booking on ' || new.name,
    coalesce(nullif(b.guest_name, ''), 'A guest') || ' is booked on ' || to_char(new.date, 'Dy DD Mon') || '. Keep or cancel it?',
    '/availability?holidays=review'
  from public.bookings b
  join public.profiles p on p.id = b.host_id and p.holidays = new.region
  left join public.event_types e on e.id = b.event_type_id
  where b.status <> 'cancelled' and b.approval_status <> 'declined' and b.start_time > now()
    and (b.start_time at time zone coalesce(nullif(e.host_timezone, ''), nullif(p.timezone, ''), 'UTC'))::date = new.date;
  return null;
end;
$$;
revoke execute on function public.notify_holiday_clash() from public, anon, authenticated;

-- ── 4. the calendar feed (service role) reads holidays ──────────────────────
grant select on public.holidays to service_role;
