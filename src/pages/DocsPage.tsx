import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ActionIcon } from '../components/ActionIcons';
import { Logo } from '../components/Logo';
import { DocsSkeleton } from '../components/PageSkeletons';
import { usePageReady } from '../components/Skeleton';
import { ThemeSwitch } from '../components/ThemeSwitch';
import { useTheme } from '../context/ThemeContext';
import { DIRECTIVES, INSTRUCTION_CATEGORIES, INSTRUCTIONS, REGISTERS, SYSCALLS } from '../helpers/mipsSyntax';
import type { Theme } from '../theme/themes';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function Accordion({ title, children, theme, badge, defaultOpen }: {
  title: string; children: React.ReactNode; theme: Theme; badge?: string; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
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
        {badge !== undefined && (
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0 14px' }}>
      <div style={{ flex: 1, height: 1, backgroundColor: theme.border }} />
      <span style={{ color: theme.subText, fontSize: 13, fontWeight: 600 }}>{label}</span>
      <div style={{ flex: 1, height: 1, backgroundColor: theme.border }} />
    </div>
  );
}

function Body({ children, theme }: { children: React.ReactNode; theme: Theme }) {
  return (
    <p style={{ color: theme.subText, fontSize: 14, lineHeight: '22px', maxWidth: '68ch', textWrap: 'pretty', margin: 0 } as React.CSSProperties}>
      {children}
    </p>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return <code style={{ fontFamily: 'monospace', fontSize: 13 }}>{children}</code>;
}

// Keyboard shortcut display
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl';

const SHORTCUTS: [string[], string][] = [
  [[`${MOD}+Enter`], 'Assemble — works from anywhere in the editor'],
  [[`${MOD}+S`],     'Save to browser storage (or account when signed in)'],
  [['F5'],           'Run — restart from the top'],
  [['F8'],           'Continue — resume past the current breakpoint'],
  [['F9'],           'Step Back — only active while step history exists'],
  [['F10'],          'Step — execute one instruction'],
  [['Esc'],          'Reset — clear execution state and output'],
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

// Toolbar button legend using real ActionIcon SVGs
const TOOLBAR_ITEMS: { icon: string; name: string; desc: string }[] = [
  { icon: 'Assemble',   name: 'Assemble',   desc: 'Parse and compile the active file. Errors appear in the Console.' },
  { icon: 'Run',        name: 'Run',        desc: 'Start from the top. Stops at the first breakpoint, or runs to completion.' },
  { icon: 'Continue',   name: 'Continue',   desc: 'Resume from a breakpoint to the next one, or to the end.' },
  { icon: 'Step Back',  name: 'Step Back',  desc: 'Undo one instruction. Registers and output revert. Dimmed until you\'ve stepped.' },
  { icon: 'Step',       name: 'Step',       desc: 'Execute one instruction and advance the highlighted line.' },
  { icon: 'Reset',      name: 'Reset',      desc: 'Clear execution state and console output. Breakpoints survive.' },
  { icon: 'Import',     name: 'Import',     desc: 'Open a .asm, .s, or .txt file from disk into a new tab.' },
  { icon: 'Export',     name: 'Export',     desc: 'Export the active tab to disk.' },
];

function ButtonLegend({ theme }: { theme: Theme }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6 }}>
      {TOOLBAR_ITEMS.map(({ icon, name, desc }) => (
        <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: `1px solid ${theme.border}22` }}>
          <div style={{
            backgroundColor: '#2563eb', color: '#fff', borderRadius: 5,
            width: 26, height: 26, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <ActionIcon name={icon} size={14} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: theme.text, flexShrink: 0, minWidth: 86 }}>{name}</span>
          <span style={{ fontSize: 13, color: theme.subText }}>{desc}</span>
        </div>
      ))}
    </div>
  );
}

