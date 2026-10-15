import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
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

  const checkUserAuth = useCallback(async () => {
    setIsLoadingAuth(true);
    try {
      const currentUser = await api.auth.me();
      if (currentUser) {
        setUser(currentUser);
        setIsAuthenticated(true);
        setAuthError(null);
      } else {
        setUser(null);
        setIsAuthenticated(false);
      }
    } catch (error) {
      console.warn('Auth check failed or session expired:', error);
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
    const subscriptionResult = api.auth.onAuthStateChange?.((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        setUser(null);
        setIsAuthenticated(false);
      } else if (session?.user || event === 'SIGNED_IN') {
        checkUserAuth();
      }
      setAuthChecked(true);
      setIsLoadingAuth(false);
    });

    const unsubscribe = subscriptionResult?.data?.subscription?.unsubscribe || subscriptionResult?.unsubscribe;

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [checkUserAuth]);

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