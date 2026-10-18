import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiLock } from 'react-icons/fi';
import { ADMIN_MIN_PASSWORD_LENGTH, adminFetch, errorMessage } from '../utils/adminApi';
import AdminAuthLayout, { FormError, IconField, adminSubmitClass } from '../components/admin/AdminAuthLayout';

/** The page the admin reset email links to: /admin/reset-password/:token. */
const AdminResetPasswordPage: React.FC = () => {
  const { token = '' } = useParams<{ token: string }>();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < ADMIN_MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${ADMIN_MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setSubmitting(true);
    try {
      await adminFetch(`/admin/auth/reset-password/${encodeURIComponent(token)}`, {
        method: 'POST',
        body: { password },
        sessionAware: false,
      });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err, "Couldn't reset your password. Please try again."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AdminAuthLayout
      tagline="Secure access to manage the Veraawell platform and monitor system health."
      title={done ? 'Password updated' : 'Choose a new password'}
      subtitle={done ? undefined : 'Every other session for this account will be signed out'}
    >
      {done ? (
        <div className="space-y-4">
          <div role="status" className="px-3 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-[12px] text-emerald-800">
            Your password has been reset. Sign in with your new password.
          </div>
          <Link to="/admin-login" className="block text-center w-full py-2 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-medium rounded-xl">
            Go to admin sign in
          </Link>
        </div>
      ) : (
        <>
          <FormError message={error} />
          <form onSubmit={handleSubmit} className="space-y-3">
            <IconField
              label="New password"
              icon={<FiLock size={13} />}
              input={{
                type: 'password', value: password, onChange: (e) => setPassword(e.target.value),
                placeholder: '••••••••', required: true, disabled: submitting, autoComplete: 'new-password',
              }}
            />
            <IconField
              label="Confirm new password"
              icon={<FiLock size={13} />}
              input={{
                type: 'password', value: confirm, onChange: (e) => setConfirm(e.target.value),
                placeholder: '••••••••', required: true, disabled: submitting, autoComplete: 'new-password',
              }}
            />
            <p className="text-[10px] text-neutral-400">At least {ADMIN_MIN_PASSWORD_LENGTH} characters.</p>
            <motion.button type="submit" disabled={submitting} whileTap={{ scale: 0.98 }} className={adminSubmitClass}>
              {submitting ? 'Saving...' : 'Reset password'}
            </motion.button>
          </form>
          <div className="mt-4 text-center">
            <Link to="/admin/forgot-password" className="text-[11px] text-neutral-500 hover:text-neutral-900 font-medium transition-colors">
              Link expired? Request a new one
            </Link>
          </div>
        </>
      )}
    </AdminAuthLayout>
  );
};

export default AdminResetPasswordPage;
