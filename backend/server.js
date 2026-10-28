import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import dotenv from 'dotenv';
import path from 'node:path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { Firestore } from '@google-cloud/firestore';
import bcrypt from 'bcryptjs';
import express from 'express';
import { OAuth2Client } from 'google-auth-library';
import { SignJWT, jwtVerify } from 'jose';

const port = Number(process.env.PORT || 8080);
const frontendOrigins = new Set((process.env.FRONTEND_ORIGINS || 'https://hyper3dp.github.io,http://localhost:5173')
  .split(',').map((origin) => origin.trim()).filter(Boolean));
const googleClientId = process.env.GOOGLE_CLIENT_ID || '';
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
console.log('--- Backend Config Debug ---');
console.log('GOOGLE_CLIENT_ID:', googleClientId ? 'LOADED' : 'MISSING');
console.log('GOOGLE_CLIENT_SECRET:', googleClientSecret ? 'LOADED' : 'MISSING');
console.log('PORT:', process.env.PORT || '8080');
console.log('---------------------------');
const tokenEncryptionKey = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY || '';
const jwtSigningKey = process.env.JWT_SIGNING_KEY || '';
const jwtKey = new TextEncoder().encode(jwtSigningKey);
const outboundTimeoutMs = 10000;
// a fixed hash to compare against when the email is unknown, so login time doesn't reveal accounts
const dummyPasswordHash = bcrypt.hashSync(randomBytes(16).toString('hex'), 12);
const oauthClient = googleClientId && googleClientSecret ? new OAuth2Client(googleClientId, googleClientSecret) : null;
const database = new Firestore({ projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT });
const users = database.collection('users');
const records = database.collection('app_records');
const oauthStates = database.collection('oauth_states');
const googleAccounts = database.collection('google_calendar_accounts');
const app = express();

const publicReadEntities = new Set(['EventType', 'AvailabilityRule', 'AvailabilityException', 'BookedSlot']);
const publicWriteEntities = new Set(['Booking', 'BookedSlot']);
const googleScopes = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

app.use((request, response, next) => {
  const origin = request.headers.origin;
  if (origin && frontendOrigins.has(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
  }
  response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  response.setHeader('Access-Control-Max-Age', '86400');
  if (request.method === 'OPTIONS') return response.sendStatus(204);
  next();
});
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

// Fixed-window rate limit per client IP and bucket (in memory: per instance, which is enough to
// stop password guessing and Google quota abuse from one client)
const rateWindows = new Map();
function rateLimit(bucket, limit, windowMs) {
  return (request, _response, next) => {
    const key = `${bucket}:${request.ip}`;
    const now = Date.now();
    let entry = rateWindows.get(key);
    if (!entry || entry.reset <= now) {
      entry = { count: 0, reset: now + windowMs };
      rateWindows.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > limit) return next(new HttpError(429, 'Too many requests. Please try again later.'));
    next();
  };
}
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateWindows) if (entry.reset <= now) rateWindows.delete(key);
}, 60000).unref();

function safeReturnPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/';
  return value;
}

function oauthClientFor(request) {
  if (!oauthClient) throw new HttpError(503, 'Google OAuth is not configured on the backend');
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${request.protocol}://${request.get('host')}/api/auth/google/callback`;
  return new OAuth2Client(googleClientId, googleClientSecret, redirectUri);
}

function profileFromUser(user) {
  return {
    ...(user.profile || {}),
    id: user.id,
    email: user.email,
    full_name: user.profile?.full_name || user.email?.split('@')[0] || 'Host',
    created_date: user.created_date,
  };
}

function publicRecord(snapshot) {
  const row = snapshot.data();
  return {
    ...row.data,
    id: snapshot.id,
    created_date: row.created_date,
    updated_date: row.updated_date,
  };
}

function matchesFilter(record, filter) {
  return Object.entries(filter).every(([key, expected]) => {
    const actual = record[key];
    if (Array.isArray(expected)) return expected.some((value) => String(value) === String(actual));
    return String(actual) === String(expected);
  });
}

