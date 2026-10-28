import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/Authcontext.jsx';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

const DefaultFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-2 border-border border-t-foreground rounded-full animate-spin"></div>
  </div>
);

export default function ProtectedRoute({ fallback = <DefaultFallback />, unauthenticatedElement }) {
  const { isAuthenticated, isLoadingAuth, authChecked, authError, checkUserAuth, logout } = useAuth();

  useEffect(() => {
    if (!authChecked && !isLoadingAuth) {
      checkUserAuth();
    }
  }, [authChecked, isLoadingAuth, checkUserAuth]);

  if (isLoadingAuth || !authChecked) {
    return fallback;
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    }
    if (authError.type === 'profile_failed') {
      return (
        <div role="alert" className="min-h-screen flex flex-col items-center justify-center gap-3 px-4 text-center">
          <h1 className="text-xl font-bold">Your account couldn’t be loaded</h1>
          <p className="max-w-sm text-sm text-muted-foreground">You’re still signed in. Check your connection and try again.</p>
          {/* signing out is the way out when retrying can't help (e.g. the account was deleted) */}
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => checkUserAuth()} className="h-10 px-5 rounded-full bg-primary text-primary-foreground text-sm font-semibold transition-all duration-200 hover:brightness-110">Try again</button>
            <button type="button" onClick={() => logout()} className="h-10 px-5 rounded-full border border-input text-sm font-semibold transition-all duration-200 hover:bg-secondary">Sign out</button>
          </div>
        </div>
      );
    }
    return unauthenticatedElement;
  }

  if (!isAuthenticated) {
    return unauthenticatedElement;
  }

  return <Outlet />;
}
