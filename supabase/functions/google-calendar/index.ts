// Google Calendar connection for GlassMeet hosts: OAuth, calendar list, busy times for booking
// pages, and copying bookings into the host's Google Calendar. Setup: see README.md here.
//
// Deploy WITHOUT gateway JWT verification. The OAuth callback is a plain browser redirect from
// Google, and freeBusy / pushBooking are called by guests on public booking pages. Actions that
// belong to a host check the caller's session themselves (supabase.auth.getUser):
//   supabase functions deploy google-calendar --no-verify-jwt
//
// Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, APP_URL (https://hyper3dp.github.io/glassmeet).
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
// Tokens are never logged or returned to the browser.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const SUPABASE_URL = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/+$/, '');
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';
const APP_URL = (Deno.env.get('APP_URL') ?? 'https://hyper3dp.github.io/glassmeet').replace(/\/+$/, '');
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/google-calendar/callback`;
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events', // create, change and delete the booking events
  'https://www.googleapis.com/auth/calendar.readonly', // calendar list, free/busy, the account's email
];
const DEFAULT_RETURN = '/calendar-connections';
const STATE_TTL_MS = 10 * 60 * 1000;
const GOOGLE_TIMEOUT_MS = 10_000;
const MAX_WINDOW_MS = 62 * 864e5;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const configured = () => Boolean(CLIENT_ID && CLIENT_SECRET && SUPABASE_URL && SERVICE_KEY);

// ── HTTP helpers ─────────────────────────────────────────────────────────────
const ALLOWED_ORIGIN = /^(https:\/\/hyper3dp\.github\.io|http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?)$/;
const cors = (req: Request): Record<string, string> => {
  const origin = req.headers.get('Origin') ?? '';
  return {
    ...(ALLOWED_ORIGIN.test(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
};

class Fail extends Error {
  constructor(public status: number, public code: string, message?: string) { super(message ?? code); }
}

const json = (req: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors(req), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

const redirect = (location: string) => new Response(null, {
  status: 302,
  headers: { Location: location, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// only a plain path inside the app: no scheme, no host, no "//", no backslash
const safeReturn = (value: unknown) =>
  typeof value === 'string' && value.length <= 200 && /^\/[A-Za-z0-9\-_/]*$/.test(value) && !value.startsWith('//')
    ? value : DEFAULT_RETURN;

// ── signed OAuth state ───────────────────────────────────────────────────────
const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

let stateKey: Promise<CryptoKey> | null = null;
// a key of its own, derived from the client secret, so the secret itself never signs anything
const getStateKey = () => stateKey ??= (async () => {
  const base = await crypto.subtle.importKey('raw', enc.encode(CLIENT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const derived = await crypto.subtle.sign('HMAC', base, enc.encode('glassmeet google-calendar oauth state v1'));
  return crypto.subtle.importKey('raw', derived, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
})();

type State = { u: string; r: string; e: number; n: string };

const signState = async (userId: string, returnTo: string) => {
  const payload: State = { u: userId, r: returnTo, e: Date.now() + STATE_TTL_MS, n: b64url(crypto.getRandomValues(new Uint8Array(12))) };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await getStateKey(), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
};

const readState = async (state: unknown): Promise<State | null> => {
  if (typeof state !== 'string' || state.length > 1000) return null;
  const [body, sig, extra] = state.split('.');
  if (!body || !sig || extra !== undefined) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await getStateKey(), fromB64url(sig), enc.encode(body));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(body))) as State;
    if (typeof payload.u !== 'string' || !UUID.test(payload.u) || typeof payload.e !== 'number' || payload.e < Date.now()) return null;
    return { ...payload, r: safeReturn(payload.r) };
  } catch {
    return null;
  }
};

// ── callers ──────────────────────────────────────────────────────────────────
const bearer = (req: Request) => {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  // a user session is a JWT; the publishable / anon key is a guest
  return token.split('.').length === 3 && token !== ANON_KEY ? token : '';
};

const optionalUser = async (req: Request) => {
  const token = bearer(req);
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error ? null : data.user;
};

const requireUser = async (req: Request) => {
  const user = await optionalUser(req);
  if (!user) throw new Fail(401, 'unauthorized', 'Sign in again to manage Google Calendar.');
  return user;
};

// ── Google API ───────────────────────────────────────────────────────────────
const googleFetch = (url: string, init: RequestInit = {}) =>
  fetch(url, { ...init, signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS) });

const tokenRequest = async (params: Record<string, string>) => {
  const res = await googleFetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, ...params }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
};

const markDisconnected = async (userId: string) => {
  await admin.from('google_tokens').delete().eq('user_id', userId);
  await admin.from('google_accounts').update({ connected: false }).eq('user_id', userId);
};

// a valid access token for the host, refreshed when it is about to expire
const accessToken = async (userId: string): Promise<string> => {
  const { data: row, error } = await admin.from('google_tokens')
    .select('refresh_token, access_token, expires_at').eq('user_id', userId).maybeSingle();
  if (error) throw new Fail(500, 'db_error', 'Could not read the Google connection.');
  if (!row) throw new Fail(409, 'not_connected', 'Google Calendar is not connected.');
  if (row.access_token && row.expires_at && new Date(row.expires_at).getTime() > Date.now() + 60_000) return row.access_token;

  const { ok, data } = await tokenRequest({ grant_type: 'refresh_token', refresh_token: row.refresh_token });
  if (!ok) {
    if (data?.error === 'invalid_grant') {
      await markDisconnected(userId);
      throw new Fail(409, 'reconnect', 'Google stopped accepting this connection. Connect Google Calendar again.');
    }
    console.error('google token refresh failed', data?.error ?? 'unknown');
    throw new Fail(502, 'google_error', 'Google Calendar did not respond. Try again in a moment.');
  }
  await admin.from('google_tokens').update({
    access_token: data.access_token,
    expires_at: new Date(Date.now() + (Number(data.expires_in) || 3600) * 1000).toISOString(),
    ...(data.refresh_token ? { refresh_token: data.refresh_token } : {}),
  }).eq('user_id', userId);
  return data.access_token as string;
};

const calendarApi = async (userId: string, path: string, init: RequestInit = {}) => {
  const token = await accessToken(userId);
  return googleFetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
};

const cal = (id: string) => encodeURIComponent(id || 'primary');

type Account = { user_id: string; email: string | null; calendar_id: string; calendar_name: string | null; auto_sync: boolean; connected: boolean };

const getAccount = async (userId: string): Promise<Account | null> => {
  const { data, error } = await admin.from('google_accounts')
    .select('user_id, email, calendar_id, calendar_name, auto_sync, connected').eq('user_id', userId).maybeSingle();
  if (error) throw new Fail(500, 'db_error', 'Could not read the Google connection.');
  return data && data.connected ? data as Account : null;
};

const writableCalendars = async (userId: string) => {
  const res = await calendarApi(userId, '/users/me/calendarList?minAccessRole=writer&maxResults=250');
  if (!res.ok) {
    console.error('google calendarList failed', res.status);
    throw new Fail(502, 'google_error', 'Could not load your Google calendars.');
  }
  const data = await res.json();
  // the primary calendar is stored as "primary", so it survives an email change
  return (data.items ?? []).map((c: { id: string; summary?: string; summaryOverride?: string; primary?: boolean }) => ({
    id: c.primary ? 'primary' : c.id,
    summary: c.summaryOverride || c.summary || c.id,
    primary: Boolean(c.primary),
  }));
};

// ── bookings → Google events ─────────────────────────────────────────────────
type Booking = {
  id: string; host_id: string; event_name: string | null; guest_name: string | null; guest_email: string | null;
  guest_phone: string | null; guest_notes: string | null; meeting_url: string | null; start_time: string; end_time: string;
  timezone: string | null; status: string; approval_status: string; created_date: string;
  google_event_id: string | null; google_cal: string | null; google_hash: string | null;
  event_types: { address?: string | null; location?: string | null; meeting_url?: string | null; booking_type?: string | null } | null;
};
const BOOKING_FIELDS = 'id, host_id, event_name, guest_name, guest_email, guest_phone, guest_notes, meeting_url, start_time, end_time, timezone, status, approval_status, created_date, google_event_id, google_cal, google_hash, event_types(address, location, meeting_url, booking_type)';

// Google event ids may use 0-9 and a-v; a booking's uuid in hex fits, so each booking has one
// fixed event id. Re-sending a booking can't create a second event, and the function never acts
// on an event id it didn't make itself.
const eventIdFor = (bookingId: string) => `gm${bookingId.replace(/-/g, '').toLowerCase()}`;

const isActive = (b: Booking) => b.status !== 'cancelled' && b.approval_status === 'approved';

const eventBody = (b: Booking) => {
  const e = Array.isArray(b.event_types) ? b.event_types[0] : b.event_types;
  const where = e?.address || b.meeting_url || e?.meeting_url || e?.location || '';
  const description = [
    b.guest_name && `Guest: ${b.guest_name}`,
    b.guest_email && `Email: ${b.guest_email}`,
    b.guest_phone && `WhatsApp: ${b.guest_phone}`,
    b.meeting_url && `Join: ${b.meeting_url}`,
    b.guest_notes && `Notes: ${b.guest_notes}`,
    'Booked with GlassMeet',
  ].filter(Boolean).join('\n').slice(0, 8000);
  return {
    summary: `${b.event_name || 'Meeting'}${b.guest_name ? ` with ${b.guest_name}` : ''}`.slice(0, 500),
    description,
    ...(where ? { location: String(where).slice(0, 1000) } : {}),
    start: { dateTime: new Date(b.start_time).toISOString(), ...(b.timezone ? { timeZone: b.timezone } : {}) },
    end: { dateTime: new Date(b.end_time).toISOString(), ...(b.timezone ? { timeZone: b.timezone } : {}) },
    status: 'confirmed',
    // a group meeting with seats left must not read as busy on the booking page's own free/busy check
    transparency: e?.booking_type === 'group' ? 'transparent' : 'opaque',
    extendedProperties: { private: { glassmeet_booking: b.id } },
  };
};

const digest = async (value: unknown) =>
  b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(JSON.stringify(value))))).slice(0, 32);

const saveLink = (id: string, fields: { google_event_id: string | null; google_cal: string | null; google_hash: string | null }) =>
  admin.from('bookings').update(fields).eq('id', id);

const deleteEvent = async (userId: string, calendarId: string, eventId: string) => {
  const res = await calendarApi(userId, `/calendars/${cal(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=none`, { method: 'DELETE' });
  await res.body?.cancel();
  // already gone counts as done
  if (!res.ok && res.status !== 404 && res.status !== 410) throw new Fail(502, 'google_error', `Google refused to delete an event (${res.status}).`);
};

// makes Google match one booking; returns what happened
const syncBooking = async (account: Account, b: Booking): Promise<'created' | 'updated' | 'deleted' | 'unchanged'> => {
  const userId = account.user_id;
  const eventId = eventIdFor(b.id);

  if (!isActive(b)) {
    if (!b.google_event_id) return 'unchanged';
    await deleteEvent(userId, b.google_cal || account.calendar_id, eventId);
    await saveLink(b.id, { google_event_id: null, google_cal: null, google_hash: null });
    return 'deleted';
  }

  const calendarId = account.calendar_id || 'primary';
  const body = eventBody(b);
  const hash = await digest({ calendarId, body });
  if (b.google_event_id && b.google_hash === hash) return 'unchanged';

  // the host picked another calendar since: move the event
  if (b.google_event_id && b.google_cal && b.google_cal !== calendarId) {
    await deleteEvent(userId, b.google_cal, eventId).catch(() => undefined);
  }

  let res = await calendarApi(userId, `/calendars/${cal(calendarId)}/events?sendUpdates=none`, {
    method: 'POST', body: JSON.stringify({ id: eventId, ...body }),
  });
  let result: 'created' | 'updated' = 'created';
  if (res.status === 409) {
    // the id exists (an earlier copy, or one deleted before): overwrite and restore it
    await res.body?.cancel();
    res = await calendarApi(userId, `/calendars/${cal(calendarId)}/events/${eventId}?sendUpdates=none`, {
      method: 'PUT', body: JSON.stringify(body),
    });
    result = 'updated';
  }
  await res.body?.cancel();
  if (!res.ok) {
    console.error('google event write failed', res.status);
    throw new Fail(502, 'google_error', `Google refused to save an event (${res.status}).`);
  }
  await saveLink(b.id, { google_event_id: eventId, google_cal: calendarId, google_hash: hash });
  return result;
};

// ── actions ──────────────────────────────────────────────────────────────────
type Body = Record<string, unknown>;

const actions: Record<string, (req: Request, body: Body) => Promise<unknown>> = {
  authUrl: async (req, body) => {
    const user = await requireUser(req);
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state: await signState(user.id, safeReturn(body.returnTo)),
      ...(user.email ? { login_hint: user.email } : {}),
    });
    return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` };
  },

  // The app calls this with the code Google sent to /callback, signed in as the host who started.
  // Finishing here (not in /callback) ties the connection to the browser's own session, so a
  // consent link someone else started can't attach your Google account to their GlassMeet.
  finish: async (req, body) => {
    const user = await requireUser(req);
    const state = await readState(body.state);
    if (!state) throw new Fail(400, 'state', 'That Google sign-in expired. Try connecting again.');
    if (state.u !== user.id) throw new Fail(403, 'wrong_user', 'That Google sign-in was started by another GlassMeet account.');
    if (typeof body.code !== 'string' || !body.code || body.code.length > 2000) throw new Fail(400, 'code', 'Google did not send a sign-in code.');

    const { ok, data } = await tokenRequest({ grant_type: 'authorization_code', code: body.code, redirect_uri: REDIRECT_URI });
    if (!ok || !data.access_token) {
      console.error('google code exchange failed', data?.error ?? 'unknown');
      throw new Fail(400, 'exchange', 'Google did not accept the sign-in. Try connecting again.');
    }
    const granted = String(data.scope ?? '').split(' ');
    if (!SCOPES.every((s) => granted.includes(s))) {
      throw new Fail(400, 'scopes', 'Allow GlassMeet to see and edit your calendar events, then try again.');
    }

    // the primary calendar's id is the account's email
    const primary = await googleFetch('https://www.googleapis.com/calendar/v3/calendars/primary', { headers: { Authorization: `Bearer ${data.access_token}` } });
    const primaryData = primary.ok ? await primary.json() : (await primary.body?.cancel(), null);
    const email: string | null = primaryData?.id ?? null;

    const { data: existing } = await admin.from('google_tokens').select('refresh_token').eq('user_id', user.id).maybeSingle();
    const refreshToken = data.refresh_token || existing?.refresh_token;
    if (!refreshToken) throw new Fail(400, 'no_refresh', 'Google did not grant offline access. Try connecting again.');

    const { error: tokenError } = await admin.from('google_tokens').upsert({
      user_id: user.id,
      refresh_token: refreshToken,
      access_token: data.access_token,
      expires_at: new Date(Date.now() + (Number(data.expires_in) || 3600) * 1000).toISOString(),
    });
    if (tokenError) throw new Fail(500, 'db_error', 'Could not save the Google connection.');

    const { data: before } = await admin.from('google_accounts').select('email').eq('user_id', user.id).maybeSingle();
    const sameAccount = before && before.email === email;
    const { error: accountError } = await admin.from('google_accounts').upsert({
      user_id: user.id,
      email,
      connected: true,
      connected_date: new Date().toISOString(),
      // another Google account: its calendars differ, start from its primary
      ...(sameAccount ? {} : { calendar_id: 'primary', calendar_name: primaryData?.summary ?? null }),
    });
    if (accountError) throw new Fail(500, 'db_error', 'Could not save the Google connection.');
    return { connected: true, email };
  },

  listCalendars: async (req) => {
    const user = await requireUser(req);
    if (!await getAccount(user.id)) throw new Fail(409, 'not_connected', 'Google Calendar is not connected.');
    return writableCalendars(user.id);
  },

  saveSettings: async (req, body) => {
    const user = await requireUser(req);
    const account = await getAccount(user.id);
    if (!account) throw new Fail(409, 'not_connected', 'Google Calendar is not connected.');
    const update: Record<string, unknown> = {};
    if (typeof body.autoSync === 'boolean') update.auto_sync = body.autoSync;
    if (typeof body.calendarId === 'string' && body.calendarId && body.calendarId !== account.calendar_id) {
      const found = (await writableCalendars(user.id)).find((c: { id: string }) => c.id === body.calendarId);
      if (!found) throw new Fail(400, 'calendar', 'GlassMeet can’t add events to that calendar.');
      update.calendar_id = found.id;
      update.calendar_name = found.summary;
    }
    const fields = 'calendar_id, calendar_name, auto_sync';
    const { data, error } = Object.keys(update).length
      ? await admin.from('google_accounts').update(update).eq('user_id', user.id).select(fields).single()
      : await admin.from('google_accounts').select(fields).eq('user_id', user.id).single();
    if (error) throw new Fail(500, 'db_error', 'Could not save the setting.');
    return { calendarId: data.calendar_id, calendarName: data.calendar_name, autoSync: data.auto_sync };
  },

  disconnect: async (req) => {
    const user = await requireUser(req);
    const { data: row } = await admin.from('google_tokens').select('refresh_token').eq('user_id', user.id).maybeSingle();
    if (row?.refresh_token) {
      // best effort: the rows go either way
      await googleFetch('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: row.refresh_token }),
      }).then((r) => r.body?.cancel()).catch(() => undefined);
    }
    await admin.from('google_tokens').delete().eq('user_id', user.id);
    await admin.from('google_accounts').delete().eq('user_id', user.id);
    // events already in Google stay; reconnecting later reuses the same event ids, so no doubles
    await admin.from('bookings').update({ google_event_id: null, google_cal: null, google_hash: null })
      .eq('host_id', user.id).not('google_event_id', 'is', null);
    return { success: true };
  },

  sync: async (req) => {
    const user = await requireUser(req);
    const account = await getAccount(user.id);
    if (!account) throw new Fail(409, 'not_connected', 'Google Calendar is not connected.');
    const { data: bookings, error } = await admin.from('bookings').select(BOOKING_FIELDS)
      .eq('host_id', user.id)
      .gte('end_time', new Date().toISOString())
      .order('start_time')
      .limit(200);
    if (error) throw new Fail(500, 'db_error', 'Could not read your bookings.');
    const counts = { created: 0, updated: 0, deleted: 0, unchanged: 0, failed: 0 };
    for (const b of (bookings ?? []) as unknown as Booking[]) {
      try {
        counts[await syncBooking(account, b)]++;
      } catch (e) {
        // a lost connection stops the run; one bad event doesn't
        if (e instanceof Fail && (e.code === 'reconnect' || e.code === 'not_connected')) throw e;
        counts.failed++;
      }
    }
    const syncedDate = new Date().toISOString();
    await admin.from('google_accounts').update({ synced_date: syncedDate }).eq('user_id', user.id);
    return { ...counts, syncedDate };
  },

  // PUBLIC: busy intervals for a host's booking page. Times only, nothing about the events.
  freeBusy: async (_req, body) => {
    const { hostId, timeMin, timeMax } = body;
    if (typeof hostId !== 'string' || !UUID.test(hostId)) throw new Fail(400, 'input', 'hostId must be a uuid.');
    const min = new Date(String(timeMin)), max = new Date(String(timeMax));
    if (Number.isNaN(min.getTime()) || Number.isNaN(max.getTime()) || max <= min || max.getTime() - min.getTime() > MAX_WINDOW_MS) {
      throw new Fail(400, 'input', 'timeMin and timeMax must be a window of at most 62 days.');
    }
    const account = await getAccount(hostId);
    if (!account) return [];
    const ids = [...new Set([account.calendar_id || 'primary', 'primary'])];
    try {
      const res = await calendarApi(hostId, '/freeBusy', {
        method: 'POST',
        body: JSON.stringify({ timeMin: min.toISOString(), timeMax: max.toISOString(), items: ids.map((id) => ({ id })) }),
      });
      if (!res.ok) { await res.body?.cancel(); console.error('google freeBusy failed', res.status); return []; }
      const data = await res.json();
      const busy: { start: string; end: string }[] = [];
      for (const c of Object.values(data.calendars ?? {}) as { busy?: { start: string; end: string }[] }[]) {
        for (const x of c.busy ?? []) if (x?.start && x?.end) busy.push({ start: String(x.start), end: String(x.end) });
      }
      return busy;
    } catch (e) {
      // the booking page still works from GlassMeet's own times
      if (!(e instanceof Fail)) console.error('google freeBusy error', (e as Error)?.name);
      return [];
    }
  },

  // PUBLIC: copy a booking a guest just made. A signed-in host may also call it for their own
  // booking at any time (after approving, cancelling or declining it).
  pushBooking: async (req, body) => {
    const { bookingId } = body;
    if (typeof bookingId !== 'string' || !UUID.test(bookingId)) throw new Fail(400, 'input', 'bookingId must be a uuid.');
    const { data, error } = await admin.from('bookings').select(BOOKING_FIELDS).eq('id', bookingId).maybeSingle();
    if (error) throw new Fail(500, 'db_error', 'Could not read the booking.');
    const b = data as unknown as Booking | null;
    if (!b) return { pushed: false };
    const user = await optionalUser(req);
    const isHost = user?.id === b.host_id;
    if (!isHost) {
      const fresh = Date.now() - new Date(b.created_date).getTime() < 10 * 60 * 1000;
      if (!fresh || b.status !== 'confirmed' || b.approval_status !== 'approved' || b.google_event_id) return { pushed: false };
    }
    const account = await getAccount(b.host_id);
    if (!account || !account.auto_sync) return { pushed: false };
    try {
      const result = await syncBooking(account, b);
      return { pushed: result !== 'unchanged' };
    } catch (e) {
      // guests don't hear about the host's Google problems; the next sync catches up
      if (!isHost) return { pushed: false };
      throw e;
    }
  },
};

