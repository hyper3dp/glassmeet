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
