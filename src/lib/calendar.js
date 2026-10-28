// Calendar integration utilities for GlassMeet
import { icsText, icsParam, icsFold, meetingLocation } from '@/lib/ics.js';
// Apple Calendar (.ics) + Google Calendar (add-event URL)

// Format a Date as an iCalendar UTC timestamp: YYYYMMDDTHHMMSSZ
const formatIcsDate = (date) => {
  const d = new Date(date);
  return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
};

// Escaping and line folding follow RFC 5545 (see ./ics.js)
const escapeIcs = icsText;
const foldLine = icsFold;

// Build the event description block with guest + meeting details
const buildEventDescription = (booking, eventType, host) => {
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

// Generate a full .ics calendar string for a booking
export const generateIcsEvent = (booking, eventType, host) => {
  const hostName = host?.full_name || eventType?.host_name || 'Host';
  // a request still waiting on the host's approval goes in as tentative
  const pending = booking.approval_status === 'pending';
  const title = `${pending ? '(Pending) ' : ''}${eventType?.name || 'Meeting'} with ${hostName}`;
  const description = buildEventDescription(booking, eventType, host);
  const location = meetingLocation(booking, eventType);
  const tz = booking.timezone || 'UTC';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//GlassMeet//Scheduling//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${booking.id || crypto.randomUUID()}@glassmeet`,
    `DTSTAMP:${formatIcsDate(new Date())}`,
    `DTSTART:${formatIcsDate(booking.start_time)}`,
    `DTEND:${formatIcsDate(booking.end_time)}`,
    `SUMMARY:${escapeIcs(title)}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    `LOCATION:${escapeIcs(location)}`,
    `STATUS:${pending ? 'TENTATIVE' : 'CONFIRMED'}`,
    `TRANSP:OPAQUE`,
  ];

  // Attendee: guest
  if (booking.guest_email) {
    lines.push(`ATTENDEE;CN=${icsParam(booking.guest_name)};ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:${booking.guest_email}`);
  }

  // Organizer: host
  const hostEmail = host?.email || eventType?.host_email || '';
  if (hostEmail) {
    lines.push(`ORGANIZER;CN=${icsParam(hostName)}:mailto:${hostEmail}`);
  }

  lines.push('END:VEVENT', 'END:VCALENDAR');

  // RFC 5545: every line ends with CRLF, the last one too
  return lines.map(foldLine).join('\r\n') + '\r\n';
};

// Trigger a download of the .ics file
export const downloadIcs = (booking, eventType, host) => {
  const ics = generateIcsEvent(booking, eventType, host);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeName = (eventType?.name || 'meeting').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  a.download = `glassmeet-${safeName}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// Google Calendar "create event" URL (guest-facing, no OAuth needed)
export const googleCalendarUrl = (booking, eventType, host) => {
  const hostName = host?.full_name || eventType?.host_name || 'Host';
  const title = `${eventType?.name || 'Meeting'} with ${hostName}`;
  const description = buildEventDescription(booking, eventType, host);
  const location = meetingLocation(booking, eventType);

  const dates = `${formatIcsDate(booking.start_time)}/${formatIcsDate(booking.end_time)}`;

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates,
    details: description,
    location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
};

// Open the Google Calendar "create event" URL in a new tab
export const openGoogleCalendar = (booking, eventType, host) => {
  window.open(googleCalendarUrl(booking, eventType, host), '_blank', 'noopener,noreferrer');
};

// Open Apple Calendar — on Apple devices a downloaded .ics opens in Calendar;
// we trigger the download which the OS handles.
export const openAppleCalendar = (booking, eventType, host) => {
  downloadIcs(booking, eventType, host);
};

// Open Outlook Calendar — generates a deep link to Outlook web calendar
// Works for both Outlook.com (personal) and Microsoft 365 (work/school) accounts.
export { openOutlookCalendar } from './outlookcalender.js';