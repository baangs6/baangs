import React, { createContext, useContext, useState, useEffect } from 'react';
import storage from '../utils/storage';
import { authApi } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const isSetup = true;

  useEffect(() => {
    const init = async () => {
      try {
        const [savedToken, savedUser] = await storage.multiGet(['token', 'user']);
        if (savedToken[1] && savedUser[1]) {
          setToken(savedToken[1]);
          setUser(JSON.parse(savedUser[1]));
        }
      } catch (e) {
        console.log('Init error:', e);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const login = async (username, password) => {
    const res = await authApi.login({ username, password, platform: 'mobile' });
    const { access_token, user: userData } = res.data;
    await storage.multiSet([['token', access_token], ['user', JSON.stringify(userData)]]);
    setToken(access_token);
    setUser(userData);
    return userData;
  };

  const logout = async () => {
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
