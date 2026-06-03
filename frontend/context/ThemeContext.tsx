import React, { createContext, useContext, useEffect, useCallback, ReactNode } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';

export type ThemeChoice = 'light' | 'dark' | 'system';

interface ThemeContextType {
  /** The user's selection: light, dark, or follow the device. */
  theme: ThemeChoice;
  setTheme: (t: ThemeChoice) => void;
  /** The actually-applied appearance after resolving 'system'. */
  resolved: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const prefersDark = (): boolean =>
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-color-scheme: dark)').matches;

const applyClass = (isDark: boolean) => {
  const root = document.documentElement;
  root.classList.toggle('dark', isDark);
  // Keep native form controls / scrollbars in sync with the theme.
  root.style.colorScheme = isDark ? 'dark' : 'light';
};

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useLocalStorage<ThemeChoice>('theme', 'system');

  const resolve = useCallback(
    (choice: ThemeChoice): 'light' | 'dark' =>
      choice === 'system' ? (prefersDark() ? 'dark' : 'light') : choice,
    []
  );

  // Apply on mount and whenever the choice changes.
  useEffect(() => {
    applyClass(resolve(theme) === 'dark');
  }, [theme, resolve]);

  // Enable theme-flip transitions only after the first paint (so the initial
  // load doesn't animate from light → dark).
  useEffect(() => {
    const id = requestAnimationFrame(() =>
      document.documentElement.classList.add('theme-ready')
    );
    return () => cancelAnimationFrame(id);
  }, []);

  // When following the system, react live to OS theme changes.
  useEffect(() => {
    if (theme !== 'system' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyClass(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = useCallback((t: ThemeChoice) => setThemeState(t), [setThemeState]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolved: resolve(theme) }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
};