// Mini gutter preview for breakpoint guide
function BpGuide({ theme }: { theme: Theme }) {
  const lines = [
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

// Inline code snippet block
function CodeBlock({ code, theme }: { code: string; theme: Theme }) {
  return (
    <pre style={{
      fontFamily: 'monospace', fontSize: 12, lineHeight: '20px',
      backgroundColor: theme.bg, border: `1px solid ${theme.border}`,
      borderRadius: 8, padding: '12px 14px', margin: '8px 0 0',
      overflowX: 'auto', color: theme.consoleText,
      whiteSpace: 'pre',
    }}>{code.trim()}</pre>
  );
}

const TYPE_COLOR: Record<string, string> = { R: '#3b82f6', I: '#f59e0b', J: '#10b981', P: '#8b5cf6' };

function InstrRow({ i, theme }: { i: typeof INSTRUCTIONS[0]; theme: Theme }) {
  return (
    <div style={{ borderBottom: `1px solid ${theme.border}22`, padding: '5px 0' }}>
      <div className="docs-instr-row">
        <span className="docs-instr-syn" style={{ color: theme.linkColor }}>{i.syntax}</span>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
          backgroundColor: `${TYPE_COLOR[i.type]}22`, color: TYPE_COLOR[i.type],
          minWidth: 20, textAlign: 'center', flexShrink: 0,
        }}>{i.type}</span>
        <span style={{ fontSize: 13, color: theme.subText, flex: 1 }}>{i.desc}</span>
        {i.example && (
          <span style={{ fontFamily: 'monospace', fontSize: 11, color: theme.subText, opacity: 0.6, flexShrink: 0 }}>{i.example}</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function DocsPage() {
  const { theme } = useTheme();
  const ready = usePageReady();
  const [search, setSearch] = useState('');

  const q = search.trim().toLowerCase();

  const filteredInstructions = useMemo(() =>
    q ? INSTRUCTIONS.filter(i =>
      i.syntax.toLowerCase().includes(q) ||
      i.mnemonic.toLowerCase().includes(q) ||
      i.desc.toLowerCase().includes(q) ||
      (i.example?.toLowerCase().includes(q) ?? false)
    ) : INSTRUCTIONS,
    [q]);

  const filteredSyscalls = useMemo(() =>
    q ? SYSCALLS.filter(s =>
      s.code.includes(q) ||
      s.args.toLowerCase().includes(q) ||
      s.desc.toLowerCase().includes(q)
    ) : SYSCALLS,
    [q]);

  const filteredDirectives = useMemo(() =>
    q ? DIRECTIVES.filter(d =>
      d.directive.toLowerCase().includes(q) ||
      d.desc.toLowerCase().includes(q)
    ) : DIRECTIVES,
    [q]);

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
        </div>
      </nav>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ maxWidth: 820, margin: '0 auto', padding: '32px 24px 80px' }}>

          <h1 style={{ color: theme.text, fontSize: 28, fontWeight: 800, marginBottom: 6, textWrap: 'balance' } as React.CSSProperties}>Docs</h1>
          <p style={{ color: theme.subText, fontSize: 14, marginBottom: 28, maxWidth: '56ch' }}>
            Platform guide and complete MIPS reference. Search to filter instructions, syscalls, and directives.
          </p>

          {/* Search */}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search instructions, syscalls, directives..."
            aria-label="Search documentation"
            className="docs-search"
            style={{
              width: '100%', boxSizing: 'border-box',
              backgroundColor: theme.card,
              border: `1px solid ${theme.border}`,
              borderRadius: 10, padding: '12px 16px',
              fontSize: 14, color: theme.text,
              outline: 'none', marginBottom: 28,
            }}
          />

          {/* ── WIMPS guide (hidden while searching) ──────────────────────── */}
          {!q && (
            <>
              <SectionDivider label="Using WIMPS" theme={theme} />

              <Accordion title="Quick start" theme={theme} defaultOpen>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <Body theme={theme}>
                    Write MIPS assembly in the editor. Click <strong style={{ color: theme.text }}>Assemble</strong> (or press <Mono>{MOD}+Enter</Mono>) to compile. If there are errors, they appear in the Console with line numbers. Fix them and assemble again.
                  </Body>
                  <Body theme={theme}>
                    Once assembled, <strong style={{ color: theme.text }}>Run</strong>, <strong style={{ color: theme.text }}>Step</strong>, and <strong style={{ color: theme.text }}>Continue</strong> become active. Run executes the whole program. Step moves one instruction at a time. Registers update after each step and the current line highlights in blue.
                  </Body>
                  <Body theme={theme}>
                    <strong style={{ color: theme.text }}>Reset</strong> clears the execution state so you can start over without reassembling. <strong style={{ color: theme.text }}>Step Back</strong> rewinds one instruction — registers revert and any console output from that step disappears.
                  </Body>
                </div>
              </Accordion>

              <Accordion title="Toolbar reference" theme={theme}>
                <ButtonLegend theme={theme} />
              </Accordion>

              <Accordion title="Keyboard shortcuts" theme={theme}>
                <ShortcutTable theme={theme} />
              </Accordion>

              <Accordion title="Files & tabs" theme={theme}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <Body theme={theme}>
                    Click <strong style={{ color: theme.text }}>+</strong> in the tab bar to open a blank file. Double-click a tab name to rename it. Click <strong style={{ color: theme.text }}>×</strong> to close a tab — this does not delete the file.
                  </Body>
                  <Body theme={theme}>
                    The <strong style={{ color: theme.text }}>Files</strong> panel (left sidebar) shows all saved files and open tabs. Opening an example from the Examples section copies it into your workspace as an editable file. Use the sidebar to reopen closed files, create new ones, or import/export.
                  </Body>
                  <Body theme={theme}>
                    Files are saved automatically to browser storage on every change. They persist across sessions and page reloads on the same browser.
                  </Body>
                </div>
              </Accordion>

              <Accordion title="Breakpoint debugging" theme={theme}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <Body theme={theme}>
                    Click any line number in the gutter to place a breakpoint. A red dot marks it and the number turns red. Click again to remove it. Breakpoints survive Reset and Assemble.
                  </Body>
                  <BpGuide theme={theme} />
                  <Body theme={theme}>
                    <strong style={{ color: theme.text }}>Run</strong> always restarts from the top and stops at the first breakpoint it hits. Use <strong style={{ color: theme.text }}>Continue</strong> to move to the next one. <strong style={{ color: theme.text }}>Step</strong> moves one instruction at a time, ignoring breakpoints.
                  </Body>
                  <Body theme={theme}>
                    <strong style={{ color: theme.text }}>Step Back</strong> rewinds one instruction. Only available after stepping (not after Run or Continue). Any output the undone instruction produced is removed from the Console.
                  </Body>
                </div>
              </Accordion>

              <Accordion title="Console & I/O" theme={theme}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <Body theme={theme}>
                    Program output (print syscalls) lands in the Console as the program runs. When a read syscall fires (<Mono>$v0 = 5</Mono>, <Mono>8</Mono>, or <Mono>12</Mono>), a cursor appears and the program pauses waiting for your input. Type and press Enter to submit.
                  </Body>
                  <Body theme={theme}>
                    WIMPS replays execution from the beginning each time you submit input, threading all prior inputs back through automatically. Programs that require several reads keep every earlier response in order.
                  </Body>
                </div>
              </Accordion>

              <Accordion title="Panels" theme={theme}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <Body theme={theme}>
                    The left sidebar has four panels, each toggled by its icon in the activity bar:
                  </Body>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                    {[
                      { icon: 'Files',   name: 'Files',      desc: 'Manage open tabs, saved files, and example programs.' },
                      { icon: 'Regs',    name: 'Registers',  desc: 'All 32 general-purpose registers, updated after every step. Toggle between hex and decimal.' },
                      { icon: 'Memory',  name: 'Memory',     desc: 'Hex dump of the data segment starting at 0x10010000. Updates after each step.' },
                      { icon: 'Stats',   name: 'Stats',      desc: 'Instruction mix breakdown after a run — counts and percentages by category.' },
                      { icon: 'Bitmap',  name: 'Bitmap',     desc: 'Renders memory as a color grid. Width, height, and base address are configurable.' },
                    ].map(({ icon, name, desc }) => (
                      <div key={name} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <div style={{ color: theme.subText, marginTop: 1, flexShrink: 0 }}>
                          <ActionIcon name={icon} size={14} />
                        </div>
                        <div>
                          <span style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>{name}</span>
                          <span style={{ fontSize: 13, color: theme.subText }}> — {desc}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Accordion>
            </>
          )}

          {/* ── MIPS reference ────────────────────────────────────────────── */}
          <SectionDivider label="MIPS Reference" theme={theme} />

          {/* Number formats & comments — hidden while searching */}
          {!q && (
            <>
              <Accordion title="Number formats & comments" theme={theme}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <Body theme={theme}>
                    Integer literals can be written in decimal or hexadecimal. Negative values use a leading minus sign.
                  </Body>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 2 }}>
                    {[
                      ['Decimal',     '42',   '42'],
                      ['Negative',    '-1',   '-1 (same as 0xFFFFFFFF in 32-bit)'],
                      ['Hexadecimal', '0x2A', 'prefix 0x or 0X'],
                      ['Character',   "'A'",  "ASCII value 65 — valid in li and immediate fields"],
                    ].map(([label, val, note]) => (
                      <div key={label} style={{ display: 'flex', gap: 12, alignItems: 'baseline', fontSize: 13 }}>
                        <span style={{ color: theme.subText, minWidth: 90, flexShrink: 0 }}>{label}</span>
                        <span style={{ fontFamily: 'monospace', color: theme.linkColor, minWidth: 60, flexShrink: 0 }}>{val}</span>
                        <span style={{ color: theme.subText }}>{note}</span>
                      </div>
                    ))}
                  </div>
                  <Body theme={theme}>
                    Comments start with <Mono>#</Mono> and run to the end of the line. There are no block comments.
                  </Body>
                  <CodeBlock theme={theme} code={`li $t0, 42       # decimal\nli $t1, 0xFF     # hex = 255\nli $t2, 'A'      # char = 65\nxori $t0,$t0,-1  # -1 as immediate`} />
                </div>
              </Accordion>

              <Accordion title="Memory model" theme={theme}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <Body theme={theme}>
                    MIPS memory is divided into four regions. The addresses below are standard for the MARS simulator.
                  </Body>
                  <div style={{ border: `1px solid ${theme.border}`, borderRadius: 10, overflow: 'hidden', marginTop: 4 }}>
                    {[
                      { seg: 'Text',  addr: '0x00400000', dir: '↑', desc: 'Executable instructions (.text). Entry point is .globl main.' },
                      { seg: 'Data',  addr: '0x10010000', dir: '↑', desc: 'Static global data (.data). $gp points near the middle.' },
                      { seg: 'Heap',  addr: '0x10040000', dir: '↑', desc: 'Dynamic memory from syscall 9 (sbrk). Grows toward higher addresses.' },
                      { seg: 'Stack', addr: '0x7FFFEFFC', dir: '↓', desc: 'Call stack. $sp starts here and grows toward lower addresses.' },
                    ].map(({ seg, addr, dir, desc }, i) => (
                      <div key={seg} style={{
                        display: 'flex', gap: 12, padding: '8px 12px', alignItems: 'flex-start',
                        backgroundColor: i % 2 === 1 ? `${theme.border}22` : 'transparent',
                        borderBottom: i < 3 ? `1px solid ${theme.border}22` : 'none',
                      }}>
                        <span style={{ fontFamily: 'monospace', fontSize: 12, color: theme.linkColor, minWidth: 50, flexShrink: 0 }}>{seg}</span>
                        <span style={{ fontFamily: 'monospace', fontSize: 12, color: theme.subText, minWidth: 108, flexShrink: 0 }}>{addr} {dir}</span>
                        <span style={{ fontSize: 13, color: theme.subText }}>{desc}</span>
                      </div>
                    ))}
                  </div>
                  <Body theme={theme}>
                    The stack must stay 4-byte aligned at minimum. Decrement <Mono>$sp</Mono> before writing; increment after reading. Never access memory below <Mono>$sp</Mono>.
                  </Body>
                </div>
              </Accordion>

              <Accordion title="Registers" theme={theme}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <Body theme={theme}>
                    MIPS has 32 general-purpose 32-bit registers plus two special registers HI and LO (used by multiply and divide). All registers are zero at program start.
                  </Body>
                  <div style={{ border: `1px solid ${theme.border}`, borderRadius: 10, overflow: 'hidden', marginTop: 8 }}>
                    <div style={{ display: 'flex', backgroundColor: `${theme.border}44`, padding: '7px 12px' }}>
                      {['Register', 'Number', 'Convention'].map((h, i) => (
                        <span key={h} style={{ flex: i === 0 ? 1 : i === 1 ? 0.6 : 2.5, fontSize: 11, fontWeight: 800, color: theme.subText, textTransform: 'uppercase', letterSpacing: 0.8 }}>{h}</span>
                      ))}
                    </div>
                    {REGISTERS.map((r, i) => (
                      <div key={r.name} style={{ display: 'flex', padding: '7px 12px', backgroundColor: i % 2 === 1 ? `${theme.border}22` : 'transparent' }}>
                        <span style={{ flex: 1, fontFamily: 'monospace', fontSize: 12, color: theme.linkColor }}>{r.name}</span>
                        <span style={{ flex: 0.6, fontFamily: 'monospace', fontSize: 12, color: theme.subText }}>{r.number}</span>
                        <span style={{ flex: 2.5, fontSize: 12, color: theme.subText }}>{r.convention}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Accordion>

              <Accordion title="Calling convention" theme={theme}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <Body theme={theme}>
                    MIPS uses the O32 calling convention. Arguments go in <Mono>$a0–$a3</Mono> (first four); additional arguments go on the stack. Return values go in <Mono>$v0</Mono> (and <Mono>$v1</Mono> for 64-bit results).
                  </Body>
                  <Body theme={theme}>
                    <strong style={{ color: theme.text }}>Caller-saved:</strong> <Mono>$t0–$t9</Mono>, <Mono>$a0–$a3</Mono>, <Mono>$v0–$v1</Mono>. The callee is free to overwrite these. Save them before a <Mono>jal</Mono> if you still need them.
                  </Body>
                  <Body theme={theme}>
                    <strong style={{ color: theme.text }}>Callee-saved:</strong> <Mono>$s0–$s7</Mono>, <Mono>$ra</Mono>, <Mono>$sp</Mono>, <Mono>$fp</Mono>. A function must restore these to their original values before returning.
                  </Body>
                  <Body theme={theme}>
                    Any function that calls another function must save <Mono>$ra</Mono> on the stack first, or the outer caller's return address is lost.
                  </Body>
                  <CodeBlock theme={theme} code={`# Leaf function (no calls inside — no frame needed)
square:
    mul  $v0, $a0, $a0
    jr   $ra

# Non-leaf function (calls another — must save $ra)
hypotenuse:
    addiu $sp, $sp, -16    # allocate frame
    sw    $ra,  12($sp)    # save return address
    sw    $s0,   8($sp)    # save callee-saved regs
    sw    $s1,   4($sp)

    move  $s0, $a0         # save args ($a0 clobbered by jal)
    move  $s1, $a1
    jal   square           # square(a)
    move  $s2, $v0         # save a²

    move  $a0, $s1
    jal   square           # square(b)
    add   $v0, $v0, $s2    # a² + b²

    lw    $s1,   4($sp)
    lw    $s0,   8($sp)
    lw    $ra,  12($sp)
    addiu $sp, $sp,  16    # deallocate frame
    jr    $ra`} />
                </div>
              </Accordion>

              <Accordion title="Assembler directives" theme={theme}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ border: `1px solid ${theme.border}`, borderRadius: 10, overflow: 'hidden', marginTop: 4 }}>
                    <div style={{ display: 'flex', backgroundColor: `${theme.border}44`, padding: '7px 12px' }}>
                      {['Directive', 'Description', 'Example'].map((h, i) => (
                        <span key={h} style={{ flex: i === 0 ? 1.4 : i === 1 ? 2 : 1.4, fontSize: 11, fontWeight: 800, color: theme.subText, textTransform: 'uppercase', letterSpacing: 0.8 }}>{h}</span>
                      ))}
                    </div>
                    {DIRECTIVES.map((d, i) => (
                      <div key={d.directive} style={{ display: 'flex', padding: '7px 12px', backgroundColor: i % 2 === 1 ? `${theme.border}22` : 'transparent' }}>
                        <span style={{ flex: 1.4, fontFamily: 'monospace', fontSize: 12, color: theme.linkColor }}>{d.directive}</span>
                        <span style={{ flex: 2, fontSize: 12, color: theme.subText }}>{d.desc}</span>
                        {d.example && <span style={{ flex: 1.4, fontFamily: 'monospace', fontSize: 11, color: theme.subText, opacity: 0.7 }}>{d.example}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              </Accordion>
            </>
          )}

          {/* Syscalls */}
          <Accordion title="Syscalls" theme={theme} badge={`${filteredSyscalls.length}`}>
            <div style={{ fontSize: 13, color: theme.subText, marginBottom: 10 }}>
              Set <Mono>$v0</Mono> to the service code, load arguments as shown, then execute <Mono>syscall</Mono>.
            </div>
            <div style={{ border: `1px solid ${theme.border}`, borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ display: 'flex', backgroundColor: `${theme.border}44`, padding: '7px 12px' }}>
                {['$v0', 'Arguments', 'Returns', 'Description'].map((h, i) => (
                  <span key={h} style={{
                    flex: i === 0 ? 0.4 : i === 1 ? 1.6 : i === 2 ? 1 : 2,
                    fontSize: 11, fontWeight: 800, color: theme.subText, textTransform: 'uppercase', letterSpacing: 0.8,
                  }}>{h}</span>
                ))}
              </div>
              {filteredSyscalls.map((s, i) => (
                <div key={s.code} style={{ display: 'flex', padding: '7px 12px', backgroundColor: i % 2 === 1 ? `${theme.border}22` : 'transparent', alignItems: 'flex-start' }}>
                  <span style={{ flex: 0.4, fontFamily: 'monospace', fontSize: 12, color: theme.linkColor }}>{s.code}</span>
                  <span style={{ flex: 1.6, fontFamily: 'monospace', fontSize: 11, color: theme.subText }}>{s.args}</span>
                  <span style={{ flex: 1, fontFamily: 'monospace', fontSize: 11, color: theme.subText }}>{s.ret ?? '—'}</span>
                  <span style={{ flex: 2, fontSize: 12, color: theme.subText }}>{s.desc}</span>
                </div>
              ))}
            </div>
          </Accordion>

          {/* Instructions — flat filtered list when searching */}
          {q && filteredInstructions.length > 0 && (
            <Accordion title="Instructions" theme={theme} badge={`${filteredInstructions.length}`} defaultOpen>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {filteredInstructions.map(i => <InstrRow key={i.syntax} i={i} theme={theme} />)}
              </div>
            </Accordion>
          )}

          {/* Instructions — grouped by category when not searching */}
          {!q && INSTRUCTION_CATEGORIES.map(({ key, label }) => {
            const group = INSTRUCTIONS.filter(i => i.category === key);
            if (group.length === 0) return null;
            return (
              <Accordion key={key} title={label} theme={theme} badge={`${group.length}`}>
                <div style={{ marginBottom: 10, fontSize: 12, color: theme.subText, lineHeight: '18px' }}>
                  Pseudo instructions are marked with <span style={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4, backgroundColor: `${TYPE_COLOR.P}22`, color: TYPE_COLOR.P }}>P</span> in every category. This accordion only holds misc aliases such as <Mono>move</Mono>; pseudo forms like <Mono>li</Mono>, <Mono>la</Mono>, and <Mono>blt</Mono> stay with their normal categories.
                </div>
                <div style={{ marginBottom: 6, fontSize: 12, color: theme.subText }}>
                  <span style={{ marginRight: 12 }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4, backgroundColor: `${TYPE_COLOR.R}22`, color: TYPE_COLOR.R }}>R</span>
                    {' '}register operands
                  </span>
                  <span style={{ marginRight: 12 }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4, backgroundColor: `${TYPE_COLOR.I}22`, color: TYPE_COLOR.I }}>I</span>
                    {' '}immediate
                  </span>
                  <span style={{ marginRight: 12 }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4, backgroundColor: `${TYPE_COLOR.J}22`, color: TYPE_COLOR.J }}>J</span>
                    {' '}jump
                  </span>
                  <span>
                    <span style={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4, backgroundColor: `${TYPE_COLOR.P}22`, color: TYPE_COLOR.P }}>P</span>
                    {' '}pseudo
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {group.map(i => <InstrRow key={i.syntax} i={i} theme={theme} />)}
                </div>
              </Accordion>
            );
          })}

        </div>
      </div>
    </div>
  );
}