const PUBLIC_ACTIONS = new Set(['freeBusy', 'pushBooking']);

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Google sends the browser here after consent. Check the state and hand the code to the app,
  // where the signed-in host finishes the connection.
  if (url.pathname.endsWith('/callback')) {
    if (req.method !== 'GET') return new Response('Method not allowed', { status: 405 });
    const state = await readState(url.searchParams.get('state'));
    const back = (params: Record<string, string>) => redirect(`${APP_URL}${state?.r ?? DEFAULT_RETURN}?${new URLSearchParams(params)}`);
    if (!state) return back({ google: 'error', reason: 'state' });
    const error = url.searchParams.get('error');
    if (error) return back({ google: 'error', reason: error === 'access_denied' ? 'denied' : 'google' });
    const code = url.searchParams.get('code');
    if (!code) return back({ google: 'error', reason: 'code' });
    return back({ google: 'finish', code, state: url.searchParams.get('state')! });
  }

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== 'POST') return json(req, { error: 'method', message: 'Use POST.' }, 405);

  let body: Body;
  try {
    body = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('not an object');
  } catch {
    return json(req, { error: 'input', message: 'Send a JSON object.' }, 400);
  }
  const action = typeof body.action === 'string' ? body.action : '';
  const run = Object.hasOwn(actions, action) ? actions[action] : undefined;
  if (!run) return json(req, { error: 'action', message: 'Unknown action.' }, 400);

  if (!configured()) {
    // guests' pages just get no Google busy times
    if (PUBLIC_ACTIONS.has(action)) return json(req, action === 'freeBusy' ? [] : { pushed: false });
    return json(req, { error: 'not_configured', message: 'Google Calendar isn’t available yet.' }, 503);
  }

  try {
    return json(req, await run(req, body));
  } catch (e) {
    if (e instanceof Fail) return json(req, { error: e.code, message: e.message }, e.status);
    console.error('google-calendar failed', action, (e as Error)?.name, (e as Error)?.message?.slice(0, 200));
    const timeout = (e as Error)?.name === 'TimeoutError';
    return json(req, { error: timeout ? 'timeout' : 'server', message: timeout ? 'Google Calendar took too long. Try again.' : 'Something went wrong.' }, timeout ? 504 : 500);
  }
});
