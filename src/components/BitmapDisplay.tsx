import React, { useEffect, useRef, useState } from 'react';
import { getMemoryBitmapData } from '../simulator/useMips';
import type { Theme } from '../theme/themes';

// Default address = start of MIPS data segment (matches MARS default)
const DEFAULT_ADDR = '0x10010000';

const SIZE_PRESETS: { label: string; w: number; h: number }[] = [
  { label: '64 × 64',   w: 64,  h: 64  },
  { label: '128 × 128', w: 128, h: 128 },
  { label: '256 × 64',  w: 256, h: 64  },
  { label: '64 × 256',  w: 64,  h: 256 },
];

const SCALE_OPTIONS = [1, 2, 3, 4, 6, 8];

interface BitmapDisplayProps {
  theme: Theme;
  /** Increments after every simulation event so the canvas redraws. */
  tick: number;
}

export function BitmapDisplay({ theme, tick }: BitmapDisplayProps) {
  const [addrStr, setAddrStr]   = useState(DEFAULT_ADDR);
  const [width, setWidth]       = useState(64);
  const [height, setHeight]     = useState(64);
  const [scale, setScale]       = useState(4);
  const canvasRef               = useRef<HTMLCanvasElement>(null);

  const parseAddr = (s: string) => parseInt(s.replace(/^0[xX]/, ''), 16) || 0x10010000;

  const redraw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const addr     = parseAddr(addrStr);
    const pixelData = getMemoryBitmapData(addr, width, height);

    // Draw to a temp canvas, then scale up with nearest-neighbour (crisp pixels)
    const tmp    = document.createElement('canvas');
    tmp.width    = width;
    tmp.height   = height;
    const tmpCtx = tmp.getContext('2d')!;
    const imgData = tmpCtx.createImageData(width, height);
    imgData.data.set(pixelData);
    tmpCtx.putImageData(imgData, 0, 0);

    canvas.width  = width  * scale;
    canvas.height = height * scale;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, width * scale, height * scale);
  };

  // Redraw whenever the sim advances OR any display setting changes
  useEffect(redraw, [tick, addrStr, width, height, scale]);

  const isDirty = addrStr !== DEFAULT_ADDR || width !== 64 || height !== 64 || scale !== 4;

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: theme.bg }}>

      {/* ── Settings bar ── */}
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
        {/* Base address */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: theme.subText, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Base</span>
          <input
            value={addrStr}
            onChange={e => setAddrStr(e.target.value)}
            aria-label="Base address"
            spellCheck={false}
            style={{
              width: 104, backgroundColor: theme.bg,
              border: `1px solid ${theme.border}`, borderRadius: 6,
              padding: '3px 7px', fontSize: 11, fontFamily: 'monospace',
              color: theme.text, outline: 'none',
            }}
          />
        </label>

        {/* Size presets */}
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          {SIZE_PRESETS.map(p => {
            const active = width === p.w && height === p.h;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => { setWidth(p.w); setHeight(p.h); }}
                style={{
                  backgroundColor: active ? '#2563eb' : theme.bg,
                  color: active ? '#fff' : theme.subText,
                  border: `1px solid ${active ? '#2563eb' : theme.border}`,
                  borderRadius: 6, fontSize: 10, fontWeight: 600,
                  padding: '3px 7px', cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Scale */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: theme.subText, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Scale</span>
          <select
            value={scale}
            onChange={e => setScale(Number(e.target.value))}
            aria-label="Display scale"
            style={{
              backgroundColor: theme.bg, border: `1px solid ${theme.border}`,
              borderRadius: 6, padding: '3px 6px', fontSize: 11,
              color: theme.text, outline: 'none', cursor: 'pointer',
            }}
          >
            {SCALE_OPTIONS.map(s => <option key={s} value={s}>{s}×</option>)}
          </select>
        </label>

        {/* Reset settings */}
        {isDirty && (
          <button
            type="button"
            onClick={() => { setAddrStr(DEFAULT_ADDR); setWidth(64); setHeight(64); setScale(4); }}
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

      {/* ── Canvas area ── */}
      {/*
        Block (not flex) container so overflow:auto reliably shows scrollbars.
        inline-flex inner wrapper sizes to canvas content, never flex-shrinks to 0.
      */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 14 }}>
        <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
          {/* Info strip */}
          <div style={{ display: 'flex', gap: 16 }}>
            {[
              { label: 'Size',    value: `${width} × ${height} px` },
              { label: 'Display', value: `${width * scale} × ${height * scale} px` },
              { label: 'Address', value: addrStr },
            ].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontSize: 9, fontWeight: 700, color: theme.subText, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</div>
                <div style={{ fontSize: 11, fontFamily: 'monospace', color: theme.text }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Canvas — sized exactly to width×scale by height×scale; card matches it */}
          <div style={{
            border: `1px solid ${theme.border}`,
            borderRadius: 6,
            overflow: 'hidden',
            lineHeight: 0,
          }}>
            <canvas
              ref={canvasRef}
              width={width * scale}
              height={height * scale}
              style={{ display: 'block', imageRendering: 'pixelated' }}
              aria-label={`Bitmap display: ${width}×${height} pixels at ${addrStr}`}
            />
          </div>

          {/* Usage hint */}
          <div style={{ color: theme.subText, fontSize: 10, lineHeight: '15px', maxWidth: 320 }}>
            Write 32-bit color words to memory starting at <code style={{ fontFamily: 'monospace', color: theme.text }}>{addrStr}</code>.
            Format: <code style={{ fontFamily: 'monospace', color: theme.text }}>0x00RRGGBB</code>.
          </div>
        </div>
      </div>
    </div>
  );
}
