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
const esc = (s: unknown) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

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

const notFound = () => new Response('Calendar feed not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });

Deno.serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });

  const url = new URL(req.url);
  const fromPath = url.pathname.split('/').pop()?.replace(/\.ics$/i, '');
  const token = url.searchParams.get('token') || (fromPath && fromPath !== 'calendar-feed' ? fromPath : '');
  if (!token || !/^[a-f0-9]{32,128}$/i.test(token)) return notFound();

  const { data: feed, error: feedError } = await supabase.from('cal_feeds').select('owner').eq('token', token).maybeSingle();
  if (feedError) {
    console.error('cal_feeds lookup failed', feedError.code, feedError.message);
    return new Response(`Feed lookup failed (${feedError.code || 'error'})`, { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
  if (!feed) return notFound();

  const [{ data: profile }, { data: bookings, error }] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', feed.owner).maybeSingle(),
    supabase
      .from('bookings')
      .select('*')
      .eq('host_id', feed.owner)
      .gte('start_time', new Date(Date.now() - 60 * 864e5).toISOString())
      .order('start_time', { ascending: true })
      .limit(1000),
  ]);
  // A missing bookings table (or no bookings yet) is an empty calendar, not an error,
  // so calendar apps can still subscribe; other failures are real outages.
  const missingTable = error && (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|schema cache/i.test(error.message));
  if (error && !missingTable) {
    console.error('bookings query failed', error.code, error.message);
    return new Response('Feed temporarily unavailable', { status: 503 });
  }

  const name = profile?.full_name ? `GlassMeet: ${profile.full_name}` : 'GlassMeet';
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//GlassMeet//Calendar Feed//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(name)}`, 'X-WR-TIMEZONE:UTC', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H',
  ];
  const stamp = icsDate(new Date().toISOString());
  for (const b of bookings ?? []) {
    if (!b.start_time || !b.end_time || b.status === 'cancelled') continue;
    const pending = b.approval_status === 'pending';
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
      `DTSTART:${icsDate(b.start_time)}`,
      `DTEND:${icsDate(b.end_time)}`,
      `SUMMARY:${esc(title)}`,
      `DESCRIPTION:${esc(details)}`,
      `STATUS:${pending ? 'TENTATIVE' : 'CONFIRMED'}`,
    );
    if (b.meeting_url) lines.push(`LOCATION:${esc(b.meeting_url)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');

  return new Response(lines.map(fold).join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="glassmeet.ics"',
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
    },
  });
});
