import React, { useMemo, useState } from 'react';
import type { Theme } from '../theme/themes';

export interface RegisterValue {
  name: string;
  number: number;
  hexValue: string;
  decimalValue?: string;
}

interface RegisterPanelProps {
  registers: RegisterValue[];
  theme: Theme;
  showHex?: boolean;
  toggleFormat?: () => void;
}

export function RegisterPanel({ registers, theme, showHex = true, toggleFormat }: RegisterPanelProps) {
  const [query, setQuery] = useState('');

  const filteredRegisters = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return registers;
    return registers.filter(r =>
      r.name.toLowerCase().includes(q) ||
      r.number.toString().includes(q) ||
      r.hexValue.toLowerCase().includes(q)
    );
  }, [query, registers]);

  return (
    <div style={{ flex: 1, minHeight: 0, backgroundColor: theme.bg, padding: 10, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 10, paddingRight: 28, paddingBottom: 6, gap: 8 }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Filter registers..."
          aria-label="Filter registers"
          style={{
            flex: 1,
            backgroundColor: theme.card,
            border: `1px solid ${theme.border}`,
            borderRadius: 6,
            padding: '4px 10px',
            fontSize: 12,
            color: theme.text,
            outline: 'none',
          }}
        />
        <span style={{ color: theme.subText, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', width: 30, textAlign: 'center' }}>#</span>
        <button
          onClick={toggleFormat}
          style={{
            backgroundColor: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '3px 6px',
            fontSize: 9,
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {showHex ? 'HEX VALUE' : 'INT VALUE'}
        </button>
      </div>

      {/* Table */}
      <div style={{
        flex: 1,
        minHeight: 0,
        borderRadius: 10,
        border: `1px solid ${theme.border}`,
        backgroundColor: theme.card,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filteredRegisters.map(reg => (
            <div
              key={reg.name}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px 10px',
                borderBottom: `1px solid ${theme.border}22`,
              }}
            >
              <span style={{ flex: 1.2, fontWeight: 700, fontSize: 12, color: theme.text }}>{reg.name}</span>
              <span style={{ width: 30, textAlign: 'center', fontFamily: 'monospace', fontSize: 12, color: theme.subText }}>{reg.number}</span>
              <span style={{ flex: 1.4, textAlign: 'right', fontFamily: 'monospace', fontSize: 12, fontWeight: 'bold', color: theme.text }}>
                {showHex ? reg.hexValue : (parseInt(reg.hexValue, 16) | 0).toString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
