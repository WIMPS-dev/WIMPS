import React from 'react';
import type { Theme } from '../theme/themes';

interface MemoryItem {
  address: string;
  value: string;
}

interface MemoryViewProps {
  data: MemoryItem[];
  theme: Theme;
}

export function MemoryView({ data, theme }: MemoryViewProps) {
  return (
    <div style={{ flex: 1, minHeight: 0, padding: 12, backgroundColor: theme.bg, display: 'flex', flexDirection: 'column' }}>
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
        <div style={{ flex: 1, overflowY: 'auto', padding: 4 }}>
          {data.length === 0 ? (
            <p style={{ color: theme.subText, textAlign: 'center', marginTop: 20, fontSize: 11, fontStyle: 'italic' }}>
              Awaiting run...
            </p>
          ) : (
            data.map((item, index) => (
              <div
                key={index}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '6px 10px',
                  borderBottom: `1px solid ${theme.border}22`,
                }}
              >
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: theme.subText }}>{item.address}</span>
                <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 'bold', color: theme.text }}>{item.value}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
