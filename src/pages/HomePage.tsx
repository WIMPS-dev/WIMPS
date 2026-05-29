import React from 'react';
import { Link } from 'react-router-dom';
import { ThemeSwitch } from '../components/ThemeSwitch';
import { useTheme } from '../context/ThemeContext';

const FEATURES = [
  {
    title: 'Full MIPS Instruction Set',
    body: 'Supports all R-type, I-type, and J-type instructions, plus syscalls compatible with MARS. Simulate MIPS assembly right from your browser — no install required.',
  },
  {
    title: 'Interactive Register View',
    body: 'Track all 32 registers in real time as your program runs, with both hex and decimal display modes.',
  },
  {
    title: 'Step-Through Simulation',
    body: 'Step instruction-by-instruction through your program and inspect registers and memory after every step.',
  },
  {
    title: 'Memory Inspector',
    body: 'Browse the simulated memory space and inspect individual addresses around memory relevant to your program.',
  },
  {
    title: 'Syntax Highlighting',
    body: 'Different MIPS syntax elements are highlighted as you type, just like your favorite IDE.',
  },
  {
    title: 'Runs Anywhere',
    body: 'Pure web — works on desktop, tablet, or mobile. Saves to browser storage, or log in to sync across devices.',
  },
];

export default function HomePage() {
  const { theme } = useTheme();

  return (
    <div style={{ minHeight: '100vh', backgroundColor: theme.bg }}>
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
      }}>
        <span style={{ color: theme.text, fontWeight: 800, fontSize: 20 }}>WIMPS</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <Link to="/docs" style={{ color: theme.subText, textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>Docs</Link>
          <Link to="/login" style={{ color: theme.subText, textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>Sign in</Link>
          <Link to="/ide" style={{
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

      {/* Hero */}
      <section style={{ textAlign: 'center', padding: '100px 24px 80px' }}>
        <div style={{
          display: 'inline-block',
          backgroundColor: '#2563eb22',
          color: '#60a5fa',
          border: '1px solid #2563eb44',
          borderRadius: 999,
          padding: '4px 14px',
          fontSize: 13,
          fontWeight: 600,
          marginBottom: 24,
        }}>
          MIPS Assembly Simulator
        </div>
        <h1 style={{
          color: theme.text,
          fontSize: 'clamp(36px, 6vw, 64px)',
          fontWeight: 800,
          lineHeight: 1.1,
          marginBottom: 24,
          maxWidth: 720,
          margin: '0 auto 24px',
        }}>
          Write, run, and debug<br />MIPS assembly in your browser
        </h1>
        <p style={{
          color: theme.subText,
          fontSize: 18,
          maxWidth: 520,
          margin: '0 auto 40px',
          lineHeight: 1.6,
        }}>
          A full-featured MIPS simulator with syntax highlighting, step-through execution, register and memory inspection — no install needed.
        </p>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/ide" style={{
            backgroundColor: '#2563eb',
            color: '#fff',
            textDecoration: 'none',
            padding: '14px 32px',
            borderRadius: 10,
            fontSize: 16,
            fontWeight: 700,
          }}>
            Launch IDE →
          </Link>
          <a href="https://github.com/DashellF/WIMPS" target="_blank" rel="noreferrer" style={{
            backgroundColor: theme.card,
            color: theme.text,
            textDecoration: 'none',
            padding: '14px 32px',
            borderRadius: 10,
            fontSize: 16,
            fontWeight: 600,
            border: `1px solid ${theme.border}`,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <svg height="20" width="20" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            GitHub
          </a>
          <Link to="/docs" style={{
            backgroundColor: theme.card,
            color: theme.text,
            textDecoration: 'none',
            padding: '14px 32px',
            borderRadius: 10,
            fontSize: 16,
            fontWeight: 600,
            border: `1px solid ${theme.border}`,
          }}>
            Browse Docs
          </Link>
        </div>
      </section>

      {/* Features */}
      <section style={{ padding: '60px 32px 100px', maxWidth: 1100, margin: '0 auto' }}>
        <h2 style={{ color: theme.text, fontSize: 28, fontWeight: 700, textAlign: 'center', marginBottom: 48 }}>
          Everything you need to learn MIPS
        </h2>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 24,
        }}>
          {FEATURES.map(f => (
            <div
              key={f.title}
              style={{
                backgroundColor: theme.card,
                border: `1px solid ${theme.border}`,
                borderRadius: 12,
                padding: 24,
              }}
            >
              <h3 style={{ color: theme.text, fontSize: 16, fontWeight: 700, marginBottom: 10 }}>{f.title}</h3>
              <p style={{ color: theme.subText, fontSize: 14, lineHeight: 1.6 }}>{f.body}</p>
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
        <h2 style={{ color: theme.text, fontSize: 28, fontWeight: 700, marginBottom: 16 }}>Ready to start?</h2>
        <p style={{ color: theme.subText, fontSize: 16, marginBottom: 32 }}>
          Jump into the IDE — no account needed.
        </p>
        <Link to="/ide" style={{
          backgroundColor: '#2563eb',
          color: '#fff',
          textDecoration: 'none',
          padding: '14px 36px',
          borderRadius: 10,
          fontSize: 16,
          fontWeight: 700,
        }}>
          Open IDE
        </Link>
      </section>

      <footer style={{
        borderTop: `1px solid ${theme.border}`,
        padding: '20px 32px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 12,
      }}>
        <span style={{ color: theme.subText, fontSize: 13 }}>WIMPS — Web Interactive MIPS Playground & Simulator</span>
        <div style={{ display: 'flex', gap: 20 }}>
          <Link to="/docs" style={{ color: theme.subText, textDecoration: 'none', fontSize: 13 }}>Docs</Link>
          <Link to="/login" style={{ color: theme.subText, textDecoration: 'none', fontSize: 13 }}>Sign in</Link>
          <Link to="/register" style={{ color: theme.subText, textDecoration: 'none', fontSize: 13 }}>Register</Link>
        </div>
      </footer>
    </div>
  );
}
