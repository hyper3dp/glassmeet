import { useState, useEffect, Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { useProfile, AppContext } from '@/lib/useprofile.js';
import Layout from '@/components/Layout';
import CommandPalette from '@/components/commandpalatte.jsx';
import ErrorBoundary from '@/components/ErrorBoundary.jsx';

const Spinner = () => <div className="w-8 h-8 border-2 border-primary-soft border-t-primary rounded-full animate-spin" />;

// The signed-in host app: loads the profile once and provides it to all app pages via context.
// Lives in its own chunk so guests on public pages never download it.
export default function AppShell() {
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

  if (loading) return <div className="fixed inset-0 flex items-center justify-center" role="status" aria-live="polite"><Spinner /><span className="sr-only">Loading…</span></div>;

  // If profile creation is still in progress for new users
  if (!profile) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-4">
        <Spinner />
        <p className="text-sm text-muted-foreground">Setting up your profile...</p>
      </div>
    );
  }

  return (
    <AppContext.Provider value={{ profile, whatsapp, setWhatsapp, updateProfile, reload }}>
      <Layout profile={profile} onOpenCommandPalette={() => setCmdOpen(true)}>
        <ErrorBoundary>
          <Suspense fallback={<div className="flex justify-center py-24" role="status"><Spinner /><span className="sr-only">Loading…</span></div>}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </Layout>
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </AppContext.Provider>
  );
}
