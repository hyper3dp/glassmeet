import { icsText, icsFold } from '@/lib/ics.js';
/**
 * Calendar subscription utilities.
 * Generates ICS calendar feeds from booking data.
 */

function pad(n) { return String(n).padStart(2, '0'); }

function toICSDate(dateStr) {
  const d = new Date(dateStr);
  return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) +
    'T' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z';
}

// RFC 5545 escaping (any line break, control characters) — shared with calendar.js
const escapeICS = icsText;

/**
 * Generates a full ICS calendar string from an array of bookings.
 */
export function generateICSFeed(bookings, calendarName = 'GlassMeet') {
  const now = new Date();
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//GlassMeet//Calendar Subscription//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeICS(calendarName)}`,
    'X-WR-TIMEZONE:UTC',
    'REFRESH-INTERVAL;VALUE=DURATION:PT15M',
    'X-PUBLISHED-TTL:PT15M',
  ];

  for (const b of bookings) {
    if (b.status === 'cancelled') continue;
    const dtStart = toICSDate(b.start_time);
    const dtEnd = toICSDate(b.end_time);
    const dtStamp = toICSDate(b.updated_date || b.created_date || now.toISOString());
    const uid = `glassmeet-${b.id}@glassmeet.app`;

    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${dtStamp}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${escapeICS(b.guest_name ? `${b.event_name || 'Meeting'} with ${b.guest_name}` : (b.event_name || 'Meeting'))}`,
      `DESCRIPTION:${escapeICS([
        b.guest_name && `Guest: ${b.guest_name}`,
        b.guest_email && `Email: ${b.guest_email}`,
        b.guest_phone && `WhatsApp: ${b.guest_phone}`,
        b.meeting_url && `Join: ${b.meeting_url}`,
        b.guest_notes && `Notes: ${b.guest_notes}`,
        'Booked with GlassMeet',
      ].filter(Boolean).join('\n'))}`,
      'STATUS:CONFIRMED',
    );
    if (b.meeting_url) lines.push(`LOCATION:${escapeICS(b.meeting_url)}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  // RFC 5545: every line ends with CRLF, the last one too
  return lines.map(icsFold).join('\r\n') + '\r\n';
}

/**
 * Triggers a download of an ICS file.
 */
export function downloadICSFeed(bookings, filename = 'glassmeet-calendar.ics', calendarName = 'GlassMeet') {
  const ics = generateICSFeed(bookings, calendarName);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // revoking straight away can cancel the download in Safari and some Firefox versions
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Generates a secure random subscription token.
 */
export function generateSubscriptionToken() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}