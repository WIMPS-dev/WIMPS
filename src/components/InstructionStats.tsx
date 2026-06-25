import React from 'react';
import type { InstrStats } from '../simulator/useMips';
import type { Theme } from '../theme/themes';

const CATEGORIES: { key: keyof InstrStats['counts']; label: string; color: string; desc: string }[] = [
  { key: 'arithmetic', label: 'Arithmetic',  color: '#3b82f6', desc: 'add, sub, mul, div, slt…' },
  { key: 'logic',      label: 'Logic',       color: '#8b5cf6', desc: 'and, or, xor, sll, srl…' },
  { key: 'memory',     label: 'Load / Store', color: '#f59e0b', desc: 'lw, sw, lb, la, li…'     },
  { key: 'branch',     label: 'Branch',      color: '#10b981', desc: 'beq, bne, blt, bgt…'     },
  { key: 'jump',       label: 'Jump',        color: '#ef4444', desc: 'j, jal, jr, jalr'         },
  { key: 'syscall',    label: 'Syscall',     color: '#06b6d4', desc: 'syscall, break'           },
  { key: 'other',      label: 'Other',       color: '#6b7280', desc: 'nop, mfhi, mflo…'        },
];

interface InstructionStatsProps {
  theme: Theme;
  stats: InstrStats | null;
}

export function InstructionStats({ theme, stats }: InstructionStatsProps) {
  const isEmpty = !stats || stats.total === 0;

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', backgroundColor: theme.bg }}>
      {isEmpty ? (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 8, padding: 24,
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.25, color: theme.subText }} aria-hidden="true">
            <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
          </svg>
          <div style={{ color: theme.subText, fontSize: 12, textAlign: 'center', lineHeight: '18px' }}>
            Run a program to see<br />instruction statistics.
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '10px 12px' }}>
          {/* Total count card */}
          <div style={{
            padding: '10px 14px', borderRadius: 10,
            backgroundColor: theme.card, border: `1px solid ${theme.border}`,
            marginBottom: 14, display: 'flex', alignItems: 'baseline', gap: 10,
          }}>
            <div>
              <div style={{ color: theme.subText, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Instructions Executed
              </div>
              <div style={{ color: theme.text, fontSize: 26, fontWeight: 800, fontFamily: 'monospace', lineHeight: 1.2 }}>
                {stats!.total.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Category bars */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {CATEGORIES.map(({ key, label, color, desc }) => {
              const count = stats!.counts[key] ?? 0;
              if (count === 0) return null;
              const pct = (count / stats!.total) * 100;
              return (
                <div key={key}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{
                        width: 8, height: 8, borderRadius: 2,
                        backgroundColor: color, flexShrink: 0,
                      }} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>{label}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                      <span style={{ fontSize: 11, color: theme.subText, fontFamily: 'monospace' }}>
                        {count.toLocaleString()}
                      </span>
                      <span style={{
                        fontSize: 11, color: theme.subText, fontFamily: 'monospace',
                        minWidth: 38, textAlign: 'right',
                      }}>
                        {pct.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div style={{
                    height: 5, borderRadius: 3,
                    backgroundColor: theme.border + '60', overflow: 'hidden',
                  }}>
                    <div style={{
                      height: '100%', width: '100%',
                      backgroundColor: color, borderRadius: 3,
                      transform: `scaleX(${pct / 100})`,
                      transformOrigin: 'left',
                      transition: 'transform 350ms cubic-bezier(0.4, 0, 0.2, 1)',
                    }} />
                  </div>
                  <div style={{ color: theme.subText, fontSize: 9, marginTop: 2, letterSpacing: '0.02em' }}>
                    {desc}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
