// Availability & slot computation utilities for GlassMeet

// Convert "HH:MM" to minutes ("24:00", midnight at the end of the day, is 1440)
export const timeToMinutes = (t) => {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

// Get all availability rules for a given weekday (0=Sun ... 6=Sat) sorted by start
export const rulesForDay = (rules, dayOfWeek) =>
  rules
    .filter((r) => r.day_of_week === dayOfWeek)
    .sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));

// Build available intervals (in minutes from midnight) for a specific date.
// Custom hours on the date ('available' with times) replace that weekday's rules; 'blocked'
// ones are then taken out (with times: those hours; without: the whole day).
// Mirrored by the database's slot check.
export const intervalsForDate = (date, rules, exceptions) => {
  const dateStr = formatDate(date);
  const dayExceptions = exceptions.filter((e) => e.date === dateStr);
  const custom = dayExceptions.filter((e) => e.type === 'available' && e.start_time && e.end_time);

  let intervals = mergeIntervals((custom.length ? custom : rulesForDay(rules, date.getDay())).map((r) => ({
    start: timeToMinutes(r.start_time),
    end: timeToMinutes(r.end_time),
  })));

  for (const exc of dayExceptions) {
    if (exc.type !== 'blocked') continue;
    const blockStart = exc.start_time ? timeToMinutes(exc.start_time) : 0;
    const blockEnd = exc.end_time ? timeToMinutes(exc.end_time) : 24 * 60;
    intervals = subtractInterval(intervals, blockStart, blockEnd);
  }

  return intervals;
};

const subtractInterval = (intervals, bs, be) => {
  const result = [];
  for (const iv of intervals) {
    if (be <= iv.start || bs >= iv.end) {
      result.push(iv);
    } else {
      if (bs > iv.start) result.push({ start: iv.start, end: bs });
      if (be < iv.end) result.push({ start: be, end: iv.end });
    }
  }
  return result;
};

export const mergeIntervals = (intervals) => {
  if (!intervals.length) return [];
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    if (sorted[i].start <= last.end) {
      last.end = Math.max(last.end, sorted[i].end);
    } else {
      merged.push(sorted[i]);
    }
  }
  return merged;
};

export const formatDate = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// whole days from a to b (local calendar dates; DST-safe)
const dayIndex = (d) => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
const keyToDate = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };

// An event type's own dates, on the host's calendar. 'dates' runs only on the listed days.
// Otherwise it repeats from start_date to end_date (both optional) every `every` days, weeks
// (on its weekdays; every day when none are picked) or months (on start_date's day of the month,
// the last day in shorter months). The hours on each day still come from the host's availability.
// Mirrored by public.event_runs_on() in the database.
export const eventRunsOn = (eventType, date) => {
  const key = formatDate(date);
  if (eventType.schedule === 'dates') return (eventType.dates || []).includes(key);
  if (eventType.start_date && key < eventType.start_date) return false;
  if (eventType.end_date && key > eventType.end_date) return false;
  const every = Math.max(1, eventType.every || 1);
  const start = eventType.start_date ? keyToDate(eventType.start_date) : null;
  if (eventType.freq === 'day') return !start || (dayIndex(date) - dayIndex(start)) % every === 0;
  if (eventType.freq === 'month') {
    if (!start) return false;
    const months = (date.getFullYear() - start.getFullYear()) * 12 + date.getMonth() - start.getMonth();
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    return months % every === 0 && date.getDate() === Math.min(start.getDate(), lastDay);
  }
  if (eventType.days?.length && !eventType.days.includes(date.getDay())) return false;
  if (every === 1 || !start) return true;
  // weeks counted Sunday to Sunday from the week start_date falls in
  const weeks = ((dayIndex(date) - date.getDay()) - (dayIndex(start) - start.getDay())) / 7;
  return weeks % every === 0;
};

// Days ahead guests may book. An event with its own end (specific dates, or an end date) is
// bookable up to that end instead.
export const bookingWindowDays = (eventType) =>
  (eventType.schedule === 'dates' || eventType.end_date ? null : eventType.max_future_days);

// First day on or after today the event runs, as "YYYY-MM-DD" (null when it never runs again)
export const firstEventDay = (eventType) => {
  const today = formatDate(new Date());
  if (eventType.schedule === 'dates') return (eventType.dates || []).filter((d) => d >= today).sort()[0] || null;
  if (eventType.end_date && eventType.end_date < today) return null;
  return eventType.start_date && eventType.start_date > today ? eventType.start_date : today;
};

// ── time zones ────────────────────────────────────────────────────────────
// Working hours are wall-clock times in the host's time zone ("09:00" in Asia/Dubai); a guest
// elsewhere must see the matching moment in their own zone. These helpers convert between
// wall-clock time in a named zone and real instants, DST included.

const partsFormatters = {};
const zoneParts = (ms, tz) => {
  const f = partsFormatters[tz] || (partsFormatters[tz] = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
  }));
  const p = {};
  for (const { type, value } of f.formatToParts(new Date(ms))) p[type] = Number(value);
  return p;
};

// minutes the zone is ahead of UTC at that instant
const offsetMinutes = (ms, tz) => {
  const p = zoneParts(ms, tz);
  return Math.round((Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000) / 60000);
};

