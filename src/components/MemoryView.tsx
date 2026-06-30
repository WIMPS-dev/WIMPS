import React, { useEffect, useState } from 'react';
import { formatWordValue, getMemoryRange, parseWordValue, type ValueFormat } from '../simulator/useMips';
import type { Theme } from '../theme/themes';

const DEFAULT_ADDR = '0x10010000';
const WORDS_PER_ROW = 4;
const ROW_COUNT_OPTIONS = [32, 64, 128, 256, 512];
const FORMAT_BUTTON_MIN_WIDTH: Record<ValueFormat, number> = {
  hex: 44,
  dec: 44,
  bin: 44,
};
const FORMAT_CELL_WIDTH: Record<ValueFormat, string> = {
  hex: '12ch',
  dec: '13ch',
  bin: '36ch',
};

interface MemoryViewProps {
  theme: Theme;
  tick: number;
  valueFormat?: ValueFormat;
  setValueFormat?: (format: ValueFormat) => void;
  editable?: boolean;
  onToggleEditable?: () => void;
  onMemoryEdit?: (address: number, value: number) => void;
}

interface MemRow {
  baseAddr: number;
  words: { address: string; value: string }[];
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
              minWidth: FORMAT_BUTTON_MIN_WIDTH[format],
              backgroundColor: valueFormat === format ? '#2563eb' : theme.bg,
              color: valueFormat === format ? '#fff' : theme.subText,
              border: `1px solid ${valueFormat === format ? '#2563eb' : theme.border}`,
              borderRadius: 6,
              padding: '4px 8px',
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

export function MemoryView({ theme, tick, valueFormat = 'hex', setValueFormat, editable = false, onToggleEditable, onMemoryEdit }: MemoryViewProps) {
  const [addrStr, setAddrStr]     = useState(DEFAULT_ADDR);
  const [numRows, setNumRows]     = useState(128);
  const [showZeros, setShowZeros] = useState(false);
  const [rows, setRows]           = useState<MemRow[]>([]);
  const [editing, setEditing]     = useState<Record<string, string>>({});

  const parseAddr = (s: string) => parseInt(s.replace(/^0[xX]/, ''), 16) || 0x10010000;

  useEffect(() => {
    const addr = parseAddr(addrStr);
    const flat = getMemoryRange(addr, numRows * WORDS_PER_ROW);
    const grouped: MemRow[] = [];
    for (let i = 0; i < flat.length; i += WORDS_PER_ROW) {
      grouped.push({
        baseAddr: addr + i * 4,
        words: flat.slice(i, i + WORDS_PER_ROW),
      });
    }
    setRows(grouped);
  }, [tick, addrStr, numRows]);

  const isZeroRow = (row: MemRow) =>
    row.words.every(w => w.value === '0x00000000');

  const visible = showZeros ? rows : rows.filter(r => !isZeroRow(r));
  const hiddenCount = rows.length - visible.length;

  const isDirty = addrStr !== DEFAULT_ADDR || numRows !== 128;

  const mono: React.CSSProperties = { fontFamily: 'monospace' };

  const commitEdit = (address: string) => {
    const value = parseWordValue(editing[address] ?? '');
    setEditing(prev => {
      const next = { ...prev };
      delete next[address];
      return next;
    });
    if (value !== null) onMemoryEdit?.(parseAddr(address), value);
  };

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', backgroundColor: theme.bg }}>

      {/* Settings bar */}
      <div style={{
        padding: '8px 12px',
        borderBottom: `1px solid ${theme.border}`,
        backgroundColor: theme.card,
        flexShrink: 0,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 10,
        alignItems: 'center',
      }}>
        <FormatToggle theme={theme} valueFormat={valueFormat} setValueFormat={setValueFormat} />

        {/* Base address */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: theme.subText, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Base</span>
          <input
            value={addrStr}
            onChange={e => setAddrStr(e.target.value)}
            spellCheck={false}
            aria-label="Base address"
            style={{
              width: 104, backgroundColor: theme.bg,
              border: `1px solid ${theme.border}`, borderRadius: 6,
              padding: '3px 7px', fontSize: 11, ...mono,
              color: theme.text, outline: 'none',
            }}
          />
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: theme.subText, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Rows</span>
          <select
            value={numRows}
            onChange={e => setNumRows(Number(e.target.value))}
            style={{
              backgroundColor: theme.bg, border: `1px solid ${theme.border}`,
              borderRadius: 6, padding: '3px 6px', fontSize: 11,
              color: theme.text, outline: 'none', cursor: 'pointer',
            }}
          >
            {ROW_COUNT_OPTIONS.map(n => (
              <option key={n} value={n}>{n} rows ({n * WORDS_PER_ROW * 4} B)</option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={onToggleEditable}
          style={{
            backgroundColor: editable ? '#2563eb22' : theme.bg,
            color: editable ? '#2563eb' : theme.subText,
            border: `1px solid ${editable ? '#2563eb' : theme.border}`,
            borderRadius: 6,
            padding: '4px 8px',
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {editable ? 'Done editing' : 'Edit memory'}
        </button>

        <button
          type="button"
          onClick={() => setShowZeros(v => !v)}
          style={{
            background: 'none',
            border: 'none',
            color: showZeros ? theme.text : theme.subText,
            fontSize: 11,
            cursor: 'pointer',
            padding: 0,
            textDecoration: 'underline',
          }}
        >
          {showZeros ? 'Hide zeros' : 'Show zeros'}
        </button>

        {isDirty && (
          <button
            type="button"
            onClick={() => { setAddrStr(DEFAULT_ADDR); setNumRows(128); }}
            style={{
              background: 'none', border: `1px solid ${theme.border}`,
              borderRadius: 6, fontSize: 10, fontWeight: 600,
              color: theme.subText, cursor: 'pointer', padding: '3px 7px',
            }}
          >
            Reset
          </button>
        )}
      </div>

      {/* Table */}
      <div style={{ flex: 1, minHeight: 0, overflowX: 'auto', overflowY: 'auto', padding: '8px 12px' }}>
        {tick === 0 && rows.every(r => isZeroRow(r)) ? (
          <div style={{
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            height: '100%', gap: 8, color: theme.subText,
            fontSize: 12, textAlign: 'center',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.25 }} aria-hidden>
              <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
            </svg>
            Run a program to inspect memory.
          </div>
        ) : (
          <>
            {/* Column headers */}
            <div style={{
              display: 'grid',
              minWidth: `calc(9ch + ${FORMAT_CELL_WIDTH[valueFormat]} * 4 + 32px)`,
              gridTemplateColumns: `9ch repeat(4, minmax(${FORMAT_CELL_WIDTH[valueFormat]}, 1fr))`,
              gap: '0 8px',
              padding: '0 4px 4px',
              borderBottom: `1px solid ${theme.border}`,
              marginBottom: 4,
            }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: theme.subText, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Address</span>
              {['+0', '+4', '+8', '+C'].map(h => (
                <span key={h} style={{ fontSize: 9, fontWeight: 700, color: theme.subText, textTransform: 'uppercase', letterSpacing: '0.07em', textAlign: 'right' }}>{h}</span>
              ))}
            </div>

            {visible.length === 0 ? (
              <div style={{ color: theme.subText, fontSize: 12, textAlign: 'center', padding: '20px 0' }}>
                All zeros — enable "Show zeros" to see empty memory.
              </div>
            ) : visible.map((row, ri) => (
              <div
                key={ri}
                style={{
                  display: 'grid',
                  minWidth: `calc(9ch + ${FORMAT_CELL_WIDTH[valueFormat]} * 4 + 32px)`,
                  gridTemplateColumns: `9ch repeat(4, minmax(${FORMAT_CELL_WIDTH[valueFormat]}, 1fr))`,
                  gap: '0 8px',
                  padding: '2px 4px',
                  borderRadius: 4,
                  backgroundColor: ri % 2 === 0 ? 'transparent' : theme.border + '18',
                }}
              >
                <span style={{ ...mono, fontSize: 10, color: theme.subText }}>
                  {row.words[0]?.address ?? ''}
                </span>
                {row.words.map((w, wi) => {
                  const isZero = w.value === '0x00000000';
                  const displayValue = formatWordValue(parseWordValue(w.value) ?? 0, valueFormat);
                  return (
                    editable ? (
                      <input
                        key={wi}
                        value={editing[w.address] ?? displayValue}
                        aria-label={`Edit memory ${w.address}`}
                        onChange={e => setEditing(prev => ({ ...prev, [w.address]: e.target.value }))}
                        onBlur={() => commitEdit(w.address)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') e.currentTarget.blur();
                          if (e.key === 'Escape') setEditing(prev => {
                            const next = { ...prev };
                            delete next[w.address];
                            return next;
                          });
                        }}
                        style={{
                          ...mono, fontSize: 11, fontWeight: isZero ? 400 : 600,
                          color: isZero ? theme.subText + '50' : theme.text,
                          textAlign: 'right',
                          minWidth: 0,
                          width: '100%',
                          backgroundColor: 'transparent',
                          border: `1px solid ${editing[w.address] !== undefined ? theme.border : 'transparent'}`,
                          borderRadius: 4,
                          padding: '1px 3px',
                          outline: 'none',
                        }}
                      />
                    ) : (
                      <span
                        key={wi}
                        style={{
                          ...mono,
                          fontSize: 11,
                          fontWeight: isZero ? 400 : 600,
                          color: isZero ? theme.subText + '50' : theme.text,
                          textAlign: 'right',
                          minWidth: 0,
                          width: '100%',
                          padding: '2px 3px',
                        }}
                      >
                        {displayValue}
                      </span>
                    )
                  );
                })}
              </div>
            ))}

            {!showZeros && hiddenCount > 0 && (
              <div style={{ color: theme.subText, fontSize: 10, textAlign: 'center', padding: '8px 0' }}>
                {hiddenCount} zero row{hiddenCount === 1 ? '' : 's'} hidden
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
