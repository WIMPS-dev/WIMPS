import React, { createContext, useContext, useState } from 'react';
import { isThemeDark, setStoredTheme } from '../helpers/themeHelper';
import type { Theme } from '../theme/themes';
import { THEMES } from '../theme/themes';

type ThemeContextType = {
  theme: Theme;
  isDark: boolean;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(isThemeDark);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    setStoredTheme(next);
  };

  return (
    <ThemeContext.Provider value={{ theme: THEMES[isDark ? 'dark' : 'light'], isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
