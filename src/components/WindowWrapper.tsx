import React from 'react';
import type { Theme } from '../theme/themes';

interface WindowWrapperProps {
  title: string;
  children: React.ReactNode;
  theme: Theme;
  isMinimized?: boolean;
  onToggleMinimize?: () => void;
  style?: React.CSSProperties;
}

export function WindowWrapper({ title, children, theme, isMinimized, onToggleMinimize, style }: WindowWrapperProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 10,
        border: `1px solid ${theme.border}`,
        overflow: 'hidden',
        backgroundColor: theme.bg,
        height: isMinimized ? 34 : undefined,
        minHeight: isMinimized ? 34 : undefined,
        flex: isMinimized ? '0 0 34px' : undefined,
        ...style,
      }}
    >
      <button
        onClick={onToggleMinimize}
        style={{
          display: 'flex',
          alignItems: 'center',
          height: 34,
          minHeight: 34,
          padding: '0 12px',
          backgroundColor: theme.card,
          borderBottom: isMinimized ? 'none' : `1px solid ${theme.border}`,
          cursor: 'pointer',
          border: 'none',
          gap: 8,
          width: '100%',
        }}
      >
        <span style={{ color: theme.text, fontSize: 12, width: 20 }}>
          {isMinimized ? '▲' : '▼'}
        </span>
        <span style={{
          flex: 1,
          color: theme.text,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: 0.3,
          textAlign: 'center',
        }}>
          {title}{isMinimized ? ' (Minimized)' : ''}
        </span>
        <span style={{ width: 20 }} />
      </button>

      {!isMinimized && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {children}
        </div>
      )}
    </div>
  );
}
