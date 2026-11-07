// Zoom and Microsoft (Outlook and Teams) connections for GlassMeet hosts: OAuth, busy times from
// Outlook for booking pages, copying bookings into Outlook, and a Zoom or Teams link per booking.
// Setup: see README.md here. Google has its own function, google-calendar.
//
// Deploy WITHOUT gateway JWT verification. The OAuth callback is a plain browser redirect, and
// freeBusy / pushBooking are called by guests on public booking pages. Actions that belong to a
// host check the caller's session themselves:
//   supabase functions deploy connections --no-verify-jwt
//
// Secrets: ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET, MS_CLIENT_ID, MS_CLIENT_SECRET, APP_URL. A provider
// without its secrets shows as not available yet. Tokens are never logged or sent to the browser.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const SUPABASE_URL = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/+$/, '');
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const APP_URL = (Deno.env.get('APP_URL') ?? 'https://glassmeet.run.place').replace(/\/+$/, '');
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/connections/callback`;
const DEFAULT_RETURN = '/calendar-connections';
const STATE_TTL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;
const DAY_MS = 864e5;
const MAX_WINDOW_MS = 62 * DAY_MS;
const GRAPH = 'https://graph.microsoft.com/v1.0';
const ZOOM_API = 'https://api.zoom.us/v2';

type Provider = 'zoom' | 'microsoft';
const NAMES: Record<Provider, string> = { zoom: 'Zoom', microsoft: 'Microsoft' };
const CREDS: Record<Provider, { id: string; secret: string }> = {
  zoom: { id: Deno.env.get('ZOOM_CLIENT_ID') ?? '', secret: Deno.env.get('ZOOM_CLIENT_SECRET') ?? '' },
  microsoft: { id: Deno.env.get('MS_CLIENT_ID') ?? '', secret: Deno.env.get('MS_CLIENT_SECRET') ?? '' },
};
// Calendars.ReadWrite is enough for a Teams link: it comes from the calendar event
const MS_SCOPES = 'openid email offline_access User.Read Calendars.ReadWrite';
const MS_AUTH = 'https://login.microsoftonline.com/common/oauth2/v2.0';

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const configured = (p: Provider) => Boolean(CREDS[p].id && CREDS[p].secret && SUPABASE_URL && SERVICE_KEY);
const asProvider = (value: unknown): Provider => {
  if (value === 'zoom' || value === 'microsoft') return value;
  throw new Fail(400, 'input', 'Unknown connection.');
};

// ── HTTP helpers ─────────────────────────────────────────────────────────────
const ALLOWED_ORIGIN = /^(https:\/\/glassmeet\.run\.place|https:\/\/hyper3dp\.github\.io|http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?)$/;
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
const getStateKey = () => stateKey ??= (async () => {
  const base = await crypto.subtle.importKey('raw', enc.encode(SERVICE_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const derived = await crypto.subtle.sign('HMAC', base, enc.encode('glassmeet connections oauth state v1'));
  return crypto.subtle.importKey('raw', derived, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
})();

type State = { u: string; p: Provider; r: string; e: number; n: string };

const signState = async (userId: string, provider: Provider, returnTo: string) => {
  const payload: State = { u: userId, p: provider, r: returnTo, e: Date.now() + STATE_TTL_MS, n: b64url(crypto.getRandomValues(new Uint8Array(12))) };
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
    if (!UUID.test(String(payload.u)) || typeof payload.e !== 'number' || payload.e < Date.now()) return null;
    if (payload.p !== 'zoom' && payload.p !== 'microsoft') return null;
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
  if (!user) throw new Fail(401, 'unauthorized', 'Sign in again to manage this connection.');
  return user;
};

// ── tokens and provider APIs ─────────────────────────────────────────────────
const timed = (url: string, init: RequestInit = {}) => fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });

const tokenRequest = async (provider: Provider, params: Record<string, string>) => {
  const { id, secret } = CREDS[provider];
  const res = provider === 'zoom'
    ? await timed('https://zoom.us/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${btoa(`${id}:${secret}`)}` },
      body: new URLSearchParams(params),
    })
    : await timed(`${MS_AUTH}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: id, client_secret: secret, scope: MS_SCOPES, ...params }),
    });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
};

// Zoom reports a dead refresh token as a 4xx with a `reason`; Microsoft as invalid_grant
const tokenRevoked = (data: { error?: string; reason?: string }) =>
  data?.error === 'invalid_grant' || /invalid.*token|token.*(expired|invalid)/i.test(data?.reason ?? '');

// only the refresh token that was refused: a reconnect that saved a new one meanwhile stays
const markDisconnected = async (userId: string, provider: Provider, refreshToken: string) => {
  const { data: gone } = await admin.from('connection_tokens').delete()
    .eq('user_id', userId).eq('provider', provider).eq('refresh_token', refreshToken).select('user_id');
  if (gone?.length) await admin.from('connections').update({ connected: false }).eq('user_id', userId).eq('provider', provider);
};

const accessToken = async (userId: string, provider: Provider, force = false): Promise<string> => {
  const { data: row, error } = await admin.from('connection_tokens')
    .select('refresh_token, access_token, expires_at').eq('user_id', userId).eq('provider', provider).maybeSingle();
  if (error) throw new Fail(500, 'db_error', 'Could not read the connection.');
  if (!row) throw new Fail(409, 'not_connected', `${NAMES[provider]} is not connected.`);
  if (!force && row.access_token && row.expires_at && new Date(row.expires_at).getTime() > Date.now() + 60_000) return row.access_token;

  const { ok, data } = await tokenRequest(provider, { grant_type: 'refresh_token', refresh_token: row.refresh_token });
  if (!ok || !data.access_token) {
    if (tokenRevoked(data)) {
      await markDisconnected(userId, provider, row.refresh_token);
      throw new Fail(409, 'reconnect', `${NAMES[provider]} stopped accepting this connection. Connect it again.`);
    }
    console.error('token refresh failed', provider, data?.error ?? 'unknown');
    throw new Fail(502, 'provider_error', `${NAMES[provider]} did not respond. Try again in a moment.`);
  }
  await admin.from('connection_tokens').update({
    access_token: data.access_token,
    expires_at: new Date(Date.now() + (Number(data.expires_in) || 3600) * 1000).toISOString(),
    // both providers may replace the refresh token on each use
    ...(data.refresh_token ? { refresh_token: data.refresh_token } : {}),
  }).eq('user_id', userId).eq('provider', provider);
  return data.access_token as string;
};

const callApi = async (provider: Provider, userId: string, url: string, init: RequestInit = {}) => {
  const send = (token: string) => timed(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
  });
  const res = await send(await accessToken(userId, provider));
  if (res.status !== 401) return res;
  // the cached token was revoked before it expired: refresh once
  await res.body?.cancel();
  return send(await accessToken(userId, provider, true));
};

type Account = { user_id: string; provider: Provider; email: string | null; teams: boolean; auto_sync: boolean; connected: boolean };

const getAccount = async (userId: string, provider: Provider): Promise<Account | null> => {
  if (!configured(provider)) return null;
  const { data, error } = await admin.from('connections')
    .select('user_id, provider, email, teams, auto_sync, connected').eq('user_id', userId).eq('provider', provider).maybeSingle();
  if (error) throw new Fail(500, 'db_error', 'Could not read the connection.');
  return data && data.connected ? data as Account : null;
};

// ── bookings ─────────────────────────────────────────────────────────────────
type EventInfo = { address?: string | null; location?: string | null; meeting_url?: string | null; booking_type?: string | null };
type Booking = {
  id: string; host_id: string; event_type_id: string | null; event_name: string | null; guest_name: string | null;
  guest_email: string | null; guest_phone: string | null; guest_notes: string | null; meeting_url: string | null;
  start_time: string; end_time: string; status: string; approval_status: string; created_date: string;
  ms_event_id: string | null; ms_hash: string | null; zoom_id: string | null;
  event_types: EventInfo | EventInfo[] | null;
};
const BOOKING_FIELDS = 'id, host_id, event_type_id, event_name, guest_name, guest_email, guest_phone, guest_notes, meeting_url, start_time, end_time, status, approval_status, created_date, ms_event_id, ms_hash, zoom_id, event_types(address, location, meeting_url, booking_type)';

const eventOf = (b: Booking): EventInfo | null => (Array.isArray(b.event_types) ? b.event_types[0] : b.event_types) ?? null;
const isActive = (b: Booking) => b.status !== 'cancelled' && b.approval_status === 'approved';
const isGroup = (b: Booking) => eventOf(b)?.booking_type === 'group';
const hasOwnLink = (b: Booking) => Boolean(b.meeting_url || eventOf(b)?.meeting_url);

const digest = async (value: unknown) =>
  b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(JSON.stringify(value))))).slice(0, 32);

// The other guests booked into the same group session, who share one meeting
const sessionMates = async (b: Booking) => {
  if (!isGroup(b) || !b.event_type_id) return [];
  const { data, error } = await admin.from('bookings')
    .select('id, meeting_url, ms_event_id, zoom_id')
    .eq('event_type_id', b.event_type_id).eq('start_time', b.start_time).neq('id', b.id)
    .neq('status', 'cancelled').neq('approval_status', 'declined');
  if (error) throw new Fail(500, 'db_error', 'Could not read the booking.');
  return data ?? [];
};

const saveFields = async (id: string, fields: Record<string, unknown>) => {
  const { error } = await admin.from('bookings').update(fields).eq('id', id);
  if (error) throw new Fail(500, 'db_error', 'Could not save the booking.');
};

// ── Zoom ─────────────────────────────────────────────────────────────────────
const deleteZoomMeeting = async (userId: string, meetingId: string) => {
  const res = await callApi('zoom', userId, `${ZOOM_API}/meetings/${encodeURIComponent(meetingId)}`, { method: 'DELETE' });
  await res.body?.cancel();
  if (!res.ok && res.status !== 404) throw new Fail(502, 'provider_error', `Zoom refused to delete a meeting (${res.status}).`);
};

const syncZoom = async (account: Account, b: Booking) => {
  const userId = account.user_id;
  const minutes = Math.max(1, Math.round((new Date(b.end_time).getTime() - new Date(b.start_time).getTime()) / 60000));

  if (!isActive(b)) {
    if (!b.zoom_id) return false;
    // others are still coming to this session: the meeting stays, and one of them takes it over
    const mates = await sessionMates(b);
    if (mates.length) await saveFields(mates[0].id, { zoom_id: b.zoom_id });
    else await deleteZoomMeeting(userId, b.zoom_id);
    await saveFields(b.id, { zoom_id: null });
    return true;
  }

  if (b.zoom_id) {
    const res = await callApi('zoom', userId, `${ZOOM_API}/meetings/${encodeURIComponent(b.zoom_id)}`, {
      method: 'PATCH', body: JSON.stringify({ start_time: new Date(b.start_time).toISOString().replace(/\.\d+Z$/, 'Z'), duration: minutes, timezone: 'UTC' }),
    });
    await res.body?.cancel();
    if (!res.ok && res.status !== 404) throw new Fail(502, 'provider_error', `Zoom refused to update a meeting (${res.status}).`);
    return false;
  }

  if (eventOf(b)?.location !== 'Zoom' || hasOwnLink(b)) return false;

  const shared = (await sessionMates(b)).find((m) => m.meeting_url);
  if (shared) {
    await saveFields(b.id, { meeting_url: shared.meeting_url });
    return true;
  }

  const res = await callApi('zoom', userId, `${ZOOM_API}/users/me/meetings`, {
    method: 'POST',
    body: JSON.stringify({
      topic: `${b.event_name || 'Meeting'}${b.guest_name && !isGroup(b) ? ` with ${b.guest_name}` : ''}`.slice(0, 200),
      type: 2,
      start_time: new Date(b.start_time).toISOString().replace(/\.\d+Z$/, 'Z'),
      duration: minutes,
      timezone: 'UTC',
    }),
  });
  const meeting = res.ok ? await res.json() : (await res.body?.cancel(), null);
  if (!meeting?.join_url) {
    console.error('zoom meeting failed', res.status);
    throw new Fail(502, 'provider_error', `Zoom refused to create a meeting (${res.status}).`);
  }
  // Two calls for one booking must not leave a spare meeting: only the first one's is kept
  const { data: claimed, error } = await admin.from('bookings')
    .update({ zoom_id: String(meeting.id), meeting_url: meeting.join_url })
    .eq('id', b.id).is('zoom_id', null).select('id');
  if (error || !claimed?.length) {
    await deleteZoomMeeting(userId, String(meeting.id)).catch(() => undefined);
    return false;
  }
  return true;
};

// ── Outlook and Teams ────────────────────────────────────────────────────────
const outlookBody = (b: Booking) => {
  const e = eventOf(b);
  const where = e?.address || b.meeting_url || e?.meeting_url || e?.location || '';
  // a group session is one event, so it isn't named after whoever booked it first
  const group = isGroup(b);
  const content = [
    !group && b.guest_name && `Guest: ${b.guest_name}`,
    !group && b.guest_email && `Email: ${b.guest_email}`,
    !group && b.guest_phone && `WhatsApp: ${b.guest_phone}`,
    b.meeting_url && `Join: ${b.meeting_url}`,
    !group && b.guest_notes && `Notes: ${b.guest_notes}`,
    'Booked with GlassMeet',
  ].filter(Boolean).join('\n').slice(0, 8000);
  return {
    subject: `${b.event_name || 'Meeting'}${b.guest_name && !group ? ` with ${b.guest_name}` : ''}`.slice(0, 255),
    body: { contentType: 'text', content },
    start: { dateTime: new Date(b.start_time).toISOString(), timeZone: 'UTC' },
    end: { dateTime: new Date(b.end_time).toISOString(), timeZone: 'UTC' },
    ...(where ? { location: { displayName: String(where).slice(0, 1000) } } : {}),
    // a group session with seats left must not read as busy on the booking page's own check
    showAs: group ? 'free' : 'busy',
  };
};

const deleteOutlookEvent = async (userId: string, eventId: string) => {
  const res = await callApi('microsoft', userId, `${GRAPH}/me/events/${encodeURIComponent(eventId)}`, { method: 'DELETE' });
  await res.body?.cancel();
  if (!res.ok && res.status !== 404) throw new Fail(502, 'provider_error', `Outlook refused to delete an event (${res.status}).`);
};

const syncOutlook = async (account: Account, b: Booking): Promise<'created' | 'updated' | 'deleted' | 'unchanged'> => {
  const userId = account.user_id;

  if (!isActive(b)) {
    if (!b.ms_event_id) return 'unchanged';
    // others are still coming to this session: its event and Teams link stay
    const mates = await sessionMates(b);
    if (mates.length) await saveFields(mates[0].id, { ms_event_id: b.ms_event_id, ms_hash: b.ms_hash });
    else await deleteOutlookEvent(userId, b.ms_event_id);
    await saveFields(b.id, { ms_event_id: null, ms_hash: null });
    return 'deleted';
  }

  let wantsTeams = eventOf(b)?.location === 'Microsoft Teams' && account.teams && !hasOwnLink(b);

  // a later guest in a group session shares its event and link
  if (!b.ms_event_id) {
    const mates = await sessionMates(b);
    const lead = mates.find((m) => m.ms_event_id);
    if (lead) {
      if (wantsTeams && lead.meeting_url) await saveFields(b.id, { meeting_url: lead.meeting_url });
      return 'unchanged';
    }
    const link = wantsTeams ? mates.find((m) => m.meeting_url)?.meeting_url : null;
    if (link) { await saveFields(b.id, { meeting_url: link }); b.meeting_url = link; wantsTeams = false; }
  }

  const body = outlookBody(b);
  const hash = await digest(body);
  if (!wantsTeams && b.ms_event_id && b.ms_hash === hash) return 'unchanged';
  const send = wantsTeams ? { ...body, isOnlineMeeting: true, onlineMeetingProvider: 'teamsForBusiness' } : body;

  const create = (retry: boolean) => callApi('microsoft', userId, `${GRAPH}/me/events`, {
    method: 'POST',
    // the same id twice makes one event, so a repeated call can't create a second. After the host
    // deleted the event in Outlook (a retry here), a new one is what's wanted.
    body: JSON.stringify(retry ? send : { ...send, transactionId: b.id }),
  });
  let result: 'created' | 'updated' = 'created';
  let res: Response;
  if (b.ms_event_id) {
    res = await callApi('microsoft', userId, `${GRAPH}/me/events/${encodeURIComponent(b.ms_event_id)}`, { method: 'PATCH', body: JSON.stringify(send) });
    result = 'updated';
    if (res.status === 404) { await res.body?.cancel(); res = await create(true); result = 'created'; }
  } else {
    res = await create(false);
  }
  if (!res.ok) {
    await res.body?.cancel();
    console.error('outlook event write failed', res.status);
    throw new Fail(502, 'provider_error', `Outlook refused to save an event (${res.status}).`);
  }
  const saved = await res.json();

  let link: string | null = saved?.onlineMeeting?.joinUrl ?? null;
  if (wantsTeams && !link && saved?.id) {
    const found = await callApi('microsoft', userId, `${GRAPH}/me/events/${encodeURIComponent(saved.id)}?$select=onlineMeeting`);
    const data = found.ok ? await found.json() : (await found.body?.cancel(), null);
    link = data?.onlineMeeting?.joinUrl ?? null;
  }
  if (wantsTeams && link) b.meeting_url = link;
  await saveFields(b.id, {
    ms_event_id: saved.id,
    // from the booking as it now stands, so the next sync finds nothing to change
    ms_hash: await digest(outlookBody(b)),
    ...(wantsTeams && link ? { meeting_url: link } : {}),
  });
  return result;
};

// makes Zoom and Outlook match one booking; `manual`: the host asked (or changed the booking)
const pushOne = async (b: Booking, manual: boolean) => {
  let changed = false;
  const [zoom, microsoft] = await Promise.all([getAccount(b.host_id, 'zoom'), getAccount(b.host_id, 'microsoft')]);
  if (zoom) changed = await syncZoom(zoom, b) || changed;
  if (microsoft) {
    // auto-sync off stops new copies, except where the event's Teams link depends on one. A
    // change to one already in Outlook still follows.
    const needed = b.ms_event_id || microsoft.auto_sync || manual
      || (eventOf(b)?.location === 'Microsoft Teams' && microsoft.teams && !hasOwnLink(b));
    if (needed) changed = (await syncOutlook(microsoft, b)) !== 'unchanged' || changed;
  }
  return changed;
};

// ── actions ──────────────────────────────────────────────────────────────────
type Body = Record<string, unknown>;

const actions: Record<string, (req: Request, body: Body) => Promise<unknown>> = {
  // which connections can be offered (a provider without its secrets can't)
  available: () => Promise.resolve({ zoom: configured('zoom'), microsoft: configured('microsoft') }),

  authUrl: async (req, body) => {
    const provider = asProvider(body.provider);
    if (!configured(provider)) throw new Fail(503, 'not_configured', `${NAMES[provider]} isn’t available yet.`);
    const user = await requireUser(req);
    const state = await signState(user.id, provider, safeReturn(body.returnTo));
    if (provider === 'zoom') {
      // Zoom takes the scopes from the app's settings in its Marketplace
      const params = new URLSearchParams({ response_type: 'code', client_id: CREDS.zoom.id, redirect_uri: REDIRECT_URI, state });
      return { url: `https://zoom.us/oauth/authorize?${params}` };
    }
    const params = new URLSearchParams({
      client_id: CREDS.microsoft.id,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      response_mode: 'query',
      scope: MS_SCOPES,
      prompt: 'select_account',
      state,
    });
    return { url: `${MS_AUTH}/authorize?${params}` };
  },

  // The app calls this with the code sent to /callback, signed in as the host who started, so a
  // consent link someone else started can't attach their account to your GlassMeet.
  finish: async (req, body) => {
    const user = await requireUser(req);
    const state = await readState(body.state);
    if (!state) throw new Fail(400, 'state', 'That sign-in expired. Try connecting again.');
    if (state.u !== user.id) throw new Fail(403, 'wrong_user', 'That sign-in was started by another GlassMeet account.');
    const provider = state.p;
    if (!configured(provider)) throw new Fail(503, 'not_configured', `${NAMES[provider]} isn’t available yet.`);
    if (typeof body.code !== 'string' || !body.code || body.code.length > 4000) throw new Fail(400, 'code', 'No sign-in code was sent.');

    const { data: before } = await admin.from('connections').select('email, connected, connected_date').eq('user_id', user.id).eq('provider', provider).maybeSingle();
    const { ok, data } = await tokenRequest(provider, { grant_type: 'authorization_code', code: body.code, redirect_uri: REDIRECT_URI });
    if (!ok || !data.access_token) {
      // a code is single use: the same return handled twice finds the connection the first made
      if (before?.connected && Date.now() - new Date(before.connected_date).getTime() < STATE_TTL_MS) return { connected: true, email: before.email };
      console.error('code exchange failed', provider, data?.error ?? 'unknown');
      throw new Fail(400, 'exchange', `${NAMES[provider]} did not accept the sign-in. Try connecting again.`);
    }
    if (!data.refresh_token) throw new Fail(400, 'no_refresh', `${NAMES[provider]} did not grant lasting access. Try connecting again.`);
    const auth = { Authorization: `Bearer ${data.access_token}` };

    let email: string | null = null;
    let teams = false;
    if (provider === 'zoom') {
      const me = await timed(`${ZOOM_API}/users/me`, { headers: auth });
      const info = me.ok ? await me.json() : (await me.body?.cancel(), null);
      email = info?.email ?? null;
    } else {
      if (!/calendars\.readwrite/i.test(String(data.scope ?? ''))) throw new Fail(400, 'scopes', 'Allow GlassMeet to see and edit your calendar, then try again.');
      const [me, calendar] = await Promise.all([
        timed(`${GRAPH}/me?$select=mail,userPrincipalName`, { headers: auth }),
        timed(`${GRAPH}/me/calendar?$select=allowedOnlineMeetingProviders`, { headers: auth }),
      ]);
      const info = me.ok ? await me.json() : (await me.body?.cancel(), null);
      const cal = calendar.ok ? await calendar.json() : (await calendar.body?.cancel(), null);
      email = info?.mail || info?.userPrincipalName || null;
      teams = (cal?.allowedOnlineMeetingProviders ?? []).includes('teamsForBusiness');
    }

    const { error: tokenError } = await admin.from('connection_tokens').upsert({
      user_id: user.id,
      provider,
      refresh_token: data.refresh_token,
      access_token: data.access_token,
      expires_at: new Date(Date.now() + (Number(data.expires_in) || 3600) * 1000).toISOString(),
    });
    if (tokenError) throw new Fail(500, 'db_error', 'Could not save the connection.');
    const { error: accountError } = await admin.from('connections').upsert({
      user_id: user.id, provider, email, teams, connected: true, connected_date: new Date().toISOString(),
    });
    if (accountError) throw new Fail(500, 'db_error', 'Could not save the connection.');
    // what was made before belongs to another account: forget it
    if (before && before.email !== email) await forgetLinks(user.id, provider);
    return { connected: true, email };
  },

  saveSettings: async (req, body) => {
    const user = await requireUser(req);
    const provider = asProvider(body.provider);
    if (typeof body.autoSync !== 'boolean') throw new Fail(400, 'input', 'autoSync must be true or false.');
    if (!await getAccount(user.id, provider)) throw new Fail(409, 'not_connected', `${NAMES[provider]} is not connected.`);
    const { data, error } = await admin.from('connections').update({ auto_sync: body.autoSync })
      .eq('user_id', user.id).eq('provider', provider).select('auto_sync').single();
    if (error) throw new Fail(500, 'db_error', 'Could not save the setting.');
    return { autoSync: data.auto_sync };
  },

  disconnect: async (req, body) => {
    const user = await requireUser(req);
    const provider = asProvider(body.provider);
    if (provider === 'zoom' && configured('zoom')) {
      const { data: row } = await admin.from('connection_tokens').select('refresh_token').eq('user_id', user.id).eq('provider', 'zoom').maybeSingle();
      if (row?.refresh_token) {
        // best effort: the rows go either way
        await timed(`https://zoom.us/oauth/revoke?${new URLSearchParams({ token: row.refresh_token })}`, {
          method: 'POST',
          headers: { Authorization: `Basic ${btoa(`${CREDS.zoom.id}:${CREDS.zoom.secret}`)}` },
        }).then((r) => r.body?.cancel()).catch(() => undefined);
      }
    }
    await admin.from('connection_tokens').delete().eq('user_id', user.id).eq('provider', provider);
    await admin.from('connections').delete().eq('user_id', user.id).eq('provider', provider);
    // meetings and events already made stay where they are, and links already given keep working
    await forgetLinks(user.id, provider);
    return { success: true };
  },

  // upcoming bookings to Outlook and Zoom: create, update if changed, remove if cancelled
  sync: async (req, body) => {
    const user = await requireUser(req);
    const provider = asProvider(body.provider);
    const account = await getAccount(user.id, provider);
    if (!account) throw new Fail(409, 'not_connected', `${NAMES[provider]} is not connected.`);
    const { data: bookings, error } = await admin.from('bookings').select(BOOKING_FIELDS)
      .eq('host_id', user.id).gte('end_time', new Date().toISOString()).order('start_time').limit(200);
    if (error) throw new Fail(500, 'db_error', 'Could not read your bookings.');
    const counts = { changed: 0, failed: 0 };
    for (const b of (bookings ?? []) as unknown as Booking[]) {
      try {
        const did = provider === 'zoom' ? await syncZoom(account, b) : (await syncOutlook(account, b)) !== 'unchanged';
        if (did) counts.changed++;
      } catch (e) {
        // a lost connection stops the run; one bad event doesn't
        if (e instanceof Fail && (e.code === 'reconnect' || e.code === 'not_connected')) throw e;
        counts.failed++;
      }
    }
    const syncedDate = new Date().toISOString();
    await admin.from('connections').update({ synced_date: syncedDate }).eq('user_id', user.id).eq('provider', provider);
    return { ...counts, syncedDate };
  },

  // PUBLIC: Outlook busy times for a host's booking page. Times only, nothing about the events.
  // Only for hosts with a switched-on event, and it can't replay anyone's past.
  freeBusy: async (_req, body) => {
    const { hostId, timeMin, timeMax } = body;
    if (typeof hostId !== 'string' || !UUID.test(hostId)) throw new Fail(400, 'input', 'hostId must be a uuid.');
    const asked = { min: new Date(String(timeMin)), max: new Date(String(timeMax)) };
    if (Number.isNaN(asked.min.getTime()) || Number.isNaN(asked.max.getTime()) || asked.max <= asked.min || asked.max.getTime() - asked.min.getTime() > MAX_WINDOW_MS) {
      throw new Fail(400, 'input', 'timeMin and timeMax must be a window of at most 62 days.');
    }
    const now = Date.now();
    const min = new Date(Math.max(asked.min.getTime(), now - DAY_MS));
    const max = new Date(Math.min(asked.max.getTime(), now + 400 * DAY_MS));
    if (max <= min) return [];
    const { data: open, error: openError } = await admin.from('event_types').select('id')
      .eq('created_by_id', hostId).eq('active', true).limit(1);
    if (openError || !open?.length) return [];
    if (!await getAccount(hostId, 'microsoft')) return [];
    try {
      const busy: { start: string; end: string }[] = [];
      const params = new URLSearchParams({ startDateTime: min.toISOString(), endDateTime: max.toISOString(), $select: 'start,end,showAs,isCancelled', $top: '200' });
      let next: string | null = `${GRAPH}/me/calendarView?${params}`;
      for (let page = 0; next && page < 5; page++) {
        const res: Response = await callApi('microsoft', hostId, next, { headers: { Prefer: 'outlook.timezone="UTC"' } });
        if (!res.ok) { await res.body?.cancel(); console.error('outlook calendarView failed', res.status); return busy; }
        const data = await res.json();
        for (const x of data.value ?? []) {
          if (x.isCancelled || x.showAs === 'free' || x.showAs === 'workingElsewhere') continue;
          // asked for UTC, and Graph leaves off the zone marker
          if (x.start?.dateTime && x.end?.dateTime) busy.push({ start: `${String(x.start.dateTime).replace(/Z$/, '')}Z`, end: `${String(x.end.dateTime).replace(/Z$/, '')}Z` });
        }
        next = data['@odata.nextLink'] ?? null;
      }
      return busy;
    } catch (e) {
      // the booking page still works from GlassMeet's own times
      if (!(e instanceof Fail)) console.error('outlook busy error', (e as Error)?.name);
      return [];
    }
  },

  // PUBLIC: a guest's new booking gets its link and calendar copy. A signed-in host may also call
  // it for their own booking at any time (after approving, cancelling or declining it).
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
      const fresh = Date.now() - new Date(b.created_date).getTime() < STATE_TTL_MS;
      if (!fresh || b.status !== 'confirmed' || b.approval_status !== 'approved' || b.ms_event_id || b.zoom_id) return { pushed: false };
    }
    try {
      return { pushed: await pushOne(b, false) };
    } catch (e) {
      // guests don't hear about the host's connection problems; a sync catches up
      if (!isHost) { console.error('push failed', (e as Error)?.message?.slice(0, 200)); return { pushed: false }; }
      throw e;
    }
  },
};