async function currentUser(request) {
  const authorization = request.headers.authorization || '';
  const token = authorization.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  if (!jwtSigningKey) throw new HttpError(503, 'Backend session signing is not configured');
  try {
    const verified = await jwtVerify(token, jwtKey, { algorithms: ['HS256'] });
    if (typeof verified.payload.sub !== 'string' || !verified.payload.sub) return null;
    const snapshot = await users.doc(verified.payload.sub).get();
    if (!snapshot.exists) return null;
    return { id: snapshot.id, ...snapshot.data() };
  } catch {
    return null;
  }
}

async function createSession(user) {
  if (!jwtSigningKey) throw new HttpError(503, 'Backend session signing is not configured');
  return new SignJWT({ email: user.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(jwtKey);
}

function encryptionKey() {
  if (!tokenEncryptionKey) throw new HttpError(503, 'Google token encryption is not configured');
  return createHash('sha256').update(`glassmeet-google:${tokenEncryptionKey}`).digest();
}

function encryptToken(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64url')).join('.');
}

function decryptToken(value) {
  const [iv, tag, ciphertext] = value.split('.').map((part) => Buffer.from(part, 'base64url'));
  if (!iv || !tag || !ciphertext) throw new HttpError(500, 'Stored Google token is invalid');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeData(value) {
  if (!isPlainObject(value)) throw new HttpError(400, 'Expected an object');
  const data = { ...value };
  delete data.id;
  delete data.created_date;
  delete data.updated_date;
  return data;
}

async function getEventType(hostId, eventTypeId) {
  const snapshot = await records.doc(eventTypeId).get();
  if (!snapshot.exists) throw new HttpError(404, 'Event type not found');
  const row = snapshot.data();
  if (row.entity !== 'EventType' || row.owner_id !== hostId || row.data.active === false) {
    throw new HttpError(404, 'Event type not found');
  }
  return { ...row.data, id: snapshot.id };
}

// Access tokens live about an hour; reuse them (keyed by the stored refresh token, so a
// reconnect gets a fresh one) instead of a token round trip on every Calendar call.
const accessTokens = new Map();
async function googleAccessToken(account) {
  if (!oauthClient) throw new HttpError(503, 'Google OAuth is not configured');
  const cacheKey = account.refresh_token_encrypted;
  const cached = accessTokens.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.token;
  const refreshToken = decryptToken(account.refresh_token_encrypted);
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: googleClientId,
      client_secret: googleClientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(outboundTimeoutMs),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.access_token) {
    accessTokens.delete(cacheKey);
    throw new HttpError(502, 'Google authorization expired. Reconnect your account.');
  }
  if (accessTokens.size > 5000) accessTokens.clear();
  // refresh a minute early so a token never expires mid-request
  accessTokens.set(cacheKey, { token: result.access_token, expires: Date.now() + (Number(result.expires_in) || 3600) * 1000 - 60000 });
  return result.access_token;
}

async function googleApi(account, path, init = {}) {
  const accessToken = await googleAccessToken(account);
  const response = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...init,
    signal: AbortSignal.timeout(outboundTimeoutMs),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (response.status === 401) accessTokens.delete(account.refresh_token_encrypted);
  if (!response.ok) throw new HttpError(502, body.error?.message || 'Google Calendar request failed');
  return body;
}

async function listCalendars(account) {
  const result = await googleApi(account, '/users/me/calendarList?minAccessRole=writer');
  return (result.items || []).map((calendar) => ({
    id: calendar.id,
    summary: calendar.summary,
    primary: Boolean(calendar.primary),
    accessRole: calendar.accessRole,
    backgroundColor: calendar.backgroundColor,
  }));
}

async function freeBusy(hostId, timeMin, timeMax) {
  const minimum = Date.parse(timeMin);
  const maximum = Date.parse(timeMax);
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum >= maximum || maximum - minimum > 93 * 86400000) {
    throw new HttpError(400, 'Choose a valid date range of 93 days or less');
  }
  const snapshot = await googleAccounts.doc(hostId).get();
  if (!snapshot.exists) return [];
  const account = snapshot.data();
  const result = await googleApi(account, '/freeBusy', {
    method: 'POST',
    body: JSON.stringify({ timeMin: new Date(minimum).toISOString(), timeMax: new Date(maximum).toISOString(), items: [{ id: account.calendar_id }] }),
  });
  return (result.calendars?.[account.calendar_id]?.busy || []).map((slot) => ({ start_time: slot.start, end_time: slot.end, status: 'confirmed' }));
}

async function createCalendarEvent(bookingId, force = false) {
  const bookingSnapshot = await records.doc(bookingId).get();
  if (!bookingSnapshot.exists) return { created: false };
  const bookingRow = bookingSnapshot.data();
  const booking = bookingRow.data;
  if (bookingRow.entity !== 'Booking' || booking.status !== 'confirmed' || booking.approval_status === 'pending') return { created: false };
  const eventType = await getEventType(booking.host_id, booking.event_type_id);
  const accountSnapshot = await googleAccounts.doc(booking.host_id).get();
  if (!accountSnapshot.exists) return { created: false };
  const account = accountSnapshot.data();
  if ((!force && !account.auto_sync) || booking.google_event_id) return { created: false };

  const result = await googleApi(account, `/calendars/${encodeURIComponent(account.calendar_id)}/events`, {
    method: 'POST',
    body: JSON.stringify({
      summary: `${booking.event_name || eventType.name || 'Meeting'}${booking.guest_name ? ` with ${booking.guest_name}` : ''}`,
      description: [booking.guest_email && `Guest email: ${booking.guest_email}`, booking.guest_phone && `Guest phone: ${booking.guest_phone}`, booking.guest_notes && `Notes: ${booking.guest_notes}`].filter(Boolean).join('\n'),
      location: booking.meeting_url || undefined,
      start: { dateTime: booking.start_time, timeZone: booking.timezone || 'UTC' },
      end: { dateTime: booking.end_time, timeZone: booking.timezone || 'UTC' },
    }),
  });
  await bookingSnapshot.ref.update({ data: { ...booking, google_event_id: result.id }, updated_date: new Date().toISOString() });
  await googleAccounts.doc(booking.host_id).update({ last_synced: new Date().toISOString() });
  return { created: true, eventId: result.id };
}

async function googleCallback(request, response) {
  const { code, state, error: providerError } = request.query;
  if (providerError) throw new HttpError(400, 'Google sign-in was cancelled');
  if (typeof code !== 'string' || typeof state !== 'string') throw new HttpError(400, 'Google sign-in request is invalid');
  const stateRef = oauthStates.doc(createHash('sha256').update(state).digest('hex'));
  // read and delete in one transaction, so one state can't be redeemed twice in parallel
  const stateData = await database.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(stateRef);
    if (!snapshot.exists) return null;
    transaction.delete(stateRef);
    return snapshot.data();
  });
  if (!stateData || stateData.expires_at.toMillis() < Date.now()) throw new HttpError(400, 'Google sign-in expired. Please retry.');
  const callbackClient = oauthClientFor(request);
  const { tokens } = await callbackClient.getToken(code);
  if (!tokens.id_token) throw new HttpError(502, 'Google did not return an ID token');
  const ticket = await callbackClient.verifyIdToken({ idToken: tokens.id_token, audience: googleClientId });
  const profile = ticket.getPayload();
  if (!profile?.sub || !profile.email || !profile.email_verified) throw new HttpError(502, 'Google did not return a verified email');

  let user;
  if (stateData.flow === 'calendar') {
    user = (await users.doc(stateData.user_id).get()).data();
    if (!user) throw new HttpError(401, 'The GlassMeet session is no longer valid');
  } else {
    const existing = await users.where('email', '==', profile.email.toLowerCase()).limit(1).get();
    if (!existing.empty) {
      user = { id: existing.docs[0].id, ...existing.docs[0].data() };
    } else {
      user = {
        id: randomUUID(),
        email: profile.email.toLowerCase(),
        profile: { full_name: profile.name || profile.email.split('@')[0], profile_photo: profile.picture || '', theme: 'system', accent_color: '#0a84ff' },
        password_hash: null,
        created_date: new Date().toISOString(),
      };
      await users.doc(user.id).set(user);
    }
  }

  if (tokens.refresh_token) {
    await googleAccounts.doc(user.id).set({
      email: profile.email.toLowerCase(),
      refresh_token_encrypted: encryptToken(tokens.refresh_token),
      calendar_id: 'primary',
      calendar_name: 'Primary',
      auto_sync: true,
      connected_at: new Date().toISOString(),
    }, { merge: true });
  }

  if (stateData.flow === 'calendar') {
    response.redirect(303, `${stateData.frontend_origin}${stateData.return_to}`);
    return;
  }
  const accessToken = await createSession(user);
  response.redirect(303, `${stateData.frontend_origin}${stateData.return_to}#glassmeet_token=${encodeURIComponent(accessToken)}`);
}

