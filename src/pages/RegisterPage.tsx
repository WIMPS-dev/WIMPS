import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthSkeleton } from '../components/PageSkeletons';
import { usePageReady } from '../components/Skeleton';
import { ThemeSwitch } from '../components/ThemeSwitch';
import { useTheme } from '../context/ThemeContext';
import { migrateGuestFiles, saveAuthToken } from '../helpers/authStorage';

const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export default function RegisterPage() {
  const { theme } = useTheme();
  const ready = usePageReady();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Registration failed');

      // Auto-login so guest work migrates immediately
      const loginRes = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const loginData = await loginRes.json();
      if (!loginRes.ok) throw new Error(loginData.message ?? 'Login failed after registration');

      saveAuthToken(loginData.token);
      await migrateGuestFiles(loginData.token, API_BASE);
      navigate('/ide');
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  if (!ready) return <AuthSkeleton theme={theme} fields={3} />;

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
          <h1 style={{ color: theme.text, fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Create account</h1>
          <p style={{ color: theme.subText, fontSize: 14, marginBottom: 28 }}>
            Save your files and sync across devices.
          </p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {(['USERNAME', 'PASSWORD', 'CONFIRM PASSWORD'] as const).map((label, i) => (
              <div key={label}>
                <label style={{ display: 'block', color: theme.subText, fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                  {label}
                </label>
                <input
                  type={i === 0 ? 'text' : 'password'}
                  value={i === 0 ? username : i === 1 ? password : confirm}
                  onChange={e => [setUsername, setPassword, setConfirm][i](e.target.value)}
                  autoComplete={i === 0 ? 'username' : i === 1 ? 'new-password' : 'new-password'}
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
            ))}

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
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </form>

          <p style={{ color: theme.subText, fontSize: 13, textAlign: 'center', marginTop: 20 }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}>
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
