// Availability & slot computation utilities for GlassMeet

// Convert "HH:MM" to minutes
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

// Build available intervals (in minutes from midnight) for a specific date
// considering weekly rules + exceptions (blocked/available overrides)
export const intervalsForDate = (date, rules, exceptions) => {
  const dayOfWeek = date.getDay();
  let intervals = rulesForDay(rules, dayOfWeek).map((r) => ({
    start: timeToMinutes(r.start_time),
    end: timeToMinutes(r.end_time),
  }));

  const dateStr = formatDate(date);
  const dayExceptions = exceptions.filter((e) => e.date === dateStr);

  for (const exc of dayExceptions) {
    if (exc.type === 'blocked') {
      const blockStart = exc.start_time ? timeToMinutes(exc.start_time) : 0;
      const blockEnd = exc.end_time ? timeToMinutes(exc.end_time) : 24 * 60;
      intervals = subtractInterval(intervals, blockStart, blockEnd);
    } else if (exc.type === 'available') {
      if (exc.start_time && exc.end_time) {
        intervals = mergeIntervals([
          ...intervals,
          { start: timeToMinutes(exc.start_time), end: timeToMinutes(exc.end_time) },
        ]);
      }
    }
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

// Check if two date ranges overlap (in minutes from midnight)
const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

// Generate available time slots for a given date for an event type
// bookings: array of existing bookings { start_time, end_time, status }
// eventType: { duration, buffer_before, buffer_after, min_notice, max_future_days }
export const generateSlots = (date, eventType, rules, exceptions, bookings, timezone) => {
  const duration = eventType.duration || 30;
  const bufferBefore = eventType.buffer_before || 0;
  const bufferAfter = eventType.buffer_after || 0;
  const slotStep = 15; // 15-minute granularity

  const intervals = intervalsForDate(date, rules, exceptions);
  const slots = [];

  const dateStr = formatDate(date);
  const dayBookings = bookings
    .filter((b) => b.status !== 'cancelled' && b.start_time && b.start_time.startsWith(dateStr))
    .map((b) => {
      const bs = new Date(b.start_time);
      const be = new Date(b.end_time);
      return {
        start: bs.getHours() * 60 + bs.getMinutes(),
        end: be.getHours() * 60 + be.getMinutes(),
      };
    });

  const now = new Date();
  const minNoticeMs = (eventType.min_notice || 0) * 60 * 60 * 1000;
  const minBookingTime = new Date(now.getTime() + minNoticeMs);

  for (const iv of intervals) {
    for (let t = iv.start; t + duration <= iv.end; t += slotStep) {
      const slotStart = t;
      const slotEnd = t + duration;
      const busyStart = slotStart - bufferBefore;
      const busyEnd = slotEnd + bufferAfter;

      // conflict with bookings
      const conflict = dayBookings.some((b) => overlaps(busyStart, busyEnd, b.start, b.end));
      if (conflict) continue;

      // build full datetime to check min notice
      const slotDate = new Date(date);
      slotDate.setHours(0, 0, 0, 0);
      slotDate.setMinutes(slotStart);
      if (slotDate < minBookingTime) continue;

      slots.push({
        start: slotStart,
        end: slotEnd,
        label: minutesToLabel(slotStart),
        date: slotDate,
      });
    }
  }

  return slots;
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