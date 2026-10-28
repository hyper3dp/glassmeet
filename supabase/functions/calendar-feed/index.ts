// Public .ics feed for calendar subscriptions (Apple Calendar, Google Calendar, Outlook).
// URL: /functions/v1/calendar-feed/<token>.ics  (also accepts ?token=<token>)
// Deploy without JWT verification — calendar apps can't send auth headers; the token is the secret:
//   supabase functions deploy calendar-feed --no-verify-jwt
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

const pad = (n: number) => String(n).padStart(2, '0');
const icsDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
};
const esc = (s: unknown) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,')
  .replace(/\r\n|\r|\n/g, '\\n').replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '');

// RFC 5545: lines longer than 75 octets are folded with CRLF + space
const fold = (line: string) => {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = '';
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > (out.length ? 74 : 75)) { out.push(cur); cur = ch; } else cur += ch;
  }
  out.push(cur);
  return out.join('\r\n ');
};

const notFound = () => new Response('Calendar feed not found', { status: 404, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } });

Deno.serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });

  const url = new URL(req.url);
  const fromPath = url.pathname.split('/').pop()?.replace(/\.ics$/i, '');
  const token = url.searchParams.get('token') || (fromPath && fromPath !== 'calendar-feed' ? fromPath : '');
  if (!token || !/^[a-f0-9]{32,128}$/i.test(token)) return notFound();

  const { data: feed, error: feedError } = await supabase.from('cal_feeds').select('owner').eq('token', token).maybeSingle();
  if (feedError) {
    console.error('cal_feeds lookup failed', feedError.code, feedError.message);
    return new Response('Feed temporarily unavailable', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
  if (!feed) return notFound();

  const [{ data: profile }, { data: bookings, error }] = await Promise.all([
    supabase.from('profiles').select('full_name, holidays').eq('id', feed.owner).maybeSingle(),
    supabase
      .from('bookings')
      // only what the feed shows; the event's in-person address is the location, as in src/lib/ics.js
      .select('id, start_time, end_time, status, approval_status, event_name, guest_name, guest_email, guest_phone, guest_notes, meeting_url, created_date, updated_date, event_types(address, meeting_url, location)')
      .eq('host_id', feed.owner)
      .gte('start_time', new Date(Date.now() - 60 * 864e5).toISOString())
      // newest first, so a busy host's upcoming meetings are never the ones cut off
      .order('start_time', { ascending: false })
      .limit(1000),
  ]);
  // A missing bookings table (or no bookings yet) is an empty calendar, not an error,
  // so calendar apps can still subscribe; other failures are real outages.
  const missingTable = error && (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|schema cache/i.test(error.message));
  if (error && !missingTable) {
    console.error('bookings query failed', error.code, error.message);
    return new Response('Feed temporarily unavailable', { status: 503, headers: { 'Content-Type': 'text/plain', 'Retry-After': '300' } });
  }

  // public holidays the host blocks, as all-day events (none until the holidays migration is applied)
  const { data: holidays, error: holidayError } = profile?.holidays
    ? await supabase.from('holidays').select('date, name').eq('region', profile.holidays)
      .gte('date', new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10)).order('date')
    : { data: [], error: null };
  if (holidayError) console.error('holidays query failed', holidayError.code, holidayError.message);

  const name = profile?.full_name ? `GlassMeet: ${profile.full_name}` : 'GlassMeet';
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//GlassMeet//Calendar Feed//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(name)}`, 'X-WR-TIMEZONE:UTC', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H',
  ];
  // DTSTAMP comes from the row (not the request time), so an unchanged calendar gives the same
  // bytes and the ETag below lets calendar apps skip the download
  const today = `${new Date().toISOString().slice(0, 10)}T00:00:00Z`;
  for (const b of bookings ?? []) {
    // declined requests keep status 'confirmed'; they aren't meetings
    if (!b.start_time || !b.end_time || b.status === 'cancelled' || b.approval_status === 'declined') continue;
    const pending = b.approval_status === 'pending';
    const e = Array.isArray(b.event_types) ? b.event_types[0] : b.event_types;
    const where = e?.address || b.meeting_url || e?.meeting_url || e?.location || '';
    const stamp = icsDate(b.updated_date || b.created_date || b.start_time);
    const title = `${pending ? '[Pending] ' : ''}${b.event_name || 'Meeting'}${b.guest_name ? ` with ${b.guest_name}` : ''}`;
    const details = [
      b.guest_name && `Guest: ${b.guest_name}`,
      b.guest_email && `Email: ${b.guest_email}`,
      b.guest_phone && `WhatsApp: ${b.guest_phone}`,
      b.meeting_url && `Join: ${b.meeting_url}`,
      b.guest_notes && `Notes: ${b.guest_notes}`,
      'Booked with GlassMeet',
    ].filter(Boolean).join('\n');
    lines.push(
      'BEGIN:VEVENT',
      `UID:glassmeet-${b.id}@glassmeet.app`,
      `DTSTAMP:${stamp}`,
      `LAST-MODIFIED:${stamp}`,
      `DTSTART:${icsDate(b.start_time)}`,
      `DTEND:${icsDate(b.end_time)}`,
      `SUMMARY:${esc(title)}`,
      `DESCRIPTION:${esc(details)}`,
      `STATUS:${pending ? 'TENTATIVE' : 'CONFIRMED'}`,
    );
    if (where) lines.push(`LOCATION:${esc(where)}`);
    lines.push('END:VEVENT');
  }
  for (const h of holidays ?? []) {
    const day = h.date.replace(/-/g, '');
    const next = new Date(`${h.date}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    lines.push(
      'BEGIN:VEVENT',
      `UID:glassmeet-holiday-${profile.holidays}-${day}@glassmeet.app`,
      `DTSTAMP:${icsDate(today)}`,
      `DTSTART;VALUE=DATE:${day}`,
      `DTEND;VALUE=DATE:${next.toISOString().slice(0, 10).replace(/-/g, '')}`,
      `SUMMARY:${esc(`${h.name} (holiday)`)}`,
      'DESCRIPTION:Bookings are closed on this day.',
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');

  const body = lines.map(fold).join('\r\n') + '\r\n';
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body)));
  const etag = `"${Array.from(digest.slice(0, 16), (x) => x.toString(16).padStart(2, '0')).join('')}"`;
  const headers = {
    'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Disposition': 'inline; filename="glassmeet.ics"',
    // guest details inside: calendar apps may cache it, shared proxies may not; no CORS, since
    // calendar apps don't need it and it would let any website read a leaked feed
    'Cache-Control': 'private, max-age=300',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ETag: etag,
  };
  // calendar apps that send the last ETag get a 304 instead of the whole feed
  const ifNoneMatch = req.headers.get('If-None-Match');
  if (ifNoneMatch && ifNoneMatch.split(',').some((tag) => tag.trim().replace(/^W\//, '') === etag)) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(req.method === 'HEAD' ? null : body, { headers });
});
