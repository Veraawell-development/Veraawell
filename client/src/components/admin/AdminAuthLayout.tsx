import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiArrowLeft, FiShield } from 'react-icons/fi';

/**
 * The two-panel frame shared by the admin sign-in, sign-up and password
 * reset pages: a dark branding panel (desktop only) and the form card.
 */

export const adminInputClass =
  'w-full pl-9 pr-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-[12px] text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/8 focus:border-neutral-400 hover:border-neutral-300 transition-all disabled:opacity-40';

export const adminSubmitClass =
  'w-full mt-2 py-2 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-medium rounded-xl transition-all disabled:opacity-50 shadow-sm';

export const FormError: React.FC<{ message: string }> = ({ message }) =>
  message ? (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      role="alert"
      className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-[11px] font-medium text-red-600 text-center"
    >
      {message}
    </motion.div>
  ) : null;

/** A labelled input with a leading icon, as on every admin auth form. */
export const IconField: React.FC<{
  label: string;
  icon: React.ReactNode;
  input: React.InputHTMLAttributes<HTMLInputElement>;
}> = ({ label, icon, input }) => {
  const id = React.useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-[11px] font-medium text-neutral-400">{label}</label>
      <div className="relative group">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-[13px] pointer-events-none">{icon}</span>
        <input id={id} className={adminInputClass} {...input} />
      </div>
    </div>
  );
};

const AdminAuthLayout: React.FC<{
  /** Copy under "Admin Portal" in the branding panel. */
  tagline: string;
  /** Optional extra content under the tagline. */
  aside?: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}> = ({ tagline, aside, title, subtitle, children }) => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#f7f7f5]">
      {/* ── Left branding panel (desktop only) ──────────────────────────── */}
      <div className="hidden md:flex md:w-2/5 lg:w-1/2 flex-col items-center justify-center p-10 relative overflow-hidden"
        style={{ background: 'linear-gradient(145deg, #0f172a 0%, #1e293b 100%)' }}>

        <motion.button
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
          onClick={() => navigate('/')}
          className="absolute top-5 left-5 w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110 z-20"
          style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
          title="Back to Home"
          aria-label="Back to Home"
        >
          <FiArrowLeft size={14} style={{ color: 'rgba(255,255,255,0.55)' }} />
        </motion.button>

        <div className="absolute inset-0 opacity-10">
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="admin-auth-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#38bdf8" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#admin-auth-grid)" />
          </svg>
        </div>

        <div className="absolute top-1/3 left-1/3 w-96 h-96 rounded-full blur-3xl pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(56,189,248,0.1) 0%, transparent 70%)' }} />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="relative z-10 flex flex-col items-center text-center max-w-sm w-full"
        >
          <div className="w-12 h-12 bg-slate-800/50 rounded-2xl flex items-center justify-center mb-6 border border-slate-700/50">
            <FiShield size={22} style={{ color: '#38bdf8' }} />
          </div>
          <h2 className="text-xl font-semibold tracking-tight leading-snug mb-2" style={{ color: '#f8fafc' }}>
            Admin Portal
          </h2>
          <p className="text-xs leading-relaxed mb-8" style={{ color: '#94a3b8' }}>{tagline}</p>
          {aside}
        </motion.div>

        <div className="absolute bottom-6 text-[10px] text-slate-600">
          Veraawell Control Panel © 2026
        </div>
      </div>

      {/* ── Right form panel ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 py-8 relative">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="w-full max-w-sm bg-white rounded-2xl border border-neutral-200/80 shadow-sm overflow-hidden"
        >
          <div className="h-0.5 bg-gradient-to-r from-teal-400 to-emerald-400" />
          <div className="px-6 pt-6 pb-5">
            <div className="mb-5">
              <h1 className="text-base font-semibold text-neutral-900 tracking-tight">{title}</h1>
              {subtitle && <p className="text-[11px] text-neutral-400 mt-0.5">{subtitle}</p>}
            </div>
            {children}
          </div>
        </motion.div>
        <p className="text-[10px] text-neutral-400 mt-5 md:hidden">Veraawell © 2026</p>
      </div>
    </div>
  );
};

export default AdminAuthLayout;
