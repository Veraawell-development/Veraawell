import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FcGoogle } from 'react-icons/fc';
import { FiUser, FiMail, FiPhone, FiLock, FiEye, FiEyeOff, FiArrowLeft, FiChevronRight } from 'react-icons/fi';
import { LuStethoscope } from 'react-icons/lu';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../config/api';
import OTPVerificationModal from '../components/OTPVerificationModal';
import toast from 'react-hot-toast';

// ── Animation variants ────────────────────────────────────────────────────────
const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeInOut" as any } },
  exit:    { opacity: 0, y: -8,  transition: { duration: 0.18 } },
};
const stagger = { animate: { transition: { staggerChildren: 0.055 } } };

// ── Reusable Input ────────────────────────────────────────────────────────────
interface FieldProps {
  label: string; type: string; value: string;
  onChange: (v: string) => void; placeholder: string;
  icon: React.ReactNode; disabled?: boolean;
  toggle?: boolean; showPw?: boolean; onToggle?: () => void;
}
function Field({ label, type, value, onChange, placeholder, icon, disabled, toggle, showPw, onToggle }: FieldProps) {
  return (
    <motion.div variants={fadeUp} className="space-y-1">
      <label className="block text-[11px] font-medium text-neutral-400 tracking-wide">{label}</label>
      <div className="relative group">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 group-focus-within:text-neutral-600 transition-colors pointer-events-none text-[13px]">
          {icon}
        </span>
        <input
          type={toggle ? (showPw ? 'text' : 'password') : type}
          value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder} disabled={disabled}
          className="w-full pl-9 pr-9 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-[13px] text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/8 focus:border-neutral-400 hover:border-neutral-300 transition-all disabled:opacity-40"
        />
        {toggle && (
          <button type="button" onClick={onToggle}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors">
            {showPw ? <FiEyeOff size={13} /> : <FiEye size={13} />}
          </button>
        )}
      </div>
    </motion.div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface AuthPageProps { mode?: 'login' | 'signup'; onSuccess?: () => void; }

// ── Component ─────────────────────────────────────────────────────────────────
export default function AuthPage({ mode, onSuccess }: AuthPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNo, setPhoneNo] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerConfirm, setRegisterConfirm] = useState('');
  const [registerMode, setRegisterMode] = useState(mode === 'signup');
  const [isProfessional, setIsProfessional] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [registerMsg, setRegisterMsg] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showLoginPw, setShowLoginPw] = useState(false);
  const [showOTPModal, setShowOTPModal] = useState(false);
  const [otpEmail, setOtpEmail] = useState('');

  const navigate = useNavigate();
  const location = useLocation();
  const { setAuthToken, checkAuth } = useAuth();
  const redirectMessage = location.state?.message;
  const redirectFrom = location.state?.from;
  const redirectServiceType = location.state?.serviceType;
  const redirectBookingType = location.state?.bookingType;

  useEffect(() => {
    if (mode === 'signup') setRegisterMode(true);
    if (mode === 'login') setRegisterMode(false);
    if (redirectMessage) setError(redirectMessage);
  }, [mode, redirectMessage]);

  useEffect(() => { if (isProfessional && registerMode) setRegisterMode(false); }, [isProfessional]);

  const canSignUp = !isProfessional;
  const clearMsgs = () => { setError(''); setRegisterMsg(''); };

  // ── All original handlers — zero logic changes ────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ username, password, role: isProfessional ? 'doctor' : 'patient' }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.token) setAuthToken(data.token);
        if (onSuccess) onSuccess();
        if (redirectFrom) navigate(redirectFrom, { state: { serviceType: redirectServiceType, bookingType: redirectBookingType } });
      } else { setError(data.message || 'Login failed'); }
    } catch { setError('Network error. Please try again.'); }
    setLoading(false);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault(); setRegisterMsg(''); setError('');
    if (!firstName.trim()) return setRegisterMsg('Name is required');
    if (!email.trim()) return setRegisterMsg('Email is required');
    if (!phoneNo.trim()) return setRegisterMsg('Phone number is required');
    if (!registerPassword.trim()) return setRegisterMsg('Password is required');
    if (!registerConfirm.trim()) return setRegisterMsg('Confirm your password');
    if (registerPassword !== registerConfirm) return setRegisterMsg('Passwords do not match');
    setLoading(true);
    try {
      // Step 1: Validate registration data on server before sending OTP!
      const validateRes = await fetch(`${API_BASE_URL}/auth/validate-registration`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastName: '', email, username: email, password: registerPassword, phoneNo, role: 'patient' }),
      });
      const validateData = await validateRes.json();
      
      if (!validateRes.ok) {
        if (validateData.errors) {
          const errorMsgs = Object.values(validateData.errors).join(', ');
          setRegisterMsg(errorMsgs);
        } else {
          setRegisterMsg(validateData.message || 'Validation failed');
        }
        setLoading(false);
        return; // Stop here!
      }

      // Step 2: If validation passes, send OTP!
      const res = await fetch(`${API_BASE_URL}/otp/send`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.toLowerCase(), userType: 'patient' }),
      });
      const data = await res.json();
      if (res.ok && data.success) { toast.success('OTP sent!'); setOtpEmail(email); setShowOTPModal(true); setLoading(false); }
      else { setRegisterMsg(data.message || 'Failed to send OTP'); setLoading(false); }
    } catch { setRegisterMsg('Network error. Please try again.'); setLoading(false); }
  };

  const handleOTPVerified = async () => {
    setShowOTPModal(false); setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ firstName, lastName: '', email, username: email, password: registerPassword, phoneNo, role: 'patient' }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Account created!');
        if (data.token) setAuthToken(data.token);
        await checkAuth();
        setFirstName(''); setEmail(''); setPhoneNo(''); setRegisterPassword(''); setRegisterConfirm('');
        setLoading(false); navigate('/patient-dashboard');
      } else {
        if (data.errors) {
          const errorMsgs = Object.values(data.errors).join(', ');
          setRegisterMsg(errorMsgs);
        } else {
          setRegisterMsg(data.message || 'Registration failed');
        }
        setLoading(false);
      }
    } catch { setRegisterMsg('Network error. Please try again.'); setLoading(false); }
  };

  const handleGoogleAuth = () => {
    window.location.href = `${API_BASE_URL}/auth/google?role=${isProfessional ? 'doctor' : 'patient'}`;
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#fcfbfa]">

      {/* ── Left branding panel (desktop only) ──────────────────────────── */}
      <div className="hidden md:flex md:w-3/5 flex-col items-center justify-center p-10 relative overflow-hidden"
        style={{ background: 'linear-gradient(145deg, #002b34 0%, #005463 100%)' }}>

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

        {/* Ambient center glow */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-72 h-72 rounded-full blur-3xl" style={{ background: 'radial-gradient(circle, rgba(20,184,166,0.15) 0%, transparent 65%)' }} />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="relative z-10 flex flex-col items-center text-center max-w-xs w-full"
        >
          {/* Logo */}
          {/* <img src="/logo.png" alt="Veraawell" className="h-7 w-auto mx-auto mb-10 brightness-0 invert opacity-60" /> */}

          {/* ── Orbital Constellation SVG ──────────────────────────────────── */}
          <div className="w-64 h-64 mb-8 relative">
            <svg viewBox="0 0 280 280" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
              <defs>
                <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#0097b2" stopOpacity="0.8" />
                  <stop offset="60%" stopColor="#0097b2" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="#0097b2" stopOpacity="0" />
                </radialGradient>
              </defs>

              {/* Static orbit rings */}
              <circle cx="140" cy="140" r="56"  stroke="#fff3db" strokeWidth="0.5" fill="none" opacity="0.15" />
              <circle cx="140" cy="140" r="84"  stroke="#fff3db" strokeWidth="0.5" fill="none" opacity="0.1" />
              <circle cx="140" cy="140" r="112" stroke="#fff3db" strokeWidth="0.5" fill="none" opacity="0.05" />

              {/* Center orb — pulsing glow */}
              <motion.circle cx="140" cy="140" r="30"
                fill="url(#coreGlow)"
                animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.8, 0.5] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                style={{ originX: '140px', originY: '140px' }}
              />
              <circle cx="140" cy="140" r="14" fill="#0097b2" opacity="0.4" />
              <circle cx="140" cy="140" r="6"  fill="#fff3db" opacity="0.9" />

              {/* Orbit 1 — r=56, 7s CW, 1 particle */}
              <motion.g
                animate={{ rotate: 360 }}
                transition={{ duration: 7, repeat: Infinity, ease: 'linear' }}
                style={{ originX: '140px', originY: '140px' }}
              >
                <circle cx={140 + 56} cy="140" r="5" fill="#fff3db" opacity="0.9" />
                <circle cx={140 + 56} cy="140" r="9" fill="#0097b2" opacity="0.2" />
              </motion.g>

              {/* Orbit 2 — r=84, 11s CCW, 2 particles offset 180° */}
              <motion.g
                animate={{ rotate: -360 }}
                transition={{ duration: 11, repeat: Infinity, ease: 'linear' }}
                style={{ originX: '140px', originY: '140px' }}
              >
                <circle cx={140 + 84} cy="140" r="4"   fill="#0097b2" opacity="0.8" />
                <circle cx={140 + 84} cy="140" r="8"   fill="#0097b2" opacity="0.15" />
                <circle cx={140 - 84} cy="140" r="3"   fill="#fff3db" opacity="0.7" />
              </motion.g>

              {/* Orbit 3 — r=112, 16s CW, 1 small particle */}
              <motion.g
                animate={{ rotate: 360 }}
                transition={{ duration: 16, repeat: Infinity, ease: 'linear', delay: 2 }}
                style={{ originX: '140px', originY: '140px' }}
              >
                <circle cx={140 + 112} cy="140" r="3.5" fill="#fff3db" opacity="0.7" />
                <circle cx={140 + 112} cy="140" r="7"   fill="#fff3db" opacity="0.1" />
              </motion.g>

              {/* Tiny ambient sparkles — very subtle, just scale-pulse */}
              {[
                { cx: 68,  cy: 82,  r: 1.5, d: 2.5 },
                { cx: 210, cy: 72,  r: 1.2, d: 3.8 },
                { cx: 54,  cy: 200, r: 1.8, d: 3.2 },
                { cx: 218, cy: 195, r: 1.4, d: 4.1 },
                { cx: 140, cy: 30,  r: 1.2, d: 2.8 },
              ].map((s, i) => (
                <motion.circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill="#fff3db"
                  animate={{ opacity: [0.1, 0.4, 0.1], scale: [0.8, 1.2, 0.8] }}
                  transition={{ duration: s.d, repeat: Infinity, ease: 'easeInOut', delay: i * 0.6 }}
                  style={{ originX: `${s.cx}px`, originY: `${s.cy}px` }}
                />
              ))}
            </svg>
          </div>

          {/* Copy */}
          <h2 className="text-xl font-semibold tracking-tight leading-snug mb-2.5" style={{ color: '#fff3db' }}>
            Mental wellness,<br />made accessible.
          </h2>
          <p className="text-xs leading-relaxed mb-8" style={{ color: '#fff3db', opacity: 0.7 }}>
            Connect with certified therapists and take<br />control of your mental health journey.
          </p>

          {/* Trust bullets */}
          <div className="flex flex-col gap-2.5 text-left w-full px-4">
            {['Licensed professionals', 'Private & confidential', 'Sessions on your schedule'].map(t => (
              <div key={t} className="flex items-center gap-3">
                <div className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: '#fff3db', opacity: 0.7 }} />
                <span className="text-[11px]" style={{ color: '#fff3db', opacity: 0.7 }}>{t}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>



      {/* ── Right form panel ─────────────────────────────────────────────── */}
      <div className="w-full md:w-2/5 flex flex-col items-center justify-center px-5 py-8 relative">





        {/* Form card */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="w-full max-w-sm bg-white rounded-2xl border border-neutral-200/80 shadow-sm overflow-hidden">

          {/* Accent top bar */}
          <div className="h-0.5 bg-[#0097b2]" />

          <div className="px-6 pt-6 pb-5">
            {/* Title */}
            <div className="mb-5">
              <h1 className="text-base font-semibold text-neutral-900 tracking-tight">
                {registerMode ? 'Create account' : 'Welcome back'}
              </h1>
              <p className="text-[11px] text-neutral-400 mt-0.5">
                {registerMode ? 'Join Veraawell today' : 'Sign in to continue'}
              </p>
            </div>

            {/* Sign In / Sign Up toggle */}
            {canSignUp && (
              <div className="flex bg-neutral-100 rounded-xl p-0.5 mb-5 gap-0.5">
                {['Sign In', 'Sign Up'].map((label, i) => {
                  const active = i === 0 ? !registerMode : registerMode;
                  return (
                    <button key={label}
                      onClick={() => { setRegisterMode(i === 1); setIsProfessional(false); clearMsgs(); }}
                      className={`flex-1 py-1.5 rounded-[10px] text-xs font-medium transition-all duration-200 ${active ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}>
                      {label}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Role selector — login only */}
            {!registerMode && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-4">
                <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-widest mb-2 text-center">I am a</p>
                <div className="grid grid-cols-2 gap-2">
                  {[{ label: 'Patient', val: false, icon: <FiUser size={15} /> }, { label: 'Doctor', val: true, icon: <LuStethoscope size={15} /> }].map(({ label, val, icon }) => {
                    const active = isProfessional === val;
                    return (
                      <button key={label} onClick={() => setIsProfessional(val)}
                        className={`relative flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-xs font-medium transition-all duration-200 justify-center ${active ? (val ? 'border-neutral-800 bg-neutral-50 text-neutral-900' : 'border-[#0097b2] bg-[#0097b2]/5 text-[#007c93]') : 'border-neutral-200 text-neutral-500 hover:border-neutral-300'}`}>
                        <span className={`${active ? (val ? 'text-neutral-700' : 'text-[#0097b2]') : 'text-neutral-400'}`}>{icon}</span>
                        {label}
                        {active && (
                          <motion.span layoutId="role-dot"
                            className="absolute top-1.5 right-1.5 w-3 h-3 rounded-full flex items-center justify-center"
                            style={{ background: val ? '#1f2937' : '#0097b2' }}>
                            <svg width="6" height="5" viewBox="0 0 6 5" fill="none">
                              <path d="M1 2.5L2.5 4L5.5 1" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </motion.span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* Doctor notice in signup */}
            {registerMode && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[11px] text-neutral-400 mb-4 text-center">
                <LuStethoscope className="inline mr-1" size={11} />
                Doctor?{' '}
                <a href="/careers" className="text-neutral-700 font-medium underline underline-offset-2 hover:text-neutral-900">Join us here</a>
              </motion.p>
            )}

            {/* Forms */}
            <AnimatePresence mode="wait">
              {registerMode ? (
                <motion.form key="register" variants={stagger} initial="initial" animate="animate" exit="exit"
                  onSubmit={handleRegister} className="space-y-2.5">
                  <Field label="Full Name" type="text" value={firstName} onChange={setFirstName}
                    placeholder="Your full name" icon={<FiUser size={13} />} disabled={loading} />
                  <Field label="Email" type="email" value={email} onChange={setEmail}
                    placeholder="rahul.sharma@gmail.com" icon={<FiMail size={13} />} disabled={loading} />
                  <Field label="Phone" type="tel" value={phoneNo} onChange={setPhoneNo}
                    placeholder="+91 98765 43210" icon={<FiPhone size={13} />} disabled={loading} />
                  {/* Password row — side by side to save vertical space */}
                  <motion.div variants={fadeUp} className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="block text-[11px] font-medium text-neutral-400">Password</label>
                      <div className="relative group">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-[13px] pointer-events-none"><FiLock size={13} /></span>
                        <input type={showPw ? 'text' : 'password'} value={registerPassword}
                          onChange={e => setRegisterPassword(e.target.value)} placeholder="Password" disabled={loading}
                          className="w-full pl-9 pr-8 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-[12px] text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/8 focus:border-neutral-400 hover:border-neutral-300 transition-all disabled:opacity-40" />
                        <button type="button" onClick={() => setShowPw(p => !p)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600">
                          {showPw ? <FiEyeOff size={12} /> : <FiEye size={12} />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[11px] font-medium text-neutral-400">Confirm</label>
                      <div className="relative group">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-[13px] pointer-events-none"><FiLock size={13} /></span>
                        <input type={showConfirm ? 'text' : 'password'} value={registerConfirm}
                          onChange={e => setRegisterConfirm(e.target.value)} placeholder="Confirm" disabled={loading}
                          className="w-full pl-9 pr-8 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-[12px] text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/8 focus:border-neutral-400 hover:border-neutral-300 transition-all disabled:opacity-40" />
                        <button type="button" onClick={() => setShowConfirm(p => !p)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600">
                          {showConfirm ? <FiEyeOff size={12} /> : <FiEye size={12} />}
                        </button>
                      </div>
                    </div>
                  </motion.div>

                  <motion.button variants={fadeUp} type="submit" disabled={loading} whileTap={{ scale: 0.98 }}
                    className="w-full mt-1 py-2 bg-[#0097b2] hover:bg-[#007c93] text-white text-xs font-medium rounded-xl transition-all disabled:opacity-50 shadow-sm">
                    {loading ? <Spinner text="Creating..." /> : 'Create Account'}
                  </motion.button>
                </motion.form>
              ) : (
                <motion.form key="login" variants={stagger} initial="initial" animate="animate" exit="exit"
                  onSubmit={handleLogin} className="space-y-2.5">
                  <Field label="Email or Phone" type="text" value={username} onChange={setUsername}
                    placeholder="Enter your email or phone" icon={<FiMail size={13} />} disabled={loading} />
                  <Field label="Password" type="password" value={password} onChange={setPassword}
                    placeholder="Enter your password" icon={<FiLock size={13} />} disabled={loading}
                    toggle showPw={showLoginPw} onToggle={() => setShowLoginPw(p => !p)} />
                  <motion.div variants={fadeUp} className="flex justify-end">
                    <button type="button" onClick={() => navigate('/forgot-password')}
                      className="text-[11px] text-neutral-500 hover:text-neutral-900 font-medium transition-colors">
                      Forgot password?
                    </button>
                  </motion.div>
                  <motion.button variants={fadeUp} type="submit" disabled={loading} whileTap={{ scale: 0.98 }}
                    className="w-full py-2 bg-[#0097b2] hover:bg-[#007c93] text-white text-xs font-medium rounded-xl transition-all disabled:opacity-50 shadow-sm">
                    {loading ? <Spinner text="Signing in..." /> : `Sign In as ${isProfessional ? 'Doctor' : 'Patient'}`}
                  </motion.button>
                </motion.form>
              )}
            </AnimatePresence>

            {/* Divider */}
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-neutral-100" />
              <span className="text-[10px] font-medium text-neutral-400 uppercase tracking-widest">or</span>
              <div className="flex-1 h-px bg-neutral-100" />
            </div>

            {/* Google */}
            <motion.button whileTap={{ scale: 0.98 }} onClick={handleGoogleAuth}
              className="w-full flex items-center justify-center gap-2 py-2 border border-neutral-200 rounded-xl text-xs font-medium text-neutral-700 hover:bg-neutral-50 hover:border-neutral-300 transition-all">
              <FcGoogle size={15} /> Continue with Google
            </motion.button>

            {/* Error / success */}
            <AnimatePresence>
              {(error || registerMsg) && (
                <motion.div key="msg" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className={`mt-3 px-3 py-2 rounded-xl text-[11px] font-medium text-center border ${registerMsg.includes('successful') ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
                  {error || registerMsg}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Admin */}
            <div className="mt-4 pt-3 border-t border-neutral-100 text-center">
              <button onClick={() => navigate('/admin-login')}
                className="inline-flex items-center gap-1 text-[11px] text-neutral-400 hover:text-neutral-600 font-medium transition-colors">
                Admin Portal <FiChevronRight size={11} />
              </button>
            </div>
          </div>
        </motion.div>

        {/* Footer */}
        <p className="mt-5 text-[11px] text-neutral-400">
          Veraawell &copy; {new Date().getFullYear()}
        </p>
      </div>

      {/* OTP Modal */}
      <OTPVerificationModal isOpen={showOTPModal} email={otpEmail} userType="patient"
        onVerified={handleOTPVerified} onClose={() => { setShowOTPModal(false); setLoading(false); }} />
    </div>
  );
}

// ── Inline Spinner ────────────────────────────────────────────────────────────
function Spinner({ text }: { text: string }) {
  return (
    <span className="flex items-center justify-center gap-2">
      <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      {text}
    </span>
  );
}
