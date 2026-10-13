import { useState, useEffect } from 'react';
import { authApi } from '../api';
import { AuthContext } from './auth-context';

function getStoredUser() {
  const savedUser = localStorage.getItem('user');
  if (!savedUser) return null;

  try {
    return JSON.parse(savedUser);
  } catch {
    localStorage.removeItem('user');
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(getStoredUser);
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);
  const [isSetup, setIsSetup] = useState(true);

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      try {
        const res = await authApi.setupStatus();
        if (active) setIsSetup(res.data.is_setup);
      } catch {
        // A temporary setup-status failure does not establish a session.
      }
      if (localStorage.getItem('token')) {
        try {
          const res = await authApi.me();
          if (active) {
            localStorage.setItem('user', JSON.stringify(res.data));
            setUser(res.data);
          }
        } catch {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          if (active) {
            setToken(null);
            setUser(null);
          }
        }
      }
      if (active) setLoading(false);
    };
    initialize();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const syncSession = (event) => {
      if (event.key !== 'token' && event.key !== 'user' && event.key !== null) return;
      const nextToken = localStorage.getItem('token');
      setToken(nextToken);
      setUser(nextToken ? getStoredUser() : null);
    };
    window.addEventListener('storage', syncSession);
    return () => window.removeEventListener('storage', syncSession);
  }, []);

  const login = async (username, password) => {
    const res = await authApi.login({ username, password, platform: 'web' });
    const { access_token, user: userData } = res.data;
    localStorage.setItem('token', access_token);
    localStorage.setItem('user', JSON.stringify(userData));
    setToken(access_token);
    setUser(userData);
    return userData;
  };

  const setup = async (data) => {
    const res = await authApi.setup(data);
    const { access_token, user: userData } = res.data;
    localStorage.setItem('token', access_token);
    localStorage.setItem('user', JSON.stringify(userData));
    setToken(access_token);
    setUser(userData);
    setIsSetup(true);
    return userData;
  };

  const logout = async () => {
    try {
      if (localStorage.getItem('token')) {
        await authApi.logout();
      }
    } catch {
      // Clear the browser session even if the server-side checkout fails.
    }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, isSetup, login, setup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