app.get('/health', (_request, response) => response.json({ ok: true }));

app.post('/api/auth/register', rateLimit('register', 10, 3600000), async (request, response, next) => {
  try {
    const email = String(request.body?.email || '').trim().toLowerCase();
    const password = String(request.body?.password || '');
    // bcrypt only reads the first 72 bytes
    if (!email.includes('@') || email.length > 254 || password.length < 8 || Buffer.byteLength(password) > 72) throw new HttpError(400, 'Enter a valid email and a password of at least 8 characters');
    const existing = await users.where('email', '==', email).limit(1).get();
    if (!existing.empty) throw new HttpError(409, 'An account with this email already exists');
    const user = { id: randomUUID(), email, password_hash: await bcrypt.hash(password, 12), profile: { full_name: email.split('@')[0], theme: 'system', accent_color: '#0a84ff' }, created_date: new Date().toISOString() };
    await users.doc(user.id).set(user);
    response.status(201).json({ user: profileFromUser(user), access_token: await createSession(user) });
  } catch (error) { next(error); }
});

app.post('/api/auth/login', rateLimit('login', 20, 900000), async (request, response, next) => {
  try {
    const email = String(request.body?.email || '').trim().toLowerCase();
    const password = String(request.body?.password || '');
    const matches = await users.where('email', '==', email).limit(1).get();
    const user = matches.empty ? null : { id: matches.docs[0].id, ...matches.docs[0].data() };
    const passwordMatches = await bcrypt.compare(password, user?.password_hash || dummyPasswordHash);
    if (!user?.password_hash || !passwordMatches) throw new HttpError(401, 'Invalid email or password');
    response.json({ user: profileFromUser(user), access_token: await createSession(user) });
  } catch (error) { next(error); }
});

