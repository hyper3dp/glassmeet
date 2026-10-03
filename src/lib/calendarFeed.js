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

function escapeICS(text) {
  if (!text) return '';
  return String(text).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

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
      `SUMMARY:${escapeICS(b.event_name || 'Meeting')}`,
      `DESCRIPTION:${escapeICS(`Guest: ${b.guest_name || ''}\n${b.guest_notes || ''}`)}`,
      'STATUS:CONFIRMED',
    );
    if (b.meeting_url) lines.push(`LOCATION:${escapeICS(b.meeting_url)}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/**
 * Triggers a download of an ICS file.
 */
export function downloadICSFeed(bookings, filename = 'glassmeet-calendar.ics') {
  const ics = generateICSFeed(bookings);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generates a secure random subscription token.
 */
export function generateSubscriptionToken() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}