import React, { createContext, useState, useContext, useEffect, useCallback, useRef, useMemo } from 'react';
import { api } from '@/lib/localApi';
import { appPath } from '@/lib/authReturnTo';

const AuthContext = createContext();

// a profile request that never answers (stalled network) must not leave a spinner up forever
const PROFILE_TIMEOUT_MS = 20000;
const withTimeout = (promise) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Loading your account is taking too long.')), PROFILE_TIMEOUT_MS);
  promise.then(
    (value) => { clearTimeout(timer); resolve(value); },
    (error) => { clearTimeout(timer); reject(error); },
  );
});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [appPublicSettings, setAppPublicSettings] = useState(null);
  const userId = useRef(null);
  // the user a running check is loading, so the same user's repeat events don't start another
  const checkingFor = useRef(null);
  const authed = useRef(false);
  // each check gets a number; a sign-out or a newer check makes older results stale
  const checkSeq = useRef(0);

  // quiet: refresh the user without showing the full-screen loader (and unmounting the app)
  const checkUserAuth = useCallback(async ({ quiet = false, forId = null } = {}) => {
    if (!quiet) setIsLoadingAuth(true);
    const mine = ++checkSeq.current;
    checkingFor.current = forId;
    try {
      const currentUser = await withTimeout(api.auth.me());
      if (mine !== checkSeq.current) return; // signed out (or checked again) meanwhile
      if (currentUser) {
        userId.current = currentUser.id;
        authed.current = true;
        setUser(currentUser);
        setIsAuthenticated(true);
        setAuthError(null);
      } else {
        userId.current = null;
        authed.current = false;
        setUser(null);
        setIsAuthenticated(false);
      }
    } catch (error) {
      if (mine !== checkSeq.current) return;
      console.warn('Auth check failed or session expired:', error);
      // still signed in but the profile didn't load (network, database): say so and offer a
      // retry, rather than sending them to log in again, which would fail the same way
      const signedIn = await api.auth.hasSession().catch(() => false);
      if (mine !== checkSeq.current) return;
      userId.current = null;
      authed.current = false;
      setUser(null);
      setIsAuthenticated(false);
      setAuthError(signedIn ? { type: 'profile_failed', message: error?.message || '' } : null);
    } finally {
      if (mine === checkSeq.current) {
        checkingFor.current = null;
        setIsLoadingAuth(false);
        setAuthChecked(true);
      }
    }
  }, []);

  const loadPublicSettings = useCallback(async () => {
    setIsLoadingPublicSettings(true);
    try {
      const settings = await api.app.getPublicSettings();
      setAppPublicSettings(settings);
    } catch (error) {
      console.error('Settings fetch failed:', error);
    } finally {
      setIsLoadingPublicSettings(false);
    }
  }, []);

  const checkAppState = useCallback(async () => {
    await Promise.all([loadPublicSettings(), checkUserAuth()]);
  }, [loadPublicSettings, checkUserAuth]);

  useEffect(() => {
    loadPublicSettings();
  }, [loadPublicSettings]);

  useEffect(() => {
    // The first event, INITIAL_SESSION, comes from storage once any sign-in link in the URL has
    // been read: no session means signed out straight away, with no network request. Supabase
    // also fires SIGNED_IN when a hidden tab comes back and TOKEN_REFRESHED hourly; those are the
    // same user, so nothing needs to reload. Keep this callback synchronous: Supabase holds its
    // auth lock while it runs, and awaiting another auth call inside it would deadlock.
    const subscriptionResult = api.auth.onAuthStateChange?.((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        checkSeq.current += 1; // a profile still loading must not sign them back in
        checkingFor.current = null;
        setIsLoadingAuth(false);
        setAuthChecked(true);
        setAuthError(null);
        userId.current = null;
        authed.current = false;
        setUser(null);
        setIsAuthenticated(false);
        return;
      }
      if (event === 'PASSWORD_RECOVERY' && !/\/reset-password\/?$/.test(window.location.pathname)) {
        window.location.replace(appPath('/reset-password'));
        return;
      }
      const id = session.user?.id;
      if (!id || id === userId.current || id === checkingFor.current) return;
      // a different account (signed in on another tab) swaps quietly; a first sign-in shows the
      // loader, so a protected page waits for the profile instead of bouncing to Log in
      checkUserAuth({ quiet: authed.current, forId: id });
    });

    const unsubscribe = subscriptionResult?.data?.subscription?.unsubscribe || subscriptionResult?.unsubscribe;

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [checkUserAuth]);

  const logout = useCallback(async (shouldRedirect = true) => {
    try {
      await api.auth.logout();
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      checkSeq.current += 1;
      checkingFor.current = null;
      userId.current = null;
      authed.current = false;
      setUser(null);
      setIsAuthenticated(false);
      setAuthError(null);
      setIsLoadingAuth(false);
      setAuthChecked(true);
      if (shouldRedirect) window.location.assign(appPath('/login'));
    }
  }, []);

  const navigateToLogin = useCallback(() => {
    window.location.assign(`${appPath('/login')}?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  }, []);

  const value = useMemo(() => ({
    user,
    isAuthenticated,
    isLoadingAuth,
    isLoadingPublicSettings,
    authError,
    appPublicSettings,
    authChecked,
    logout,
    navigateToLogin,
    checkUserAuth,
    checkAppState
  }), [user, isAuthenticated, isLoadingAuth, isLoadingPublicSettings, authError, appPublicSettings, authChecked, logout, navigateToLogin, checkUserAuth, checkAppState]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
