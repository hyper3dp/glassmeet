import { Toaster } from "@/components/ui/toaster";
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { ThemeProvider } from 'next-themes';
import { embedTheme } from '@/lib/embed.js';
import { AuthProvider, useAuth } from '@/lib/Authcontext.jsx';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './Components/scrolltotop.jsx';
import ProtectedRoute from '@/components/protectedroute.jsx';
import { useApp } from '@/lib/useprofile.js';
import ErrorBoundary from '@/components/ErrorBoundary.jsx';
import { PAGES, preloadPage } from '@/lib/pages.js';

// Pages load on demand (see lib/pages.js); the one being opened starts downloading right away
const AppShell = lazy(PAGES.appShell);
const PageNotFound = lazy(PAGES.notFound);
const Login = lazy(PAGES.login);
const Register = lazy(PAGES.register);
const ForgotPassword = lazy(PAGES.forgotPassword);
const ResetPassword = lazy(PAGES.resetPassword);
const Landing = lazy(PAGES.landing);
const Dashboard = lazy(PAGES.dashboard);
const CalendarPage = lazy(PAGES.calendar);
const EventTypes = lazy(PAGES.eventTypes);
const Bookings = lazy(PAGES.bookings);
const Availability = lazy(PAGES.availability);
const WhatsAppSettings = lazy(PAGES.whatsapp);
const Settings = lazy(PAGES.settings);
const BookingPage = lazy(PAGES.booking);
const BookingConfirmation = lazy(PAGES.confirmation);
const CalendarConnections = lazy(PAGES.calendarConnections);
const Analytics = lazy(PAGES.analytics);
const Terms = lazy(PAGES.terms);
const Privacy = lazy(PAGES.privacy);

preloadPage(window.location.pathname.slice(import.meta.env.BASE_URL.length - 1));

const FullScreenLoader = () => (
  <div 
    className="fixed inset-0 flex items-center justify-center" 
    role="status" 
    aria-live="polite"
  >
    <div className="w-8 h-8 border-2 border-primary-soft border-t-primary rounded-full animate-spin"></div>
    <span className="sr-only">Loading application...</span>
  </div>
);

// Thin wrappers so pages receive profile/whatsapp from context without prop-drilling at the route level.
// signed-out visitors to an app page go to Log in and come back to that page afterwards
function LoginRedirect() {
  const location = useLocation();
  return <Navigate to={`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`} replace />;
}

const DashboardPage = () => { const { profile } = useApp(); return <Dashboard profile={profile} />; };
const CalendarPagePage = () => { const { profile } = useApp(); return <CalendarPage profile={profile} />; };
const EventTypesPage = () => { const { profile } = useApp(); return <EventTypes profile={profile} />; };
const BookingsPage = () => { const { profile, whatsapp } = useApp(); return <Bookings profile={profile} whatsapp={whatsapp} />; };
const AvailabilityPage = () => { const { profile, updateProfile } = useApp(); return <Availability profile={profile} updateProfile={updateProfile} />; };
const WhatsAppPage = () => { const { profile, whatsapp, setWhatsapp } = useApp(); return <WhatsAppSettings profile={profile} whatsapp={whatsapp} setWhatsapp={setWhatsapp} />; };
const SettingsPage = () => { const { profile, updateProfile } = useApp(); return <Settings profile={profile} updateProfile={updateProfile} />; };
const CalendarConnectionsPage = () => { return <CalendarConnections />; };
const AnalyticsPage = () => { const { profile } = useApp(); return <Analytics profile={profile} />; };

// The landing page sends signed-in visitors to the dashboard: wait for that check rather than
// flash the landing page first. Other public pages don't depend on it and render at once.
const LandingPage = () => {
  const { authChecked } = useAuth();
  return authChecked ? <Landing /> : <FullScreenLoader />;
};

const AuthenticatedApp = () => {
  const { authError } = useAuth();

  // Only short-circuit for unregistered users; unauthenticated visitors may still
  // view public pages (landing, booking). Protected routes gate via ProtectedRoute.
  if (authError && authError.type === 'user_not_registered') {
    return <UserNotRegisteredError />;
  }

  return (
    <ErrorBoundary>
    <Suspense fallback={<FullScreenLoader />}>
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/book/:eventTypeId" element={<BookingPage />} />
      <Route path="/confirm/:bookingId" element={<BookingConfirmation />} />

      {/* Auth routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />

      {/* Protected app routes */}
      <Route element={<ProtectedRoute unauthenticatedElement={<LoginRedirect />} />}>
        <Route element={<AppShell />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/calendar" element={<CalendarPagePage />} />
          <Route path="/event-types" element={<EventTypesPage />} />
          <Route path="/bookings" element={<BookingsPage />} />
          <Route path="/availability" element={<AvailabilityPage />} />
          <Route path="/whatsapp" element={<WhatsAppPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/calendar-connections" element={<CalendarConnectionsPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<PageNotFound />} />
    </Routes>
    </Suspense>
    </ErrorBoundary>
  );
};

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem forcedTheme={embedTheme()} disableTransitionOnChange>
      <AuthProvider>
          <Router basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
            <ScrollToTop />
            <AuthenticatedApp />
          </Router>
          <Toaster />
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;