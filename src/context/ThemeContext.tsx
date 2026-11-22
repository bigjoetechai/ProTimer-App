/**
 * Theme Context and Hook for Dark and Light Theme Management.
 * Synchronizes with document attributes, body styling, and local preferences.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { storageService } from '../services/storageService';

export type AppTheme = 'dark' | 'light';

interface ThemeContextType {
  theme: AppTheme;
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (theme: AppTheme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<AppTheme>(() => {
    if (typeof window !== 'undefined') {
      const prefs = storageService.getPreferences();
      return (prefs.theme === 'light' || prefs.theme === 'dark') ? prefs.theme : 'dark';
    }
    return 'dark';
  });

  const applyThemeToDOM = useCallback((t: AppTheme) => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.setAttribute('data-theme', t);
    if (t === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
      document.body.style.backgroundColor = '#0d0e12';
      document.body.style.color = '#e2e8f0';
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
      document.body.style.backgroundColor = '#f4f6fa';
      document.body.style.color = '#0f172a';
    }
  }, []);

  useEffect(() => {
    applyThemeToDOM(theme);
  }, [theme, applyThemeToDOM]);

  const setTheme = useCallback((newTheme: AppTheme) => {
    setThemeState(newTheme);
    applyThemeToDOM(newTheme);
    const prefs = storageService.getPreferences();
    storageService.savePreferences({ ...prefs, theme: newTheme });
  }, [applyThemeToDOM]);

  const toggleTheme = useCallback(() => {
    const nextTheme: AppTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, isDark: theme === 'dark', toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    // Graceful fallback if used outside provider
    const isDark = typeof document !== 'undefined' ? document.documentElement.getAttribute('data-theme') !== 'light' : true;
    return {
      theme: isDark ? 'dark' : 'light',
      isDark,
      toggleTheme: () => {},
      setTheme: () => {},
    };
  }
  return context;
};