app.post('/api/auth/google/start', rateLimit('google-start', 30, 900000), async (request, response, next) => {
  try {
    const oauth = oauthClientFor(request);
    const flow = request.body?.flow === 'calendar' ? 'calendar' : 'login';
    const frontendOrigin = String(request.body?.frontendOrigin || '');
    if (!frontendOrigins.has(frontendOrigin)) throw new HttpError(400, 'Frontend origin is not allowed');
    const returnTo = safeReturnPath(request.body?.returnTo);
    const user = flow === 'calendar' ? await currentUser(request) : null;
    if (flow === 'calendar' && !user) throw new HttpError(401, 'Sign in before connecting Google Calendar');
    const state = randomBytes(32).toString('base64url');
    await oauthStates.doc(createHash('sha256').update(state).digest('hex')).set({
      flow,
      user_id: user?.id || null,
      frontend_origin: frontendOrigin,
      return_to: returnTo,
      expires_at: new Date(Date.now() + 10 * 60 * 1000),
    });
    const authorizationUrl = oauth.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: true,
      scope: googleScopes,
      state,
    });
    response.json({ url: authorizationUrl });
  } catch (error) { next(error); }
});

app.get('/api/auth/google/callback', (request, response, next) => googleCallback(request, response).catch(next));

app.get('/api/auth/me', async (request, response, next) => {
  try {
    const user = await currentUser(request);
    if (!user) throw new HttpError(401, 'Please sign in');
    response.json(profileFromUser(user));
  } catch (error) { next(error); }
});

