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
function Accordion({ title, children, theme, badge }: { title: string; children: React.ReactNode; theme: Theme; badge?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ border: `1px solid ${theme.border}`, borderRadius: 14, marginBottom: 10, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(p => !p)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          padding: '14px 16px',
          backgroundColor: theme.card,
          border: 'none',
          cursor: 'pointer',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: '#2563eb', fontSize: 20, fontWeight: 700, lineHeight: 1, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 180ms' }}>›</span>
          <span style={{ color: theme.text, fontSize: 15, fontWeight: 700 }}>{title}</span>
        </div>
        {badge && (
          <span style={{ backgroundColor: '#2563eb22', border: '1px solid #2563eb55', borderRadius: 8, padding: '2px 8px', fontSize: 11, fontWeight: 700, color: '#2563eb' }}>{badge}</span>
        )}
      </button>
      {open && (
        <div style={{ padding: '12px 16px 16px', borderTop: `1px solid ${theme.border}`, backgroundColor: theme.card }}>
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
          <span style={{ flex: 1.2, fontFamily: 'monospace', fontSize: 12, color: '#2563eb' }}>{a}</span>
          <span style={{ flex: 2, fontFamily: 'monospace', fontSize: 12, color: theme.subText }}>{b}</span>
          {c !== undefined && <span style={{ flex: 2, fontSize: 12, color: theme.subText }}>{c}</span>}
        </div>
      ))}
    </div>
  );
}

function Body({ children, theme }: { children: string; theme: Theme }) {
  return <p style={{ color: theme.subText, fontSize: 14, lineHeight: '22px', whiteSpace: 'pre-line' }}>{children}</p>;
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
    <div style={{ height: '100vh', backgroundColor: theme.bg, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Nav */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 24px', borderBottom: `1px solid ${theme.border}`, flexShrink: 0 }}>
        <Link to="/" style={{ textDecoration: 'none', color: theme.text, fontWeight: 800, fontSize: 18 }}>WIMPS</Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <ThemeSwitch />
          <Link to="/ide" style={{ color: theme.subText, textDecoration: 'none', fontSize: 14, fontWeight: 600, padding: '6px 14px', border: `1px solid ${theme.border}`, borderRadius: 8 }}>IDE</Link>
          {isLoggedIn ? (
            <button onClick={handleLogout} style={{ backgroundColor: theme.card, color: theme.text, border: `1px solid ${theme.border}`, borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>Sign out</button>
          ) : (
            <Link to="/login" style={{ backgroundColor: '#2563eb', color: '#fff', textDecoration: 'none', padding: '6px 14px', borderRadius: 8, fontSize: 14, fontWeight: 600 }}>Sign in</Link>
          )}
        </div>
      </nav>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ maxWidth: 780, margin: '0 auto', padding: '32px 24px 80px' }}>
          <h1 style={{ color: theme.text, fontSize: 28, fontWeight: 800, marginBottom: 4 }}>Documentation</h1>
          <p style={{ color: theme.subText, fontSize: 14, marginBottom: 28 }}>Everything you need to write MIPS assembly in WIMPS</p>

          {/* Search */}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search instructions, syscalls, directives..."
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

          {/* WIMPS section */}
          {!q && (
            <>
              <SectionDivider label="WIMPS" theme={theme} />

              <Accordion title="Getting Started" theme={theme}>
                <Body theme={theme}>
                  {'Write your MIPS assembly code in the Editor panel. The toolbar gives you four actions:\n\n• Assemble — parses and assembles your source. Errors appear in the Console.\n• Run — executes the assembled program until it terminates or waits for input.\n• Step — executes one instruction at a time so you can watch registers change.\n• Reset — clears execution state and output. You need to Assemble again before running.'}
                </Body>
              </Accordion>

              <Accordion title="Editor & Tabs" theme={theme}>
                <Body theme={theme}>
                  {'The editor supports multiple files via tabs. Click the + button to open a new tab. Double-click a tab name to rename it. Click ✕ to close a tab (a minimum of one tab stays open).\n\nFiles are saved automatically to browser storage. Log in to sync across devices.'}
                </Body>
              </Accordion>

              <Accordion title="Console & Input" theme={theme}>
                <Body theme={theme}>
                  {'Program output appears in the Console panel. When your program executes a read syscall (5, 8, 12), the console shows a prompt. Type your input and press Enter or click Submit. WIMPS replays execution with all prior inputs, so every value is always available.'}
                </Body>
              </Accordion>

              <Accordion title="Memory Inspector" theme={theme}>
                <Body theme={theme}>
                  {'The Memory panel shows 32 words of the data segment starting at 0x10010000 after each Run or Step. Use this to verify load/store operations and check .data layout.'}
                </Body>
              </Accordion>

              <Accordion title="Saving & Syncing" theme={theme}>
                <Body theme={theme}>
                  {'Without an account, tabs are saved to localStorage and persist between browser sessions. With an account, press Save to sync up to 15 tabs (1 MB each) to the cloud so you can access them from any device.'}
                </Body>
              </Accordion>
            </>
          )}

          {/* MIPS section */}
          <SectionDivider label="MIPS" theme={theme} />

          {/* Instructions */}
          <Accordion title="Instructions" theme={theme} badge={`${filteredInstructions.length}`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {filteredInstructions.map(([syn, type, desc]) => (
                <div key={syn} style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '6px 0', borderBottom: `1px solid ${theme.border}22` }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#2563eb', minWidth: 180 }}>{syn}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
                    backgroundColor: `${TYPE_COLOR[type]}22`, color: TYPE_COLOR[type], minWidth: 20, textAlign: 'center',
                  }}>{type}</span>
                  <span style={{ fontSize: 13, color: theme.subText }}>{desc}</span>
                </div>
              ))}
            </div>
          </Accordion>

          {/* Syscalls */}
          <Accordion title="Syscalls" theme={theme} badge={`${filteredSyscalls.length}`}>
            <MiniTable rows={filteredSyscalls} headers={['Code', 'Args / Return', 'Description']} theme={theme} />
          </Accordion>

          {/* Registers */}
          {!q && (
            <Accordion title="Registers" theme={theme}>
              <MiniTable rows={REGISTERS} headers={['Name', 'Number', 'Convention']} theme={theme} />
            </Accordion>
          )}

          {/* Directives */}
          <Accordion title="Assembler Directives" theme={theme} badge={`${filteredDirectives.length}`}>
            <MiniTable rows={filteredDirectives.map(([d, desc]) => [d, desc] as [string, string])} headers={['Directive', 'Description']} theme={theme} />
          </Accordion>

          {/* Example */}
          {!q && (
            <>
              <SectionDivider label="Example" theme={theme} />
              <Accordion title="QuadHex — like FizzBuzz, but for 4, 6, and 24" theme={theme}>
                <Body theme={theme}>{'Prints 1–40, replacing multiples of 4 with "Quad", multiples of 6 with "Hex", and multiples of 24 with "QuadHex".'}</Body>
                <div style={{ overflowX: 'auto', marginTop: 8 }}>
                  <pre style={{
                    fontFamily: 'monospace', fontSize: 12, lineHeight: '19px',
                    backgroundColor: `${theme.border}33`, color: theme.consoleText,
                    borderRadius: 10, padding: 14,
                  }}>
                    {EXAMPLE}
                  </pre>
                </div>
              </Accordion>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