// the instant (ms) when the wall clock in tz reads y-m-d plus `minutes` (month is 0-based;
// overflowing days roll over like Date.UTC)
export const zonedTimeToUtc = (y, m, d, minutes, tz) => {
  const guess = Date.UTC(y, m, d, 0, minutes);
  const first = guess - offsetMinutes(guess, tz) * 60000;
  const second = guess - offsetMinutes(first, tz) * 60000;
  return second;
};

// calendar date of an instant in tz, as a local Date (for getDay / formatDate)
export const dateInZone = (ms, tz) => {
  const p = zoneParts(ms, tz);
  return new Date(p.year, p.month - 1, p.day);
};

const labelFormatters = {};
const timeLabel = (ms, tz) => (labelFormatters[tz] || (labelFormatters[tz] = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true }))).format(new Date(ms));

// Available start times on one calendar day as the viewer sees it.
// date: the viewer's day (local Date; only its y/m/d are used)
// bookings: existing { start_time, end_time, status, event_type_id } that block time
// hostTz: zone the weekly hours and date-specific hours are written in
// viewTz: zone the slots are shown in (defaults to this browser's)
// Bookings of this same event carry its buffers on both sides. For a group event, a booking
// of it that isn't full yet only lets a guest join at exactly its start; it still blocks every
// other overlapping time.
export const generateSlots = (date, eventType, rules, exceptions, bookings, hostTz, viewTz) => {
  const duration = eventType.duration || 30;
  const bufferBefore = (eventType.buffer_before || 0) * 60000;
  const bufferAfter = (eventType.buffer_after || 0) * 60000;
  const slotStep = 15; // 15-minute granularity
  const tz = hostTz || detectTimezone();
  const vtz = viewTz || detectTimezone();

  const dayStart = zonedTimeToUtc(date.getFullYear(), date.getMonth(), date.getDate(), 0, vtz);
  const dayEnd = zonedTimeToUtc(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, vtz);
  const earliest = Date.now() + (eventType.min_notice || 0) * 3600000;

  const capacity = eventType.booking_type === 'group' ? (eventType.max_attendees || 1) : 1;
  const live = bookings.filter((b) => b.status !== 'cancelled' && b.approval_status !== 'declined' && b.start_time && b.end_time);
  const takenAt = {};
  live.forEach((b) => { if (b.event_type_id === eventType.id) { const k = new Date(b.start_time).getTime(); takenAt[k] = (takenAt[k] || 0) + 1; } });
  const busy = live.map((b) => {
    const start = new Date(b.start_time).getTime();
    const same = eventType.id && b.event_type_id === eventType.id;
    const end = new Date(b.end_time).getTime();
    return {
      start,
      end,
      // a booking of this event also keeps its own buffers clear
      bufStart: start - (same ? bufferBefore : 0),
      bufEnd: end + (same ? bufferAfter : 0),
      joinableAt: same && capacity > 1 && takenAt[start] < capacity ? start : null,
    };
  });
  // Buffers may overlap each other but never a meeting: the new meeting stays out of existing
  // buffers, and the new meeting's buffers stay clear of existing meetings.
  const clashes = (b, start, end) => b.joinableAt !== start
    && ((start < b.bufEnd && b.bufStart < end) || (start - bufferBefore < b.end && b.start < end + bufferAfter));

  // the viewer's day can overlap up to three of the host's calendar days
  const hostFirst = dateInZone(dayStart, tz);
  const seen = new Set();
  const slots = [];
  for (let k = -1; k <= 1; k++) {
    const hostDay = new Date(hostFirst.getFullYear(), hostFirst.getMonth(), hostFirst.getDate() + k);
    if (!eventRunsOn(eventType, hostDay)) continue;
    for (const iv of intervalsForDate(hostDay, rules, exceptions)) {
      for (let t = iv.start; t + duration <= iv.end; t += slotStep) {
        const start = zonedTimeToUtc(hostDay.getFullYear(), hostDay.getMonth(), hostDay.getDate(), t, tz);
        if (start < dayStart || start >= dayEnd || start < earliest || seen.has(start)) continue;
        const end = start + duration * 60000;
        if (busy.some((b) => clashes(b, start, end))) continue;
        seen.add(start);
        const startMin = Math.round((start - dayStart) / 60000);
        slots.push({ start: startMin, end: startMin + duration, label: timeLabel(start, vtz), date: new Date(start) });
      }
    }
  }
  return slots.sort((a, b) => a.date - b.date);
};

export const minutesToLabel = (mins) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 === 0 ? 12 : h % 12;
  return `${displayH}:${String(m).padStart(2, '0')} ${period}`;
};

export const minutesTo24h = (mins) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

// Check whether a date is within max_future_days from today
export const isWithinMaxFuture = (date, maxFutureDays) => {
  if (!maxFutureDays) return true;
  const max = new Date();
  max.setHours(0, 0, 0, 0);
  max.setDate(max.getDate() + maxFutureDays);
  return date <= max;
};

export const isPastDate = (date) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
};

// Get browser timezone
export const detectTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

// Common timezones list
export const COMMON_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Africa/Lagos',
  'Africa/Johannesburg',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
];