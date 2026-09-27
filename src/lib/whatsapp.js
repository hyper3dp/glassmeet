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

// Format a Date for display in a given timezone
export const formatMeetingDate = (date, timezone) => {
  try {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: timezone,
    }).format(new Date(date));
  } catch {
    return new Date(date).toLocaleDateString();
  }
};

export const formatMeetingTime = (date, timezone) => {
  try {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timezone,
    }).format(new Date(date));
  } catch {
    return new Date(date).toLocaleTimeString();
  }
};

// Fill a template with booking context
export const fillTemplate = (template, ctx) => {
  if (!template) return '';
  return template
    .replace(/\[Name\]/g, ctx.guestName || '')
    .replace(/\[Host\]/g, ctx.hostName || '')
    .replace(/\[Date\]/g, ctx.date || '')
    .replace(/\[Time\]/g, ctx.time || '')
    .replace(/\[Duration\]/g, ctx.duration || '')
    .replace(/\[Meeting Link\]/g, ctx.meetingUrl || '')
    .replace(/\[Booking Link\]/g, ctx.bookingLink || '')
    .replace(/\[Timezone\]/g, ctx.timezone || '');
};

export const DEFAULT_CONFIRMATION_TEMPLATE = `Hi [Name]! Your meeting with [Host] is confirmed.

Date: [Date]
Time: [Time]
Duration: [Duration]
Meeting: [Meeting Link]

See you then!`;

export const DEFAULT_REMINDER_24H = `Reminder: Your meeting with [Host] is tomorrow at [Time] ([Timezone]).

Meeting: [Meeting Link]`;

export const DEFAULT_REMINDER_1H = `Starting soon: Your meeting with [Host] is in 1 hour.

Meeting: [Meeting Link]`;

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
    meetingUrl: booking.meeting_url || eventType?.meeting_url || 'TBD',
    bookingLink: '',
    timezone: timezone || '',
  };
};