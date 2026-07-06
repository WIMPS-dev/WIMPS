import React from 'react';

interface LogoProps {
  size?: number;
  gap?: number;
  textSize?: number;
  showText?: boolean;
}

export function Logo({ size = 22, gap = 7, textSize = 14, showText = true }: LogoProps) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        style={{ display: 'block', flexShrink: 0 }}
      >
        <rect width="32" height="32" rx="7" fill="#0f172a"/>
        <rect x="9" y="9" width="14" height="14" rx="2" fill="#2563eb"/>
        <rect x="4" y="11" width="5" height="3" rx="1" fill="#60a5fa"/>
        <rect x="4" y="18" width="5" height="3" rx="1" fill="#60a5fa"/>
        <rect x="23" y="11" width="5" height="3" rx="1" fill="#60a5fa"/>
        <rect x="23" y="18" width="5" height="3" rx="1" fill="#60a5fa"/>
        <rect x="11" y="4" width="3" height="5" rx="1" fill="#60a5fa"/>
        <rect x="18" y="4" width="3" height="5" rx="1" fill="#60a5fa"/>
        <rect x="11" y="23" width="3" height="5" rx="1" fill="#60a5fa"/>
        <rect x="18" y="23" width="3" height="5" rx="1" fill="#60a5fa"/>
        <rect x="13" y="13" width="6" height="6" rx="1" fill="white" opacity="0.92"/>
      </svg>
      {showText ? <span style={{ fontSize: textSize, lineHeight: 1, fontWeight: 800 }}>WIMPS</span> : null}
    </span>
  );
}
