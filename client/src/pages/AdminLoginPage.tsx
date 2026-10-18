import React, { useState } from 'react';
import { useNavigate, Link, Navigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiMail, FiLock } from 'react-icons/fi';
import { useAdmin } from '../context/AdminContext';
import { errorMessage } from '../utils/adminApi';
import AdminAuthLayout, { FormError, IconField, adminSubmitClass } from '../components/admin/AdminAuthLayout';

/**
 * Where to go after signing in: back to the console page that sent the admin
 * here (AdminProtectedRoute passes it as `state.from`), else the dashboard.
 * Only console paths — `from` is router state, but nothing else belongs here.
 */
function destinationFrom(state: unknown): string {
  const from = (state as { from?: { pathname?: unknown; search?: unknown } } | null)?.from;
  const pathname = typeof from?.pathname === 'string' ? from.pathname : '';
  if (!pathname.startsWith('/super-admin-dashboard')) return '/super-admin-dashboard';
  return pathname + (typeof from?.search === 'string' ? from.search : '');
}

const AdminLoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { admin, login } = useAdmin();
  const destination = destinationFrom(location.state);

  // Already signed in (a bookmark, the back button): straight to the console.
  if (admin && !submitting) {
    return <Navigate to={destination} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      // A required password change is enforced by AdminProtectedRoute, before
      // any console screen renders.
      navigate(destination, { replace: true });
    } catch (err) {
      setError(errorMessage(err, 'Login failed'));
      setSubmitting(false);
    }
  };

  return (
    <AdminAuthLayout
      tagline="Secure access to manage the Veraawell platform and monitor system health."
      aside={(
        <div className="grid grid-cols-2 gap-3 w-full px-4">
          <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl p-3 text-left">
            <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider">Status</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
              <p className="text-[11px] text-slate-300 font-medium">All systems live</p>
            </div>
          </div>
          <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl p-3 text-left">
            <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider">Security</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <p className="text-[11px] text-slate-300 font-medium">Encrypted session</p>
            </div>
          </div>
        </div>
      )}
      title="Welcome Back"
      subtitle="Sign in to your admin account"
    >
      <FormError message={error} />

      <form onSubmit={handleSubmit} className="space-y-3">
        <IconField
          label="Email"
          icon={<FiMail size={13} />}
          input={{
            type: 'email', value: email, onChange: (e) => setEmail(e.target.value),
            placeholder: 'admin@veraawell.com', required: true, disabled: submitting, autoComplete: 'username',
          }}
        />
        <IconField
          label="Password"
          icon={<FiLock size={13} />}
          input={{
            type: 'password', value: password, onChange: (e) => setPassword(e.target.value),
            placeholder: '••••••••', required: true, disabled: submitting, autoComplete: 'current-password',
          }}
        />
        <div className="flex justify-end">
          <Link to="/admin/forgot-password" className="text-[11px] text-neutral-500 hover:text-neutral-900 font-medium transition-colors">
            Forgot password?
          </Link>
        </div>

        <motion.button type="submit" disabled={submitting} whileTap={{ scale: 0.98 }} className={adminSubmitClass}>
          {submitting ? 'Signing in...' : 'Sign In'}
        </motion.button>
      </form>

      <div className="mt-4 text-center space-y-1.5">
        <Link to="/admin-signup" className="block text-[11px] text-neutral-500 hover:text-neutral-900 font-medium transition-colors">
          Don't have an account? Sign up
        </Link>
      </div>
    </AdminAuthLayout>
  );
};

export default AdminLoginPage;