app.put('/api/auth/me', async (request, response, next) => {
  try {
    const user = await currentUser(request);
    if (!user) throw new HttpError(401, 'Please sign in');
    if (!isPlainObject(request.body)) throw new HttpError(400, 'Expected an object');
    const changes = normalizeData(request.body);
    delete changes.email;
    user.profile = { ...user.profile, ...changes };
    // only the profile changes; never rewrite the stored password hash or email from here
    await users.doc(user.id).update({ profile: user.profile });
    response.json(profileFromUser(user));
  } catch (error) { next(error); }
});

app.post('/api/auth/logout', (_request, response) => response.json({ success: true }));
app.post('/api/auth/password-reset', (_request, _response, next) => next(new HttpError(501, 'Configure an email provider to enable password recovery')));
app.post('/api/auth/password-reset/confirm', (_request, _response, next) => next(new HttpError(501, 'Configure an email provider to enable password recovery')));
app.get('/api/app/settings', (_request, response) => response.json({ id: 'google-cloud', public_settings: { app_name: 'GlassMeet' } }));

app.all('/api/entities/:entity/bulk', async (request, response, next) => {
  try {
    const user = await currentUser(request);
    const entity = request.params.entity;
    const items = request.body;
    if (!Array.isArray(items)) throw new HttpError(400, 'Expected an array');
    if (items.length > 100) throw new HttpError(400, 'At most 100 items at a time');
    if (request.method === 'POST') {
      response.status(201).json(await Promise.all(items.map((item) => writeRecord(entity, item, user))));
      return;
    }
    if (request.method !== 'PATCH' && request.method !== 'PUT') throw new HttpError(405, 'Method not allowed');
    if (!user) throw new HttpError(401, 'Please sign in');
    if (!items.every((item) => isPlainObject(item) && typeof item.id === 'string')) throw new HttpError(400, 'Each item needs an id');
    response.json(await Promise.all(items.map(({ id, ...value }) => updateRecord(entity, id, value, user))));
  } catch (error) { next(error); }
});

app.get('/api/entities/:entity/:id', async (request, response, next) => {
  try {
    const user = await currentUser(request);
    const snapshot = await records.doc(request.params.id).get();
    if (!snapshot.exists || snapshot.data().entity !== request.params.entity) { response.json(null); return; }
    const row = snapshot.data();
    if (row.owner_id !== user?.id && !publicReadEntities.has(row.entity)) throw new HttpError(401, 'Please sign in');
    if (row.entity === 'EventType' && row.data.active === false) { response.json(null); return; }
    response.json(publicRecord(snapshot));
  } catch (error) { next(error); }
});

app.get('/api/entities/:entity', async (request, response, next) => {
  try {
    const user = await currentUser(request);
    const entity = request.params.entity;
    if (!user && !publicReadEntities.has(entity)) throw new HttpError(401, 'Please sign in');
    let where = {};
    try {
      if (request.query.where) where = JSON.parse(String(request.query.where));
    } catch {
      throw new HttpError(400, 'The where filter must be JSON');
    }
    if (!isPlainObject(where)) throw new HttpError(400, 'The where filter must be an object');
    // a signed-in user's own records are filtered by Firestore, not after reading 1000 of everyone's
    let query = records.where('entity', '==', entity);
    if (user) query = query.where('owner_id', '==', user.id);
    const snapshot = await query.limit(1000).get();
    let output = snapshot.docs
      .map(publicRecord)
      .filter((item) => !(entity === 'EventType' && item.active === false));
    output = output.filter((item) => matchesFilter(item, where));
    const sort = String(request.query.sort || '');
    if (sort) {
      const descending = sort.startsWith('-');
      const field = descending ? sort.slice(1) : sort;
      output.sort((a, b) => {
        const result = String(a[field] ?? '').localeCompare(String(b[field] ?? ''), undefined, { numeric: true });
        return descending ? -result : result;
      });
    }
    const requestedLimit = Number(request.query.limit);
    if (request.query.limit !== undefined && Number.isInteger(requestedLimit) && requestedLimit >= 0) output = output.slice(0, requestedLimit);
    response.json(output);
  } catch (error) { next(error); }
});

