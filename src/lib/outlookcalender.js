// Outlook Calendar integration utilities for GlassMeet
// Supports both Microsoft 365 and Outlook.com personal accounts.

const formatOutlookDate = (date) => {
  const d = new Date(date);
  return d.toISOString().split('.')[0] + 'Z';
};

const buildOutlookDescription = (booking, eventType, host) => {
  const lines = [
    eventType?.description || '',
    '',
    `Guest: ${booking.guest_name || ''}`,
    `Email: ${booking.guest_email || ''}`,
    `WhatsApp: ${booking.guest_phone || ''}`,
    booking.guest_notes ? `Notes: ${booking.guest_notes}` : '',
  ].filter(Boolean);
  return lines.join('\n');
};

// Generate Outlook web calendar deep link (works for both Outlook.com and Microsoft 365)
// Users with personal accounts (outlook.com, hotmail.com, live.com) get outlook.live.com
// Users with work/school accounts (Microsoft 365) get redirected to outlook.office.com
export const outlookCalendarUrl = (booking, eventType, host) => {
  const hostName = host?.full_name || eventType?.host_name || 'Host';
  const title = `${eventType?.name || 'Meeting'} with ${hostName}`;
  const description = buildOutlookDescription(booking, eventType, host);
  const location = booking.meeting_url || eventType?.meeting_url || eventType?.location || '';

  const params = new URLSearchParams({
    rru: 'addevent',
    startdt: formatOutlookDate(booking.start_time),
    enddt: formatOutlookDate(booking.end_time),
    subject: title,
    body: description,
    location,
  });

  return `https://outlook.live.com/calendar/0/deeplink/compose?path=/calendar/action/compose&${params.toString()}`;
};

// Open Outlook calendar in a new tab with pre-filled event details
export const openOutlookCalendar = (booking, eventType, host) => {
  window.open(outlookCalendarUrl(booking, eventType, host), '_blank', 'noopener,noreferrer');
};

// Build Outlook event content for display / ICS generation
export const buildOutlookEventContent = (booking, eventType, host) => {
  const hostName = host?.full_name || eventType?.host_name || 'Host';
  return {
    title: `${eventType?.name || 'Meeting'} with ${hostName}`,
    startTime: booking.start_time,
    endTime: booking.end_time,
    timezone: booking.timezone || 'UTC',
    description: eventType?.description || '',
    meetingUrl: booking.meeting_url || eventType?.meeting_url || '',
    guestName: booking.guest_name || '',
    guestEmail: booking.guest_email || '',
    guestPhone: booking.guest_phone || '',
    location: eventType?.location || '',
  };
};