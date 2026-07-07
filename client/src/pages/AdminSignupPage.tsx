import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiMail, FiLock, FiArrowLeft, FiUser, FiUserCheck, FiShield } from 'react-icons/fi';
import { useMutation } from '@tanstack/react-query';
import { API_BASE_URL } from '../config/api';

const AdminSignupPage: React.FC = () => {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    username: '',
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();
  const signupMutation = useMutation({
    mutationFn: async (payload: any) => {
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const data = await response.json();
        if (data.errors) {
          const errorList = Object.values(data.errors);
          throw new Error(errorList.join('. ') + '.');
        }
        throw new Error(data.message || 'Signup failed');
      }
      return response.json();
    },
    onSuccess: () => {
      setSuccess(true);
      setTimeout(() => navigate('/admin-login'), 3000);
    },
    onError: (err: any) => {
      setError(err.message || 'Signup failed');
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    signupMutation.mutate({
      firstName: formData.firstName,
      lastName: formData.lastName,
      email: formData.email,
      username: formData.username,
      password: formData.password,
      role: 'admin'
    });
  };

  const loading = signupMutation.isPending;

  if (success) {
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
          <h2 className="text-base font-semibold text-neutral-900 mb-2">
            Application Submitted
          </h2>
          <p className="text-[11px] text-neutral-400 leading-relaxed mb-4">
            Your admin account request has been submitted. A super admin will review and approve your application soon.
          </p>
          <p className="text-[10px] text-neutral-400">
            Redirecting to login page...
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#f7f7f5]">
      
      {/* ── Left branding panel (desktop only) ──────────────────────────── */}
      <div className="hidden md:flex md:w-2/5 lg:w-1/2 flex-col items-center justify-center p-10 relative overflow-hidden"
        style={{ background: 'linear-gradient(145deg, #0f172a 0%, #1e293b 100%)' }}>

        {/* Back button — icon only, top-left of dark panel */}
        <motion.button
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
          onClick={() => navigate('/')}
          className="absolute top-5 left-5 w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110 z-20"
          style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
          title="Back to Home"
        >
          <FiArrowLeft size={14} style={{ color: 'rgba(255,255,255,0.55)' }} />
        </motion.button>

        {/* Geometric background grid lines */}
        <div className="absolute inset-0 opacity-10">
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#38bdf8" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>

        {/* Ambient glow */}
        <div className="absolute top-1/3 left-1/3 w-96 h-96 rounded-full blur-3xl pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(56,189,248,0.1) 0%, transparent 70%)' }} />

        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="relative z-10 flex flex-col items-center text-center max-w-sm w-full"
        >
          {/* Icon */}
          <div className="w-12 h-12 bg-slate-800/50 rounded-2xl flex items-center justify-center mb-6 border border-slate-700/50">
            <FiShield size={22} style={{ color: '#38bdf8' }} />
          </div>

          {/* Copy */}
          <h2 className="text-xl font-semibold tracking-tight leading-snug mb-2" style={{ color: '#f8fafc' }}>
            Admin Portal
          </h2>
          <p className="text-xs leading-relaxed mb-8" style={{ color: '#94a3b8' }}>
            Apply for secure access to manage the Veraawell platform.
          </p>

          {/* Info card */}
          <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl p-4 text-left w-full">
            <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider mb-1.5">Note</p>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              All admin accounts require manual approval by a super admin before access is granted.
            </p>
          </div>
        </motion.div>

        {/* Footer info */}
        <div className="absolute bottom-6 text-[10px] text-slate-600">
          Veraawell Control Panel © 2026
        </div>
      </div>

      {/* ── Right form panel ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 py-8 relative">
        


        {/* Form card */}
        <motion.div 
          initial={{ opacity: 0, y: 16 }} 
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="w-full max-w-sm bg-white rounded-2xl border border-neutral-200/80 shadow-sm overflow-hidden"
        >
          {/* Accent top bar */}
          <div className="h-0.5 bg-gradient-to-r from-teal-400 to-emerald-400" />

          <div className="px-6 pt-6 pb-5">
            {/* Title */}
            <div className="mb-5">
              <h1 className="text-base font-semibold text-neutral-900 tracking-tight">
                Apply for Access
              </h1>
              <p className="text-[11px] text-neutral-400 mt-0.5">
                Your application will be reviewed by a super admin
              </p>
            </div>

            {error && (
              <motion.div 
                initial={{ opacity: 0, y: -4 }} 
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-[11px] font-medium text-red-600 text-center"
              >
                {error}
              </motion.div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              {/* Name Grid */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-neutral-400">First Name</label>
                  <div className="relative group">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-[13px] pointer-events-none">
                      <FiUser size={13} />
                    </span>
                    <input
                      type="text"
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      required
                      disabled={loading}
                      className="w-full pl-9 pr-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-[12px] text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/8 focus:border-neutral-400 hover:border-neutral-300 transition-all disabled:opacity-40"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-neutral-400">Last Name</label>
                  <div className="relative group">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-[13px] pointer-events-none">
                      <FiUser size={13} />
                    </span>
                    <input
                      type="text"
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                      required
                      disabled={loading}
                      className="w-full pl-9 pr-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-[12px] text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/8 focus:border-neutral-400 hover:border-neutral-300 transition-all disabled:opacity-40"
                    />
                  </div>
                </div>
              </div>

              {/* Email Field */}
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-neutral-400">Email</label>
                <div className="relative group">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-[13px] pointer-events-none">
                    <FiMail size={13} />
                  </span>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="admin@veraawell.com"
                    required
                    disabled={loading}
                    className="w-full pl-9 pr-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-[12px] text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/8 focus:border-neutral-400 hover:border-neutral-300 transition-all disabled:opacity-40"
                  />
                </div>
              </div>

              {/* Username Field */}
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-neutral-400">Username</label>
                <div className="relative group">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-[13px] pointer-events-none">
                    <FiUserCheck size={13} />
                  </span>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    required
                    disabled={loading}
                    className="w-full pl-9 pr-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-[12px] text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/8 focus:border-neutral-400 hover:border-neutral-300 transition-all disabled:opacity-40"
                  />
                </div>
              </div>

              {/* Password Field */}
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-neutral-400">Password</label>
                <div className="relative group">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-[13px] pointer-events-none">
                    <FiLock size={13} />
                  </span>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="••••••••"
                    required
                    disabled={loading}
                    className="w-full pl-9 pr-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-[12px] text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/8 focus:border-neutral-400 hover:border-neutral-300 transition-all disabled:opacity-40"
                  />
                </div>
              </div>

              {/* Confirm Password Field */}
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-neutral-400">Confirm Password</label>
                <div className="relative group">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-[13px] pointer-events-none">
                    <FiLock size={13} />
                  </span>
                  <input
                    type="password"
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    placeholder="••••••••"
                    required
                    disabled={loading}
                    className="w-full pl-9 pr-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-[12px] text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/8 focus:border-neutral-400 hover:border-neutral-300 transition-all disabled:opacity-40"
                  />
                </div>
              </div>

              <motion.button
                type="submit"
                disabled={loading}
                whileTap={{ scale: 0.98 }}
                className="w-full mt-2 py-2 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-medium rounded-xl transition-all disabled:opacity-50 shadow-sm"
              >
                {loading ? 'Submitting...' : 'Submit Application'}
              </motion.button>
            </form>

            {/* Links */}
            <div className="mt-4 text-center space-y-1.5">
              <Link
                to="/admin-login"
                className="block text-[11px] text-neutral-500 hover:text-neutral-900 font-medium transition-colors"
              >
                Already have an account? Login
              </Link>
            </div>
          </div>
        </motion.div>
        
        {/* Footer */}
        <p className="text-[10px] text-neutral-400 mt-5 md:hidden">
          Veraawell © 2026
        </p>
      </div>
    </div>
  );
};

export default AdminSignupPage;
