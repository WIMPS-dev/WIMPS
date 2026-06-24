import React from 'react';
import type { AutosaveStatus } from '../hooks/useAutosave';

interface SaveStatusProps {
  status: AutosaveStatus;
  lastSavedAt: number | null;
  onRetry?: () => void;
  compact?: boolean;
}

const DOT: Record<AutosaveStatus, string> = {
  idle:    '#94a3b8',
  saving:  '#2563eb',
  saved:   '#94a3b8',
  error:   '#ef4444',
  offline: '#f59e0b',
};

const LABEL: Record<AutosaveStatus, string> = {
  idle:    '',
  saving:  'Saving…',
  saved:   'Saved',
  error:   'Save failed',
  offline: 'Offline',
};

export function SaveStatus({ status, lastSavedAt, onRetry, compact = false }: SaveStatusProps) {
  if (status === 'idle') return null;

  const isPulse = status === 'saving';
  const isClickable = status === 'error' && !!onRetry;
  const tooltip = status === 'error'
    ? 'Save failed — click to retry'
    : lastSavedAt
      ? `Last saved: ${new Date(lastSavedAt).toLocaleTimeString()}`
      : '';

  return (
    <span
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      title={tooltip}
      onClick={isClickable ? onRetry : undefined}
      onKeyDown={isClickable ? (e) => (e.key === 'Enter' || e.key === ' ') && onRetry?.() : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        color: '#94a3b8',
        fontSize: 12,
        cursor: isClickable ? 'pointer' : 'default',
        userSelect: 'none',
      }}
    >
      <span
        className={isPulse ? 'save-status-pulse' : undefined}
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          backgroundColor: DOT[status],
          flexShrink: 0,
        }}
      />
      {!compact && <span>{LABEL[status]}</span>}
    </span>
  );
}