// meetings made through an account the host no longer connects aren't touched again
const forgetLinks = async (userId: string, provider: Provider) => {
  const query = admin.from('bookings').update(provider === 'zoom' ? { zoom_id: null } : { ms_event_id: null, ms_hash: null }).eq('host_id', userId);
  const { error } = await (provider === 'zoom' ? query.not('zoom_id', 'is', null) : query.not('ms_event_id', 'is', null));
  if (error) console.error('forget links failed', provider);
};

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // The provider sends the browser here after consent. Check the state and hand the code to the
  // app, where the signed-in host finishes the connection.
  if (url.pathname.endsWith('/callback')) {
    if (req.method !== 'GET') return new Response('Method not allowed', { status: 405 });
    const rawState = url.searchParams.get('state');
    const state = await readState(rawState);
    const back = (params: Record<string, string>) => redirect(`${APP_URL}${state?.r ?? DEFAULT_RETURN}?${new URLSearchParams(params)}`);
    if (!state) return back({ connect: 'error', reason: 'state' });
    const error = url.searchParams.get('error');
    if (error) return back({ connect: 'error', provider: state.p, reason: error === 'access_denied' ? 'denied' : 'provider' });
    const code = url.searchParams.get('code');
    if (!code) return back({ connect: 'error', provider: state.p, reason: 'code' });
    return back({ connect: 'finish', provider: state.p, code, state: rawState! });
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

  try {
    return json(req, await run(req, body));
  } catch (e) {
    if (e instanceof Fail) return json(req, { error: e.code, message: e.message }, e.status);
    console.error('connections failed', action, (e as Error)?.name, (e as Error)?.message?.slice(0, 200));
    const timeout = (e as Error)?.name === 'TimeoutError';
    return json(req, { error: timeout ? 'timeout' : 'server', message: timeout ? 'The connection took too long. Try again.' : 'Something went wrong.' }, timeout ? 504 : 500);
  }
});
