import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiMail, FiLock, FiUser, FiUserCheck, FiKey } from 'react-icons/fi';
import { useMutation } from '@tanstack/react-query';
import { API_BASE_URL } from '../config/api';
import { ADMIN_MIN_PASSWORD_LENGTH, errorMessage, fallbackMessage, serverErrorText } from '../utils/adminApi';
import ResendCodeButton from '../components/ResendCodeButton';
import AdminAuthLayout, { FormError, IconField, adminSubmitClass } from '../components/admin/AdminAuthLayout';

/**
 * Admin sign-up is the same two-step signup as everyone else's: register
 * creates a pending signup and emails a 6-digit code, and only verify-signup
 * creates the account. This page used to stop after the first step and say
 * "Application Submitted" — so no applicant ever entered the code, and no
 * admin account was ever actually created through it.
 */

type Step = 'form' | 'verify' | 'done';

/** POST to a public auth endpoint; throws the server's message on failure. */
async function postAuth<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(fallbackMessage(0));
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.success === false) {
    throw new Error(serverErrorText(data, fallbackMessage(response.status)));
  }
  return data as T;
}

const AdminSignupPage: React.FC = () => {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    username: '',
    password: '',
    confirmPassword: ''
  });
  const [step, setStep] = useState<Step>('form');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');

  const update = (field: keyof typeof formData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));

  const signupMutation = useMutation({
    mutationFn: () => postAuth<{ email?: string }>('/auth/register', {
      firstName: formData.firstName,
      lastName: formData.lastName,
      email: formData.email,
      username: formData.username,
      password: formData.password,
      role: 'admin'
    }),
    onSuccess: () => {
      setOtp('');
      setStep('verify');
    },
    onError: (err) => setError(errorMessage(err, 'Signup failed')),
  });

  const verifyMutation = useMutation({
    // For an admin the server answers { requiresApproval: true } and signs
    // nobody in: the account exists but can't be used until a super admin
    // approves it.
    mutationFn: () => postAuth<{ requiresApproval?: boolean }>('/auth/verify-signup', {
      email: formData.email,
      otp: otp.trim(),
    }),
    onSuccess: () => setStep('done'),
    onError: (err) => setError(errorMessage(err, 'Verification failed')),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.password.length < ADMIN_MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${ADMIN_MIN_PASSWORD_LENGTH} characters`);
      return;
    }

    signupMutation.mutate();
  };

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!/^\d{6}$/.test(otp.trim())) {
      setError('Enter the 6-digit code from the email.');
      return;
    }
    verifyMutation.mutate();
  };

  const loading = signupMutation.isPending;

  if (step === 'done') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f7f7f5] px-5 py-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl border border-neutral-200/80 shadow-sm p-8 max-w-sm w-full text-center"
        >
          <div className="mb-4">
            <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mx-auto border border-emerald-100">
              <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
          <h2 className="text-base font-semibold text-neutral-900 mb-2">Email verified</h2>
          <p className="text-[12px] text-neutral-500 leading-relaxed mb-2">
            Verified — a super admin will review your request; you'll get an email when approved.
          </p>
          <Link
            to="/admin-login"
            className="inline-block mt-3 px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-medium rounded-xl"
          >
            Go to admin sign in
          </Link>
        </motion.div>
      </div>
    );
  }

  if (step === 'verify') {
    return (
      <AdminAuthLayout
        tagline="Apply for secure access to manage the Veraawell platform."
        title="Check your email"
        subtitle={`We sent a 6-digit code to ${formData.email}`}
      >
        <FormError message={error} />
        <form onSubmit={handleVerify} className="space-y-3">
          <IconField
            label="Verification code"
            icon={<FiKey size={13} />}
            input={{
              type: 'text', inputMode: 'numeric', autoComplete: 'one-time-code', maxLength: 6,
              value: otp, onChange: (e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6)),
              placeholder: '123456', required: true, disabled: verifyMutation.isPending,
            }}
          />
          <motion.button type="submit" disabled={verifyMutation.isPending} whileTap={{ scale: 0.98 }} className={adminSubmitClass}>
            {verifyMutation.isPending ? 'Verifying...' : 'Verify email'}
          </motion.button>
        </form>
        <div className="mt-4 flex items-center justify-between">
          <ResendCodeButton
            email={formData.email}
            className="text-[11px] font-semibold text-neutral-600 hover:text-neutral-900 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{}}
          />
          <button
            type="button"
            onClick={() => { setError(''); setStep('form'); }}
            className="text-[11px] text-neutral-500 hover:text-neutral-900 font-medium"
          >
            Use a different email
          </button>
        </div>
      </AdminAuthLayout>
    );
  }

  return (
    <AdminAuthLayout
      tagline="Apply for secure access to manage the Veraawell platform."
      aside={(
        <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl p-4 text-left w-full">
          <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider mb-1.5">Note</p>
          <p className="text-[11px] text-slate-300 leading-relaxed">
            All admin accounts require manual approval by a super admin before access is granted.
          </p>
        </div>
      )}
      title="Apply for Access"
      subtitle="Your application will be reviewed by a super admin"
    >
      <FormError message={error} />

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <IconField label="First Name" icon={<FiUser size={13} />}
            input={{ type: 'text', value: formData.firstName, onChange: update('firstName'), required: true, disabled: loading, autoComplete: 'given-name' }} />
          <IconField label="Last Name" icon={<FiUser size={13} />}
            input={{ type: 'text', value: formData.lastName, onChange: update('lastName'), required: true, disabled: loading, autoComplete: 'family-name' }} />
        </div>
        <IconField label="Email" icon={<FiMail size={13} />}
          input={{ type: 'email', value: formData.email, onChange: update('email'), placeholder: 'admin@veraawell.com', required: true, disabled: loading, autoComplete: 'email' }} />
        <IconField label="Username" icon={<FiUserCheck size={13} />}
          input={{ type: 'text', value: formData.username, onChange: update('username'), required: true, disabled: loading, autoComplete: 'username' }} />
        <IconField label="Password" icon={<FiLock size={13} />}
          input={{ type: 'password', value: formData.password, onChange: update('password'), placeholder: '••••••••', required: true, disabled: loading, autoComplete: 'new-password' }} />
        <IconField label="Confirm Password" icon={<FiLock size={13} />}
          input={{ type: 'password', value: formData.confirmPassword, onChange: update('confirmPassword'), placeholder: '••••••••', required: true, disabled: loading, autoComplete: 'new-password' }} />

        <motion.button type="submit" disabled={loading} whileTap={{ scale: 0.98 }} className={adminSubmitClass}>
          {loading ? 'Submitting...' : 'Submit Application'}
        </motion.button>
      </form>

      <div className="mt-4 text-center space-y-1.5">
        <Link to="/admin-login" className="block text-[11px] text-neutral-500 hover:text-neutral-900 font-medium transition-colors">
          Already have an account? Login
        </Link>
      </div>
    </AdminAuthLayout>
  );
};

export default AdminSignupPage;
