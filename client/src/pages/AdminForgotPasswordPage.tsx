import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiMail } from 'react-icons/fi';
import { adminFetch, errorMessage } from '../utils/adminApi';
import AdminAuthLayout, { FormError, IconField, adminSubmitClass } from '../components/admin/AdminAuthLayout';

/**
 * Request an admin password reset link. The server answers the same way
 * whether or not the address holds an admin account (so this can't be used
 * to find out who the admins are), and this page does too.
 */
const AdminForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sentMessage, setSentMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const data = await adminFetch<{ message?: string }>('/admin/auth/forgot-password', {
        method: 'POST',
        body: { email: email.trim() },
        sessionAware: false,
      });
      setSentMessage(data?.message || 'If that address belongs to an admin account, a reset link is on its way.');
    } catch (err) {
      setError(errorMessage(err, "Couldn't send the reset link. Please try again."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AdminAuthLayout
      tagline="Secure access to manage the Veraawell platform and monitor system health."
      title="Reset your password"
      subtitle="We'll email you a link to choose a new one"
    >
      {sentMessage ? (
        <div className="space-y-4">
          <div role="status" className="px-3 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-[12px] text-emerald-800">
            {sentMessage}
          </div>
          <p className="text-[11px] text-neutral-500">The link expires after a short while. Check your spam folder if it doesn't arrive.</p>
        </div>
      ) : (
        <>
          <FormError message={error} />
          <form onSubmit={handleSubmit} className="space-y-3">
            <IconField
              label="Email"
              icon={<FiMail size={13} />}
              input={{
                type: 'email', value: email, onChange: (e) => setEmail(e.target.value),
                placeholder: 'admin@veraawell.com', required: true, disabled: submitting, autoComplete: 'email',
              }}
            />
            <motion.button type="submit" disabled={submitting} whileTap={{ scale: 0.98 }} className={adminSubmitClass}>
              {submitting ? 'Sending...' : 'Send reset link'}
            </motion.button>
          </form>
        </>
      )}
      <div className="mt-4 text-center">
        <Link to="/admin-login" className="text-[11px] text-neutral-500 hover:text-neutral-900 font-medium transition-colors">
          Back to sign in
        </Link>
      </div>
    </AdminAuthLayout>
  );
};

export default AdminForgotPasswordPage;