app.post('/api/entities/:entity', async (request, response, next) => {
  try {
    const user = await currentUser(request);
    response.status(201).json(await writeRecord(request.params.entity, request.body, user));
  } catch (error) { next(error); }
});

app.patch('/api/entities/:entity/:id', async (request, response, next) => {
  try {
    const user = await currentUser(request);
    if (!user) throw new HttpError(401, 'Please sign in');
    response.json(await updateRecord(request.params.entity, request.params.id, request.body, user));
  } catch (error) { next(error); }
});

app.delete('/api/entities/:entity/:id', async (request, response, next) => {
  try {
    const user = await currentUser(request);
    if (!user) throw new HttpError(401, 'Please sign in');
    const reference = records.doc(request.params.id);
    const snapshot = await reference.get();
    if (!snapshot.exists || snapshot.data().entity !== request.params.entity || snapshot.data().owner_id !== user.id) throw new HttpError(404, 'Record not found');
    await reference.delete();
    response.json({ success: true });
  } catch (error) { next(error); }
});

async function writeRecord(entity, value, user) {
  if (!user && !publicWriteEntities.has(entity)) throw new HttpError(401, 'Please sign in');
  const data = normalizeData(value);
  let ownerId;
  if (publicWriteEntities.has(entity)) {
    // a booking belongs to the host of an active event type, whoever sends it
    ownerId = data.host_id || data.created_by_id || user?.id;
    if (typeof ownerId !== 'string' || typeof data.event_type_id !== 'string') throw new HttpError(400, 'Record owner is required');
    await getEventType(ownerId, data.event_type_id);
  } else {
    // everything else belongs to the signed-in user; the body can't name another owner
    ownerId = user.id;
    data.created_by_id = user.id;
  }
  const id = randomUUID();
  const now = new Date().toISOString();
  const row = { entity, owner_id: ownerId, data, created_date: now, updated_date: now };
  await records.doc(id).set(row);
  if (entity === 'Booking' && data.status === 'confirmed' && data.approval_status !== 'pending') {
    createCalendarEvent(id).catch((error) => console.error('Google Calendar event creation failed:', error.message));
  }
  return { ...data, id, created_date: now, updated_date: now };
}

async function updateRecord(entity, id, value, user) {
  const reference = records.doc(id);
  const snapshot = await reference.get();
  if (!snapshot.exists || snapshot.data().entity !== entity || snapshot.data().owner_id !== user.id) throw new HttpError(404, 'Record not found');
  const old = snapshot.data();
  const changes = normalizeData(value);
  // ownership fields stay as they were
  delete changes.created_by_id;
  delete changes.host_id;
  const data = { ...old.data, ...changes };
  const updated = new Date().toISOString();
  await reference.update({ data, updated_date: updated });
  return { ...data, id, created_date: old.created_date, updated_date: updated };
}

app.get('/api/google/status', async (request, response, next) => {
  try {
    const user = await currentUser(request);
    if (!user) throw new HttpError(401, 'Please sign in');
    const snapshot = await googleAccounts.doc(user.id).get();
    if (!snapshot.exists) { response.json({ connected: false }); return; }
    const account = snapshot.data();
    response.json({ connected: true, email: account.email, calendar_id: account.calendar_id, calendar_name: account.calendar_name, auto_sync: account.auto_sync, last_synced: account.last_synced });
  } catch (error) { next(error); }
});

