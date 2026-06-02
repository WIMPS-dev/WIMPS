import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ThemeSwitch } from '../components/ThemeSwitch';
import { useTheme } from '../context/ThemeContext';
import { clearAuthToken, getAuthToken } from '../helpers/authStorage';
import type { Theme } from '../theme/themes';

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------
const SYSCALLS: [string, string, string][] = [
  ['1',  '$v0=1, $a0=int',       'Print integer'],
  ['2',  '$v0=2, $f12=float',    'Print float'],
  ['3',  '$v0=3, $f12=double',   'Print double'],
  ['4',  '$v0=4, $a0=addr',      'Print null-terminated string'],
  ['5',  '$v0=5 → $v0=int',      'Read integer from console'],
  ['6',  '$v0=6 → $f0=float',    'Read float from console'],
  ['7',  '$v0=7 → $f0=double',   'Read double from console'],
  ['8',  '$v0=8 → string',       'Read string from console'],
  ['10', '$v0=10',               'Exit program'],
  ['11', '$v0=11, $a0=char',     'Print character'],
  ['12', '$v0=12 → $v0=char',    'Read character from console'],
];

const REGISTERS: [string, string, string][] = [
  ['$zero / $0', '0',          'Always zero — writes ignored'],
  ['$at / $1',   'Assembler',  'Reserved for assembler'],
  ['$v0–$v1',    '2–3',        'Function return values / syscall code'],
  ['$a0–$a3',    '4–7',        'Function arguments'],
  ['$t0–$t9',    '8–15,24–25', 'Temporaries — not preserved across calls'],
  ['$s0–$s7',    '16–23',      'Saved temporaries — preserved across calls'],
  ['$k0–$k1',    '26–27',      'Reserved for OS kernel'],
  ['$gp',        '28',         'Global pointer'],
  ['$sp',        '29',         'Stack pointer'],
  ['$fp',        '30',         'Frame pointer'],
  ['$ra',        '31',         'Return address'],
];

const INSTRUCTIONS: [string, string, string][] = [
  ['add $d,$s,$t',   'R',  'Signed addition; traps on overflow'],
  ['addu $d,$s,$t',  'R',  'Unsigned addition; no overflow trap'],
  ['addi $t,$s,imm', 'I',  'Add sign-extended immediate'],
  ['addiu $t,$s,imm','I',  'Add immediate, unsigned'],
  ['sub $d,$s,$t',   'R',  'Signed subtract'],
  ['subu $d,$s,$t',  'R',  'Unsigned subtract'],
  ['mul $d,$s,$t',   'R',  'Multiply, result to $d (pseudo)'],
  ['mult $s,$t',     'R',  'Signed multiply → HI:LO'],
  ['multu $s,$t',    'R',  'Unsigned multiply → HI:LO'],
  ['div $s,$t',      'R',  'Signed divide; quotient→LO, rem→HI'],
  ['divu $s,$t',     'R',  'Unsigned divide'],
  ['mfhi $d',        'R',  'Move HI to register'],
  ['mflo $d',        'R',  'Move LO to register'],
  ['and $d,$s,$t',   'R',  'Bitwise AND'],
  ['andi $t,$s,imm', 'I',  'Bitwise AND with zero-extended imm'],
  ['or $d,$s,$t',    'R',  'Bitwise OR'],
  ['ori $t,$s,imm',  'I',  'Bitwise OR with zero-extended imm'],
  ['xor $d,$s,$t',   'R',  'Bitwise XOR'],
  ['nor $d,$s,$t',   'R',  'Bitwise NOR'],
  ['sll $d,$t,sa',   'R',  'Shift left logical'],
  ['srl $d,$t,sa',   'R',  'Shift right logical'],
  ['sra $d,$t,sa',   'R',  'Shift right arithmetic'],
  ['slt $d,$s,$t',   'R',  'Set $d=1 if $s < $t (signed)'],
  ['sltu $d,$s,$t',  'R',  'Unsigned version of slt'],
  ['slti $t,$s,imm', 'I',  'Set if less than immediate (signed)'],
  ['lw $t,off($s)',  'I',  'Load word from memory'],
  ['sw $t,off($s)',  'I',  'Store word to memory'],
  ['lh $t,off($s)',  'I',  'Load halfword, sign-extend'],
  ['lhu $t,off($s)', 'I',  'Load halfword, zero-extend'],
  ['sh $t,off($s)',  'I',  'Store halfword'],
  ['lb $t,off($s)',  'I',  'Load byte, sign-extend'],
  ['lbu $t,off($s)', 'I',  'Load byte, zero-extend'],
  ['sb $t,off($s)',  'I',  'Store byte'],
  ['lui $t,imm',     'I',  'Load upper 16 bits of register'],
  ['beq $s,$t,lbl',  'I',  'Branch if equal'],
  ['bne $s,$t,lbl',  'I',  'Branch if not equal'],
  ['blt $s,$t,lbl',  'I',  'Branch if less than (pseudo)'],
  ['bgt $s,$t,lbl',  'I',  'Branch if greater than (pseudo)'],
  ['ble $s,$t,lbl',  'I',  'Branch if ≤ (pseudo)'],
  ['bge $s,$t,lbl',  'I',  'Branch if ≥ (pseudo)'],
  ['beqz $s,lbl',    'I',  'Branch if $s == 0 (pseudo)'],
  ['bnez $s,lbl',    'I',  'Branch if $s != 0 (pseudo)'],
  ['j label',        'J',  'Unconditional jump'],
  ['jal label',      'J',  'Jump and link — saves PC+4 to $ra'],
  ['jr $s',          'R',  'Jump to address in register'],
  ['jalr $s',        'R',  'Jump and link via register'],
  ['li $t,imm',      'P',  'Load immediate (pseudo)'],
  ['la $t,label',    'P',  'Load address (pseudo)'],
  ['move $d,$s',     'P',  'Copy register (pseudo)'],
  ['nop',            'P',  'No operation (pseudo)'],
];

