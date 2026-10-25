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

  // quiet: refresh the user without showing the full-screen loader (and unmounting the app)
  const checkUserAuth = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setIsLoadingAuth(true);
    try {
      const currentUser = await api.auth.me();
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
      console.warn('Auth check failed or session expired:', error);
      userId.current = null;
      setUser(null);
      setIsAuthenticated(false);
      setAuthError(null);
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
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