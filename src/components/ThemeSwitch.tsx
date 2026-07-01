import React from 'react';
import { useTheme } from '../context/ThemeContext';

export function ThemeSwitch() {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      aria-label="Toggle theme"
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      style={{
        width: 26,
        height: 26,
        borderRadius: 4,
        border: `1px solid ${isDark ? '#475569' : '#cbd5e1'}`,
        backgroundColor: isDark ? '#1e293b' : '#f8fafc',
        cursor: 'pointer',
        transition: 'background-color 150ms, border-color 150ms, color 150ms',
        flexShrink: 0,
        padding: 0,
        color: isDark ? '#e2e8f0' : '#334155',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <span style={{ fontSize: 12, lineHeight: 1 }}>
        {isDark ? '☾' : '☼'}
      </span>
    </button>
  );
}
