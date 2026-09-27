import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Outlet, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { ThemeProvider } from 'next-themes';
import PageNotFound from './lib/Pagenotfound.jsx';
import { AuthProvider, useAuth } from '@/lib/Authcontext.jsx';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './Components/scrolltotop.jsx';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useProfile, AppContext, useApp } from '@/lib/useprofile.js';
import Layout from '@/components/Layout';
import CommandPalette from '@/components/commandpalatte.jsx';
import LiquidGlassFilter from '@/components/LiquidGlassFilter';

// Auth pages
import Login from './pages/login.jsx';
import Register from './pages/register.jsx';
import ForgotPassword from './pages/forgotpassword.jsx';
import ResetPassword from './pages/resetpassword.jsx';

// App pages
import Landing from '@/pages/Landing';
import Dashboard from './pages/dashboard.jsx';
import CalendarPage from './pages/calenderpage.jsx';
import EventTypes from './pages/Event types.jsx';
import Bookings from './pages/bookings.jsx';
import Availability from './pages/Availability.jsx';
import WhatsAppSettings from './pages/whatsappsettings.jsx';
import Settings from './pages/settings.jsx';
import BookingPage from './pages/bookingpage.jsx';
import BookingConfirmation from './pages/bookingconfirmation.jsx';
import CalendarConnections from './pages/calenderconnections.jsx';
import Analytics from './pages/Analytics.jsx';
import Guests from './pages/guests.jsx';

const FullScreenLoader = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-foreground/20 border-t-accent rounded-full animate-spin"></div>
  </div>
);

// Loads the profile once and provides it to all app pages via context.
function AppShell() {
  const { profile, whatsapp, setWhatsapp, loading, updateProfile, reload } = useProfile();
  const [cmdOpen, setCmdOpen] = useState(false);
  const { isAuthenticated } = useAuth();

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

  if (loading) return <FullScreenLoader />;
  if (!profile) {
    // Authenticated but profile couldn't load — sign back in to re-establish session.
    return <Navigate to="/login" replace />;
  }
  return (
    <AppContext.Provider value={{ profile, whatsapp, setWhatsapp, updateProfile, reload }}>
      <Layout profile={profile} onOpenCommandPalette={() => setCmdOpen(true)}>
        <Outlet />
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
const CalendarConnectionsPage = () => { const { profile, updateProfile } = useApp(); return <CalendarConnections />; };
const AnalyticsPage = () => { const { profile } = useApp(); return <Analytics profile={profile} />; };
const GuestsPage = () => { const { profile } = useApp(); return <Guests profile={profile} />; };

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
          <Route path="/guests" element={<GuestsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <ScrollToTop />
            <LiquidGlassFilter />
            <AuthenticatedApp />
          </Router>
          <Toaster />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App