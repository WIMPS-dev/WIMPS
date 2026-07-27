import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { ThemeSwitch } from '../components/ThemeSwitch';
import { useTheme } from '../context/ThemeContext';

const DEFAULT_VSCODE_WEB_URL = 'https://wimps-vscode.pages.dev/';

function shouldEmbed(url: string) {
  try {
    const target = new URL(url, window.location.href);
    return target.hostname !== 'vscode.dev';
  } catch {
    return true;
  }
}

export default function VSCodeWebPage() {
  const { theme } = useTheme();
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSlowLoad, setIsSlowLoad] = useState(false);
  const vscodeUrl = import.meta.env.VITE_VSCODE_WEB_URL || DEFAULT_VSCODE_WEB_URL;
  const canEmbed = shouldEmbed(vscodeUrl);

  useEffect(() => {
    setIsLoaded(false);
    setIsSlowLoad(false);
    const timeout = window.setTimeout(() => setIsSlowLoad(true), 8000);
    return () => window.clearTimeout(timeout);
  }, [vscodeUrl]);

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: theme.bg,
        color: theme.text,
        display: 'grid',
        gridTemplateRows: '48px minmax(0, 1fr)',
      }}
    >
      <header
        style={{
          height: 48,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 14px 0 16px',
          borderBottom: `1px solid ${theme.border}`,
          backgroundColor: theme.bg,
        }}
      >
        <Link
          to="/"
          aria-label="WIMPS home"
          style={{ color: theme.text, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
        >
          <Logo size={22} />
        </Link>
        <nav style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link
            to="/classic"
            style={{
              color: theme.subText,
              textDecoration: 'none',
              fontSize: 13,
              fontWeight: 600,
              padding: '6px 10px',
              border: `1px solid ${theme.border}`,
              borderRadius: 8,
            }}
          >
            Classic IDE
          </Link>
          <Link
            to="/docs"
            style={{
              color: theme.subText,
              textDecoration: 'none',
              fontSize: 13,
              fontWeight: 600,
              padding: '6px 10px',
            }}
          >
            Docs
          </Link>
          <ThemeSwitch />
        </nav>
      </header>

      <main style={{ minHeight: 0, position: 'relative', backgroundColor: '#1e1e1e' }}>
        {!canEmbed ? (
          <div
            style={{
              minHeight: '100%',
              display: 'grid',
              placeItems: 'center',
              padding: 24,
              color: '#c9d1d9',
              backgroundColor: '#1e1e1e',
            }}
          >
            <section style={{ width: 'min(520px, 100%)' }}>
              <h1 style={{ color: '#f8fafc', fontSize: 28, lineHeight: 1.2, margin: '0 0 12px' }}>
                VS Code blocks embedded frames
              </h1>
              <p style={{ fontSize: 15, lineHeight: 1.6, margin: '0 0 24px' }}>
                vscode.dev must open in its own browser tab. Set `VITE_VSCODE_WEB_URL` to an embeddable
                self-hosted VS Code URL when the WIMPS extension host is ready.
              </p>
              <a
                href={vscodeUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 40,
                  padding: '0 16px',
                  borderRadius: 8,
                  backgroundColor: '#2563eb',
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 700,
                  textDecoration: 'none',
                }}
              >
                Open VS Code
              </a>
            </section>
          </div>
        ) : (
          <>
            {!isLoaded && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'grid',
                  placeItems: 'center',
                  color: '#c9d1d9',
                  backgroundColor: '#1e1e1e',
                  fontSize: 14,
                  zIndex: 1,
                }}
              >
                <div style={{ width: 'min(420px, calc(100% - 48px))', textAlign: 'center' }}>
                  <div style={{ marginBottom: isSlowLoad ? 12 : 0 }}>Loading VS Code...</div>
                  {isSlowLoad && (
                    <>
                      <p style={{ color: '#94a3b8', fontSize: 13, lineHeight: 1.5, margin: '0 0 14px' }}>
                        If this stays here, open VS Code directly, then refresh this page.
                      </p>
                      <a
                        href={vscodeUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          minHeight: 36,
                          padding: '0 14px',
                          borderRadius: 8,
                          backgroundColor: '#2563eb',
                          color: '#fff',
                          fontSize: 13,
                          fontWeight: 700,
                          textDecoration: 'none',
                        }}
                      >
                        Open VS Code
                      </a>
                    </>
                  )}
                </div>
              </div>
            )}
            <iframe
              title="WIMPS VS Code"
              src={vscodeUrl}
              onLoad={() => {
                setIsLoaded(true);
                setIsSlowLoad(false);
              }}
              allow="clipboard-read; clipboard-write; fullscreen"
              style={{
                width: '100%',
                height: '100%',
                border: 0,
                display: 'block',
                backgroundColor: '#1e1e1e',
              }}
            />
          </>
        )}
      </main>
    </div>
  );
}
