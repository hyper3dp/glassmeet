import { useState, useEffect, Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useProfile, AppContext } from '@/lib/useprofile.js';
import Layout from '@/components/Layout';
import CommandPalette from '@/components/commandpalatte.jsx';
import ErrorBoundary from '@/components/ErrorBoundary.jsx';
import { api } from '@/lib/localApi';
import { appPath } from '@/lib/authReturnTo';
import { prefetchAppPages } from '@/lib/pages.js';
import Onboarding from '@/components/Onboarding.jsx';

const Spinner = () => <div className="w-8 h-8 border-2 border-primary-soft border-t-primary rounded-full animate-spin" />;

// The signed-in host app: loads the profile once and provides it to all app pages via context.
// Lives in its own chunk so guests on public pages never download it.
export default function AppShell() {
  const { profile, whatsapp, setWhatsapp, loading, error, updateProfile, reload } = useProfile();
  const [cmdOpen, setCmdOpen] = useState(false);
  const location = useLocation();

  useEffect(() => { prefetchAppPages(); }, []);

  // Command palette keyboard shortcut: Ctrl+K / Cmd+K
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key?.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  if (loading) return <div className="fixed inset-0 flex items-center justify-center" role="status" aria-live="polite"><Spinner /><span className="sr-only">Loading…</span></div>;

  // The profile couldn't load (network, or the database refused): say so, with a way out
  if (!profile && error) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-xl font-bold">We couldn’t load your account</h1>
        <p className="max-w-sm text-sm text-muted-foreground">{error}</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => reload()} className="h-10 px-5 rounded-full bg-primary text-primary-foreground text-sm font-semibold transition-all duration-200 hover:bg-primary-hover">Try again</button>
          <button type="button" onClick={async () => { await api.auth.logout(); window.location.assign(appPath('/login')); }} className="h-10 px-5 rounded-full border border-input text-sm font-semibold transition-all duration-200 hover:bg-secondary">Sign out</button>
        </div>
      </div>
    );
  }

  // If profile creation is still in progress for new users
  if (!profile) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-4">
        <Spinner />
        <p className="text-sm text-muted-foreground">Setting up your profile...</p>
      </div>
    );
  }

  // a new host sets up first, whichever app page they opened (profiles.onboarded is false only
  // for accounts made after the onboarding migration; undefined before it, so nobody is stopped)
  if (profile.onboarded === false) {
    return <Onboarding profile={profile} updateProfile={updateProfile} whatsapp={whatsapp} setWhatsapp={setWhatsapp} />;
  }

  return (
    <AppContext.Provider value={{ profile, whatsapp, setWhatsapp, updateProfile, reload }}>
      <Layout profile={profile} onOpenCommandPalette={() => setCmdOpen(true)}>
        {/* keyed by page so an error on one page doesn't follow the host to the next */}
        <ErrorBoundary key={location.pathname}>
          <Suspense fallback={<div className="flex justify-center py-24" role="status"><Spinner /><span className="sr-only">Loading…</span></div>}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </Layout>
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </AppContext.Provider>
  );
}
