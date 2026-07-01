interface ActionIconProps {
  name: string;
  size?: number;
}

export function ActionIcon({ name, size = 14 }: ActionIconProps) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    style: { display: 'block', flexShrink: 0 },
    'aria-hidden': true,
  };

  switch (name) {
    case 'Run':
      return <svg {...common}><polygon points="6 3 20 12 6 21 6 3" fill="currentColor" stroke="none" /></svg>;
    case 'Continue':
      return <svg {...common}><polygon points="5 4 15 12 5 20" fill="currentColor" stroke="none" /><line x1="19" y1="5" x2="19" y2="19" /></svg>;
    case 'Run to Line':
      return <svg {...common}><polygon points="5 4 14 12 5 20" fill="currentColor" stroke="none" /><line x1="18" y1="5" x2="18" y2="19" /><line x1="21" y1="8" x2="21" y2="16" /></svg>;
    case 'Step Back':
      return <svg {...common}><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>;
    case 'Step':
      return <svg {...common}><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>;
    case 'Reset':
      return <svg {...common}><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>;
    case 'Save':
      return <svg {...common}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>;
    case 'Import':
      return <svg {...common}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>;
    case 'Export':
      return <svg {...common}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>;
    case 'Regs':
      return <svg {...common}><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>;
    case 'Memory':
      return <svg {...common}><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/></svg>;
    case 'Stats':
      return <svg {...common}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>;
    case 'Bitmap':
      return <svg {...common}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>;
    case 'Segments':
      return <svg {...common}><rect x="3" y="4" width="18" height="5" rx="1"/><rect x="3" y="15" width="18" height="5" rx="1"/><line x1="7" y1="9" x2="7" y2="15"/><line x1="17" y1="9" x2="17" y2="15"/></svg>;
    case 'Cache':
      return <svg {...common}><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 9h8M8 13h8M8 17h5"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3"/></svg>;
    case 'Special':
      return <svg {...common}><circle cx="12" cy="12" r="8"/><path d="M12 8v8M8 12h8"/></svg>;
    case 'Files':
      return <svg {...common}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>;
    case 'Settings':
      return <svg {...common}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
    case 'Tools':
      return <svg {...common}><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h10"/><circle cx="17" cy="17" r="2"/></svg>;
    case 'Assemble':
    default:
      // crossed wrench + hammer
      return (
        <svg {...common}>
          <path d="M14.7 4.8a4.2 4.2 0 0 0 1.64 5.52L7.8 18.86a2.2 2.2 0 0 1-3.11-3.11l8.54-8.54a4.2 4.2 0 0 0 5.52 1.64l-2.68-2.68 1.42-1.37 2.68 2.68a4.2 4.2 0 0 0-5.47-2.68z" />
          <path d="M13.2 13.35 18.9 7.6l2.5 2.5-5.73 5.7" />
          <path d="m10.85 15.7-3.55 3.56" />
          <path d="m16.5 5.25 2.25 2.25" />
        </svg>
      );
  }
}
