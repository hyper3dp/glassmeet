// Page chunks, loaded on demand so guests opening a booking link don't download the host app.
// Calling a loader by hand starts the download before the page renders: at startup for the page
// being opened (alongside the sign-in check instead of after it), and in idle time for the rest.
export const PAGES = {
  appShell: () => import('@/components/AppShell.jsx'),
  notFound: () => import('@/lib/Pagenotfound.jsx'),
  login: () => import('@/pages/login.jsx'),
  register: () => import('@/pages/register.jsx'),
  forgotPassword: () => import('@/pages/forgotpassword.jsx'),
  resetPassword: () => import('@/pages/resetpassword.jsx'),
  landing: () => import('@/pages/Landing.jsx'),
  dashboard: () => import('@/pages/dashboard.jsx'),
  calendar: () => import('@/pages/calenderpage.jsx'),
  eventTypes: () => import('@/pages/Event types.jsx'),
  bookings: () => import('@/pages/bookings.jsx'),
  availability: () => import('@/pages/Availability.jsx'),
  whatsapp: () => import('@/pages/whatsappsettings.jsx'),
  settings: () => import('@/pages/settings.jsx'),
  booking: () => import('@/pages/bookingpage.jsx'),
  confirmation: () => import('@/pages/bookingconfirmation.jsx'),
  calendarConnections: () => import('@/pages/calenderconnections.jsx'),
  analytics: () => import('@/pages/Analytics.jsx'),
  terms: () => import('@/pages/terms.jsx'),
  privacy: () => import('@/pages/privacy.jsx'),
};

// host app routes → page (each also needs the shell)
const APP_ROUTES = {
  '/dashboard': 'dashboard',
  '/calendar': 'calendar',
  '/event-types': 'eventTypes',
  '/bookings': 'bookings',
  '/availability': 'availability',
  '/whatsapp': 'whatsapp',
  '/settings': 'settings',
  '/calendar-connections': 'calendarConnections',
  '/analytics': 'analytics',
};
const PUBLIC_ROUTES = {
  '/': 'landing',
  '/login': 'login',
  '/register': 'register',
  '/forgot-password': 'forgotPassword',
  '/reset-password': 'resetPassword',
  '/terms': 'terms',
  '/privacy': 'privacy',
};

const ignore = () => {}; // a failed preload retries when the page renders

// Starts downloading the page for this address (path inside the app, without the base)
export function preloadPage(path) {
  const clean = path.replace(/\/+$/, '') || '/';
  if (APP_ROUTES[clean]) {
    PAGES.appShell().catch(ignore);
    PAGES[APP_ROUTES[clean]]().catch(ignore);
  } else if (PUBLIC_ROUTES[clean]) PAGES[PUBLIC_ROUTES[clean]]().catch(ignore);
  else if (clean.startsWith('/book/')) PAGES.booking().catch(ignore);
  else if (clean.startsWith('/confirm/')) PAGES.confirmation().catch(ignore);
}

// The other host pages, fetched when the browser is idle so moving around the app is instant.
// Analytics (charts) is large and rarely opened first, so it waits for its own visit.
export function prefetchAppPages() {
  const run = () => Object.values(APP_ROUTES).forEach((name) => { if (name !== 'analytics') PAGES[name]().catch(ignore); });
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 4000 });
  else setTimeout(run, 1500);
}
