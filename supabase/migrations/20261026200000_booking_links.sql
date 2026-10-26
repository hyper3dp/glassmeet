-- GlassMeet: booking notifications open that meeting (the Meetings page reads ?id=), and
-- requests open on the Pending tab. Run after 20261026190000_holidays.sql. Safe to run more than once.
create or replace function public.notify_new_booking()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (created_by_id, type, title, message, link)
  values (
    new.host_id,
    case when new.approval_status = 'pending' then 'booking_request' else 'new_booking' end,
    case when new.approval_status = 'pending' then 'Booking request: ' else 'New booking: ' end || new.guest_name,
    coalesce(new.event_name, 'Meeting') || ' on ' || to_char(new.start_time at time zone coalesce(new.timezone, 'UTC'), 'Dy DD Mon, HH12:MI AM'),
    '/bookings?id=' || new.id || case when new.approval_status = 'pending' then '&tab=pending' else '' end
  );
  return new;
end;
$$;
revoke execute on function public.notify_new_booking() from public, anon, authenticated;
