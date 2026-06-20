import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance } from 'react-native';
import storage from './utils/storage';

export const lightColors = {
  bg: '#f8fafc',
  bgAlt: '#ffffff',
  surface: '#ffffff',
  surface2: '#f1f5f9',
  border: '#e2e8f0',
  accent: '#2563eb',
  accentHover: '#1d4ed8',
  accentDim: 'rgba(37, 99, 235, 0.1)',
  secondary: '#64748b',
  secondaryDim: 'rgba(100, 116, 139, 0.12)',
  info: '#3b82f6',
  infoDim: 'rgba(59, 130, 246, 0.1)',
  success: '#10b981',
  successDim: 'rgba(16, 185, 129, 0.1)',
  warning: '#f59e0b',
  warningDim: 'rgba(245, 158, 11, 0.1)',
  amber: '#f59e0b',
  amberDim: 'rgba(245, 158, 11, 0.1)',
  danger: '#ef4444',
  dangerDim: 'rgba(239, 68, 68, 0.1)',
  text: '#1e293b',
  textSecondary: '#475569',
  textMuted: '#94a3b8',
};

export const darkColors = {
  bg: '#0f172a',
  bgAlt: '#111827',
  surface: '#1e293b',
  surface2: '#334155',
  border: '#475569',
  accent: '#60a5fa',
  accentHover: '#93c5fd',
  accentDim: 'rgba(96, 165, 250, 0.16)',
  secondary: '#94a3b8',
  secondaryDim: 'rgba(148, 163, 184, 0.16)',
  info: '#38bdf8',
  infoDim: 'rgba(56, 189, 248, 0.16)',
  success: '#34d399',
  successDim: 'rgba(52, 211, 153, 0.16)',
  warning: '#fbbf24',
  warningDim: 'rgba(251, 191, 36, 0.16)',
  amber: '#fbbf24',
  amberDim: 'rgba(251, 191, 36, 0.16)',
  danger: '#fb7185',
  dangerDim: 'rgba(251, 113, 133, 0.16)',
  text: '#f8fafc',
  textSecondary: '#cbd5e1',
  textMuted: '#94a3b8',
};

export const colors = { ...lightColors };

const ThemeContext = createContext({
  themeMode: 'light',
  colors,
  setThemeMode: () => {},
});

function applyColors(nextColors) {
  Object.keys(colors).forEach((key) => delete colors[key]);
  Object.assign(colors, nextColors);
}

function resolveColors(mode) {
  if (mode === 'system') {
    return Appearance.getColorScheme() === 'dark' ? darkColors : lightColors;
  }
  return mode === 'dark' ? darkColors : lightColors;
}

export function ThemeProvider({ children }) {
  const [themeMode, setThemeModeState] = useState('light');
  const [systemScheme, setSystemScheme] = useState(Appearance.getColorScheme());

  useEffect(() => {
    storage.getItem('themeMode').then((saved) => {
      if (['light', 'dark', 'system'].includes(saved)) {
        setThemeModeState(saved);
      }
    });

    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme);
    });
    return () => subscription.remove();
  }, []);

  const activeColors = useMemo(() => {
    const nextColors = resolveColors(themeMode);
    applyColors(nextColors);
    return { ...nextColors };
  }, [themeMode, systemScheme]);

  const setThemeMode = async (mode) => {
    setThemeModeState(mode);
    await storage.setItem('themeMode', mode);
  };

  return (
    <ThemeContext.Provider value={{ themeMode, colors: activeColors, setThemeMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export const spacing = {
  xs: 4, sm: 8, md: 12, base: 16, lg: 20, xl: 24, '2xl': 32, '3xl': 48,
};

export const radius = {
  sm: 6, md: 10, lg: 16, xl: 24, full: 999,
};
