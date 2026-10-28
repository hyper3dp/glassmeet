// Public holidays a host can block with one switch (profiles.holidays = region code).
// The dates live in the database (public.holidays); the server refuses guest bookings on them too.
import { formatMeetingDate, formatMeetingTime } from '@/lib/whatsapp';

export const HOLIDAY_REGIONS = { ae: 'UAE and Islamic holidays' };

// holidays as whole-day blocked exceptions, so generateSlots skips them like a day off
export const holidayExceptions = (holidays) =>
  (holidays || []).map((h) => ({ id: `holiday-${h.date}`, date: h.date, type: 'blocked', start_time: null, end_time: null, label: h.name }));

// { 'YYYY-MM-DD': name }
export const holidayMap = (holidays) => Object.fromEntries((holidays || []).map((h) => [h.date, h.name]));

// upcoming meetings that fall on a holiday, on the host's calendar
export const holidayClashes = (bookings, holidays, tz) => {
  const names = holidayMap(holidays);
  const now = Date.now();
  return (bookings || [])
    .filter((b) => b.status !== 'cancelled' && b.approval_status !== 'declined' && new Date(b.start_time).getTime() > now)
    .map((b) => ({ booking: b, holiday: names[new Date(b.start_time).toLocaleDateString('en-CA', { timeZone: tz })] }))
    .filter((c) => c.holiday)
    .sort((a, b) => new Date(a.booking.start_time) - new Date(b.booking.start_time));
};

// The message a host sends after cancelling a meeting that falls on a holiday
export const rescheduleMessage = ({ booking, holiday, bookingLink, timezone }) => {
  const tz = booking.timezone || timezone;
  const first = (booking.guest_name || '').trim().split(/\s+/)[0];
  // booking.timezone is the host's: name it, as the guest may be somewhere else
  const zone = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date(booking.start_time)).find((p) => p.type === 'timeZoneName')?.value;
  return `Hi${first ? ` ${first}` : ''}, I'm sorry, I need to reschedule our meeting on ${formatMeetingDate(booking.start_time, tz)} at ${formatMeetingTime(booking.start_time, tz)}${zone ? ` (${zone})` : ''} because of ${holiday}.

Please pick a new time that suits you here: ${bookingLink}`;
};
