import { appPath } from '@/lib/authReturnTo';

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const TOKEN_KEY = 'glassmeet_session';

function storeToken(token) {
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
}

function consumeGoogleCallbackToken() {
  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  const token = hashParams.get('glassmeet_token');
  if (!token) return;
  storeToken(token);
  hashParams.delete('glassmeet_token');
  const remainingHash = hashParams.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${remainingHash ? `#${remainingHash}` : ''}`);
}

consumeGoogleCallbackToken();

async function request(path, options = {}) {
  if (!API_URL) throw new Error('Google Cloud API is not configured. Add VITE_API_URL to the GitHub Pages build settings.');
  const headers = new Headers(options.headers);
  const token = window.localStorage.getItem(TOKEN_KEY);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let body = options.body;
  if (body !== undefined && typeof body !== 'string') {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(body);
  }
  const response = await fetch(`${API_URL}${path}`, { ...options, headers, body });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && path === '/api/auth/me') window.localStorage.removeItem(TOKEN_KEY);
    throw new Error(payload.error || `Request failed (${response.status})`);
  }
  return payload;
}

const entities = new Proxy({}, {
  get: (_target, entityName) => ({
    filter: (where = {}, sort, limit) => {
      const params = new URLSearchParams({ where: JSON.stringify(where) });
      if (sort) params.set('sort', sort);
      if (limit != null) params.set('limit', String(limit));
      return request(`/api/entities/${encodeURIComponent(entityName)}?${params}`);
    },
    get: (id) => request(`/api/entities/${encodeURIComponent(entityName)}/${encodeURIComponent(id)}`),
    create: (value) => request(`/api/entities/${encodeURIComponent(entityName)}`, { method: 'POST', body: value }),
    bulkCreate: (values) => request(`/api/entities/${encodeURIComponent(entityName)}/bulk`, { method: 'POST', body: values }),
    update: (id, value) => request(`/api/entities/${encodeURIComponent(entityName)}/${encodeURIComponent(id)}`, { method: 'PATCH', body: value }),
    bulkUpdate: (values) => request(`/api/entities/${encodeURIComponent(entityName)}/bulk`, { method: 'PATCH', body: values }),
    delete: (id) => request(`/api/entities/${encodeURIComponent(entityName)}/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  }),
});

export const api = {
  entities,
  app: { getPublicSettings: () => request('/api/app/settings') },
  auth: {
    me: () => request('/api/auth/me'),
    updateMe: (value) => request('/api/auth/me', { method: 'PUT', body: value }),
    loginViaEmailPassword: async (email, password) => {
      const result = await request('/api/auth/login', { method: 'POST', body: { email, password } });
      storeToken(result.access_token);
      return result;
    },
    register: async (value) => {
      const result = await request('/api/auth/register', { method: 'POST', body: value });
      storeToken(result.access_token);
      return result;
    },
    loginWithGoogle: async (returnTo = '/', flow = 'login') => {
      const result = await request('/api/auth/google/start', {
        method: 'POST',
        body: { flow, returnTo: appPath(returnTo), frontendOrigin: window.location.origin },
      });
      window.location.assign(result.url);
    },
    logout: async () => {
      try { await request('/api/auth/logout', { method: 'POST' }); }
      finally { window.localStorage.removeItem(TOKEN_KEY); }
    },
    resetPasswordRequest: (email) => request('/api/auth/password-reset', { method: 'POST', body: { email } }),
    resetPassword: (value) => request('/api/auth/password-reset/confirm', { method: 'POST', body: value }),
    hasSession: async () => Boolean(window.localStorage.getItem(TOKEN_KEY)),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  },
  google: {
    status: () => request('/api/google/status'),
    calendars: () => request('/api/google/calendars'),
    busy: (hostId, timeMin, timeMax) => {
      const params = new URLSearchParams({ timeMin, timeMax });
      return request(`/api/google/busy/${encodeURIComponent(hostId)}?${params}`);
    },
    saveSettings: (value) => request('/api/google/settings', { method: 'POST', body: value }),
    sync: () => request('/api/google/sync', { method: 'POST' }),
    disconnect: () => request('/api/google', { method: 'DELETE' }),
  },
};