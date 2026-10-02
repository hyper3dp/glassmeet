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
      setUser(currentUser);
      setIsAuthenticated(Boolean(currentUser));
      setAuthError(null);
    } catch {
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
      setAppPublicSettings(await api.app.getPublicSettings());
    } catch (error) {
      setAuthError({
        type: 'unknown',
        message: error.message || 'Could not connect to the local server',
      });
    } finally {
      setIsLoadingPublicSettings(false);
    }
    await checkUserAuth();
  }, [checkUserAuth]);

  useEffect(() => {
    checkAppState();
  }, [checkAppState]);

  useEffect(() => {
    const { data: { subscription } } = api.auth.onAuthStateChange((event, session) => {
      window.setTimeout(async () => {
        if (event === 'SIGNED_OUT' || !session) {
          setUser(null);
          setIsAuthenticated(false);
        } else {
          try {
            const currentUser = await api.auth.me();
            setUser(currentUser);
            setIsAuthenticated(Boolean(currentUser));
          } catch (error) {
            setAuthError({ type: 'unknown', message: error.message });
          }
        }
        setAuthChecked(true);
        setIsLoadingAuth(false);
      }, 0);
    });
    return () => subscription.unsubscribe();
  }, []);

  const logout = async (shouldRedirect = true) => {
    await api.auth.logout();
    setUser(null);
    setIsAuthenticated(false);
    setAuthChecked(true);
    if (shouldRedirect) window.location.assign(appPath('/login'));
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