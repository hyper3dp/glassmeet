import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const encryptionSecret = Deno.env.get('GOOGLE_TOKEN_ENCRYPTION_KEY')!;
const googleClientId = Deno.env.get('GOOGLE_CLIENT_ID')!;
const googleClientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!;

const publicOrigins = new Set([
  'http://localhost:5173',
  'https://glassmeet.is-a.dev',
  'https://hyper3dp.github.io',
]);

const service = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function headersFor(origin: string | null) {
  const allowedOrigin = origin && publicOrigins.has(origin) ? origin : 'https://glassmeet.is-a.dev';
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
    'Content-Type': 'application/json; charset=utf-8',
  };
}

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers });
}

function encodeBase64(value: Uint8Array) {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBase64(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

async function encryptionKey() {
  if (!encryptionSecret) throw new Error('Google token encryption is not configured');
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`glassmeet-google:${encryptionSecret}`));
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function encrypt(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await encryptionKey(), encoder.encode(value));
  return `${encodeBase64(iv)}.${encodeBase64(new Uint8Array(ciphertext))}`;
}

async function decrypt(value: string) {
  const [ivPart, ciphertextPart] = value.split('.');
  if (!ivPart || !ciphertextPart) throw new Error('Stored Google token is invalid');
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: decodeBase64(ivPart) },
    await encryptionKey(),
    decodeBase64(ciphertextPart),
  );
  return decoder.decode(plaintext);
}

async function signedInUser(request: Request) {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return null;
  const accessToken = authorization.slice('Bearer '.length);
  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data, error } = await authClient.auth.getUser(accessToken);
  if (error) return null;
  return data.user;
}

async function accountFor(userId: string) {
  const { data, error } = await service.from('google_credentials').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

async function accessToken(account: { refresh_token_encrypted: string }) {
  const refreshToken = await decrypt(account.refresh_token_encrypted);
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: googleClientId,
      client_secret: googleClientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const result = await response.json();
  if (!response.ok || !result.access_token) throw new Error('Google authorization expired. Reconnect your account.');
  return result.access_token as string;
}

async function googleRequest(account: { refresh_token_encrypted: string }, path: string, init: RequestInit = {}) {
  const token = await accessToken(account);
  const response = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error?.message || 'Google Calendar request failed');
  return body;
}

async function listCalendars(account: { refresh_token_encrypted: string }) {
  const result = await googleRequest(account, '/users/me/calendarList?minAccessRole=writer');
  return (result.items ?? []).map((calendar: Record<string, unknown>) => ({
    id: calendar.id,
    summary: calendar.summary,
    primary: Boolean(calendar.primary),
    accessRole: calendar.accessRole,
    backgroundColor: calendar.backgroundColor,
  }));
}

async function busyTimes(hostId: string, timeMin: string, timeMax: string) {
  const min = Date.parse(timeMin);
  const max = Date.parse(timeMax);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max || max - min > 93 * 86400000) {
    throw new Error('Choose a valid date range of 93 days or less');
  }
  const account = await accountFor(hostId);
  if (!account) return [];
  const result = await googleRequest(account, '/freeBusy', {
    method: 'POST',
    body: JSON.stringify({
      timeMin: new Date(min).toISOString(),
      timeMax: new Date(max).toISOString(),
      items: [{ id: account.calendar_id }],
    }),
  });
  return (result.calendars?.[account.calendar_id]?.busy ?? []).map((slot: { start: string; end: string }) => ({
    start_time: slot.start,
    end_time: slot.end,
    status: 'confirmed',
  }));
}

