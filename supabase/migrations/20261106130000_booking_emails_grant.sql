-- GlassMeet: the booking-email function records each send in booking_emails using the service
-- role, which 20261102120000_booking_emails.sql forgot to grant. Without this every email stops
-- before it is sent. Safe to run more than once.
grant select, insert, delete on public.booking_emails to service_role;