const DIRECTIVES: [string, string][] = [
  ['.data',        'Begin data segment'],
  ['.text',        'Begin code segment'],
  ['.globl label', 'Make label globally visible'],
  ['.word n',      'Allocate one or more 32-bit words'],
  ['.half n',      'Allocate one or more 16-bit halfwords'],
  ['.byte n',      'Allocate one or more bytes'],
  ['.ascii "s"',   'Store string (no null terminator)'],
  ['.asciiz "s"',  'Store null-terminated string'],
  ['.float n',     'Allocate a single-precision float'],
  ['.double n',    'Allocate a double-precision float'],
  ['.space n',     'Allocate n bytes of zero-filled space'],
  ['.align n',     'Align next datum to 2ⁿ byte boundary'],
];

const EXAMPLE = `# QuadHex — like FizzBuzz, but for 4, 6, and 24
.data
str_quad:    .asciiz "Quad"
str_hex:     .asciiz "Hex"
str_quadhex: .asciiz "QuadHex"
str_newline: .asciiz "\\n"

.text
main:
    li   $t0, 1          # counter
    li   $t1, 40         # limit

loop:
    bgt  $t0, $t1, done

    # divisible by 24?
    li   $t2, 24
    div  $t0, $t2
    mfhi $t3
    beqz $t3, print_quadhex

    # divisible by 6?
    li   $t2, 6
    div  $t0, $t2
    mfhi $t3
    beqz $t3, print_hex

    # divisible by 4?
    li   $t2, 4
    div  $t0, $t2
    mfhi $t3
    beqz $t3, print_quad

    # otherwise: print the number
    li   $v0, 1
    move $a0, $t0
    syscall
    j    next

print_quadhex:
    li   $v0, 4
    la   $a0, str_quadhex
    syscall
    j    next

print_hex:
    li   $v0, 4
    la   $a0, str_hex
    syscall
    j    next

print_quad:
    li   $v0, 4
    la   $a0, str_quad
    syscall

next:
    li   $v0, 4
    la   $a0, str_newline
    syscall
    addi $t0, $t0, 1
    j    loop

done:
    li   $v0, 10
    syscall`;

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

