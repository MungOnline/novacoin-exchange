'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { useRouter } from 'next/navigation';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(null);
  const router = useRouter();

  useEffect(() => {
    const savedToken = localStorage.getItem('nvc_token');
    if (savedToken) {
      api.setToken(savedToken);
      setToken(savedToken);
      api.getMe()
        .then(data => {
          setUser(data.user);
        })
        .catch(() => {
          localStorage.removeItem('nvc_token');
          api.setToken(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await api.login(email, password);
    if (data.requiresTwoFactor) {
      return { requiresTwoFactor: true, tempToken: data.tempToken };
    }
    api.setToken(data.token);
    setToken(data.token);
    setUser(data.user);
    return data;
  }, []);

  const verify2fa = useCallback(async (tempToken, code) => {
    const data = await api.verify2fa(tempToken, code);
    api.setToken(data.token);
    setToken(data.token);
    setUser(data.user);
    return data;
  }, []);

  const register = useCallback(async (email, password, full_name, phone) => {
    const data = await api.register(email, password, full_name, phone);
    return data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch (e) {
      // ignore
    }
    api.setToken(null);
    setToken(null);
    setUser(null);
    localStorage.removeItem('nvc_token');
    router.push('/');
  }, [router]);

  const processGoogleToken = useCallback(async (googleToken, userData) => {
    api.setToken(googleToken);
    setToken(googleToken);
    setUser(userData);
    localStorage.setItem('nvc_token', googleToken);
    return userData;
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const data = await api.getMe();
      setUser(data.user);
    } catch (e) {
      console.error('Refresh user failed:', e);
    }
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      token,
      loading,
      login,
      verify2fa,
      register,
      logout,
      processGoogleToken,
      refreshUser,
      isAdmin: user?.is_admin || false,
      isAuthenticated: !!user,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
