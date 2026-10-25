-- GlassMeet core schema: event types, availability, bookings, WhatsApp settings, notifications.
-- Column names match what the web app reads and writes (src/lib/localApi.js maps entity → table).
-- Ownership defaults to the signed-in user, so the app never has to send it.
-- Guests book without an account: they may read event types and availability, create a booking
-- for an active event, and see only busy times (busy_slots view), never other guests' details.

-- ── event types ─────────────────────────────────────────────────────────────
create table if not exists public.event_types (
  id uuid primary key default gen_random_uuid(),
  created_by_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  description text,
  duration integer not null default 30 check (duration between 5 and 1440),
  location text,
  meeting_url text,
  booking_type text not null default 'one_on_one' check (booking_type in ('one_on_one', 'group')),
  max_attendees integer not null default 1 check (max_attendees >= 1),
  active boolean not null default true,
  requires_approval boolean not null default false,
  host_name text,
  host_email text,
  host_photo text,
  host_timezone text,
  color text,
  buffer_before integer not null default 0,
  buffer_after integer not null default 0,
  max_future_days integer not null default 60,
  min_notice integer not null default 0,
  custom_questions jsonb not null default '[]'::jsonb,
  price numeric(10, 2) not null default 0,
  currency text not null default 'USD',
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
create index if not exists event_types_created_by_idx on public.event_types (created_by_id);

-- ── weekly availability ─────────────────────────────────────────────────────
create table if not exists public.availability_rules (
  id uuid primary key default gen_random_uuid(),
  created_by_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  created_date timestamptz not null default now()
);
create index if not exists availability_rules_created_by_idx on public.availability_rules (created_by_id);

-- ── date-specific hours ─────────────────────────────────────────────────────
create table if not exists public.availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  created_by_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  type text not null default 'blocked' check (type in ('blocked', 'available')),
  start_time time,
  end_time time,
  label text,
  created_date timestamptz not null default now()
);
create index if not exists availability_exceptions_created_by_idx on public.availability_exceptions (created_by_id, date);

-- ── bookings ────────────────────────────────────────────────────────────────
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users (id) on delete cascade,
  event_type_id uuid references public.event_types (id) on delete set null,
  event_name text,
  guest_name text not null,
  guest_email text not null,
  guest_phone text,
  guest_notes text,
  notes text,
  start_time timestamptz not null,
  end_time timestamptz not null,
  timezone text,
  meeting_url text,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled', 'completed')),
  approval_status text not null default 'approved' check (approval_status in ('approved', 'pending', 'declined')),
  custom_answers jsonb not null default '[]'::jsonb,
  attendee_count integer not null default 1,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  check (end_time > start_time)
);
create index if not exists bookings_host_start_idx on public.bookings (host_id, start_time);
create index if not exists bookings_event_type_idx on public.bookings (event_type_id);

-- Busy times only, for public booking pages (no guest details). Owned by postgres, so it
-- reads past bookings RLS on purpose; it exposes nothing but times and status.
create or replace view public.busy_slots as
  select id, host_id, event_type_id, start_time, end_time, status
  from public.bookings
  where status <> 'cancelled' and approval_status <> 'declined';

-- ── WhatsApp settings ───────────────────────────────────────────────────────
create table if not exists public.whatsapp_settings (
  id uuid primary key default gen_random_uuid(),
  created_by_id uuid not null unique default auth.uid() references auth.users (id) on delete cascade,
  phone_number text,
  enabled boolean not null default true,
  provider text not null default 'deep_link',
  auto_send_confirmation boolean not null default false,
  confirmation_template text,
  reminder_24h_template text,
  reminder_1h_template text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

-- ── notifications ───────────────────────────────────────────────────────────
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  created_by_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type text not null default 'info',
  title text not null,
  message text,
  link text,
  read boolean not null default false,
  created_date timestamptz not null default now()
);
create index if not exists notifications_owner_idx on public.notifications (created_by_id, created_date desc);

-- ── updated_date bookkeeping ────────────────────────────────────────────────
create or replace function public.touch_updated_date()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_date := now();
  return new;
end;
$$;

drop trigger if exists event_types_touch on public.event_types;
create trigger event_types_touch before update on public.event_types for each row execute function public.touch_updated_date();
drop trigger if exists bookings_touch on public.bookings;
create trigger bookings_touch before update on public.bookings for each row execute function public.touch_updated_date();
drop trigger if exists whatsapp_settings_touch on public.whatsapp_settings;
create trigger whatsapp_settings_touch before update on public.whatsapp_settings for each row execute function public.touch_updated_date();

