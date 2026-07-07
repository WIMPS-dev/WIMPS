import React from 'react';
import type { AutosaveStatus } from '../hooks/useAutosave';
import { ActionIcon } from './ActionIcons';

interface SaveStatusProps {
  status: AutosaveStatus;
  lastSavedAt: number | null;
  onRetry?: () => void;
  compact?: boolean;
}

const DOT: Record<AutosaveStatus, string> = {
  idle:    '#94a3b8',
  saving:  '#2563eb',
  saved:   '#10b981',
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
        gap: 4,
        color: status === 'saved' ? '#10b981' : '#94a3b8',
        fontSize: 11,
        lineHeight: 1,
        cursor: isClickable ? 'pointer' : 'default',
        userSelect: 'none',
      }}
    >
      <span
        className={isPulse ? 'save-status-pulse' : undefined}
        style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          backgroundColor: DOT[status],
          flexShrink: 0,
        }}
      />
      {!compact && <span>{LABEL[status]}</span>}
    </span>
  );
}

export function SaveAction({
  onClick,
  hotkey,
  disabled = false,
}: {
  onClick: () => void;
  hotkey: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={`Save (${hotkey})`}
      aria-label={`Save (${hotkey})`}
      style={{
        backgroundColor: '#2563eb',
        border: 'none',
        borderRadius: 6,
        color: '#fff',
        cursor: disabled ? 'not-allowed' : 'pointer',
        height: 28,
        padding: '0 12px',
        fontSize: 12,
        fontWeight: 700,
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        whiteSpace: 'nowrap',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <ActionIcon name="Save" size={13} />
      <span>Save</span>
    </button>
  );
}
