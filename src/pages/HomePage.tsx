import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { HomeSkeleton } from '../components/PageSkeletons';
import { usePageReady } from '../components/Skeleton';
import { ThemeSwitch } from '../components/ThemeSwitch';
import { useTheme } from '../context/ThemeContext';
import { clearAuthToken, getAuthToken } from '../helpers/authStorage';

interface MockPart { text: string; color: string; }
interface MockReg  { name: string; value: string; changed: boolean; }

// IDE preview mockup — always rendered in dark theme colors
const MOCK_LINES: MockPart[][] = [
  [{ text: '.data', color: '#f472b6' }],
  [{ text: 'msg:', color: '#f8fafc' }, { text: ' .asciiz', color: '#f472b6' }, { text: ' "Hi!"', color: '#f8fafc' }],
  [],
  [{ text: '.text', color: '#f472b6' }],
  // active line (index 4)
  [{ text: 'main:', color: '#f8fafc' }, { text: ' li ', color: '#60a5fa' }, { text: '$v0', color: '#fb923c' }, { text: ', 4', color: '#f8fafc' }],
  [{ text: '      ', color: 'transparent' }, { text: 'la ', color: '#60a5fa' }, { text: '$a0', color: '#fb923c' }, { text: ', msg', color: '#f8fafc' }],
  [{ text: '      syscall', color: '#60a5fa' }],
  [{ text: '      ', color: 'transparent' }, { text: 'li ', color: '#60a5fa' }, { text: '$v0', color: '#fb923c' }, { text: ', 10', color: '#f8fafc' }],
  [{ text: '      syscall', color: '#60a5fa' }],
];

const MOCK_REGISTERS: MockReg[] = [
  { name: '$zero', value: '0x00000000', changed: false },
  { name: '$v0',   value: '0x00000004', changed: true  },
  { name: '$a0',   value: '0x10010000', changed: true  },
  { name: '$t0',   value: '0x00000000', changed: false },
  { name: '$sp',   value: '0x7FFFEFFC', changed: false },
];

const CAPABILITIES = [
  {
    title: 'Full MIPS instruction set',
    body: 'All R-, I-, and J-type instructions, plus every MARS-compatible syscall. If your lab assignment runs in MARS, it runs here.',
  },
  {
    title: 'Syntax highlighting and tabbed files',
    body: 'The editor highlights instructions, registers, directives, and comments as you type. Open multiple .asm files in tabs and rename by double-clicking.',
  },
  {
    title: 'Works without an account',
    body: 'Files auto-save to browser storage. Sign in to sync across devices. No account required.',
  },
];

const ACTIVE_LINE = 4;

const prefersReducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function HomePage() {
  const { theme } = useTheme();
  const ready = usePageReady();

  const [isLoggedIn] = useState(() => !!getAuthToken());

  const handleLogout = () => {
    clearAuthToken();
    window.location.href = '/login';
  };

  if (!ready) return <HomeSkeleton theme={theme} />;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: theme.bg }}>
      <a className="skip-link" href="#main-content">Skip to content</a>

      {/* Nav */}
      <nav style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 32px',
        borderBottom: `1px solid ${theme.border}`,
        position: 'sticky',
        top: 0,
        backgroundColor: theme.bg,
        zIndex: 50,
        '--hp-ink': theme.text,
      } as React.CSSProperties}>
        <span style={{ color: theme.text, fontWeight: 800, fontSize: 20 }}><Logo size={24} /></span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <Link to="/docs" className="home-nav-link" style={{ color: theme.subText, textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>Docs</Link>
          {/* TEMP: login disabled
          {isLoggedIn ? (
            <button type="button" onClick={handleLogout} className="home-nav-link" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: theme.subText, fontSize: 14, fontWeight: 500, fontFamily: 'inherit' }}>Sign out</button>
          ) : (
            <Link to="/login" className="home-nav-link" style={{ color: theme.subText, textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>Sign in</Link>
          )}
          */}
          <Link to="/ide" className="home-nav-btn" style={{
            backgroundColor: '#2563eb',
            color: '#fff',
            textDecoration: 'none',
            padding: '8px 18px',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
          }}>
            Open IDE
          </Link>
          <ThemeSwitch />
        </div>
      </nav>

      <main id="main-content">

      {/* Hero */}
      <section style={{ textAlign: 'center', padding: '100px 24px 80px' }}>
        <h1 className="text-balance" style={{
          color: theme.text,
          fontSize: 'clamp(36px, 6vw, 64px)',
          fontWeight: 800,
          lineHeight: 1.1,
          marginBottom: 24,
          maxWidth: 720,
          margin: '0 auto 24px',
        } as React.CSSProperties}>
          Write, run, and debug<br />MIPS assembly in your browser
        </h1>
        <p style={{
          color: theme.subText,
          fontSize: 18,
          maxWidth: 520,
          margin: '0 auto 40px',
          lineHeight: 1.6,
        }}>
          A MIPS simulator with step-through debugging and live register inspection. No install, no account.
        </p>

        {/* Single primary CTA */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <Link
            to="/ide"
            className="home-cta-primary"
            style={{
              backgroundColor: '#2563eb',
              color: '#fff',
              textDecoration: 'none',
              padding: '14px 36px',
              borderRadius: 10,
              fontSize: 17,
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            Launch IDE →
          </Link>
        </div>

        {/* Secondary text links */}
        <div style={{ display: 'flex', gap: 28, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
          <a
            href="https://github.com/WIMPS-dev/WIMPS"
            target="_blank"
            rel="noreferrer"
            className="home-link-muted"
            style={{ color: theme.subText, textDecoration: 'none', fontSize: 14, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <svg height="15" width="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            View on GitHub
          </a>
          <Link
            to="/docs"
            className="home-link-muted"
            style={{ color: theme.subText, textDecoration: 'none', fontSize: 14, fontWeight: 500 }}
          >
            Browse docs
          </Link>
        </div>
      </section>

      {/* Demo video */}
      <section style={{ padding: '0 32px 80px', maxWidth: 960, margin: '0 auto' }}>
        <div style={{
          borderRadius: 12,
          overflow: 'hidden',
          border: '1px solid #1f2937',
          backgroundColor: '#0b1020',
          lineHeight: 0,
          boxShadow: 'none',
        }}>
          <video
            src="/WIMPS%20Demo%20Video.mp4"
            autoPlay={!prefersReducedMotion}
            muted
            loop
            playsInline
            controls
            style={{ width: '100%', display: 'block' }}
            aria-label="WIMPS IDE demo: assembling and stepping through a MIPS program"
          />
        </div>
      </section>

      {/* Features */}
      <section style={{ padding: '60px 32px 100px', maxWidth: 1100, margin: '0 auto' }}>

        {/* Main asymmetric feature panel */}
        <div className="home-feature-main">

          {/* Left: text */}
          <div>
            <h2 className="text-balance" style={{
              color: theme.text,
              fontSize: 30,
              fontWeight: 700,
              lineHeight: 1.2,
              marginBottom: 18,
            } as React.CSSProperties}>
              Debug instruction by instruction
            </h2>
            <p style={{
              color: theme.subText,
              fontSize: 16,
              lineHeight: 1.7,
              marginBottom: 14,
              maxWidth: '42ch',
            }}>
              Assemble your program, then step through it one instruction at a time.
              All 32 registers update after each step. Switch between hex and decimal at any point.
            </p>
            <p style={{
              color: theme.subText,
              fontSize: 15,
              lineHeight: 1.6,
              marginBottom: 36,
              maxWidth: '42ch',
            }}>
              The active line stays highlighted. Run to completion or stop at any instruction to inspect registers and memory.
            </p>
            <Link
              to="/ide"
              className="home-feature-link"
              style={{
                color: theme.linkColor,
                textDecoration: 'none',
                fontSize: 14,
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              Try it, no account needed →
            </Link>
          </div>

          {/* Right: IDE mockup */}
          <div style={{
            backgroundColor: '#0b1020',
            border: '1px solid #1f2937',
            borderRadius: 12,
            overflow: 'hidden',
            userSelect: 'none',
            pointerEvents: 'none',
          }}>
            {/* Toolbar */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              height: 40,
              backgroundColor: '#1f2937',
              borderBottom: '1px solid #0b1020',
              padding: '0 12px',
              gap: 5,
            }}>
              <span style={{ color: '#f8fafc', fontWeight: 800, fontSize: 13, marginRight: 6, flexShrink: 0 }}>WIMPS</span>
              {['main.asm', 'fib.asm'].map((name, i) => (
                <div key={name} style={{
                  padding: '0 8px',
                  height: 27,
                  display: 'flex',
                  alignItems: 'center',
                  borderRadius: 5,
                  border: '1px solid #0b1020',
                  backgroundColor: i === 0 ? '#1e293b' : '#111827',
                  fontSize: 11,
                  color: i === 0 ? '#f8fafc' : '#94a3b8',
                  flexShrink: 0,
                }}>{name}</div>
              ))}
              <div style={{
                marginLeft: 'auto',
                display: 'flex',
                gap: 2,
                alignItems: 'center',
                backgroundColor: '#0b1020',
                border: '1px solid #1f2937',
                borderRadius: 6,
                padding: '0 5px',
                height: 28,
                flexShrink: 0,
              }}>
                {([
                  { sym: '⚙', on: false },
                  { sym: '▶', on: true  },
                  { sym: '→', on: true  },
                  { sym: '↺', on: false },
                ] as const).map(({ sym, on }) => (
                  <div key={sym} style={{
                    width: 22, height: 22, borderRadius: 4,
                    backgroundColor: on ? '#2563eb' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#f8fafc', fontSize: 11,
                  }}>{sym}</div>
                ))}
              </div>
            </div>

            {/* Editor + Registers */}
            <div style={{ display: 'flex', height: 218 }}>
              {/* Gutter */}
              <div style={{
                width: 34,
                backgroundColor: '#0b1020',
                borderRight: '1px solid #1f2937',
                paddingTop: 12,
                flexShrink: 0,
              }}>
                {MOCK_LINES.map((_, i) => (
                  <div key={i} style={{
                    textAlign: 'right',
                    paddingRight: 8,
                    lineHeight: '20px',
                    fontFamily: 'monospace',
                    fontSize: 11,
                    color: i === ACTIVE_LINE ? '#f8fafc' : '#334155',
                    fontWeight: i === ACTIVE_LINE ? 700 : 400,
                    backgroundColor: i === ACTIVE_LINE ? '#2563eb44' : 'transparent',
                  }}>{i + 1}</div>
                ))}
              </div>

              {/* Code */}
              <div style={{ flex: 1, minWidth: 0, paddingTop: 12, paddingLeft: 12, overflow: 'hidden' }}>
                {MOCK_LINES.map((parts, i) => (
                  <div key={i} style={{
                    lineHeight: '20px',
                    fontFamily: 'monospace',
                    fontSize: 12,
                    backgroundColor: i === ACTIVE_LINE ? '#2563eb22' : 'transparent',
                    marginLeft: i === ACTIVE_LINE ? -12 : 0,
                    paddingLeft: i === ACTIVE_LINE ? 12 : 0,
                    whiteSpace: 'nowrap',
                  }}>
                    {parts.length === 0
                      ? <span>&nbsp;</span>
                      : parts.map((part, j) => (
                          <span key={j} style={{ color: part.color }}>{part.text}</span>
                        ))}
                  </div>
                ))}
              </div>

              {/* Register panel */}
              <div style={{
                width: 148,
                borderLeft: '1px solid #1f2937',
                backgroundColor: '#111827',
                padding: '10px 8px',
                flexShrink: 0,
                overflow: 'hidden',
              }}>
                <div style={{
                  fontSize: 10, fontWeight: 600, color: '#94a3b8',
                  letterSpacing: '0.5px', textTransform: 'uppercase',
                  marginBottom: 8,
                }}>
                  Registers
                </div>
                {MOCK_REGISTERS.map(reg => (
                  <div key={reg.name} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '3px 0',
                    borderBottom: '1px solid rgba(31,41,55,0.5)',
                    fontFamily: 'monospace',
                    fontSize: 10,
                  }}>
                    <span style={{ color: reg.changed ? '#f8fafc' : '#475569', fontWeight: reg.changed ? 700 : 400 }}>
                      {reg.name}
                    </span>
                    <span style={{ color: reg.changed ? '#60a5fa' : '#334155' }}>
                      {reg.value}
                    </span>
                  </div>
                ))}
                <div style={{ color: '#334155', fontSize: 9, marginTop: 6 }}>+ 27 more</div>
              </div>
            </div>

            {/* Console strip */}
            <div style={{
              borderTop: '1px solid #1f2937',
              backgroundColor: '#0b1020',
              padding: '8px 12px',
              fontFamily: 'monospace',
              fontSize: 11,
              color: '#cbd5e1',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              minHeight: 32,
            }}>
              <span style={{ color: '#334155', fontSize: 10, fontWeight: 600, flexShrink: 0 }}>output</span>
              <span>Hi!</span>
              <span style={{
                display: 'inline-block',
                width: '0.5em',
                height: '1em',
                backgroundColor: '#2563eb',
                verticalAlign: 'text-bottom',
              }} />
            </div>
          </div>
        </div>

        {/* Capability strip — no cards, no boxes */}
        <div className="home-capability-grid" style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 52 }}>
          {CAPABILITIES.map(cap => (
            <div key={cap.title}>
              <div style={{
                fontSize: 14,
                fontWeight: 700,
                color: theme.text,
                marginBottom: 8,
              }}>
                {cap.title}
              </div>
              <p style={{
                fontSize: 14,
                color: theme.subText,
                lineHeight: 1.6,
                margin: 0,
              }}>
                {cap.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{
        textAlign: 'center',
        padding: '60px 24px 100px',
        borderTop: `1px solid ${theme.border}`,
      }}>
        <h2 style={{ color: theme.text, fontSize: 28, fontWeight: 700, marginBottom: 16 }}>Start writing</h2>
        <p style={{ color: theme.subText, fontSize: 16, marginBottom: 32 }}>
          No account needed.
        </p>
        <Link to="/ide" className="home-cta-primary" style={{
          backgroundColor: '#2563eb',
          color: '#fff',
          textDecoration: 'none',
          padding: '14px 36px',
          borderRadius: 10,
          fontSize: 16,
          fontWeight: 700,
          display: 'inline-block',
        }}>
          Open IDE
        </Link>
      </section>

      {/* About / Team */}
      <section style={{
        maxWidth: 880,
        margin: '0 auto',
        padding: '72px 24px 96px',
        borderTop: `1px solid ${theme.border}`,
      }}>
        <h2 style={{ color: theme.text, fontSize: 28, fontWeight: 700, marginBottom: 16, textAlign: 'center' }}>
          About the team
        </h2>
        <p style={{ color: theme.subText, fontSize: 16, lineHeight: 1.7, maxWidth: 680, margin: '0 auto 40px', textAlign: 'center' }}>
          We built WIMPS to make learning MIPS assembly both accessible and approachable. Most simulators are
          desktop-only, inconvenient to install, and discouraging to use for students taking their first
          computer-architecture course. WIMPS runs entirely in the browser, with write, assemble,
          and step through code with live registers, memory, and a bitmap display, no setup required.
        </p>
        <p style={{ color: theme.subText, fontSize: 16, lineHeight: 1.7, maxWidth: 680, margin: '0 auto 40px', textAlign: 'center' }}>

          Our focus is on meeting needs without being overwhelming,
          and giving students a truly convenient experience in a world of forced signups and borderline bloatware.
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 16,
          marginBottom: 40,
        }}>
          {[
            { name: 'Dashell Finn', role: 'Backend & Systems' },
            { name: 'Matthew Wang', role: 'Lead Developer' },
            { name: 'Tarran Thomas', role: 'UI & UX' },
          ].map((member, i) => (
            <div key={i} style={{
              border: `1px solid ${theme.border}`,
              borderRadius: 12,
              padding: '18px 20px',
              backgroundColor: theme.card,
            }}>
              <div style={{ color: theme.text, fontSize: 16, fontWeight: 700 }}>{member.name}</div>
              <div style={{ color: theme.subText, fontSize: 14, marginTop: 4 }}>{member.role}</div>
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ color: theme.subText, fontSize: 14 }}>
            Faculty advisor: <span style={{ color: theme.text, fontWeight: 600 }}>Professor Dominic Dabish</span>
          </p>
          <p style={{ color: theme.subText, fontSize: 14 }}>
            Built on the{' '}
            <a
              href="https://github.com/specy/mars"
              target="_blank"
              rel="noopener noreferrer"
              className="home-nav-link"
              style={{ color: theme.linkColor, textDecoration: 'none', fontWeight: 600 }}
            >
              @specy/mips
            </a>{' '}
            library — a MARS-compatible MIPS simulator that powers assembly and execution under the hood.
          </p>
        </div>
      </section>

      </main>

      <footer style={{
        borderTop: `1px solid ${theme.border}`,
        padding: '20px 32px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 12,
      }}>
        <span style={{ color: theme.subText, fontSize: 13 }}>WIMPS · Web Interactive MIPS Playground & Simulator</span>
        <div style={{ display: 'flex', gap: 20 }}>
          <Link to="/docs" className="home-link-muted" style={{ color: theme.subText, textDecoration: 'none', fontSize: 13 }}>Docs</Link>
          {/* TEMP: login disabled per advisor (data privacy) — re-enable later
          {isLoggedIn ? (
            <button type="button" onClick={handleLogout} className="home-link-muted" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: theme.subText, fontSize: 13, fontFamily: 'inherit' }}>Sign out</button>
          ) : (
            <Link to="/login" className="home-link-muted" style={{ color: theme.subText, textDecoration: 'none', fontSize: 13 }}>Sign in</Link>
          )}
          {!isLoggedIn && (
            <Link to="/register" className="home-link-muted" style={{ color: theme.subText, textDecoration: 'none', fontSize: 13 }}>Register</Link>
          )}
          */}
        </div>
      </footer>
    </div>
  );
}
