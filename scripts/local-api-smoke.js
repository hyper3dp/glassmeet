import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { DatabaseSync } from 'node:sqlite';

const origin = `http://localhost:${process.env.PORT || 5173}`;
const email = `smoke-${randomUUID()}@example.test`;
let userId;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(path, options = {}) {
  const response = await fetch(`${origin}${path}`, options);
  const result = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${result.error}`);
  return result;
}

try {
  const canonicalResponse = await new Promise((resolve, reject) => {
    const target = new URL(origin);
    const request = httpRequest({
      hostname: '127.0.0.1',
      port: target.port,
      path: '/login?returnTo=%2Fdashboard',
      headers: { host: 'www.glassmeet.com' },
    }, (response) => {
      response.resume();
      resolve(response);
    });
    request.on('error', reject);
    request.end();
  });
  assert(canonicalResponse.statusCode === 308, `www domain did not redirect (HTTP ${canonicalResponse.statusCode})`);
  assert(canonicalResponse.headers.location === 'https://glassmeet.com/login?returnTo=%2Fdashboard', 'www redirect did not preserve the URL');

  const googleConfig = await request('/api/auth/google/config');
  assert(typeof googleConfig.enabled === 'boolean', 'Google OAuth configuration status is missing');
  if (googleConfig.enabled) {
    const googleStart = await fetch(`${origin}/api/auth/google/start?returnTo=%2F`, { redirect: 'manual' });
    const authorizationUrl = new URL(googleStart.headers.get('location'));
    assert(googleStart.status === 303 && authorizationUrl.hostname === 'accounts.google.com', 'Google OAuth did not redirect to Google');
    assert(authorizationUrl.searchParams.get('redirect_uri') === `${origin}/api/auth/google/callback`, `Google OAuth callback URL is incorrect: ${authorizationUrl.searchParams.get('redirect_uri')}`);
    assert(authorizationUrl.searchParams.get('scope').includes('https://www.googleapis.com/auth/calendar.events'), 'Google Calendar event scope is missing');
  }
  assert((await request(`/api/google/busy/${randomUUID()}?timeMin=2026-09-01T00%3A00%3A00.000Z&timeMax=2026-09-02T00%3A00%3A00.000Z`)).length === 0, 'unconnected Google calendar should have no busy times');

  const registrationResponse = await fetch(`${origin}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'SmokeTestPass123!' }),
  });
  const registration = await registrationResponse.json();
  assert(registrationResponse.headers.get('set-cookie')?.includes('HttpOnly'), 'registration session cookie was not set securely');
  userId = registration.user.id;
  const headers = {
    Authorization: `Bearer ${registration.access_token}`,
    'Content-Type': 'application/json',
  };
  assert((await request('/api/auth/me', { headers })).id === userId, 'session lookup failed');

  const event = await request('/api/entities/EventType', {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: 'Smoke test event', duration: 30, active: true }),
  });
  const filtered = await request(`/api/entities/EventType?where=${encodeURIComponent(JSON.stringify({ created_by_id: userId }))}`, { headers });
  assert(filtered.some((record) => record.id === event.id), 'entity filter failed');

  const updated = await request(`/api/entities/EventType/${event.id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ name: 'Updated smoke test event' }),
  });
  assert(updated.name === 'Updated smoke test event', 'entity update failed');

  const rules = await request('/api/entities/AvailabilityRule/bulk', {
    method: 'POST',
    headers,
    body: JSON.stringify([{ day_of_week: 1 }, { day_of_week: 2 }]),
  });
  assert(rules.length === 2, 'bulk create failed');
  const changedRules = await request('/api/entities/AvailabilityRule/bulk', {
    method: 'PATCH',
    headers,
    body: JSON.stringify([{ id: rules[0].id, start_time: '10:00' }]),
  });
  assert(changedRules[0].start_time === '10:00', 'bulk update failed');

  const privateResponse = await fetch(`${origin}/api/entities/CalendarSubscription`);
  assert(privateResponse.status === 401, 'anonymous users can access private entity records');

  const reset = await request('/api/auth/password-reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  assert(reset.resetToken, 'password reset token was not generated');
  await request('/api/auth/password-reset/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resetToken: reset.resetToken, newPassword: 'UpdatedPass123!' }),
  });
  const login = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'UpdatedPass123!' }),
  });
  assert(login.user.id === userId, 'login after password reset failed');
  console.log('Local auth, password reset, entity CRUD, Google config, and private data checks passed.');
} finally {
  if (userId) {
    const database = new DatabaseSync('data/glassmeet.sqlite');
    database.prepare('DELETE FROM entity_records WHERE owner_id = ?').run(userId);
    database.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    database.prepare('DELETE FROM password_resets WHERE user_id = ?').run(userId);
    database.prepare('DELETE FROM users WHERE id = ?').run(userId);
    database.close();
  }
}