import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ThemeSwitch } from '../components/ThemeSwitch';
import { useTheme } from '../context/ThemeContext';
import { saveAuthToken } from '../helpers/authStorage';

const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export default function LoginPage() {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? 'Login failed');
      saveAuthToken(data.token);
      navigate('/ide');
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: theme.bg, display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: `1px solid ${theme.border}` }}>
        <Link to="/" style={{ textDecoration: 'none', color: theme.text, fontWeight: 700, fontSize: 18 }}>WIMPS</Link>
        <ThemeSwitch />
      </nav>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{
          width: '100%',
          maxWidth: 380,
          backgroundColor: theme.card,
          border: `1px solid ${theme.border}`,
          borderRadius: 16,
          padding: 32,
        }}>
          <h1 style={{ color: theme.text, fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Sign in</h1>
          <p style={{ color: theme.subText, fontSize: 14, marginBottom: 28 }}>
            Access your saved files and settings.
          </p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', color: theme.subText, fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                USERNAME
              </label>
              <input
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoComplete="username"
                style={{
                  width: '100%',
                  backgroundColor: theme.bg,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 8,
                  padding: '10px 12px',
                  fontSize: 14,
                  color: theme.text,
                  outline: 'none',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', color: theme.subText, fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                PASSWORD
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                style={{
                  width: '100%',
                  backgroundColor: theme.bg,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 8,
                  padding: '10px 12px',
                  fontSize: 14,
                  color: theme.text,
                  outline: 'none',
                }}
              />
            </div>

            {error && (
              <p style={{ color: '#ef4444', fontSize: 13, textAlign: 'center' }}>{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                backgroundColor: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '12px',
                fontSize: 15,
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
                marginTop: 4,
              }}
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <p style={{ color: theme.subText, fontSize: 13, textAlign: 'center', marginTop: 20 }}>
            No account?{' '}
            <Link to="/register" style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}>
              Register
            </Link>
          </p>
          <p style={{ color: theme.subText, fontSize: 13, textAlign: 'center', marginTop: 8 }}>
            <Link to="/ide" style={{ color: theme.subText, textDecoration: 'none' }}>
              Continue without signing in →
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