-- ── notify the host about new bookings ──────────────────────────────────────
create or replace function public.notify_new_booking()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (created_by_id, type, title, message, link)
  values (
    new.host_id,
    case when new.approval_status = 'pending' then 'booking_request' else 'new_booking' end,
    case when new.approval_status = 'pending' then 'Booking request: ' else 'New booking: ' end || new.guest_name,
    coalesce(new.event_name, 'Meeting') || ' on ' || to_char(new.start_time at time zone coalesce(new.timezone, 'UTC'), 'Dy DD Mon, HH12:MI AM'),
    '/bookings'
  );
  return new;
end;
$$;
revoke execute on function public.notify_new_booking() from public, anon, authenticated;

drop trigger if exists bookings_notify on public.bookings;
create trigger bookings_notify after insert on public.bookings for each row execute function public.notify_new_booking();

-- ── row level security ──────────────────────────────────────────────────────
alter table public.event_types enable row level security;
alter table public.availability_rules enable row level security;
alter table public.availability_exceptions enable row level security;
alter table public.bookings enable row level security;
alter table public.whatsapp_settings enable row level security;
alter table public.notifications enable row level security;

-- event types: public read (booking pages), owner writes
drop policy if exists event_types_read on public.event_types;
create policy event_types_read on public.event_types for select to anon, authenticated using (true);
drop policy if exists event_types_write_own on public.event_types;
create policy event_types_write_own on public.event_types for all to authenticated
  using ((select auth.uid()) = created_by_id) with check ((select auth.uid()) = created_by_id);

-- availability: public read (slot calculation), owner writes
drop policy if exists availability_rules_read on public.availability_rules;
create policy availability_rules_read on public.availability_rules for select to anon, authenticated using (true);
drop policy if exists availability_rules_write_own on public.availability_rules;
create policy availability_rules_write_own on public.availability_rules for all to authenticated
  using ((select auth.uid()) = created_by_id) with check ((select auth.uid()) = created_by_id);

drop policy if exists availability_exceptions_read on public.availability_exceptions;
create policy availability_exceptions_read on public.availability_exceptions for select to anon, authenticated using (true);
drop policy if exists availability_exceptions_write_own on public.availability_exceptions;
create policy availability_exceptions_write_own on public.availability_exceptions for all to authenticated
  using ((select auth.uid()) = created_by_id) with check ((select auth.uid()) = created_by_id);

-- bookings: anyone may book an active event for its own host; only the host reads and changes them
drop policy if exists bookings_insert_guest on public.bookings;
create policy bookings_insert_guest on public.bookings for insert to anon, authenticated
  with check (
    exists (
      select 1 from public.event_types e
      where e.id = event_type_id and e.active and e.created_by_id = host_id
        and (not e.requires_approval or approval_status = 'pending')
    )
  );
drop policy if exists bookings_host_read on public.bookings;
create policy bookings_host_read on public.bookings for select to authenticated using ((select auth.uid()) = host_id);
drop policy if exists bookings_host_update on public.bookings;
create policy bookings_host_update on public.bookings for update to authenticated
  using ((select auth.uid()) = host_id) with check ((select auth.uid()) = host_id);
drop policy if exists bookings_host_delete on public.bookings;
create policy bookings_host_delete on public.bookings for delete to authenticated using ((select auth.uid()) = host_id);

-- WhatsApp settings and notifications: owner only
drop policy if exists whatsapp_settings_own on public.whatsapp_settings;
create policy whatsapp_settings_own on public.whatsapp_settings for all to authenticated
  using ((select auth.uid()) = created_by_id) with check ((select auth.uid()) = created_by_id);
drop policy if exists notifications_own on public.notifications;
create policy notifications_own on public.notifications for all to authenticated
  using ((select auth.uid()) = created_by_id) with check ((select auth.uid()) = created_by_id);

-- ── grants (newer projects don't grant new tables automatically) ───────────
grant select on public.event_types, public.availability_rules, public.availability_exceptions to anon;
grant insert on public.bookings to anon;
grant select on public.busy_slots to anon, authenticated;
grant select, insert, update, delete on
  public.event_types, public.availability_rules, public.availability_exceptions,
  public.bookings, public.whatsapp_settings, public.notifications
  to authenticated;
grant select on public.bookings, public.event_types, public.profiles to service_role;