app.get('/api/google/calendars', async (request, response, next) => {
  try {
    const user = await currentUser(request);
    if (!user) throw new HttpError(401, 'Please sign in');
    const account = (await googleAccounts.doc(user.id).get()).data();
    if (!account) throw new HttpError(409, 'Connect Google Calendar first');
    response.json(await listCalendars(account));
  } catch (error) { next(error); }
});

// public (booking pages), so limited: each call spends the host's Google API quota
app.get('/api/google/busy/:hostId', rateLimit('busy', 120, 600000), async (request, response, next) => {
  try {
    response.json(await freeBusy(request.params.hostId, String(request.query.timeMin || ''), String(request.query.timeMax || '')));
  } catch (error) { next(error); }
});

app.post('/api/google/settings', async (request, response, next) => {
  try {
    const user = await currentUser(request);
    if (!user) throw new HttpError(401, 'Please sign in');
    const reference = googleAccounts.doc(user.id);
    const snapshot = await reference.get();
    if (!snapshot.exists) throw new HttpError(409, 'Connect Google Calendar first');
    const account = snapshot.data();
    const calendars = await listCalendars(account);
    const selected = calendars.find((calendar) => calendar.id === request.body?.calendarId);
    if (!selected) throw new HttpError(400, 'Choose a writable calendar');
    const autoSync = request.body.autoSync !== false;
    await reference.update({ calendar_id: selected.id, calendar_name: selected.summary, auto_sync: autoSync });
    response.json({ calendarId: selected.id, calendarName: selected.summary, autoSync });
  } catch (error) { next(error); }
});

app.post('/api/google/sync', async (request, response, next) => {
  try {
    const user = await currentUser(request);
    if (!user) throw new HttpError(401, 'Please sign in');
    const snapshot = await records.where('entity', '==', 'Booking').where('owner_id', '==', user.id).limit(1000).get();
    let created = 0;
    let failed = 0;
    // one at a time to stay inside Google's per-user rate limits; one bad booking (say, its
    // event type was deleted) doesn't stop the rest
    for (const booking of snapshot.docs) {
      if (booking.data().data.status === 'confirmed' && booking.data().data.approval_status !== 'pending' && !booking.data().data.google_event_id) {
        try {
          const result = await createCalendarEvent(booking.id, true);
          if (result.created) created += 1;
        } catch (error) {
          if (error instanceof HttpError && error.status === 503) throw error;
          failed += 1;
          console.error('Google Calendar sync failed for a booking:', error.message);
        }
      }
    }
    if (failed && !created) throw new HttpError(502, 'Google Calendar sync failed. Reconnect your account and try again.');
    const account = (await googleAccounts.doc(user.id).get()).data();
    response.json({ created, lastSynced: account?.last_synced || null });
  } catch (error) { next(error); }
});

app.delete('/api/google', async (request, response, next) => {
  try {
    const user = await currentUser(request);
    if (!user) throw new HttpError(401, 'Please sign in');
    await googleAccounts.doc(user.id).delete();
    response.json({ success: true });
  } catch (error) { next(error); }
});

app.use((error, _request, response, _next) => {
  // body-parser errors (bad JSON, too large) carry their own 4xx status
  const clientStatus = Number(error?.status || error?.statusCode);
  const status = error instanceof HttpError ? error.status
    : clientStatus >= 400 && clientStatus < 500 ? clientStatus : 500;
  if (status >= 500) console.error(error);
  // internal error details (Firestore, crypto) stay in the logs
  const message = error instanceof HttpError || status < 500 ? error.message : 'Internal server error';
  if (response.headersSent) return;
  response.status(status).json({ error: message || 'Internal server error' });
});

process.on('unhandledRejection', (reason) => console.error('Unhandled promise rejection:', reason));

const httpServer = createServer(app);
httpServer.requestTimeout = 30000;
httpServer.headersTimeout = 20000;
httpServer.listen(port, '0.0.0.0', () => console.log(`GlassMeet API listening on ${port}`));

// Cloud Run sends SIGTERM before stopping an instance: finish in-flight requests first
process.on('SIGTERM', () => {
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 8000).unref();
});
