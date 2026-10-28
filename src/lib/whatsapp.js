// WhatsApp message generation & deep-link utilities for GlassMeet

// Normalize a phone number to digits-only with optional country code
export const normalizePhone = (phone) => {
  if (!phone) return '';
  return phone.replace(/[^\d+]/g, '');
};

// Build a wa.me deep link
export const buildWhatsAppLink = (phone, message) => {
  const digits = normalizePhone(phone).replace(/^\+/, '');
  const base = digits ? `https://wa.me/${digits}` : 'https://wa.me/';
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
};

// Build a WhatsApp share link (no specific number, opens share sheet)
export const buildWhatsAppShareLink = (message) => {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
};

// Format a Date for display in a given timezone. Building an Intl.DateTimeFormat is slow, and
// lists of meetings call these once per row, so each formatter is made once per zone.
const formatters = new Map();
const formatter = (kind, options, timezone) => {
  const key = `${kind}|${timezone || ''}`;
  if (!formatters.has(key)) formatters.set(key, new Intl.DateTimeFormat('en-US', { ...options, timeZone: timezone }));
  return formatters.get(key);
};

export const formatMeetingDate = (date, timezone) => {
  try {
    return formatter('date', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }, timezone).format(new Date(date));
  } catch {
    return new Date(date).toLocaleDateString();
  }
};

export const formatMeetingTime = (date, timezone) => {
  try {
    return formatter('time', { hour: 'numeric', minute: '2-digit' }, timezone).format(new Date(date));
  } catch {
    return new Date(date).toLocaleTimeString();
  }
};

// Fill a template with booking context. A line whose placeholder has no value ("Meeting: ")
// is left out rather than sent half empty.
export const fillTemplate = (template, ctx) => {
  if (!template) return '';
  const filled = template
    .replace(/\[Name\]/g, ctx.guestName || '')
    .replace(/\[Host\]/g, ctx.hostName || '')
    .replace(/\[Date\]/g, ctx.date || '')
    .replace(/\[Time\]/g, ctx.time || '')
    .replace(/\[Duration\]/g, ctx.duration || '')
    .replace(/\[Meeting Link\]/g, ctx.meetingUrl || '')
    .replace(/\[Booking Link\]/g, ctx.bookingLink || '')
    .replace(/\[Timezone\]/g, ctx.timezone || '');
  return filled.split('\n').filter((line) => !/^[^:\n]{1,20}:\s*(\(\s*\))?\s*$/.test(line)).join('\n');
};

export const DEFAULT_CONFIRMATION_TEMPLATE = `Hi [Name]! Your meeting with [Host] is confirmed.

Date: [Date]
Time: [Time] ([Timezone])
Duration: [Duration]
Meeting: [Meeting Link]

See you then!`;

export const DEFAULT_REMINDER_24H = `Reminder: Your meeting with [Host] is tomorrow at [Time] ([Timezone]).

Meeting: [Meeting Link]`;

export const DEFAULT_REMINDER_1H = `Starting soon: Your meeting with [Host] is in 1 hour.

Meeting: [Meeting Link]`;

export const DEFAULT_CANCELLATION_TEMPLATE = `Hi [Name], I'm sorry, I need to cancel our meeting on [Date] at [Time] ([Timezone]).

You can pick a new time here: [Booking Link]`;

export const DEFAULT_DECLINE_TEMPLATE = `Hi [Name], thanks for your request for [Date] at [Time]. Unfortunately I can't make that time.

Please pick another time here: [Booking Link]`;

// Build the full booking context object for templates
export const buildBookingContext = (booking, eventType, host, timezone) => {
  const date = formatMeetingDate(booking.start_time, timezone);
  const time = formatMeetingTime(booking.start_time, timezone);
  return {
    guestName: booking.guest_name,
    hostName: host?.full_name || 'Your host',
    date,
    time,
    duration: `${eventType?.duration || 30} min`,
    meetingUrl: booking.meeting_url || eventType?.meeting_url || '',
    bookingLink: eventType?.bookingLink || '',
    timezone: timezone || '',
  };
};