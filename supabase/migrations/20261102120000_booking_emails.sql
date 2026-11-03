-- GlassMeet: email the host about every new booking. A trigger hands the booking id to the
-- booking-email edge function (pg_net, queued, so the guest's booking never waits on it), and
-- the function sends it over SMTP. booking_emails records what was sent, so each booking is
-- emailed once however often the function is called. Setup: supabase/functions/booking-email.
-- Run after 20261030120000_security.sql. Safe to run more than once.

create extension if not exists pg_net with schema extensions;

create table if not exists public.booking_emails (
  booking_id uuid primary key references public.bookings (id) on delete cascade,
  sent_date timestamptz not null default now()
);
-- only the edge function (service role) uses it
alter table public.booking_emails enable row level security;
revoke all on public.booking_emails from anon, authenticated;

create or replace function public.email_new_booking()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform net.http_post(
    url := 'https://sjxraemrdpzleipfmwun.supabase.co/functions/v1/booking-email',
    body := jsonb_build_object('booking_id', new.id),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 10000
  );
  return new;
exception when others then
  -- an email problem must never stop a booking
  return new;
end;
$$;
revoke execute on function public.email_new_booking() from public, anon, authenticated;

drop trigger if exists bookings_email_host on public.bookings;
create trigger bookings_email_host after insert on public.bookings
  for each row execute function public.email_new_booking();
