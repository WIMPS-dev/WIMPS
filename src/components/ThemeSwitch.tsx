import React from 'react';
import { useTheme } from '../context/ThemeContext';

export function ThemeSwitch() {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      aria-label="Toggle theme"
      style={{
        width: 56,
        height: 28,
        borderRadius: 14,
        border: `1.5px solid ${isDark ? '#2563eb' : '#cbd5e1'}`,
        backgroundColor: isDark ? '#2563eb' : '#ffffff',
        cursor: 'pointer',
        position: 'relative',
        transition: 'background-color 150ms, border-color 150ms',
        flexShrink: 0,
        padding: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 3,
          left: isDark ? 30 : 4,
          width: 20,
          height: 20,
          borderRadius: '50%',
          backgroundColor: isDark ? '#ffffff' : '#94a3b8',
          transition: 'left 150ms, background-color 150ms',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          color: isDark ? '#2563eb' : '#ffffff',
        }}
      >
        {isDark ? '☾' : '☼'}
      </span>
    </button>
  );
}
