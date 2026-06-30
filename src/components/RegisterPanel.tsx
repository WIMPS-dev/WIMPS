import React, { useMemo, useState } from 'react';
import { formatWordValue, getSpecialRegisters, parseWordValue, type ValueFormat } from '../simulator/useMips';
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
  valueFormat?: ValueFormat;
  setValueFormat?: (format: ValueFormat) => void;
  editable?: boolean;
  onToggleEditable?: () => void;
  changedRegisters?: Set<string>;
  onRegisterEdit?: (name: string, value: number) => void;
  tick?: number;
}

function FormatToggle({
  theme,
  valueFormat,
  setValueFormat,
}: {
  theme: Theme;
  valueFormat: ValueFormat;
  setValueFormat?: (format: ValueFormat) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {(['hex', 'dec', 'bin'] as const).map(format => (
        <button
          key={format}
          type="button"
          onClick={() => setValueFormat?.(format)}
          style={{
            backgroundColor: valueFormat === format ? '#2563eb' : 'transparent',
            color: valueFormat === format ? '#fff' : theme.subText,
            border: `1px solid ${valueFormat === format ? '#2563eb' : theme.border}`,
            borderRadius: 6,
            padding: '4px 7px',
            fontSize: 10,
            fontWeight: 700,
            cursor: 'pointer',
            textTransform: 'uppercase',
          }}
        >
          {format}
        </button>
      ))}
    </div>
  );
}

export function RegisterPanel({ registers, theme, valueFormat = 'hex', setValueFormat, editable = false, onToggleEditable, changedRegisters, onRegisterEdit, tick = 0 }: RegisterPanelProps) {
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [focusedReg, setFocusedReg] = useState<string | null>(null);
  const special = useMemo(() => getSpecialRegisters(), [tick]);

  const filteredRegisters = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return registers;
    return registers.filter(r =>
      r.name.toLowerCase().includes(q) ||
      r.number.toString().includes(q) ||
      r.hexValue.toLowerCase().includes(q)
    );
  }, [query, registers]);

  const commitEdit = (name: string) => {
    const value = parseWordValue(editing[name] ?? '');
    setEditing(prev => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
    if (value !== null) onRegisterEdit?.(name, value);
  };

  return (
    <div style={{ flex: 1, minHeight: 0, backgroundColor: theme.bg, padding: 10, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 0 8px', flexWrap: 'wrap' }}>
        <FormatToggle theme={theme} valueFormat={valueFormat} setValueFormat={setValueFormat} />
        <div style={{ flex: 1, minWidth: 180 }}>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Filter…"
            aria-label="Filter registers"
            style={{
              width: 'calc(100% - 8px)',
              boxSizing: 'border-box',
              backgroundColor: theme.card,
              border: `1px solid ${theme.border}`,
              borderRadius: 6,
              padding: '4px 10px',
              fontSize: 12,
              color: theme.text,
              outline: 'none',
            }}
          />
        </div>
        <button
          type="button"
          onClick={onToggleEditable}
          style={{
            flexShrink: 0,
            backgroundColor: editable ? '#2563eb22' : theme.card,
            color: editable ? '#2563eb' : theme.subText,
            border: `1px solid ${editable ? '#2563eb' : theme.border}`,
            borderRadius: 6,
            padding: '5px 8px',
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {editable ? 'Done editing' : 'Edit registers'}
        </button>
      </div>

      <div style={{ marginBottom: 8, borderRadius: 10, border: `1px solid ${theme.border}`, backgroundColor: theme.card, padding: 10, display: 'grid', gap: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          {[
            ['PC', special.pc],
            ['HI', special.hi],
            ['LO', special.lo],
          ].map(([label, value]) => (
            <div key={label} style={{ minWidth: 0, borderRadius: 8, border: `1px solid ${theme.border}`, backgroundColor: theme.bg, padding: '8px 10px' }}>
              <div style={{ color: theme.subText, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>{label}</div>
              <div
                title={formatWordValue(value as number, valueFormat)}
                style={{
                  marginTop: 4,
                  minWidth: 0,
                  color: theme.text,
                  fontFamily: 'monospace',
                  fontSize: 12,
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {formatWordValue(value as number, valueFormat)}
              </div>
            </div>
          ))}
        </div>
        <div>
          <div style={{ color: theme.subText, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>Condition flags</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {special.conditionFlags.map((flag, i) => (
              <span key={i} style={{ border: `1px solid ${theme.border}`, backgroundColor: flag ? '#2563eb22' : theme.bg, color: flag ? '#2563eb' : theme.subText, borderRadius: 999, padding: '3px 7px', fontSize: 11, fontFamily: 'monospace' }}>
                F{i}:{flag}
              </span>
            ))}
          </div>
        </div>
      </div>

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
        <div style={{ display: 'flex', alignItems: 'center', padding: '8px 10px', borderBottom: `1px solid ${theme.border}` }}>
          <span style={{ flex: 1.2, color: theme.subText, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>Register</span>
          <span style={{ width: 30, flexShrink: 0, textAlign: 'center', color: theme.subText, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>#</span>
          <span style={{ flex: 1.4, textAlign: 'right', color: theme.subText, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>
            {valueFormat}
          </span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filteredRegisters.map(reg => (
            <div
              key={reg.name}
              className={changedRegisters?.has(reg.name) ? 'reg-row-changed' : ''}
              title={reg.name === '$zero' ? '$zero is read-only' : editable ? `Edit ${reg.name}` : `${reg.name} value`}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px 10px',
                borderBottom: `1px solid ${theme.border}22`,
                borderLeft: '2px solid transparent',
                transition: 'border-left-color 0.8s ease-out',
              }}
            >
              <span style={{ flex: 1.2, fontWeight: 700, fontSize: 12, color: theme.text }}>{reg.name}</span>
              <span style={{ width: 30, textAlign: 'center', fontFamily: 'monospace', fontSize: 12, color: theme.subText }}>{reg.number}</span>
              {editable && reg.name !== '$zero' ? (
                <input
                  value={editing[reg.name] ?? formatWordValue(parseInt(reg.hexValue, 16), valueFormat)}
                  aria-label={`Edit ${reg.name}`}
                  onChange={e => setEditing(prev => ({ ...prev, [reg.name]: e.target.value }))}
                  onFocus={() => setFocusedReg(reg.name)}
                  onBlur={() => {
                    setFocusedReg(null);
                    commitEdit(reg.name);
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                    if (e.key === 'Escape') setEditing(prev => {
                      const next = { ...prev };
                      delete next[reg.name];
                      return next;
                    });
                  }}
                  style={{
                    flex: 1.4,
                    minWidth: 0,
                    textAlign: 'right',
                    fontFamily: 'monospace',
                    fontSize: 12,
                    fontWeight: 'bold',
                    color: theme.text,
                    backgroundColor: focusedReg === reg.name ? theme.bg : `${theme.bg}88`,
                    border: `1px solid ${focusedReg === reg.name ? '#2563eb' : theme.border}`,
                    borderRadius: 6,
                    padding: '4px 6px',
                    outline: focusedReg === reg.name ? '2px solid #2563eb44' : 'none',
                  }}
                />
              ) : (
                <span
                  style={{
                    flex: 1.4,
                    minWidth: 0,
                    textAlign: 'right',
                    fontFamily: 'monospace',
                    fontSize: 12,
                    fontWeight: 700,
                    color: reg.name === '$zero' ? theme.subText : theme.text,
                    opacity: reg.name === '$zero' ? 0.85 : 1,
                  }}
                >
                  {formatWordValue(parseInt(reg.hexValue, 16), valueFormat)}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
