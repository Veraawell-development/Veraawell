import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAdmin } from '../context/AdminContext';
import { motion } from 'framer-motion';
import { FiMail, FiLock, FiArrowLeft, FiShield } from 'react-icons/fi';

const AdminLoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAdmin();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      navigate('/super-admin-dashboard');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

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
            Secure access to manage the Veraawell platform and monitor system health.
          </p>

          {/* System status mock or simple stats */}
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
                Welcome Back
              </h1>
              <p className="text-[11px] text-neutral-400 mt-0.5">
                Sign in to your admin account
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
              {/* Email Field */}
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-neutral-400">Email</label>
                <div className="relative group">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-[13px] pointer-events-none">
                    <FiMail size={13} />
                  </span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@veraawell.com"
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
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
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
                {loading ? 'Signing in...' : 'Sign In'}
              </motion.button>
            </form>

            {/* Links */}
            <div className="mt-4 text-center space-y-1.5">
              <Link
                to="/admin-signup"
                className="block text-[11px] text-neutral-500 hover:text-neutral-900 font-medium transition-colors"
              >
                Don't have an account? Sign up
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

export default AdminLoginPage;
