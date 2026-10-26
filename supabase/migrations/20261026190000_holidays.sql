-- GlassMeet: public holidays a host can block with one switch. Run after
-- 20261026170000_repeat_templates.sql. Safe to run more than once.

-- ── 1. holiday dates, one row per day off ───────────────────────────────────
create table if not exists public.holidays (
  region text not null,
  date date not null,
  name text not null,
  primary key (region, date)
);
alter table public.holidays enable row level security;
drop policy if exists holidays_read on public.holidays;
create policy holidays_read on public.holidays for select to anon, authenticated using (true);
grant select on public.holidays to anon, authenticated;

-- the region whose holidays the host blocks (null = off)
alter table public.profiles add column if not exists holidays text;
alter table public.profiles drop constraint if exists profiles_holidays_check;
alter table public.profiles add constraint profiles_holidays_check check (holidays in ('ae'));

-- UAE public holidays. Islamic dates follow the moon and are expected dates: when the official
-- date moves, update the row's date here (hosts with a booking on the new date are notified).
insert into public.holidays (region, date, name) values
  ('ae', '2026-01-01', 'New Year''s Day'),
  ('ae', '2026-03-20', 'Eid al-Fitr'),
  ('ae', '2026-03-21', 'Eid al-Fitr'),
  ('ae', '2026-03-22', 'Eid al-Fitr'),
  ('ae', '2026-05-26', 'Arafat Day'),
  ('ae', '2026-05-27', 'Eid al-Adha'),
  ('ae', '2026-05-28', 'Eid al-Adha'),
  ('ae', '2026-05-29', 'Eid al-Adha'),
  ('ae', '2026-06-16', 'Islamic New Year'),
  ('ae', '2026-08-25', 'Prophet''s Birthday'),
  ('ae', '2026-12-01', 'Commemoration Day'),
  ('ae', '2026-12-02', 'National Day'),
  ('ae', '2026-12-03', 'National Day'),
  ('ae', '2027-01-01', 'New Year''s Day'),
  ('ae', '2027-03-10', 'Eid al-Fitr'),
  ('ae', '2027-03-11', 'Eid al-Fitr'),
  ('ae', '2027-03-12', 'Eid al-Fitr'),
  ('ae', '2027-05-15', 'Arafat Day'),
  ('ae', '2027-05-16', 'Eid al-Adha'),
  ('ae', '2027-05-17', 'Eid al-Adha'),
  ('ae', '2027-05-18', 'Eid al-Adha'),
  ('ae', '2027-06-06', 'Islamic New Year'),
  ('ae', '2027-08-15', 'Prophet''s Birthday'),
  ('ae', '2027-12-01', 'Commemoration Day'),
  ('ae', '2027-12-02', 'National Day'),
  ('ae', '2027-12-03', 'National Day'),
  ('ae', '2028-01-01', 'New Year''s Day'),
  ('ae', '2028-02-26', 'Eid al-Fitr'),
  ('ae', '2028-02-27', 'Eid al-Fitr'),
  ('ae', '2028-02-28', 'Eid al-Fitr'),
  ('ae', '2028-05-04', 'Arafat Day'),
  ('ae', '2028-05-05', 'Eid al-Adha'),
  ('ae', '2028-05-06', 'Eid al-Adha'),
  ('ae', '2028-05-07', 'Eid al-Adha'),
  ('ae', '2028-05-25', 'Islamic New Year'),
  ('ae', '2028-08-03', 'Prophet''s Birthday'),
  ('ae', '2028-12-01', 'Commemoration Day'),
  ('ae', '2028-12-02', 'National Day'),
  ('ae', '2028-12-03', 'National Day')
on conflict (region, date) do update set name = excluded.name;

-- ── 2. booking pages read a host's holidays without reading their profile ───
create or replace function public.host_holidays(p_host uuid)
returns table (date date, name text) language sql stable security definer set search_path = '' as $$
  select h.date, h.name
  from public.holidays h
  join public.profiles p on p.holidays = h.region
  where p.id = p_host and h.date >= current_date - 1
  order by h.date;
$$;
revoke execute on function public.host_holidays(uuid) from public;
grant execute on function public.host_holidays(uuid) to anon, authenticated;

-- ── 3. guests can't book a holiday (the host can still add their own) ───────
create or replace function public.guard_holiday_booking()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  tz text;
begin
  if (select auth.uid()) is not distinct from new.host_id then
    return new;
  end if;
  select coalesce(nullif(e.host_timezone, ''), 'UTC') into tz from public.event_types e where e.id = new.event_type_id;
  if exists (
    select 1 from public.holidays h
    join public.profiles p on p.holidays = h.region
    where p.id = new.host_id and h.date = (new.start_time at time zone coalesce(tz, 'UTC'))::date
  ) then
    raise exception 'That time can no longer be booked.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_holiday_booking() from public, anon, authenticated;

drop trigger if exists bookings_guard_holiday on public.bookings;
create trigger bookings_guard_holiday before insert on public.bookings
  for each row execute function public.guard_holiday_booking();

-- ── 4. a holiday that moves onto a booked day tells the host ────────────────
create or replace function public.notify_holiday_clash()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (created_by_id, type, title, message, link)
  select b.host_id, 'holiday_clash', 'Booking on ' || new.name,
    coalesce(nullif(b.guest_name, ''), 'A guest') || ' is booked on ' || to_char(new.date, 'Dy DD Mon') || '. Keep or cancel it?',
    '/availability?holidays=review'
  from public.bookings b
  join public.profiles p on p.id = b.host_id and p.holidays = new.region
  where b.status <> 'cancelled' and b.approval_status <> 'declined' and b.start_time > now()
    and (b.start_time at time zone coalesce(nullif(p.timezone, ''), 'UTC'))::date = new.date;
  return null;
end;
$$;
revoke execute on function public.notify_holiday_clash() from public, anon, authenticated;

drop trigger if exists holidays_notify on public.holidays;
create trigger holidays_notify after insert or update of date on public.holidays
  for each row execute function public.notify_holiday_clash();
