import React, { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';
import { api } from '@/lib/localApi';
import { appPath } from '@/lib/authReturnTo';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [appPublicSettings, setAppPublicSettings] = useState(null);
  const userId = useRef(null);
  // each check gets a number; a sign-out or a newer check makes older results stale
  const checkSeq = useRef(0);

  // quiet: refresh the user without showing the full-screen loader (and unmounting the app)
  const checkUserAuth = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setIsLoadingAuth(true);
    const mine = ++checkSeq.current;
    try {
      const currentUser = await api.auth.me();
      if (mine !== checkSeq.current) return; // signed out (or checked again) meanwhile
      if (currentUser) {
        userId.current = currentUser.id;
        setUser(currentUser);
        setIsAuthenticated(true);
        setAuthError(null);
      } else {
        userId.current = null;
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
      setUser(null);
      setIsAuthenticated(false);
      setAuthError(signedIn ? { type: 'profile_failed', message: error?.message || '' } : null);
    } finally {
      if (mine === checkSeq.current) {
        setIsLoadingAuth(false);
        setAuthChecked(true);
      }
    }
  }, []);

  const checkAppState = useCallback(async () => {
    setIsLoadingPublicSettings(true);
    try {
      const settings = await api.app.getPublicSettings();
      setAppPublicSettings(settings);
    } catch (error) {
      console.error('Settings fetch failed:', error);
    } finally {
      setIsLoadingPublicSettings(false);
    }
    await checkUserAuth();
  }, [checkUserAuth]);

  useEffect(() => {
    checkAppState();
  }, [checkAppState]);

  useEffect(() => {
    // Supabase also fires SIGNED_IN when a hidden tab comes back and TOKEN_REFRESHED hourly;
    // those are the same user, so nothing needs to reload.
    const subscriptionResult = api.auth.onAuthStateChange?.((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        checkSeq.current += 1; // a profile still loading must not sign them back in
        setIsLoadingAuth(false);
        setAuthChecked(true);
        setAuthError(null);
        userId.current = null;
        setUser(null);
        setIsAuthenticated(false);
        return;
      }
      if (event === 'PASSWORD_RECOVERY' && !window.location.pathname.endsWith('/reset-password')) {
        window.location.replace(appPath('/reset-password'));
        return;
      }
      if (session.user && session.user.id !== userId.current) checkUserAuth({ quiet: authChecked });
    });

    const unsubscribe = subscriptionResult?.data?.subscription?.unsubscribe || subscriptionResult?.unsubscribe;

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [checkUserAuth, authChecked]);

  const logout = async (shouldRedirect = true) => {
    try {
      await api.auth.logout();
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setUser(null);
      setIsAuthenticated(false);
      setAuthChecked(true);
      if (shouldRedirect) window.location.assign(appPath('/login'));
    }
  };

  const navigateToLogin = () => {
    window.location.assign(`${appPath('/login')}?returnTo=${encodeURIComponent(window.location.pathname)}`);
  };

  return (
    <AuthContext.Provider value={{
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
    }}>
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