async function createBookingEvent(bookingId: string) {
  const { data: row, error } = await service.from('app_records').select('*').eq('id', bookingId).eq('entity', 'Booking').single();
  if (error) throw error;
  const booking = row.data;
  if (!booking.host_id || booking.status !== 'confirmed' || booking.approval_status === 'pending') return { created: false };
  const { data: eventType, error: eventError } = await service.from('app_records').select('*')
    .eq('id', booking.event_type_id).eq('entity', 'EventType').eq('owner_id', booking.host_id).single();
  if (eventError || eventType?.data?.active === false) return { created: false };
  const account = await accountFor(booking.host_id);
  if (!account || !account.auto_sync || booking.google_event_id) return { created: false };
  const result = await googleRequest(account, `/calendars/${encodeURIComponent(account.calendar_id)}/events`, {
    method: 'POST',
    body: JSON.stringify({
      summary: `${booking.event_name || 'Meeting'}${booking.guest_name ? ` with ${booking.guest_name}` : ''}`,
      description: [booking.guest_email && `Guest email: ${booking.guest_email}`, booking.guest_phone && `Guest phone: ${booking.guest_phone}`, booking.guest_notes && `Notes: ${booking.guest_notes}`].filter(Boolean).join('\n'),
      location: booking.meeting_url || undefined,
      start: { dateTime: booking.start_time, timeZone: booking.timezone || 'UTC' },
      end: { dateTime: booking.end_time, timeZone: booking.timezone || 'UTC' },
    }),
  });
  const { error: updateError } = await service.from('app_records')
    .update({ data: { ...booking, google_event_id: result.id }, updated_at: new Date().toISOString() }).eq('id', bookingId);
  if (updateError) throw updateError;
  await service.from('google_credentials').update({ last_synced: new Date().toISOString() }).eq('user_id', booking.host_id);
  return { created: true, eventId: result.id };
}

Deno.serve(async (request: Request) => {
  const headers = headersFor(request.headers.get('Origin'));
  if (request.method === 'OPTIONS') return new Response('ok', { headers });

  try {
    const body = await request.json();
    const action = body.action as string;
    const user = await signedInUser(request);
    const userId = user?.id;

    if (action === 'busy') {
      if (typeof body.hostId !== 'string') throw new Error('Host id is required');
      return json(await busyTimes(body.hostId, body.timeMin, body.timeMax), 200, headers);
    }

    if (action === 'create-booking-event') {
      if (typeof body.bookingId !== 'string') throw new Error('Booking id is required');
      return json(await createBookingEvent(body.bookingId), 200, headers);
    }

    if (!userId) return json({ error: 'Sign in required' }, 401, headers);

    if (action === 'store-token') {
      if (typeof body.refreshToken !== 'string' || body.refreshToken.length < 20) throw new Error('Google refresh token is missing');
      const { error } = await service.from('google_credentials').upsert({
        user_id: userId,
        email: String(body.email || user.email || ''),
        refresh_token_encrypted: await encrypt(body.refreshToken),
        calendar_id: 'primary',
        calendar_name: 'Primary',
        auto_sync: true,
        connected_at: new Date().toISOString(),
      });
      if (error) throw error;
      return json({ connected: true }, 200, headers);
    }

    if (action === 'status') {
      const account = await accountFor(userId);
      return json(account ? {
        connected: true,
        email: account.email,
        calendar_id: account.calendar_id,
        calendar_name: account.calendar_name,
        auto_sync: account.auto_sync,
        last_synced: account.last_synced,
      } : { connected: false }, 200, headers);
    }

    if (action === 'calendars') {
      const account = await accountFor(userId);
      if (!account) throw new Error('Connect a Google account first');
      return json(await listCalendars(account), 200, headers);
    }

    if (action === 'save-settings') {
      const account = await accountFor(userId);
      if (!account) throw new Error('Connect a Google account first');
      const calendars = await listCalendars(account);
      const selected = calendars.find((calendar: { id: string }) => calendar.id === body.calendarId);
      if (!selected) throw new Error('Choose a writable calendar');
      const { error } = await service.from('google_credentials').update({
        calendar_id: selected.id,
        calendar_name: selected.summary,
        auto_sync: body.autoSync !== false,
      }).eq('user_id', userId);
      if (error) throw error;
      return json({ calendarId: selected.id, calendarName: selected.summary, autoSync: body.autoSync !== false }, 200, headers);
    }

    if (action === 'disconnect') {
      const { error } = await service.from('google_credentials').delete().eq('user_id', userId);
      if (error) throw error;
      return json({ success: true }, 200, headers);
    }

    if (action === 'sync') {
      const { data: rows, error } = await service.from('app_records').select('*').eq('entity', 'Booking').eq('owner_id', userId);
      if (error) throw error;
      let created = 0;
      for (const row of rows ?? []) {
        if (row.data.status === 'confirmed' && row.data.approval_status !== 'pending' && !row.data.google_event_id) {
          const result = await createBookingEvent(row.id);
          if (result.created) created += 1;
        }
      }
      const { data: account } = await service.from('google_credentials').select('last_synced').eq('user_id', userId).maybeSingle();
      return json({ created, lastSynced: account?.last_synced ?? null }, 200, headers);
    }

    return json({ error: 'Unknown action' }, 404, headers);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Google Calendar request failed' }, 400, headers);
  }
});