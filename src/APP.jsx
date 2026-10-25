import { Toaster } from "@/components/ui/toaster";
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClientInstance } from '@/lib/query-client';
import { BrowserRouter as Router, Route, Routes, Outlet, Navigate } from 'react-router-dom';
import { useState, useEffect, lazy, Suspense } from 'react';
import { ThemeProvider } from 'next-themes';
import PageNotFound from './lib/Pagenotfound.jsx';
import { AuthProvider, useAuth } from '@/lib/Authcontext.jsx';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './Components/scrolltotop.jsx';
import ProtectedRoute from '@/components/protectedroute.jsx';
import { useProfile, AppContext, useApp } from '@/lib/useprofile.js';
import Layout from '@/components/Layout';
import CommandPalette from '@/components/commandpalatte.jsx';
import ErrorBoundary from '@/components/ErrorBoundary.jsx';

// Pages load on demand, so guests opening a booking link don't download the host app
const Login = lazy(() => import('./pages/login.jsx'));
const Register = lazy(() => import('./pages/register.jsx'));
const ForgotPassword = lazy(() => import('./pages/forgotpassword.jsx'));
const ResetPassword = lazy(() => import('./pages/resetpassword.jsx'));
const Landing = lazy(() => import('@/pages/Landing'));
const Dashboard = lazy(() => import('./pages/dashboard.jsx'));
const CalendarPage = lazy(() => import('./pages/calenderpage.jsx'));
const EventTypes = lazy(() => import('./pages/Event types.jsx'));
const Bookings = lazy(() => import('./pages/bookings.jsx'));
const Availability = lazy(() => import('./pages/Availability.jsx'));
const WhatsAppSettings = lazy(() => import('./pages/whatsappsettings.jsx'));
const Settings = lazy(() => import('./pages/settings.jsx'));
const BookingPage = lazy(() => import('./pages/bookingpage.jsx'));
const BookingConfirmation = lazy(() => import('./pages/bookingconfirmation.jsx'));
const CalendarConnections = lazy(() => import('./pages/calenderconnections.jsx'));
const Analytics = lazy(() => import('./pages/Analytics.jsx'));
const Terms = lazy(() => import('@/pages/terms.jsx'));
const Privacy = lazy(() => import('@/pages/privacy.jsx'));

const PageLoader = () => (
  <div className="flex justify-center py-24" role="status" aria-live="polite">
    <div className="w-8 h-8 border-2 border-primary-soft border-t-primary rounded-full animate-spin"></div>
    <span className="sr-only">Loading…</span>
  </div>
);

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

// Loads the profile once and provides it to all app pages via context.
function AppShell() {
  const { profile, whatsapp, setWhatsapp, loading, updateProfile, reload } = useProfile();
  const [cmdOpen, setCmdOpen] = useState(false);

  // Command palette keyboard shortcut: Ctrl+K / Cmd+K
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Show full screen loader while profile fetching is in progress
  if (loading) return <FullScreenLoader />;
  
  // If profile creation is still in progress for new users
  if (!profile) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-4">
        <div className="w-8 h-8 border-2 border-primary-soft border-t-primary rounded-full animate-spin"></div>
        <p className="text-sm text-muted-foreground">Setting up your profile...</p>
      </div>
    );
  }

  return (
    <AppContext.Provider value={{ profile, whatsapp, setWhatsapp, updateProfile, reload }}>
      <Layout profile={profile} onOpenCommandPalette={() => setCmdOpen(true)}>
        <ErrorBoundary>
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </Layout>
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </AppContext.Provider>
  );
}

// Thin wrappers so pages receive profile/whatsapp from context without prop-drilling at the route level.
const DashboardPage = () => { const { profile } = useApp(); return <Dashboard profile={profile} />; };
const CalendarPagePage = () => { const { profile } = useApp(); return <CalendarPage profile={profile} />; };
const EventTypesPage = () => { const { profile } = useApp(); return <EventTypes profile={profile} />; };
const BookingsPage = () => { const { profile, whatsapp } = useApp(); return <Bookings profile={profile} whatsapp={whatsapp} />; };
const AvailabilityPage = () => { const { profile } = useApp(); return <Availability profile={profile} />; };
const WhatsAppPage = () => { const { profile, whatsapp, setWhatsapp } = useApp(); return <WhatsAppSettings profile={profile} whatsapp={whatsapp} setWhatsapp={setWhatsapp} />; };
const SettingsPage = () => { const { profile, updateProfile } = useApp(); return <Settings profile={profile} updateProfile={updateProfile} />; };
const CalendarConnectionsPage = () => { return <CalendarConnections />; };
const AnalyticsPage = () => { const { profile } = useApp(); return <Analytics profile={profile} />; };

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return <FullScreenLoader />;
  }

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
      <Route path="/" element={<Landing />} />
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
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
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
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
            <ScrollToTop />
            <AuthenticatedApp />
          </Router>
          <Toaster />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;