// Toolbar button legend
function ButtonLegend({ theme }: { theme: Theme }) {
  const items: [string, string, string][] = [
    ['⚙', 'Assemble',  'Parse and compile. Errors show up in the Console.'],
    ['▶', 'Run',       'Start from scratch. Stops at the first breakpoint it hits, or runs to the end.'],
    ['⏭', 'Continue', 'Resume from where you\'re paused, to the next breakpoint or the end.'],
    ['←', 'Step Back', 'Undo one instruction and retract its output. Stays dimmed until you\'ve stepped at least once.'],
    ['→', 'Step',      'Execute one instruction.'],
    ['↺', 'Reset',     'Clear execution state and output. Breakpoints are preserved.'],
    ['↑', 'Upload',    'Open a .asm / .s / .txt file from disk into a new tab.'],
    ['↓', 'Download',  'Export the active tab to disk.'],
    ['💾', 'Save',     'Sync all tabs to your account. Only visible when signed in.'],
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
  const [search, setSearch] = useState('');
  const [isLoggedIn] = useState(() => !!getAuthToken());

  const q = search.trim().toLowerCase();

  const filteredInstructions = useMemo(() =>
    q ? INSTRUCTIONS.filter(([syn, , desc]) => syn.toLowerCase().includes(q) || desc.toLowerCase().includes(q)) : INSTRUCTIONS,
    [q]);

  const filteredSyscalls = useMemo(() =>
    q ? SYSCALLS.filter(([num, args, desc]) => num.includes(q) || args.toLowerCase().includes(q) || desc.toLowerCase().includes(q)) : SYSCALLS,
    [q]);

  const filteredDirectives = useMemo(() =>
    q ? DIRECTIVES.filter(([dir, desc]) => dir.toLowerCase().includes(q) || desc.toLowerCase().includes(q)) : DIRECTIVES,
    [q]);

  const handleLogout = () => {
    clearAuthToken();
    window.location.href = '/login';
  };

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
        <Link to="/" className="ide-nav-link" style={{ textDecoration: 'none', color: theme.text, fontWeight: 800, fontSize: 18 }}>WIMPS</Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <ThemeSwitch />
          <Link to="/ide" className="ide-sign-out" style={{ color: theme.subText, textDecoration: 'none', fontSize: 14, fontWeight: 600, padding: '6px 14px', border: `1px solid ${theme.border}`, borderRadius: 8 }}>IDE</Link>
          {isLoggedIn ? (
            <button type="button" onClick={handleLogout} className="ide-sign-out" style={{ backgroundColor: theme.card, color: theme.text, border: `1px solid ${theme.border}`, borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>Sign out</button>
          ) : (
            <Link to="/login" className="ide-sign-in" style={{ backgroundColor: '#2563eb', color: '#fff', textDecoration: 'none', padding: '6px 14px', borderRadius: 8, fontSize: 14, fontWeight: 600 }}>Sign in</Link>
          )}
        </div>
      </nav>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ maxWidth: 780, margin: '0 auto', padding: '32px 24px 80px' }}>

          {/* Header */}
          <h1 style={{ color: theme.text, fontSize: 28, fontWeight: 800, marginBottom: 6, textWrap: 'balance' } as React.CSSProperties}>Docs</h1>
          <p style={{ color: theme.subText, fontSize: 14, marginBottom: 28, maxWidth: '52ch' }}>
            A reference for using WIMPS and writing MIPS. Use the search below to filter instructions, syscalls, and directives.
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
                    Assemble is the prerequisite for everything else — write your code, hit ⚙, and check the Console for any errors. Once it compiles, the run controls turn blue. The active line gets a blue highlight as you step through; when you stop at a breakpoint you'll see which instruction is up next.
                  </Body>
                  <div style={{ marginTop: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: theme.subText, textTransform: 'uppercase', letterSpacing: 1 }}>Toolbar</span>
                    <ButtonLegend theme={theme} />
                  </div>
                </div>
              </Accordion>

              <Accordion title="Breakpoint debugging" theme={theme}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <Body theme={theme}>
                    Click any line number in the gutter to place a breakpoint. A red dot marks it, and the number turns red. Click the same line again to remove it. Breakpoints don't clear on Reset or Assemble — they stay until you remove them.
                  </Body>
                  <BpGuide theme={theme} />
                  <Body theme={theme}>
                    <strong style={{ color: theme.text }}>Run</strong> always restarts from the top and stops at the first breakpoint it hits. If you're already paused at a breakpoint and want to move to the next one, use <strong style={{ color: theme.text }}>Continue</strong> — it executes the current instruction and keeps going. <strong style={{ color: theme.text }}>Step</strong> moves one instruction at a time regardless of breakpoints.
                  </Body>
                  <Body theme={theme}>
                    <strong style={{ color: theme.text }}>Step Back</strong> rewinds one instruction. Registers revert to exactly how they were before that step, and any output it produced disappears from the Console. After a Run or Continue, the step-back history resets — you can only rewind over instructions you've explicitly stepped through.
                  </Body>
                </div>
              </Accordion>

              <Accordion title="Editor & tabs" theme={theme}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <Body theme={theme}>
                    Click <strong style={{ color: theme.text }}>+</strong> to open a new tab. Double-click a tab name to rename it. The <strong style={{ color: theme.text }}>×</strong> button closes the tab locally — it doesn't touch anything on the server.
                  </Body>
                  <Body theme={theme}>
                    If you're signed in, hovering a tab shows a red trash icon. That one actually deletes the file from your account. There's no undo, so use it deliberately.
                  </Body>
                  <Body theme={theme}>
                    Upload (↑) opens a .asm, .s, or .txt file from disk into a new tab. Download (↓) exports the active tab back to disk. Syntax is highlighted as you type.
                  </Body>
                </div>
              </Accordion>

              <Accordion title="Console & input" theme={theme}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <Body theme={theme}>
                    Program output lands in the Console as your code runs. When a read syscall fires ($v0 = 5, 8, or 12), the console goes interactive — a cursor appears and you can start typing. Press Enter to submit.
                  </Body>
                  <Body theme={theme}>
                    Under the hood, WIMPS replays the full execution each time you submit input, threading all accumulated inputs back through the program from the start. That means you don't lose earlier reads if your program needs multiple inputs.
                  </Body>
                </div>
              </Accordion>

              <Accordion title="Registers & memory" theme={theme}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <Body theme={theme}>
                    The Registers panel shows all 32 general-purpose registers, updated after each Step or Run. Toggle between hex and decimal display at the top of the panel.
                  </Body>
                  <Body theme={theme}>
                    The Memory panel shows 32 words of the data segment starting at 0x10010000 — the default starting address for .data. Use it to check load/store results and verify how your data is laid out in memory.
                  </Body>
                </div>
              </Accordion>

              <Accordion title="Saving & syncing" theme={theme}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <Body theme={theme}>
                    No account required. WIMPS writes your tabs to localStorage on every change and restores them when you come back. If you clear browser storage or switch machines, those files are gone.
                  </Body>
                  <Body theme={theme}>
                    Sign in to back files up server-side. Up to 15 files, 1 MB each. The 💾 Save button appears in the toolbar when you're logged in — hit it to push the current state. Files load automatically on your next login from any device.
                  </Body>
                </div>
              </Accordion>
            </>
          )}

          {/* ── MIPS ─────────────────────────────────────────────────────── */}
          <SectionDivider label="MIPS reference" theme={theme} />

          <Accordion title="Instructions" theme={theme} badge={`${filteredInstructions.length}`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {filteredInstructions.map(([syn, type, desc]) => (
                <div key={syn} className="docs-instr-row" style={{ borderBottom: `1px solid ${theme.border}22` }}>
                  <span className="docs-instr-syn" style={{ color: theme.linkColor }}>{syn}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
                    backgroundColor: `${TYPE_COLOR[type]}22`, color: TYPE_COLOR[type],
                    minWidth: 20, textAlign: 'center', flexShrink: 0,
                  }}>{type}</span>
                  <span style={{ fontSize: 13, color: theme.subText }}>{desc}</span>
                </div>
              ))}
            </div>
          </Accordion>

          <Accordion title="Syscalls" theme={theme} badge={`${filteredSyscalls.length}`}>
            <MiniTable rows={filteredSyscalls} headers={['Code', 'Args / Return', 'Description']} theme={theme} />
          </Accordion>

          {!q && (
            <Accordion title="Registers" theme={theme}>
              <MiniTable rows={REGISTERS} headers={['Name', 'Number', 'Convention']} theme={theme} />
            </Accordion>
          )}

          <Accordion title="Assembler directives" theme={theme} badge={`${filteredDirectives.length}`}>
            <MiniTable rows={filteredDirectives.map(([d, desc]) => [d, desc] as [string, string])} headers={['Directive', 'Description']} theme={theme} />
          </Accordion>

          {/* ── Example ──────────────────────────────────────────────────── */}
          {!q && (
            <>
              <SectionDivider label="Example" theme={theme} />
              <Accordion title="QuadHex — like FizzBuzz, but for 4, 6, and 24" theme={theme}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <Body theme={theme}>
                    Counts from 1 to 40, swapping multiples of 4 for "Quad", multiples of 6 for "Hex", and multiples of 24 for "QuadHex". Good for testing the step debugger — try setting a breakpoint on the loop label and watching <code style={{ fontFamily: 'monospace', fontSize: 12, backgroundColor: `${theme.border}66`, padding: '1px 4px', borderRadius: 3, color: theme.linkColor }}>$t0</code> tick up in the Registers panel.
                  </Body>
                  <div style={{ overflowX: 'auto' }}>
                    <pre style={{
                      fontFamily: 'monospace', fontSize: 12, lineHeight: '19px',
                      backgroundColor: `${theme.border}33`, color: theme.consoleText,
                      borderRadius: 10, padding: 14, margin: 0,
                    }}>
                      {EXAMPLE}
                    </pre>
                  </div>
                </div>
              </Accordion>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
