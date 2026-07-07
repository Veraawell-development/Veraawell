import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FcGoogle } from 'react-icons/fc';
import { FiUser, FiMail, FiPhone, FiLock, FiEye, FiEyeOff, FiArrowLeft, FiChevronRight } from 'react-icons/fi';
import { LuStethoscope } from 'react-icons/lu';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../config/api';
import toast from 'react-hot-toast';
import LeafDecor from '../components/ui/LeafDecor';

// ── Animation variants ────────────────────────────────────────────────────────
const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeInOut" as any } },
  exit:    { opacity: 0, y: -8,  transition: { duration: 0.18 } },
};
const stagger = { animate: { transition: { staggerChildren: 0.055 } } };

// ── Password Strength Utility ────────────────────────────────────────────────
const getPasswordStrength = (password: string) => {
  let score = 0;
  if (!password) return { score, label: '', color: 'transparent' };
  
  if (password.length >= 8) score += 25;
  if (/[A-Z]/.test(password)) score += 25;
  if (/[a-z]/.test(password)) score += 25;
  if (/[0-9]/.test(password) || /[^A-Za-z0-9]/.test(password)) score += 25;

  if (score <= 25) return { score, label: 'Weak', color: '#EF4444' };
  if (score <= 75) return { score, label: 'Fair', color: '#F59E0B' };
  return { score, label: 'Strong', color: '#10B981' };
};

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
      <label className="block text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{label}</label>
      <div className="relative group">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400 group-focus-within:text-[var(--teal)] transition-colors pointer-events-none">
          {icon}
        </span>
        <input
          type={toggle ? (showPw ? 'text' : 'password') : type}
          value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder} disabled={disabled}
          className="w-full pl-10 pr-10 py-2.5 bg-white border rounded-xl text-[13px] transition-all disabled:opacity-40"
          style={{
            borderColor: 'var(--border)',
            color: 'var(--text)',
            outline: 'none',
          }}
          onFocus={e => {
            e.target.style.borderColor = 'var(--teal)';
            e.target.style.boxShadow = '0 0 0 3px var(--teal-muted)';
          }}
          onBlur={e => {
            e.target.style.borderColor = 'var(--border)';
            e.target.style.boxShadow = 'none';
          }}
        />
        {toggle && (
          <button type="button" onClick={onToggle}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors">
            {showPw ? <FiEyeOff size={15} /> : <FiEye size={15} />}
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
  const [step, setStep] = useState<'auth' | 'verify'>('auth');
  const [otp, setOtp] = useState('');
  const [registeredEmail, setRegisteredEmail] = useState('');

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
  const loginMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.errors) throw new Error(Object.values(data.errors).join(', '));
        if (data.requiresVerification) return { ...data, needsVerify: true };
        throw new Error(data.message || 'Login failed');
      }
      return data;
    },
    onSuccess: (data) => {
      if (data.needsVerify) {
        setRegisteredEmail(data.email || username);
        setStep('verify');
        return;
      }
      if (data.token) setAuthToken(data.token);
      if (onSuccess) onSuccess();
      if (redirectFrom) navigate(redirectFrom, { state: { serviceType: redirectServiceType, bookingType: redirectBookingType } });
    },
    onError: (err: any) => { setError(err.message || 'Network error. Please try again.'); }
  });

  const registerMutation = useMutation({
    mutationFn: async (payload: any) => {
      const validateRes = await fetch(`${API_BASE_URL}/auth/validate-registration`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const validateData = await validateRes.json();
      if (!validateRes.ok) {
        if (validateData.errors) throw new Error(Object.values(validateData.errors).join(', '));
        throw new Error(validateData.message || 'Validation failed');
      }

      const res = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.errors) throw new Error(Object.values(data.errors).join(', '));
        throw new Error(data.message || 'Registration failed');
      }
      return data;
    },
    onSuccess: async (data, variables) => {
      if (data.requiresVerification) {
        setRegisteredEmail(data.email || variables.email);
        setStep('verify');
        return;
      }
      toast.success('Account created!');
      if (data.token) setAuthToken(data.token);
      await checkAuth();
      setFirstName(''); setEmail(''); setPhoneNo(''); setRegisterPassword(''); setRegisterConfirm('');
      navigate('/patient-dashboard');
    },
    onError: (err: any) => { setRegisterMsg(err.message || 'Network error. Please try again.'); }
  });

  const verifyOtpMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch(`${API_BASE_URL}/auth/verify-signup`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Verification failed');
      return data;
    },
    onSuccess: async (data) => {
      toast.success('Email verified successfully!');
      if (data.token) setAuthToken(data.token);
      await checkAuth();
      navigate(isProfessional ? '/doctor-dashboard' : '/patient-dashboard');
    },
    onError: (err: any) => { setError(err.message || 'Network error. Please try again.'); }
  });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    loginMutation.mutate({ username, password, role: isProfessional ? 'doctor' : 'patient' });
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault(); setRegisterMsg(''); setError('');
    if (!firstName.trim()) return setRegisterMsg('Name is required');
    if (!email.trim()) return setRegisterMsg('Email is required');
    if (!phoneNo.trim()) return setRegisterMsg('Phone number is required');
    if (!registerPassword.trim()) return setRegisterMsg('Password is required');
    if (!registerConfirm.trim()) return setRegisterMsg('Confirm your password');
    if (registerPassword !== registerConfirm) return setRegisterMsg('Passwords do not match');
    
    registerMutation.mutate({ firstName, lastName: '', email, username: email, password: registerPassword, phoneNo, role: 'patient' });
  };

  const handleGoogleAuth = () => {
    window.location.href = `${API_BASE_URL}/auth/google?role=${isProfessional ? 'doctor' : 'patient'}`;
  };

  const handleVerifyOTP = (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp || otp.length !== 6) return setError('Please enter a 6-digit verification code');
    setError('');
    verifyOtpMutation.mutate({ email: registeredEmail, otp });
  };

  const isMutationLoading = loginMutation.isPending || registerMutation.isPending || verifyOtpMutation.isPending;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[var(--bg-2)] relative overflow-hidden font-sans">
      
      {/* Decorative ambient background */}
      <div 
        className="absolute top-[-20%] left-[-10%] w-[60%] aspect-square rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, var(--teal-muted) 0%, transparent 60%)', opacity: 0.6 }}
      />
      <div 
        className="absolute bottom-[-20%] right-[-10%] w-[60%] aspect-square rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(107, 168, 136, 0.15) 0%, transparent 60%)', opacity: 0.6 }}
      />
      
      {/* ── Left branding panel (desktop only) ──────────────────────────── */}
      <div className="hidden md:flex md:w-[55%] flex-col items-start justify-center p-12 lg:p-20 relative z-10">

        {/* Back button */}
        <motion.button
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
          onClick={() => navigate('/')}
          className="absolute top-10 left-12 w-12 h-12 rounded-full flex items-center justify-center transition-transform hover:-translate-x-1"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}
          title="Back to Home"
        >
          <FiArrowLeft size={18} style={{ color: 'var(--text-2)' }} />
        </motion.button>

        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="relative z-10 max-w-xl w-full mt-12"
        >
          <LeafDecor 
            style={{ 
              position: 'absolute', 
              top: '-140px', 
              left: '-80px', 
              width: '320px', 
              height: '320px', 
              transform: 'rotate(-15deg)', 
              opacity: 0.04, 
              zIndex: -1 
            }} 
          />
          
          <div className="flex items-center gap-2 mb-6">
            <span className="w-2 h-2 rounded-full" style={{ background: 'var(--teal)' }} />
            <span
              className="text-xs font-semibold tracking-widest uppercase"
              style={{ color: 'var(--teal)', fontFamily: 'var(--font-mono)' }}
            >
              Veraawell
            </span>
          </div>

          <h2 
            className="leading-tight mb-6" 
            style={{ 
              fontFamily: 'var(--font-display)', 
              fontSize: 'clamp(44px, 5vw, 64px)', 
              color: 'var(--text)',
              letterSpacing: '-0.02em',
            }}
          >
            Your mind deserves the same care as your <em style={{ color: 'var(--teal)' }}>body.</em>
          </h2>
          <p className="text-lg leading-relaxed mb-12" style={{ color: 'var(--text-2)', fontFamily: 'var(--font-body)' }}>
            Connect with verified therapists, track your progress, and take control of your mental wellness journey at your own pace.
          </p>

          {/* Trust bullets */}
          <div className="flex flex-col gap-4">
            {[
              { icon: '✓', text: 'Verified, licensed professionals' },
              { icon: '✓', text: 'Bank-level privacy & encryption' },
              { icon: '✓', text: 'Flexible sessions on your schedule' }
            ].map(t => (
              <div key={t.text} className="flex items-center gap-4 bg-white/40 backdrop-blur-sm p-4 rounded-2xl border border-white/60 w-fit pr-8">
                <div className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-white text-xs shadow-sm" style={{ background: 'var(--teal)' }}>
                  {t.icon}
                </div>
                <span className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>{t.text}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* ── Right form panel ─────────────────────────────────────────────── */}
      <div className="w-full md:w-[45%] flex flex-col items-center justify-center p-6 sm:p-10 relative z-10">

        {/* Mobile back button */}
        <motion.button
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
          onClick={() => navigate('/')}
          className="md:hidden absolute top-6 left-6 w-12 h-12 rounded-full flex items-center justify-center transition-transform active:scale-95 z-20"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}
        >
          <FiArrowLeft size={18} style={{ color: 'var(--text-2)' }} />
        </motion.button>

        {/* Form card */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="w-full max-w-[400px] rounded-[24px] p-6 sm:p-8 relative overflow-hidden"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          <div className="mb-6">
            <h1 className="text-2xl font-semibold tracking-normal mb-1.5" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
              {registerMode ? 'Create account' : 'Welcome back'}
            </h1>
            <p className="text-[13px]" style={{ color: 'var(--text-2)' }}>
              {registerMode ? 'Join Veraawell today and start your journey.' : 'Sign in to continue your wellness journey.'}
            </p>
          </div>

          {/* Sign In / Sign Up toggle */}
          {canSignUp && step === 'auth' && (
            <div className="flex bg-neutral-100 rounded-xl p-1 mb-6 gap-1">
              {['Sign In', 'Sign Up'].map((label, i) => {
                const active = i === 0 ? !registerMode : registerMode;
                return (
                  <button key={label}
                    onClick={() => { setRegisterMode(i === 1); setIsProfessional(false); clearMsgs(); }}
                    className={`flex-1 py-2 rounded-lg text-[13px] font-semibold transition-all duration-200 ${active ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}>
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Role selector — login only */}
          {!registerMode && step === 'auth' && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-5">
              <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-widest mb-2 text-center" style={{ fontFamily: 'var(--font-mono)' }}>I am a</p>
              <div className="grid grid-cols-2 gap-2">
                {[{ label: 'Patient', val: false, icon: <FiUser size={16} /> }, { label: 'Doctor', val: true, icon: <LuStethoscope size={16} /> }].map(({ label, val, icon }) => {
                  const active = isProfessional === val;
                  return (
                    <button key={label} onClick={() => setIsProfessional(val)}
                      className={`relative flex items-center gap-2 px-3 py-2.5 rounded-xl border-[1.5px] text-[13px] font-semibold transition-all duration-200 justify-center ${active ? (val ? 'border-[var(--sage)] bg-[rgba(107,168,136,0.08)] text-[var(--sage)]' : 'border-[var(--teal)] bg-[var(--teal-muted)] text-[var(--teal)]') : 'border-[var(--border)] text-[var(--text-3)] hover:border-neutral-300'}`}>
                      <span>{icon}</span>
                      {label}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* Doctor notice in signup */}
          {registerMode && step === 'auth' && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[12px] text-neutral-500 mb-5 text-center">
              <LuStethoscope className="inline mr-1" size={13} />
              Doctor?{' '}
              <a href="/careers" className="text-[var(--teal)] font-semibold underline underline-offset-4 hover:text-[var(--teal-dark)] transition-colors">Join us here</a>
            </motion.p>
          )}

          {/* Forms */}
          <AnimatePresence mode="wait">
            {step === 'verify' ? (
              <motion.form key="verify" variants={stagger} initial="initial" animate="animate" exit="exit"
                onSubmit={handleVerifyOTP} className="space-y-4 text-center mt-2">
                <div className="w-16 h-16 mx-auto bg-emerald-50 rounded-full flex items-center justify-center mb-2">
                  <FiMail size={28} className="text-emerald-500" />
                </div>
                <h3 className="text-[17px] font-semibold text-neutral-800">Check your email</h3>
                <p className="text-[13px] text-neutral-500 max-w-xs mx-auto leading-relaxed">
                  We've sent a 6-digit verification code to <br/><span className="font-medium text-neutral-800">{registeredEmail}</span>
                </p>
                <div className="pt-2">
                  <input type="text" value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="------" disabled={isMutationLoading}
                    className="w-full text-center tracking-[0.5em] font-mono text-xl py-3 bg-white border rounded-xl transition-all disabled:opacity-40"
                    style={{ borderColor: 'var(--border)', color: 'var(--text)', outline: 'none' }}
                    onFocus={e => { e.target.style.borderColor = 'var(--teal)'; e.target.style.boxShadow = '0 0 0 3px var(--teal-muted)'; }}
                    onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }} />
                </div>
                <motion.button variants={fadeUp} type="submit" disabled={isMutationLoading || otp.length !== 6} whileTap={{ scale: 0.98 }}
                  className="w-full py-3 text-white text-[14px] font-semibold rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
                  style={{ background: 'var(--teal)' }}>
                  {isMutationLoading ? <Spinner text="Verifying..." /> : 'Verify Account'}
                </motion.button>
                <button type="button" onClick={() => setStep('auth')} className="text-[12px] text-neutral-400 hover:text-neutral-600 font-medium mt-2">
                  Back to login
                </button>
              </motion.form>
            ) : registerMode ? (
              <motion.form key="register" variants={stagger} initial="initial" animate="animate" exit="exit"
                onSubmit={handleRegister} className="space-y-3">
                <Field label="Full Name" type="text" value={firstName} onChange={setFirstName}
                  placeholder="Your full name" icon={<FiUser size={15} />} disabled={loading} />
                <Field label="Email" type="email" value={email} onChange={setEmail}
                  placeholder="rahul.sharma@gmail.com" icon={<FiMail size={15} />} disabled={loading} />
                <Field label="Phone" type="tel" value={phoneNo} onChange={setPhoneNo}
                  placeholder="+91 84487 45066" icon={<FiPhone size={15} />} disabled={loading} />
                
                {/* Password row */}
                <motion.div variants={fadeUp} className="space-y-1">
                  <label className="block text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>Password</label>
                  <div className="relative group">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400 group-focus-within:text-[var(--teal)] transition-colors pointer-events-none"><FiLock size={15} /></span>
                    <input type={showPw ? 'text' : 'password'} value={registerPassword}
                      onChange={e => setRegisterPassword(e.target.value)} placeholder="Password" disabled={loading}
                      className="w-full pl-10 pr-10 py-2.5 bg-white border rounded-xl text-[13px] transition-all disabled:opacity-40"
                      style={{ borderColor: 'var(--border)', color: 'var(--text)', outline: 'none' }}
                      onFocus={e => { e.target.style.borderColor = 'var(--teal)'; e.target.style.boxShadow = '0 0 0 3px var(--teal-muted)'; }}
                      onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }} />
                    <button type="button" onClick={() => setShowPw(p => !p)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600">
                      {showPw ? <FiEyeOff size={15} /> : <FiEye size={15} />}
                    </button>
                  </div>
                  {/* Password Strength Indicator */}
                  <AnimatePresence>
                    {registerPassword.length > 0 && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0, filter: 'blur(4px)' }} 
                        animate={{ opacity: 1, height: 'auto', filter: 'blur(0px)' }} 
                        exit={{ opacity: 0, height: 0, filter: 'blur(4px)' }}
                        transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
                        className="pt-1.5 pb-1 space-y-1.5 px-0.5 overflow-hidden"
                      >
                        <div className="flex justify-between items-center text-[9px] font-semibold uppercase tracking-wider text-neutral-400">
                          <span>Strength</span>
                          <motion.span 
                            animate={{ color: getPasswordStrength(registerPassword).color }}
                            transition={{ duration: 0.3 }}
                          >
                            {getPasswordStrength(registerPassword).label}
                          </motion.span>
                        </div>
                        <div className="flex gap-1 h-1 w-full">
                          {[25, 50, 75, 100].map((threshold, idx) => {
                            const strength = getPasswordStrength(registerPassword);
                            const isActive = strength.score >= threshold;
                            return (
                              <motion.div 
                                key={threshold} 
                                className="flex-1 rounded-full"
                                initial={false}
                                animate={{ 
                                  backgroundColor: isActive ? strength.color : 'rgba(156, 163, 175, 0.2)',
                                  boxShadow: isActive ? `0 0 10px ${strength.color}50` : 'none',
                                }}
                                transition={{ 
                                  duration: 0.5, 
                                  ease: [0.25, 1, 0.5, 1], // ultra-smooth easeOut
                                  delay: isActive ? idx * 0.04 : 0 
                                }}
                              />
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>

                <motion.div variants={fadeUp} className="space-y-1">
                  <label className="block text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>Confirm</label>
                  <div className="relative group">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400 group-focus-within:text-[var(--teal)] transition-colors pointer-events-none"><FiLock size={15} /></span>
                    <input type={showConfirm ? 'text' : 'password'} value={registerConfirm}
                      onChange={e => setRegisterConfirm(e.target.value)} placeholder="Confirm Password" disabled={loading}
                      className="w-full pl-10 pr-10 py-2.5 bg-white border rounded-xl text-[13px] transition-all disabled:opacity-40"
                      style={{ borderColor: 'var(--border)', color: 'var(--text)', outline: 'none' }}
                      onFocus={e => { e.target.style.borderColor = 'var(--teal)'; e.target.style.boxShadow = '0 0 0 3px var(--teal-muted)'; }}
                      onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }} />
                    <button type="button" onClick={() => setShowConfirm(p => !p)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600">
                      {showConfirm ? <FiEyeOff size={15} /> : <FiEye size={15} />}
                    </button>
                  </div>
                </motion.div>

                <motion.button variants={fadeUp} type="submit" disabled={loading} whileTap={{ scale: 0.98 }}
                  className="w-full mt-3 py-2.5 text-white text-[14px] font-semibold rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
                  style={{ background: 'var(--teal)', border: '1px solid rgba(0,0,0,0.05)' }}
                  onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = 'var(--teal-dark)'}
                  onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'var(--teal)'}>
                  {loading ? <Spinner text="Creating Account..." /> : 'Create Account'}
                </motion.button>
              </motion.form>
            ) : (
              <motion.form key="login" variants={stagger} initial="initial" animate="animate" exit="exit"
                onSubmit={handleLogin} className="space-y-3">
                <Field label="Email or Phone" type="text" value={username} onChange={setUsername}
                  placeholder="Enter your email or phone" icon={<FiMail size={15} />} disabled={loading} />
                <Field label="Password" type="password" value={password} onChange={setPassword}
                  placeholder="Enter your password" icon={<FiLock size={15} />} disabled={loading}
                  toggle showPw={showLoginPw} onToggle={() => setShowLoginPw(p => !p)} />
                <motion.div variants={fadeUp} className="flex justify-end pt-0.5">
                  <button type="button" onClick={() => navigate('/forgot-password')}
                    className="text-[13px] text-[var(--teal)] hover:text-[var(--teal-dark)] font-semibold transition-colors underline-offset-4 hover:underline">
                    Forgot password?
                  </button>
                </motion.div>
                <motion.button variants={fadeUp} type="submit" disabled={loading} whileTap={{ scale: 0.98 }}
                  className="w-full py-2.5 text-white text-[14px] font-semibold rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
                  style={{ background: isProfessional ? 'var(--sage)' : 'var(--teal)', border: '1px solid rgba(0,0,0,0.05)' }}
                  onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = isProfessional ? '#5b8f74' : 'var(--teal-dark)'}
                  onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = isProfessional ? 'var(--sage)' : 'var(--teal)'}>
                  {loading ? <Spinner text="Signing in..." /> : `Sign In as ${isProfessional ? 'Doctor' : 'Patient'}`}
                </motion.button>
              </motion.form>
            )}
          </AnimatePresence>

          {/* Divider */}
          {!isProfessional && step === 'auth' && (
            <div className="flex items-center gap-4 my-5">
              <div className="flex-1 h-px bg-neutral-200" />
              <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-widest" style={{ fontFamily: 'var(--font-mono)' }}>or continue with</span>
              <div className="flex-1 h-px bg-neutral-200" />
            </div>
          )}

          {/* Google */}
          {!isProfessional && step === 'auth' && (
            <motion.button whileTap={{ scale: 0.98 }} onClick={handleGoogleAuth}
              className="w-full flex items-center justify-center gap-2 py-2.5 border border-neutral-200 rounded-xl text-[14px] font-semibold text-neutral-700 bg-white hover:bg-neutral-50 hover:border-neutral-300 transition-all shadow-sm">
              <FcGoogle size={18} /> Google
            </motion.button>
          )}

          {/* Error / success */}
          <AnimatePresence>
            {(error || registerMsg) && (
              <motion.div key="msg" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className={`mt-5 px-3 py-2.5 rounded-xl text-[12px] font-semibold text-center border ${registerMsg.includes('successful') ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
                {error || registerMsg}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Admin */}
          <div className="mt-6 pt-4 border-t border-neutral-100 text-center">
            <button onClick={() => navigate('/admin-login')}
              className="inline-flex items-center gap-1.5 text-[11px] text-neutral-400 hover:text-neutral-600 font-semibold transition-colors uppercase tracking-widest" style={{ fontFamily: 'var(--font-mono)' }}>
              Admin Portal <FiChevronRight size={13} />
            </button>
          </div>
        </motion.div>

        {/* Footer */}
        <p className="mt-8 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
          Veraawell &copy; {new Date().getFullYear()}
        </p>
      </div>

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
