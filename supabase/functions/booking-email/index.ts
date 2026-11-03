// Emails the host when someone books them, over SMTP. The database calls this for every new
// booking (trigger bookings_email_host, migration 20261102120000_booking_emails.sql). Setup: see
// README.md here.
//
// Deploy WITHOUT gateway JWT verification; the trigger has no user session:
//   supabase functions deploy booking-email --no-verify-jwt
// Anyone can call it, so it only acts on a booking made in the last 15 minutes, and each booking
// is emailed at most once (public.booking_emails), always to that booking's own host.
//
// Secrets: SMTP_HOST, SMTP_PORT (465), SMTP_USER, SMTP_PASS, SMTP_FROM ("GlassMeet <bookings@…>"),
// APP_URL (https://hyper3dp.github.io/glassmeet). SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are
// provided by Supabase. The SMTP password is never logged.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import nodemailer from 'npm:nodemailer@6.9.16';

const SUPABASE_URL = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/+$/, '');
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SMTP_HOST = Deno.env.get('SMTP_HOST') ?? '';
const SMTP_PORT = Number(Deno.env.get('SMTP_PORT') || 465);
const SMTP_USER = Deno.env.get('SMTP_USER') ?? '';
const SMTP_PASS = Deno.env.get('SMTP_PASS') ?? '';
const SMTP_FROM = Deno.env.get('SMTP_FROM') || SMTP_USER;
const APP_URL = (Deno.env.get('APP_URL') ?? 'https://hyper3dp.github.io/glassmeet').replace(/\/+$/, '');
const FRESH_MS = 15 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const configured = () => Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS && SUPABASE_URL && SERVICE_KEY);

// Supabase blocks outbound ports 25 and 587, so 465 (TLS from the start) is the one that works
const transport = configured()
  ? nodemailer.createTransport({ host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_PORT === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } })
  : null;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

// "Tuesday, November 3 at 2:00 PM GMT+4" in the host's zone; UTC if the zone is unknown
const when = (iso: string, timeZone: string) => {
  const options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' };
  try { return new Intl.DateTimeFormat('en-US', { ...options, timeZone }).format(new Date(iso)); } catch { return new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).format(new Date(iso)); }
};

type Booking = {
  id: string; host_id: string; event_name: string | null; guest_name: string; guest_email: string | null;
  guest_phone: string | null; guest_notes: string | null; start_time: string; end_time: string; timezone: string | null;
  status: string; approval_status: string; custom_answers: { question?: string; answer?: string }[] | null; created_date: string;
};

const message = (b: Booking, timeZone: string) => {
  const pending = b.approval_status === 'pending';
  const event = b.event_name || 'Meeting';
  const time = when(b.start_time, timeZone);
  const minutes = Math.round((new Date(b.end_time).getTime() - new Date(b.start_time).getTime()) / 60000);
  const link = `${APP_URL}/bookings?id=${b.id}${pending ? '&tab=pending' : ''}`;
  const rows: [string, string][] = [
    ['When', `${time} (${minutes} min)`],
    ['Guest', b.guest_name],
    ...(b.guest_email ? [['Email', b.guest_email] as [string, string]] : []),
    ...(b.guest_phone ? [['WhatsApp', b.guest_phone] as [string, string]] : []),
    ...(b.guest_notes ? [['Notes', b.guest_notes] as [string, string]] : []),
    ...(b.custom_answers || []).filter((a) => a?.question && a?.answer).map((a) => [String(a.question), String(a.answer)] as [string, string]),
  ];
  const subject = `${pending ? 'Booking request' : 'New booking'}: ${b.guest_name}, ${event} on ${time}`.slice(0, 200);
  const intro = pending ? `${b.guest_name} asked to book ${event}. Approve or decline it in GlassMeet.` : `${b.guest_name} booked ${event}.`;
  const action = pending ? 'Review the request' : 'Open the meeting';
  const text = [intro, '', ...rows.map(([k, v]) => `${k}: ${v}`), '', `${action}: ${link}`].join('\n');
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f9f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#344248">
<table role="presentation" width="100%" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #dfe8e8;border-radius:12px"><tr><td style="padding:28px">
<h1 style="margin:0 0 8px;font-size:20px">${esc(pending ? 'Booking request' : 'New booking')}</h1>
<p style="margin:0 0 20px;font-size:15px;color:#55686d">${esc(intro)}</p>
<table role="presentation" style="width:100%;font-size:14px;border-collapse:collapse">
${rows.map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;font-weight:600;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:6px 0;white-space:pre-wrap">${esc(v)}</td></tr>`).join('\n')}
</table>
<p style="margin:24px 0 0"><a href="${esc(link)}" style="display:inline-block;padding:10px 20px;border-radius:999px;background:#2b7a75;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px">${esc(action)}</a></p>
</td></tr></table>
<p style="max-width:520px;margin:16px auto 0;font-size:12px;color:#55686d;text-align:center">Sent by GlassMeet because someone booked you.</p>
</body></html>`;
  return { subject, text, html, replyTo: b.guest_email || undefined };
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  if (!configured() || !transport) return json({ sent: false, reason: 'not_configured' }, 503);

  let bookingId = '';
  try { bookingId = String((await req.json())?.booking_id ?? ''); } catch { /* falls through */ }
  if (!UUID.test(bookingId)) return json({ error: 'input' }, 400);

  const { data: b } = await admin.from('bookings')
    .select('id, host_id, event_name, guest_name, guest_email, guest_phone, guest_notes, start_time, end_time, timezone, status, approval_status, custom_answers, created_date')
    .eq('id', bookingId).maybeSingle<Booking>();
  if (!b || b.status === 'cancelled' || Date.now() - new Date(b.created_date).getTime() > FRESH_MS) return json({ sent: false });

  // claim the booking first: a second call (retry, or someone replaying it) finds it taken
  const { error: claimError } = await admin.from('booking_emails').insert({ booking_id: b.id });
  if (claimError) return json({ sent: false });

  try {
    const [{ data: host }, { data: profile }] = await Promise.all([
      admin.auth.admin.getUserById(b.host_id),
      admin.from('profiles').select('timezone').eq('id', b.host_id).maybeSingle(),
    ]);
    const to = host?.user?.email;
    if (!to) return json({ sent: false });
    await transport.sendMail({ from: SMTP_FROM, to, ...message(b, profile?.timezone || b.timezone || 'UTC') });
    return json({ sent: true });
  } catch (e) {
    // let the booking be sent again later; the error names the SMTP problem, not the password
    await admin.from('booking_emails').delete().eq('booking_id', b.id);
    console.error('booking-email: send failed', e instanceof Error ? e.message : e);
    return json({ sent: false, reason: 'smtp' }, 502);
  }
});
