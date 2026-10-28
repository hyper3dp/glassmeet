// "Report a bug" for the launch period. Installed first thing in Main.jsx, it keeps the last few
// errors, failed requests and pages visited, so a report says what happened without the person
// having to. Temporary: the button hides itself after REPORTS_UNTIL (delete this file,
// Components/BugReport.jsx and their two imports to remove it for good).
import { supabase } from '@/lib/supabaseClient';

export const REPORTS_UNTIL = '2026-12-31';
export const reportsOpen = () => new Date() < new Date(`${REPORTS_UNTIL}T23:59:59`);

const MAX = 25;
const errors = [];
const requests = [];
const pages = [];
const started = Date.now();
const push = (list, item) => { list.push(item); if (list.length > MAX) list.shift(); };
const at = () => Math.round((Date.now() - started) / 1000); // seconds since the page loaded

// sign-in links carry tokens in the hash and query; never send those
const SECRET_PARAMS = /^(access_token|refresh_token|token|code|state|provider_token|key|apikey)$/i;
export const cleanUrl = (raw) => {
  try {
    const url = new URL(raw, window.location.origin);
    url.hash = '';
    for (const k of [...url.searchParams.keys()]) if (SECRET_PARAMS.test(k)) url.searchParams.set(k, '…');
    return url.origin === window.location.origin ? url.pathname + url.search : url.origin + url.pathname;
  } catch {
    return '';
  }
};
const text = (v) => {
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch { return String(v); }
};
const clip = (s, n = 500) => (s.length > n ? `${s.slice(0, n)}…` : s);

let installed = false;
export const installBugCollector = () => {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('error', (e) => {
    push(errors, { at: at(), type: 'error', message: clip(e.message || text(e.error)), source: e.filename ? `${cleanUrl(e.filename)}:${e.lineno}` : undefined });
  });
  window.addEventListener('unhandledrejection', (e) => {
    push(errors, { at: at(), type: 'promise', message: clip(text(e.reason)) });
  });
  for (const level of ['error', 'warn']) {
    const original = console[level];
    console[level] = (...args) => {
      push(errors, { at: at(), type: `console.${level}`, message: clip(args.map(text).join(' ')) });
      original.apply(console, args);
    };
  }

  // failed requests only: method, address without its query, status and time taken
  const originalFetch = window.fetch;
  window.fetch = async (input, init) => {
    const t0 = performance.now();
    const method = (init?.method || input?.method || 'GET').toUpperCase();
    const url = cleanUrl(typeof input === 'string' ? input : input?.url || String(input)).split('?')[0];
    try {
      const res = await originalFetch(input, init);
      if (!res.ok) push(requests, { at: at(), method, url, status: res.status, ms: Math.round(performance.now() - t0) });
      return res;
    } catch (err) {
      push(requests, { at: at(), method, url, status: 'failed', error: clip(text(err), 200), ms: Math.round(performance.now() - t0) });
      throw err;
    }
  };

  const visit = () => { const p = cleanUrl(window.location.href); if (pages[pages.length - 1]?.page !== p) push(pages, { at: at(), page: p }); };
  visit();
  for (const fn of ['pushState', 'replaceState']) {
    const original = history[fn];
    history[fn] = function (...args) { const r = original.apply(this, args); visit(); return r; };
  }
  window.addEventListener('popstate', visit);
};

// what a report sends besides the person's note; shown to them before they send it
export const collectDetails = () => {
  const nav = navigator;
  return {
    page: cleanUrl(window.location.href),
    browser: nav.userAgent,
    platform: nav.userAgentData?.platform || nav.platform || '',
    mobile: nav.userAgentData?.mobile ?? /Mobi|Android/i.test(nav.userAgent),
    language: nav.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    screen: `${window.screen.width}×${window.screen.height} @${window.devicePixelRatio}x`,
    window: `${window.innerWidth}×${window.innerHeight}`,
    theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
    online: nav.onLine,
    connection: nav.connection?.effectiveType,
    seconds_on_page: at(),
    app_version: import.meta.env.VITE_APP_VERSION || document.querySelector('script[type="module"][src*="/assets/"]')?.src.split('/').pop() || 'dev',
    recent_pages: [...pages],
    recent_errors: [...errors],
    failed_requests: [...requests],
  };
};

export const sendBugReport = async ({ message, email, details }) => {
  const { data: { session } } = await supabase.auth.getSession();
  const { error } = await supabase.from('bug_reports').insert({
    message: message.trim().slice(0, 4000),
    email: (email || session?.user?.email || '').trim().slice(0, 320) || null,
    page: cleanUrl(window.location.href),
    details: details || null,
    user_id: session?.user?.id ?? null,
  });
  if (error) {
    if (error.code === '42P01' || /relation .* does not exist|schema cache/i.test(error.message)) throw new Error('Bug reports aren’t switched on yet. Please try again later.');
    throw new Error(error.message || 'The report couldn’t be sent.');
  }
};
