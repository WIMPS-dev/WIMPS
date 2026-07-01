import type React from 'react';
import type { Theme } from './themes';

export function getIdeChromeVars(theme: Theme, isDark: boolean): React.CSSProperties {
  return {
    '--ide-ink': theme.text,
    '--ide-card': theme.card,
    '--ide-border': theme.border,
    '--ide-muted': theme.subText,
    '--ide-titlebar-bg': isDark ? '#151c29' : '#e2e8f0',
    '--ide-commandbar-bg': isDark ? '#111827' : '#f8fafc',
    '--ide-tabbar-bg': isDark ? '#101826' : '#eef2f7',
    '--ide-active-tab-bg': theme.bg,
    '--ide-sidebar-bg': isDark ? '#141c2b' : '#f8fafc',
    '--ide-rail-bg': isDark ? '#0f1724' : '#e9eef5',
    '--ide-hover': isDark ? '#334155' : '#e2e8f0',
    '--ide-active': isDark ? '#7dd3fc' : '#1d4ed8',
    '--ide-active-wash': isDark ? '#0ea5e914' : '#2563eb14',
    '--ide-active-icon': isDark ? '#7dd3fc' : '#1d4ed8',
    '--ide-icon-hover': isDark ? '#94a3b8' : '#1e293b',
    '--ide-muted-strong': isDark ? '#94a3b8' : '#475569',
    '--ide-control-bg': isDark ? '#1e293b' : '#f8fafc',
    '--ide-control-border': isDark ? '#475569' : '#cbd5e1',
    '--ide-menu-active': isDark ? '#334155' : '#e2e8f0',
    '--ide-resizer-dot': isDark ? '#94a3b8' : '#64748b',
    '--ide-statusbar-bg': theme.linkColor,
    '--ide-statusbar-ink': '#ffffff',
    '--scrollbar-thumb': isDark ? '#334155' : '#94a3b8',
    '--scrollbar-thumb-hover': isDark ? '#475569' : '#64748b',
  } as React.CSSProperties;
}
