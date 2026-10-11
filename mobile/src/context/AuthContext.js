import React, { createContext, useContext, useState, useEffect } from 'react';
import { AppState } from 'react-native';
import storage from '../utils/storage';
import { authApi, notificationsApi } from '../api';
import { subscribe } from '../utils/appEvents';

const AuthContext = createContext(null);

function todayKey() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function isAutoLogoutTime() {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hourCycle: 'h23' }).format(new Date())) >= 22;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const isSetup = true;

  useEffect(() => subscribe('sessionExpired', () => { setToken(null); setUser(null); }), []);

  useEffect(() => {
    const init = async () => {
      try {
        const [savedToken, savedUser] = await storage.multiGet(['token', 'user']);
        if (savedToken[1] && savedUser[1]) {
          const response = await authApi.me();
          setToken(savedToken[1]);
          setUser(response.data);
          await storage.setItem('user', JSON.stringify(response.data));
        }
      } catch (e) {
        console.log('Init error:', e);
        if (e.response?.status !== 401) {
          const [savedToken, savedUser] = await storage.multiGet(['token', 'user']);
          if (savedToken[1] && savedUser[1]) {
            try { setToken(savedToken[1]); setUser(JSON.parse(savedUser[1])); }
            catch { await storage.multiRemove(['token', 'user']); }
          }
        }
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  useEffect(() => {
    let mounted = true;

    const checkAutoLogout = async () => {
      if (!mounted || !user) return;
      if (!isAutoLogoutTime()) return;

      const today = todayKey();
      const lastAutoLogoutDate = await storage.getItem('lastAutoLogoutDate');
      if (lastAutoLogoutDate === today) return;

      await storage.setItem('lastAutoLogoutDate', today);
      await storage.multiRemove(['token', 'user']);
      setToken(null);
      setUser(null);
    };

    checkAutoLogout();
    const intervalId = setInterval(checkAutoLogout, 60000);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        checkAutoLogout();
      }
    });

    return () => {
      mounted = false;
      clearInterval(intervalId);
      appStateSubscription.remove();
    };
  }, [user]);

  const login = async (username, password) => {
    const res = await authApi.login({ username, password, platform: 'mobile' });
    const { access_token, user: userData } = res.data;
    await storage.multiSet([['token', access_token], ['user', JSON.stringify(userData)]]);
    setToken(access_token);
    setUser(userData);
    return userData;
  };

  const logout = async () => {
    const pushToken = await storage.getItem('expoPushToken');
    if (pushToken) await notificationsApi.unregisterPushToken(pushToken).catch(() => {});
    await storage.multiRemove(['token', 'user']);
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, isSetup, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
