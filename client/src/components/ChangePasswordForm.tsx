import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { API_BASE_URL } from '../config/api';
import { useAuth } from '../context/AuthContext';

/**
 * Change password, for therapists' Settings → Account (patients have their own
 * settings page). Therapists had no way to change a password except "forgot
 * password" — the server endpoint existed, nothing called it.
 */
const ChangePasswordForm: React.FC = () => {
  const { user, setAuthToken } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (user?.signInMethod === 'google') {
    return (
      <p style={{ fontSize: 13, color: '#6b7573' }}>
        You sign in with Google, so there is no Veraawell password to change. Manage it in your Google account.
      </p>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next !== confirm) { setError('The new passwords do not match.'); return; }
    if (next === current) { setError('Choose a password different from your current one.'); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/update-password`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Could not change your password.');
      // The change ends every other signed-in session; this one gets a new token.
      if (data.token) setAuthToken(data.token);
      toast.success('Password changed. Other devices have been signed out.');
      setCurrent(''); setNext(''); setConfirm('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const field = (id: string, label: string, value: string, set: (v: string) => void, auto: string) => (
    <label htmlFor={id} className="block">
      <span style={{ display: 'block', fontSize: 12.5, fontWeight: 500, color: '#6b7573', marginBottom: 6 }}>{label}</span>
      <input
        id={id}
        type="password"
        autoComplete={auto}
        value={value}
        onChange={(e) => set(e.target.value)}
        required
        className="w-full px-4 py-3 rounded-xl focus:outline-none focus:ring-2"
        style={{ border: '1px solid rgba(27,43,46,.12)', background: 'rgba(255,255,255,.75)', fontSize: 14 }}
      />
    </label>
  );

  return (
    <form onSubmit={submit} className="space-y-4" aria-label="Change password">
      {field('current-password', 'Current password', current, setCurrent, 'current-password')}
      {field('new-password', 'New password', next, setNext, 'new-password')}
      {field('confirm-password', 'Confirm new password', confirm, setConfirm, 'new-password')}
      <p style={{ fontSize: 12, color: '#8a938f' }}>At least 6 characters.</p>
      {error && <p role="alert" style={{ fontSize: 13, color: '#b42318' }}>{error}</p>}
      <button
        type="submit"
        disabled={saving}
        className="px-6 py-2.5 rounded-full text-white text-sm font-semibold disabled:opacity-60"
        style={{ background: '#1f7a8c' }}
      >
        {saving ? 'Changing…' : 'Change password'}
      </button>
    </form>
  );
};

export default ChangePasswordForm;
