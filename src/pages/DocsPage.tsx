import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { DocsSkeleton } from '../components/PageSkeletons';
import { usePageReady } from '../components/Skeleton';
import { ThemeSwitch } from '../components/ThemeSwitch';
import { useTheme } from '../context/ThemeContext';
import { clearAuthToken, getAuthToken } from '../helpers/authStorage';
import { DIRECTIVES, INSTRUCTIONS, REGISTERS, SYSCALLS } from '../helpers/mipsSyntax';
import type { Theme } from '../theme/themes';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function Accordion({ title, children, theme, badge }: {
  title: string; children: React.ReactNode; theme: Theme; badge?: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = `accordion-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const btnId = `${panelId}-btn`;
  return (
    <div style={{ border: `1px solid ${theme.border}`, borderRadius: 14, marginBottom: 10, overflow: 'hidden' }}>
      <button
        id={btnId}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(p => !p)}
        className="docs-accordion-btn"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', padding: '14px 16px',
          backgroundColor: theme.card, border: 'none', cursor: 'pointer', gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{ color: '#2563eb', fontSize: 20, fontWeight: 700, lineHeight: 1, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 180ms ease-out' }}
            aria-hidden="true"
          >›</span>
          <span style={{ color: theme.text, fontSize: 15, fontWeight: 700 }}>{title}</span>
        </div>
        {badge && (
          <span style={{ backgroundColor: '#2563eb22', border: '1px solid #2563eb55', borderRadius: 8, padding: '2px 8px', fontSize: 11, fontWeight: 700, color: '#2563eb' }}>{badge}</span>
        )}
      </button>
      {open && (
        <div id={panelId} role="region" aria-labelledby={btnId} style={{ padding: '12px 16px 16px', borderTop: `1px solid ${theme.border}`, backgroundColor: theme.card }}>
          {children}
        </div>
      )}
    </div>
  );
}

function SectionDivider({ label, theme }: { label: string; theme: Theme }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0' }}>
      <div style={{ flex: 1, height: 1, backgroundColor: theme.border }} />
      <span style={{ color: theme.subText, fontSize: 11, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase' }}>{label}</span>
      <div style={{ flex: 1, height: 1, backgroundColor: theme.border }} />
    </div>
  );
}

function MiniTable({ rows, headers, theme }: { rows: [string, string, string?][]; headers: string[]; theme: Theme }) {
  return (
    <div style={{ border: `1px solid ${theme.border}`, borderRadius: 10, overflow: 'hidden', marginTop: 8 }}>
      <div style={{ display: 'flex', backgroundColor: `${theme.border}44`, padding: '8px 12px' }}>
        {headers.map((h, i) => (
          <span key={h} style={{ flex: i === 0 ? 1.2 : 2, fontSize: 11, fontWeight: 800, color: theme.subText, textTransform: 'uppercase', letterSpacing: 0.8 }}>{h}</span>
        ))}
      </div>
      {rows.map(([a, b, c], i) => (
        <div key={i} style={{ display: 'flex', padding: '8px 12px', backgroundColor: i % 2 === 1 ? `${theme.border}22` : 'transparent' }}>
          <span style={{ flex: 1.2, fontFamily: 'monospace', fontSize: 12, color: theme.linkColor }}>{a}</span>
          <span style={{ flex: 2, fontFamily: 'monospace', fontSize: 12, color: theme.subText }}>{b}</span>
          {c !== undefined && <span style={{ flex: 2, fontSize: 12, color: theme.subText }}>{c}</span>}
        </div>
      ))}
    </div>
  );
}

function Body({ children, theme }: { children: React.ReactNode; theme: Theme }) {
  return (
    <p style={{ color: theme.subText, fontSize: 14, lineHeight: '22px', maxWidth: '68ch', textWrap: 'pretty' } as React.CSSProperties}>
      {children}
    </p>
  );
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl';

const SHORTCUTS: [string[], string][] = [
  [[`${MOD}+Enter`],          'Assemble — works from the editor without inserting a newline'],
  [[`${MOD}+S`],              'Save — syncs to your account when signed in, otherwise to the browser'],
  [['F5'],                    'Run — restart from the top'],
  [['F8'],                    'Continue — resume past the current breakpoint'],
  [['F9'],                    'Step Back — only active while step history exists'],
  [['F10'],                   'Step — execute one instruction'],
  [['Esc'],                   'Reset — clear execution state and output'],
];

function ShortcutTable({ theme }: { theme: Theme }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6 }}>
      {SHORTCUTS.map(([keys, desc]) => (
        <div key={keys[0]} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: `1px solid ${theme.border}22` }}>
          <div style={{ display: 'flex', gap: 4, flexShrink: 0, minWidth: 130 }}>
            {keys.map(k => (
              <span key={k} style={{
                fontFamily: 'monospace', fontSize: 12, fontWeight: 700,
                backgroundColor: theme.bg, color: theme.text,
                border: `1px solid ${theme.border}`,
                borderRadius: 5, padding: '2px 7px',
                boxShadow: `0 1px 0 ${theme.border}`,
              }}>{k}</span>
            ))}
          </div>
          <span style={{ fontSize: 13, color: theme.subText }}>{desc}</span>
        </div>
      ))}
    </div>
  );
}

// Toolbar button legend
function ButtonLegend({ theme }: { theme: Theme }) {
  const items: [string, string, string][] = [
    ['⚙', 'Assemble',  'Parse and compile. Errors show up in the Console.'],
    ['▶', 'Run',       'Start from scratch. Stops at the first breakpoint it hits, or runs to the end.'],
    ['⏭', 'Continue', 'Resume from where you\'re paused, to the next breakpoint or the end.'],
    ['←', 'Step Back', 'Undo one instruction and retract its output. Stays dimmed until you\'ve stepped at least once.'],
    ['→', 'Step',      'Execute one instruction.'],
    ['↺', 'Reset',     'Clear execution state and output. Breakpoints survive.'],
    ['↑', 'Upload',    'Open a .asm / .s / .txt file from disk into a new tab.'],
    ['↓', 'Download',  'Export the active tab to disk.'],
    ['💾', 'Save',     'Sync all tabs to your account. Appears when signed in.'],
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6 }}>
      {items.map(([sym, name, desc]) => (
        <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: `1px solid ${theme.border}22` }}>
          <span style={{
            fontFamily: 'monospace', fontSize: 13, fontWeight: 700,
            backgroundColor: '#2563eb', color: '#fff',
            borderRadius: 5, padding: '2px 7px',
            flexShrink: 0, minWidth: 26, textAlign: 'center',
          }}>{sym}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: theme.text, flexShrink: 0, minWidth: 82 }}>{name}</span>
          <span style={{ fontSize: 13, color: theme.subText }}>{desc}</span>
        </div>
      ))}
    </div>
  );
}

// Mini gutter preview showing a breakpoint and active-line highlight
function BpGuide({ theme }: { theme: Theme }) {
  const lines: { n: number; bp: boolean; active: boolean; code: string }[] = [
    { n: 1, bp: false, active: false, code: 'li   $t0, 1' },
    { n: 2, bp: false, active: false, code: 'li   $t1, 10' },
    { n: 3, bp: true,  active: false, code: 'loop:' },
    { n: 4, bp: false, active: true,  code: '    add  $t0, $t0, 1' },
    { n: 5, bp: false, active: false, code: '    blt  $t0, $t1, loop' },
  ];
  return (
    <div style={{
      fontFamily: 'monospace', fontSize: 12, lineHeight: '20px',
      backgroundColor: theme.bg, borderRadius: 8, padding: '8px 0',
      border: `1px solid ${theme.border}`, display: 'inline-flex',
      flexDirection: 'column', marginTop: 10, overflow: 'hidden',
    }}>
      {lines.map(({ n, bp, active, code }) => (
        <div key={n} style={{ display: 'flex', alignItems: 'center', height: 22, backgroundColor: active ? '#2563eb22' : 'transparent' }}>
          <div style={{
            width: 48, display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
            gap: 4, paddingRight: 8, borderRight: `1px solid ${theme.border}`,
            color: active ? theme.text : (bp ? '#ef4444' : theme.subText),
            flexShrink: 0,
          }}>
            {bp && <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#ef4444', display: 'inline-block', flexShrink: 0 }} />}
            <span style={{ fontSize: 11, fontWeight: bp || active ? 700 : 400 }}>{n}</span>
          </div>
          <span style={{ paddingLeft: 10, color: active ? theme.linkColor : theme.consoleText }}>{code}</span>
        </div>
      ))}
    </div>
  );
}

const TYPE_COLOR: Record<string, string> = { R: '#3b82f6', I: '#f59e0b', J: '#10b981', P: '#8b5cf6' };

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function DocsPage() {
  const { theme } = useTheme();
  const ready = usePageReady();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [isLoggedIn] = useState(() => !!getAuthToken());

  const q = search.trim().toLowerCase();

  const filteredInstructions = useMemo(() =>
    q ? INSTRUCTIONS.filter(i => i.syntax.toLowerCase().includes(q) || i.desc.toLowerCase().includes(q)) : INSTRUCTIONS,
    [q]);

  const filteredSyscalls = useMemo(() =>
    q ? SYSCALLS.filter(s => s.code.includes(q) || s.args.toLowerCase().includes(q) || s.desc.toLowerCase().includes(q)) : SYSCALLS,
    [q]);

  const filteredDirectives = useMemo(() =>
    q ? DIRECTIVES.filter(d => d.directive.toLowerCase().includes(q) || d.desc.toLowerCase().includes(q)) : DIRECTIVES,
    [q]);

  const handleLogout = () => {
    clearAuthToken();
    navigate('/login');
  };

  if (!ready) return <DocsSkeleton theme={theme} />;

  return (
    <div style={{
      height: '100vh', backgroundColor: theme.bg, display: 'flex', flexDirection: 'column', overflow: 'hidden',
      '--ide-ink': theme.text,
      '--ide-card': theme.card,
      '--ide-hover': theme.resizer,
      '--hp-ink': theme.text,
    } as React.CSSProperties}>
      {/* Nav */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 24px', borderBottom: `1px solid ${theme.border}`, flexShrink: 0 }}>
        <Link to="/" className="ide-nav-link" style={{ textDecoration: 'none', color: theme.text, fontWeight: 800, fontSize: 18 }}><Logo size={22} /></Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <ThemeSwitch />
          <Link to="/ide" className="ide-sign-out" style={{ color: theme.subText, textDecoration: 'none', fontSize: 14, fontWeight: 600, padding: '6px 14px', border: `1px solid ${theme.border}`, borderRadius: 8 }}>IDE</Link>
          {/* TEMP: login disabled
          {isLoggedIn ? (
            <button type="button" onClick={handleLogout} className="ide-sign-out" style={{ backgroundColor: theme.card, color: theme.text, border: `1px solid ${theme.border}`, borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>Sign out</button>
          ) : (
            <Link to="/login" className="ide-sign-in" style={{ backgroundColor: '#2563eb', color: '#fff', textDecoration: 'none', padding: '6px 14px', borderRadius: 8, fontSize: 14, fontWeight: 600 }}>Sign in</Link>
          )}
          */}
        </div>
      </nav>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ maxWidth: 780, margin: '0 auto', padding: '32px 24px 80px' }}>

          {/* Header */}
          <h1 style={{ color: theme.text, fontSize: 28, fontWeight: 800, marginBottom: 6, textWrap: 'balance' } as React.CSSProperties}>Docs</h1>
          <p style={{ color: theme.subText, fontSize: 14, marginBottom: 28, maxWidth: '52ch' }}>
            WIMPS and MIPS reference. Search to filter instructions, syscalls, and directives.
          </p>

          {/* Search */}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search instructions, syscalls, directives..."
            aria-label="Search documentation"
            className="docs-search"
            style={{
              width: '100%',
              backgroundColor: theme.card,
              border: `1px solid ${theme.border}`,
              borderRadius: 10,
              padding: '12px 16px',
              fontSize: 14,
              color: theme.text,
              outline: 'none',
              marginBottom: 28,
            }}
          />

          {/* ── WIMPS ────────────────────────────────────────────────────── */}
          {!q && (
            <>
              <SectionDivider label="Using WIMPS" theme={theme} />

              <Accordion title="Getting started" theme={theme}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <Body theme={theme}>
                    Write your code, hit ⚙, and check the Console for errors. Once assembled, the run controls turn blue. The editor highlights the current line in blue as you step through.
                  </Body>
                  <div style={{ marginTop: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: theme.subText, textTransform: 'uppercase', letterSpacing: 1 }}>Toolbar</span>
                    <ButtonLegend theme={theme} />
                  </div>
                </div>
              </Accordion>

              <Accordion title="Keyboard shortcuts" theme={theme}>
                <ShortcutTable theme={theme} />
              </Accordion>

              <Accordion title="Breakpoint debugging" theme={theme}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <Body theme={theme}>
                    Click any line number in the gutter to place a breakpoint. A red dot marks it and the number turns red. Click the same line again to remove it. Breakpoints survive Reset and Assemble.
                  </Body>
                  <BpGuide theme={theme} />
                  <Body theme={theme}>
                    <strong style={{ color: theme.text }}>Run</strong> always restarts from the top and stops at the first breakpoint it hits. If you're paused at a breakpoint and want to move to the next one, use <strong style={{ color: theme.text }}>Continue</strong>. It executes the current instruction and keeps going. <strong style={{ color: theme.text }}>Step</strong> moves one instruction at a time regardless of breakpoints.
                  </Body>
                  <Body theme={theme}>
                    <strong style={{ color: theme.text }}>Step Back</strong> rewinds one instruction. Registers revert to how they were before that step, and any output it produced disappears from the Console. After a Run or Continue, the step-back history resets. You can only rewind over instructions you've stepped through.
                  </Body>
                </div>
              </Accordion>

              <Accordion title="Editor & tabs" theme={theme}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <Body theme={theme}>
                    Click <strong style={{ color: theme.text }}>+</strong> to open a new tab. Double-click a tab name to rename it. <strong style={{ color: theme.text }}>×</strong> closes the tab. It doesn't delete the file from your account.
                  </Body>
                  <Body theme={theme}>
                    If you're signed in, hovering a tab shows a red trash icon. Clicking it deletes the file from your account. No undo.
                  </Body>
                  <Body theme={theme}>
                    Upload (↑) opens a .asm, .s, or .txt file from disk into a new tab. Download (↓) exports the active tab to disk. The editor highlights syntax as you type.
                  </Body>
                </div>
              </Accordion>

              <Accordion title="Console & input" theme={theme}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <Body theme={theme}>
                    Program output lands in the Console as your code runs. When a read syscall fires ($v0 = 5, 8, or 12), a cursor appears and you can start typing. Press Enter to submit.
                  </Body>
                  <Body theme={theme}>
                    WIMPS replays execution from the start each time you submit input, threading all prior inputs back through. Programs that need several inputs keep every earlier read.
                  </Body>
                </div>
              </Accordion>

              <Accordion title="Registers & memory" theme={theme}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <Body theme={theme}>
                    The Registers panel shows all 32 general-purpose registers, updated after each Step or Run. Toggle between hex and decimal display at the top of the panel.
                  </Body>
                  <Body theme={theme}>
                    The Memory panel shows 32 words of the data segment starting at 0x10010000, the default .data address. Use it to check load/store results and verify your data layout.
                  </Body>
                </div>
              </Accordion>

              <Accordion title="Saving & syncing" theme={theme}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <Body theme={theme}>
                    No account required. WIMPS writes your tabs to localStorage on every change and restores them when you come back. If you clear browser storage or switch machines, those files are gone.
                  </Body>
                  <Body theme={theme}>
                    Sign in to back files up server-side (1 MB total). The 💾 Save button appears when you're logged in. Hit it to sync. Sign in on any device and your files are there.
                  </Body>
                </div>
              </Accordion>
            </>
          )}

          {/* ── MIPS ─────────────────────────────────────────────────────── */}
          <SectionDivider label="MIPS reference" theme={theme} />

          <Accordion title="Instructions" theme={theme} badge={`${filteredInstructions.length}`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {filteredInstructions.map(i => (
                <div key={i.syntax} className="docs-instr-row" style={{ borderBottom: `1px solid ${theme.border}22` }}>
                  <span className="docs-instr-syn" style={{ color: theme.linkColor }}>{i.syntax}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
                    backgroundColor: `${TYPE_COLOR[i.type]}22`, color: TYPE_COLOR[i.type],
                    minWidth: 20, textAlign: 'center', flexShrink: 0,
                  }}>{i.type}</span>
                  <span style={{ fontSize: 13, color: theme.subText }}>{i.desc}</span>
                </div>
              ))}
            </div>
          </Accordion>

          <Accordion title="Syscalls" theme={theme} badge={`${filteredSyscalls.length}`}>
            <MiniTable rows={filteredSyscalls.map(s => [s.code, s.args, s.desc] as [string, string, string])} headers={['Code', 'Args / Return', 'Description']} theme={theme} />
          </Accordion>

          {!q && (
            <Accordion title="Registers" theme={theme}>
              <MiniTable rows={REGISTERS.map(r => [r.name, r.number, r.convention] as [string, string, string])} headers={['Name', 'Number', 'Convention']} theme={theme} />
            </Accordion>
          )}

          <Accordion title="Assembler directives" theme={theme} badge={`${filteredDirectives.length}`}>
            <MiniTable rows={filteredDirectives.map(d => [d.directive, d.desc] as [string, string])} headers={['Directive', 'Description']} theme={theme} />
          </Accordion>
        </div>
      </div>
    </div>
  );
}
