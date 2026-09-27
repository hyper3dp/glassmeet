import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const projectRoot = process.cwd();
const dataDirectory = join(projectRoot, 'data');
mkdirSync(dataDirectory, { recursive: true });

const database = new DatabaseSync(join(dataDirectory, 'glassmeet.sqlite'));
database.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    profile TEXT NOT NULL,
    created_date TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS password_resets (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS oauth_states (
    state_hash TEXT PRIMARY KEY,
    user_id TEXT,
    flow TEXT NOT NULL,
    return_to TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS google_accounts (
    user_id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    calendar_id TEXT NOT NULL DEFAULT 'primary',
    auto_sync INTEGER NOT NULL DEFAULT 1,
    last_synced TEXT,
    connected_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS entity_records (
    id TEXT PRIMARY KEY,
    entity TEXT NOT NULL,
    owner_id TEXT,
    created_date TEXT NOT NULL,
    updated_date TEXT NOT NULL,
    data TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS entity_records_entity_owner
    ON entity_records (entity, owner_id);
`);

const publicReadEntities = new Set(['EventType', 'AvailabilityRule', 'AvailabilityException', 'BookedSlot']);
const publicWriteEntities = new Set(['Booking', 'BookedSlot']);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const hash = (value) => createHash('sha256').update(value).digest('hex');
const passwordHash = (password, salt) => scryptSync(password, salt, 64).toString('hex');

function publicUser(row) {
  return { ...JSON.parse(row.profile), id: row.id, email: row.email, created_date: row.created_date };
}

function getUserFromRequest(request) {
  const cookieToken = request.headers.cookie?.split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith('glassmeet_session='))
    ?.slice('glassmeet_session='.length);
  const token = cookieToken || request.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const session = database.prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?').get(hash(token));
  if (!session || session.expires_at < new Date().toISOString()) return null;
  const row = database.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id);
  return row ? publicUser(row) : null;
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new HttpError(413, 'Request body is too large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON');
  }
}

function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

function createSession(userId) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  database.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .run(hash(token), userId, expiresAt);
  return token;
}

function googleCredentials() {
  let fileCredentials = {};
  const configuredFile = process.env.GOOGLE_OAUTH_CREDENTIALS_FILE;
  const credentialFiles = configuredFile
    ? [resolve(projectRoot, configuredFile)]
    : (() => {
      try {
        return readdirSync(join(projectRoot, 'authgoogle'))
          .filter((file) => file.endsWith('.json'))
          .map((file) => join(projectRoot, 'authgoogle', file));
      } catch {
        return [];
      }
    })();

  for (const file of credentialFiles) {
    try {
      const config = JSON.parse(readFileSync(file, 'utf8'));
      const client = config.web ?? config.installed ?? {};
      if (client.client_id && client.client_secret) {
        fileCredentials = { clientId: client.client_id, clientSecret: client.client_secret };
        break;
      }
    } catch {
      continue;
    }
  }

  return {
    clientId: process.env.GOOGLE_CLIENT_ID || fileCredentials.clientId,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || fileCredentials.clientSecret,
  };
}

function googleSettingsAvailable() {
  const { clientId, clientSecret } = googleCredentials();
  return Boolean(clientId && clientSecret);
}

function googleEncryptionKey() {
  const secret = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY || googleCredentials().clientSecret;
  if (!secret) throw new HttpError(503, 'Google integration is not configured');
  return createHash('sha256').update(`glassmeet:google-token:${secret}`).digest();
}

function encryptGoogleToken(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', googleEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64url')).join('.');
}

function decryptGoogleToken(value) {
  const [iv, tag, ciphertext] = value.split('.').map((part) => Buffer.from(part, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', googleEncryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

function googleRedirectUri(request, url) {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  const publicOrigin = process.env.APP_PUBLIC_URL || url.origin;
  return new URL('/api/auth/google/callback', publicOrigin).toString();
}

function safeReturnPath(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/';
}

function setGoogleSessionCookie(response, request, token) {
  const secure = process.env.APP_PUBLIC_URL?.startsWith('https://') || process.env.GOOGLE_REDIRECT_URI?.startsWith('https://');
  response.setHeader('Set-Cookie', `glassmeet_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure ? '; Secure' : ''}`);
}

function comparePassword(password, salt, expectedHash) {
  const actual = Buffer.from(passwordHash(password, salt), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function matchesFilter(record, filter) {
  return Object.entries(filter).every(([key, expected]) => {
    const actual = record[key];
    if (Array.isArray(expected)) return expected.some((value) => String(value) === String(actual));
    return String(actual) === String(expected);
  });
}

function entityRecords(entity, user, filter = {}) {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(entity)) throw new HttpError(400, 'Invalid entity name');
  const records = database.prepare('SELECT * FROM entity_records WHERE entity = ?').all(entity)
    .filter((row) => user ? row.owner_id === user.id : publicReadEntities.has(entity))
    .map((row) => ({ ...JSON.parse(row.data), id: row.id, created_date: row.created_date, updated_date: row.updated_date }));
  return records.filter((record) => matchesFilter(record, filter));
}

function storeEntity(entity, value, user, existing = null) {
  const now = new Date().toISOString();
  const record = { ...(existing?.data ?? {}), ...value };
  if (user && !record.created_by_id && !record.host_id) record.created_by_id = user.id;
  const id = existing?.id ?? record.id ?? randomUUID();
  const createdDate = existing?.created_date ?? now;
  const ownerId = existing?.owner_id ?? record.created_by_id ?? record.host_id ?? user?.id ?? null;
  delete record.id;
  delete record.created_date;
  delete record.updated_date;
  database.prepare(`
    INSERT INTO entity_records (id, entity, owner_id, created_date, updated_date, data)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET updated_date = excluded.updated_date, data = excluded.data
  `).run(id, entity, ownerId, createdDate, now, JSON.stringify(record));
  return { ...record, id, created_date: createdDate, updated_date: now };
}

async function googleAccessToken(account) {
  const credentials = googleCredentials();
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      refresh_token: decryptGoogleToken(account.refresh_token),
      grant_type: 'refresh_token',
    }),
  });
  const result = await response.json();
  if (!response.ok || !result.access_token) throw new HttpError(502, 'Google authorization expired. Reconnect your Google account.');
  return result.access_token;
}

async function googleApi(account, path, options = {}) {
  const accessToken = await googleAccessToken(account);
  const response = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new HttpError(502, result.error?.message || 'Google Calendar request failed');
  return result;
}

async function googleCalendarList(userId) {
  const account = database.prepare('SELECT * FROM google_accounts WHERE user_id = ?').get(userId);
  if (!account) throw new HttpError(409, 'Connect a Google account first');
  const result = await googleApi(account, '/users/me/calendarList?minAccessRole=writer');
  return result.items ?? [];
}

async function googleBusyTimes(userId, timeMin, timeMax) {
  const account = database.prepare('SELECT * FROM google_accounts WHERE user_id = ?').get(userId);
  if (!account) return [];
  const start = Date.parse(timeMin);
  const end = Date.parse(timeMax);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end || end - start > 93 * 24 * 60 * 60 * 1000) {
    throw new HttpError(400, 'Choose a valid date range of 93 days or less');
  }
  const result = await googleApi(account, '/freeBusy', {
    method: 'POST',
    body: JSON.stringify({
      timeMin: new Date(start).toISOString(),
      timeMax: new Date(end).toISOString(),
      items: [{ id: account.calendar_id }],
    }),
  });
  return (result.calendars?.[account.calendar_id]?.busy ?? []).map(({ start: busyStart, end: busyEnd }) => ({
    start_time: busyStart,
    end_time: busyEnd,
    status: 'confirmed',
  }));
}

async function createGoogleCalendarEvent(booking, hostId, force = false) {
  if (booking.status !== 'confirmed' || booking.approval_status === 'pending') return null;
  const account = database.prepare('SELECT * FROM google_accounts WHERE user_id = ?').get(hostId);
  if (!account || (!force && !account.auto_sync)) return null;
  const event = await googleApi(account, `/calendars/${encodeURIComponent(account.calendar_id)}/events`, {
    method: 'POST',
    body: JSON.stringify({
      summary: `${booking.event_name || 'Meeting'}${booking.guest_name ? ` with ${booking.guest_name}` : ''}`,
      description: [
        booking.guest_email && `Guest email: ${booking.guest_email}`,
        booking.guest_phone && `Guest phone: ${booking.guest_phone}`,
        booking.guest_notes && `Notes: ${booking.guest_notes}`,
      ].filter(Boolean).join('\n'),
      location: booking.meeting_url || undefined,
      start: { dateTime: booking.start_time, timeZone: booking.timezone || 'UTC' },
      end: { dateTime: booking.end_time, timeZone: booking.timezone || 'UTC' },
    }),
  });
  if (booking.id) {
    const stored = database.prepare('SELECT * FROM entity_records WHERE id = ? AND entity = ?').get(booking.id, 'Booking');
    if (stored) {
      const data = { ...JSON.parse(stored.data), google_event_id: event.id };
      database.prepare('UPDATE entity_records SET data = ?, updated_date = ? WHERE id = ?')
        .run(JSON.stringify(data), new Date().toISOString(), booking.id);
    }
  }
  database.prepare('UPDATE google_accounts SET last_synced = ? WHERE user_id = ?')
    .run(new Date().toISOString(), hostId);
  return event;
}

async function syncGoogleBookings(user) {
  const account = database.prepare('SELECT * FROM google_accounts WHERE user_id = ?').get(user.id);
  if (!account) throw new HttpError(409, 'Connect a Google account first');
  const bookings = database.prepare('SELECT * FROM entity_records WHERE entity = ? AND owner_id = ?').all('Booking', user.id)
    .map((row) => ({ ...JSON.parse(row.data), id: row.id, created_date: row.created_date, updated_date: row.updated_date }))
    .filter((booking) => booking.status === 'confirmed' && booking.approval_status !== 'pending' && !booking.google_event_id);
  let created = 0;
  for (const booking of bookings) {
    await createGoogleCalendarEvent(booking, user.id, true);
    created += 1;
  }
  database.prepare('UPDATE google_accounts SET last_synced = ? WHERE user_id = ?')
    .run(new Date().toISOString(), user.id);
  return { created, lastSynced: new Date().toISOString() };
}

function updateGoogleProfile(userId, values) {
  const row = database.prepare('SELECT profile FROM users WHERE id = ?').get(userId);
  if (!row) return;
  const profile = { ...JSON.parse(row.profile), ...values };
  database.prepare('UPDATE users SET profile = ? WHERE id = ?').run(JSON.stringify(profile), userId);
}

async function googleOAuthCallback(request, response, url) {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) throw new HttpError(400, 'Google sign-in was cancelled or invalid');

  const stateHash = hash(state);
  const oauthState = database.prepare('SELECT * FROM oauth_states WHERE state_hash = ?').get(stateHash);
  database.prepare('DELETE FROM oauth_states WHERE state_hash = ?').run(stateHash);
  if (!oauthState || oauthState.expires_at < new Date().toISOString()) throw new HttpError(400, 'Google sign-in expired. Please try again.');

  const credentials = googleCredentials();
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      redirect_uri: googleRedirectUri(request, url),
      grant_type: 'authorization_code',
    }),
  });
  const tokens = await tokenResponse.json();
  if (!tokenResponse.ok || !tokens.access_token) throw new HttpError(502, 'Google could not complete sign-in');

  const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const googleProfile = await profileResponse.json();
  if (!profileResponse.ok || !googleProfile.email || googleProfile.email_verified !== true) {
    throw new HttpError(502, 'Google did not return a verified email address');
  }

  let userId = oauthState.user_id;
  if (oauthState.flow === 'login') {
    const existing = database.prepare('SELECT * FROM users WHERE email = ?').get(googleProfile.email.toLowerCase());
    if (existing) {
      userId = existing.id;
      updateGoogleProfile(userId, { full_name: googleProfile.name || googleProfile.email.split('@')[0], profile_photo: googleProfile.picture || '' });
    } else {
      userId = randomUUID();
      const salt = randomBytes(16).toString('hex');
      const createdDate = new Date().toISOString();
      const profile = {
        full_name: googleProfile.name || googleProfile.email.split('@')[0],
        profile_photo: googleProfile.picture || '',
        theme: 'system',
        accent_color: '#0a84ff',
      };
      database.prepare('INSERT INTO users (id, email, password_hash, salt, profile, created_date) VALUES (?, ?, ?, ?, ?, ?)')
        .run(userId, googleProfile.email.toLowerCase(), passwordHash(randomBytes(32).toString('hex'), salt), salt, JSON.stringify(profile), createdDate);
    }
  } else if (oauthState.flow !== 'calendar' || !userId || !database.prepare('SELECT id FROM users WHERE id = ?').get(userId)) {
    throw new HttpError(400, 'Google calendar connection is no longer valid');
  }

  const existingAccount = database.prepare('SELECT * FROM google_accounts WHERE user_id = ?').get(userId);
  const refreshToken = tokens.refresh_token
    ? encryptGoogleToken(tokens.refresh_token)
    : existingAccount?.refresh_token;
  if (!refreshToken) throw new HttpError(502, 'Google did not grant offline access. Try connecting again.');

  database.prepare(`
    INSERT INTO google_accounts (user_id, email, refresh_token, calendar_id, auto_sync, connected_at)
    VALUES (?, ?, ?, ?, 1, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      email = excluded.email,
      refresh_token = excluded.refresh_token,
      connected_at = excluded.connected_at
  `).run(userId, googleProfile.email, refreshToken, existingAccount?.calendar_id || 'primary', new Date().toISOString());
  updateGoogleProfile(userId, { google_calendar_connected: true, google_email: googleProfile.email });

  if (oauthState.flow === 'login') setGoogleSessionCookie(response, request, createSession(userId));
  response.writeHead(303, { Location: safeReturnPath(oauthState.return_to) });
  response.end();
}

async function handleApi(request, response, url) {
  const path = url.pathname;
  const user = getUserFromRequest(request);

  if (path === '/api/auth/google/config' && request.method === 'GET') {
    return sendJson(response, 200, { enabled: googleSettingsAvailable() });
  }

  if (path === '/api/auth/google/start' && request.method === 'GET') {
    const flow = url.searchParams.get('flow') === 'calendar' ? 'calendar' : 'login';
    const returnTo = safeReturnPath(url.searchParams.get('returnTo'));
    if (!googleSettingsAvailable()) {
      const target = flow === 'calendar' ? '/calendar-connections' : '/login';
      response.writeHead(303, { Location: `${target}?google_error=not_configured` });
      response.end();
      return;
    }
    if (flow === 'calendar' && !user) {
      response.writeHead(303, { Location: `/login?returnTo=${encodeURIComponent(returnTo)}` });
      response.end();
      return;
    }

    const state = randomBytes(32).toString('base64url');
    database.prepare('INSERT INTO oauth_states (state_hash, user_id, flow, return_to, expires_at) VALUES (?, ?, ?, ?, ?)')
      .run(hash(state), flow === 'calendar' ? user.id : null, flow, returnTo, new Date(Date.now() + 10 * 60 * 1000).toISOString());
    const authorizationUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    const credentials = googleCredentials();
    authorizationUrl.search = new URLSearchParams({
      client_id: credentials.clientId,
      redirect_uri: googleRedirectUri(request, url),
      response_type: 'code',
      scope: [
        'openid',
        'email',
        'profile',
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
      ].join(' '),
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    }).toString();
    response.writeHead(303, { Location: authorizationUrl.toString() });
    response.end();
    return;
  }

  if (path === '/api/auth/google/callback' && request.method === 'GET') {
    await googleOAuthCallback(request, response, url);
    return;
  }

  if (path === '/api/google/status' && request.method === 'GET') {
    if (!user) throw new HttpError(401, 'Please sign in');
    const account = database.prepare('SELECT email, calendar_id, auto_sync, last_synced, connected_at FROM google_accounts WHERE user_id = ?').get(user.id);
    return sendJson(response, 200, account ? {
      connected: true,
      ...account,
      calendar_name: user.google_calendars?.[0] || account.calendar_id,
      auto_sync: Boolean(account.auto_sync),
    } : { connected: false });
  }

  if (path === '/api/google/calendars' && request.method === 'GET') {
    if (!user) throw new HttpError(401, 'Please sign in');
    const calendars = await googleCalendarList(user.id);
    return sendJson(response, 200, calendars.map(({ id, summary, primary, accessRole, backgroundColor }) => ({ id, summary, primary: Boolean(primary), accessRole, backgroundColor })));
  }

  const googleBusyMatch = path.match(/^\/api\/google\/busy\/([^/]+)$/);
  if (googleBusyMatch && request.method === 'GET') {
    const timeMin = url.searchParams.get('timeMin');
    const timeMax = url.searchParams.get('timeMax');
    if (!timeMin || !timeMax) throw new HttpError(400, 'Provide timeMin and timeMax');
    const busy = await googleBusyTimes(decodeURIComponent(googleBusyMatch[1]), timeMin, timeMax);
    return sendJson(response, 200, busy);
  }

  if (path === '/api/google/settings' && request.method === 'POST') {
    if (!user) throw new HttpError(401, 'Please sign in');
    const { calendarId, autoSync } = await readJson(request);
    const account = database.prepare('SELECT * FROM google_accounts WHERE user_id = ?').get(user.id);
    if (!account) throw new HttpError(409, 'Connect a Google account first');
    const calendars = await googleCalendarList(user.id);
    const selected = calendars.find((calendar) => calendar.id === calendarId);
    if (!selected) throw new HttpError(400, 'Choose a calendar you can write to');
    database.prepare('UPDATE google_accounts SET calendar_id = ?, auto_sync = ? WHERE user_id = ?')
      .run(selected.id, autoSync === false ? 0 : 1, user.id);
    updateGoogleProfile(user.id, {
      google_calendars: [selected.summary],
      google_auto_sync: autoSync !== false,
    });
    return sendJson(response, 200, { calendarId: selected.id, calendarName: selected.summary, autoSync: autoSync !== false });
  }

  if (path === '/api/google/sync' && request.method === 'POST') {
    if (!user) throw new HttpError(401, 'Please sign in');
    const result = await syncGoogleBookings(user);
    return sendJson(response, 200, result);
  }

  if (path === '/api/google' && request.method === 'DELETE') {
    if (!user) throw new HttpError(401, 'Please sign in');
    database.prepare('DELETE FROM google_accounts WHERE user_id = ?').run(user.id);
    updateGoogleProfile(user.id, {
      google_calendar_connected: false,
      google_email: '',
      google_calendars: [],
      google_auto_sync: false,
      google_last_synced: null,
    });
    return sendJson(response, 200, { success: true });
  }

  if (path === '/api/app/settings' && request.method === 'GET') {
    return sendJson(response, 200, { id: 'local', public_settings: { app_name: 'GlassMeet' } });
  }

  if (path === '/api/auth/register' && request.method === 'POST') {
    const { email, password } = await readJson(request);
    if (typeof email !== 'string' || !email.includes('@') || typeof password !== 'string' || password.length < 8) {
      throw new HttpError(400, 'Enter a valid email and a password of at least 8 characters');
    }
    const id = randomUUID();
    const salt = randomBytes(16).toString('hex');
    const createdDate = new Date().toISOString();
    const profile = { full_name: email.split('@')[0], theme: 'system', accent_color: '#0a84ff' };
    try {
      database.prepare('INSERT INTO users (id, email, password_hash, salt, profile, created_date) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, email.trim().toLowerCase(), passwordHash(password, salt), salt, JSON.stringify(profile), createdDate);
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') throw new HttpError(409, 'An account with this email already exists');
      throw error;
    }
    const row = database.prepare('SELECT * FROM users WHERE id = ?').get(id);
    const sessionToken = createSession(id);
    setGoogleSessionCookie(response, request, sessionToken);
    return sendJson(response, 201, { user: publicUser(row), access_token: sessionToken });
  }

  if (path === '/api/auth/login' && request.method === 'POST') {
    const { email, password } = await readJson(request);
    const row = database.prepare('SELECT * FROM users WHERE email = ?').get(String(email ?? '').trim().toLowerCase());
    if (!row || typeof password !== 'string' || !comparePassword(password, row.salt, row.password_hash)) {
      throw new HttpError(401, 'Invalid email or password');
    }
    const sessionToken = createSession(row.id);
    setGoogleSessionCookie(response, request, sessionToken);
    return sendJson(response, 200, { user: publicUser(row), access_token: sessionToken });
  }

  if (path === '/api/auth/me' && request.method === 'GET') {
    return sendJson(response, 200, user);
  }

  if (path === '/api/auth/me' && request.method === 'PUT') {
    if (!user) throw new HttpError(401, 'Please sign in');
    const updates = await readJson(request);
    const profile = { ...user, ...updates };
    delete profile.id;
    delete profile.email;
    delete profile.created_date;
    database.prepare('UPDATE users SET profile = ? WHERE id = ?').run(JSON.stringify(profile), user.id);
    return sendJson(response, 200, { ...profile, id: user.id, email: user.email, created_date: user.created_date });
  }

  if (path === '/api/auth/logout' && request.method === 'POST') {
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
    const cookieToken = request.headers.cookie?.split(';').map((value) => value.trim())
      .find((value) => value.startsWith('glassmeet_session='))?.slice('glassmeet_session='.length);
    if (token) database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash(token));
    if (cookieToken && cookieToken !== token) database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash(cookieToken));
    response.setHeader('Set-Cookie', 'glassmeet_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    return sendJson(response, 200, { success: true });
  }

  if (path === '/api/auth/password-reset' && request.method === 'POST') {
    const { email } = await readJson(request);
    const row = database.prepare('SELECT id FROM users WHERE email = ?').get(String(email ?? '').trim().toLowerCase());
    if (!row) return sendJson(response, 200, {});
    const token = randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    database.prepare('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
      .run(hash(token), row.id, expiresAt);
    return sendJson(response, 200, { resetToken: token });
  }

  if (path === '/api/auth/password-reset/confirm' && request.method === 'POST') {
    const { resetToken, newPassword } = await readJson(request);
    if (typeof newPassword !== 'string' || newPassword.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
    const reset = database.prepare('SELECT * FROM password_resets WHERE token_hash = ?').get(hash(String(resetToken ?? '')));
    if (!reset || reset.expires_at < new Date().toISOString()) throw new HttpError(400, 'Reset link is invalid or expired');
    const salt = randomBytes(16).toString('hex');
    database.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?')
      .run(passwordHash(newPassword, salt), salt, reset.user_id);
    database.prepare('DELETE FROM password_resets WHERE token_hash = ?').run(hash(resetToken));
    return sendJson(response, 200, { success: true });
  }

  const entityMatch = path.match(/^\/api\/entities\/([^/]+)(?:\/([^/]+))?$/);
  if (entityMatch) {
    const entity = decodeURIComponent(entityMatch[1]);
    const id = entityMatch[2] ? decodeURIComponent(entityMatch[2]) : null;
    if (!user && !publicReadEntities.has(entity) && !publicWriteEntities.has(entity)) {
      throw new HttpError(401, 'Please sign in');
    }

    if (request.method === 'GET' && id) {
      const records = entityRecords(entity, user, { id });
      return sendJson(response, 200, records[0] ?? null);
    }

    if (request.method === 'GET') {
      let filter = {};
      const encodedFilter = url.searchParams.get('where');
      if (encodedFilter) {
        try { filter = JSON.parse(encodedFilter); }
        catch { throw new HttpError(400, 'Invalid filter'); }
      }
      let records = entityRecords(entity, user, filter);
      const sort = url.searchParams.get('sort');
      if (sort) {
        const descending = sort.startsWith('-');
        const field = descending ? sort.slice(1) : sort;
        records.sort((left, right) => {
          const result = String(left[field] ?? '').localeCompare(String(right[field] ?? ''), undefined, { numeric: true });
          return descending ? -result : result;
        });
      }
      const encodedLimit = url.searchParams.get('limit');
      if (encodedLimit !== null) {
        const limit = Number(encodedLimit);
        if (Number.isInteger(limit) && limit >= 0) records = records.slice(0, limit);
      }
      return sendJson(response, 200, records);
    }

    if (request.method === 'POST' && id === 'bulk') {
      if (!user && !publicWriteEntities.has(entity)) throw new HttpError(401, 'Please sign in');
      const records = await readJson(request);
      if (!Array.isArray(records)) throw new HttpError(400, 'Expected an array');
      return sendJson(response, 201, records.map((record) => storeEntity(entity, record, user)));
    }

    if (request.method === 'POST' && !id) {
      if (!user && !publicWriteEntities.has(entity)) throw new HttpError(401, 'Please sign in');
      const record = storeEntity(entity, await readJson(request), user);
      if (entity === 'Booking' && record.host_id) {
        try { await createGoogleCalendarEvent(record, record.host_id); }
        catch (error) { console.error('Google Calendar event creation failed:', error.message); }
      }
      return sendJson(response, 201, record);
    }

    if (request.method === 'PATCH' && id === 'bulk') {
      if (!user) throw new HttpError(401, 'Please sign in');
      const updates = await readJson(request);
      if (!Array.isArray(updates)) throw new HttpError(400, 'Expected an array');
      const results = updates.map((update) => {
        const existing = database.prepare('SELECT * FROM entity_records WHERE id = ? AND entity = ? AND owner_id = ?')
          .get(update.id, entity, user.id);
        if (!existing) throw new HttpError(404, `${entity} record not found`);
        return storeEntity(entity, update, user, {
          id: existing.id,
          owner_id: existing.owner_id,
          created_date: existing.created_date,
          data: JSON.parse(existing.data),
        });
      });
      return sendJson(response, 200, results);
    }

    if (request.method === 'PATCH' && id) {
      if (!user) throw new HttpError(401, 'Please sign in');
      const existing = database.prepare('SELECT * FROM entity_records WHERE id = ? AND entity = ? AND owner_id = ?')
        .get(id, entity, user.id);
      if (!existing) throw new HttpError(404, `${entity} record not found`);
      return sendJson(response, 200, storeEntity(entity, await readJson(request), user, {
        id: existing.id,
        owner_id: existing.owner_id,
        created_date: existing.created_date,
        data: JSON.parse(existing.data),
      }));
    }

    if (request.method === 'DELETE' && id) {
      if (!user) throw new HttpError(401, 'Please sign in');
      const result = database.prepare('DELETE FROM entity_records WHERE id = ? AND entity = ? AND owner_id = ?')
        .run(id, entity, user.id);
      if (!result.changes) throw new HttpError(404, `${entity} record not found`);
      return sendJson(response, 200, { success: true });
    }
  }

  throw new HttpError(404, 'Not found');
}

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

async function serveBuiltFile(request, response) {
  const distDirectory = join(projectRoot, 'dist');
  const requestedPath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  let filePath = resolve(distDirectory, `.${requestedPath}`);
  if (!filePath.startsWith(resolve(distDirectory))) throw new HttpError(403, 'Forbidden');
  try {
    if (!(await stat(filePath)).isFile()) filePath = join(distDirectory, 'index.html');
  } catch {
    filePath = join(distDirectory, 'index.html');
  }
  const content = await readFile(filePath);
  response.writeHead(200, { 'content-type': mimeTypes[extname(filePath)] ?? 'application/octet-stream' });
  response.end(content);
}

const production = process.argv.includes('--production');
const vite = production ? null : await (await import('vite')).createServer({
  configFile: join(projectRoot, 'vite.config.js'),
  server: { middlewareMode: true },
  appType: 'spa',
});

const server = createServer(async (request, response) => {
  const forwardedProtocol = request.headers['x-forwarded-proto']?.split(',')[0].trim();
  const protocol = forwardedProtocol || 'http';
  const host = request.headers['x-forwarded-host']?.split(',')[0].trim() || request.headers.host || 'localhost';
  const url = new URL(request.url, `${protocol}://${host}`);
  try {
    if (request.headers.host?.split(':')[0].toLowerCase() === 'www.glassmeet.com') {
      response.writeHead(308, { Location: `https://glassmeet.com${url.pathname}${url.search}` });
      response.end();
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      await handleApi(request, response, url);
      return;
    }
    if (vite) {
      vite.middlewares(request, response, (error) => {
        if (error) {
          vite.ssrFixStacktrace(error);
          sendJson(response, 500, { error: error.message });
        }
      });
    } else {
      await serveBuiltFile(request, response);
    }
  } catch (error) {
    sendJson(response, error.status ?? 500, { error: error.message ?? 'Internal server error' });
  }
});

const port = Number(process.env.PORT ?? 5173);
server.listen(port, '0.0.0.0', () => {
  console.log(`GlassMeet local server ready at http://localhost:${port}`);
  console.log(`SQLite database: ${join(dataDirectory, 'glassmeet.sqlite')}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    server.close();
    await vite?.close();
    database.close();
    process.exit(0);
  });
}