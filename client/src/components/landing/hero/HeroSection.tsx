import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Calendar, Clock, ArrowRight, Quote } from 'lucide-react';

import LeafDecor from '../../ui/LeafDecor';

/* ─── Wellness Companion Card (hero right side) ──────────────── */
const WellnessCard: React.FC = () => {
  const [selectedMood, setSelectedMood] = useState(3);

  // Premium Color Scale
  const moods = [
    { color: '#E8956D', bg: '#FDF6F3', label: 'Low' },
    { color: '#F4A261', bg: '#FEF8F3', label: 'Okay' },
    { color: '#C4A882', bg: '#FDFCF9', label: 'Good' },
    { color: '#6BA888', bg: '#F2F8F5', label: 'Great' },
    { color: '#0097B2', bg: '#F0FBFC', label: 'Amazing' },
  ];

  return (
    <div className="relative select-none" style={{ maxWidth: '460px', width: '100%' }}>
      {/* Soft teal glow behind card */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(circle at 50% 50%, rgba(0, 151, 178, 0.15) 0%, transparent 60%)',
          filter: 'blur(40px)',
          transform: 'scale(1.2)',
          zIndex: 0,
        }}
      />

      {/* Main wellness card - Glassmorphism */}
      <div
        className="wellness-card relative"
        style={{
          background: 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(32px)',
          WebkitBackdropFilter: 'blur(32px)',
          borderRadius: '32px',
          boxShadow: '0 32px 64px rgba(26, 46, 50, 0.08), 0 2px 12px rgba(26, 46, 50, 0.03), inset 0 1px 1px rgba(255, 255, 255, 1)',
          border: '1px solid rgba(255, 255, 255, 0.6)',
          overflow: 'visible',
          zIndex: 1,
        }}
      >
        <div style={{ padding: '36px 32px' }}>
          {/* Greeting */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <p
                className="text-[11px] font-bold mb-1.5 uppercase tracking-widest"
                style={{ color: 'var(--sage)' }}
              >
                Good Morning
              </p>
              <h3
                className="text-2xl font-medium"
                style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}
              >
                Isha
              </h3>
            </div>
            <div
              className="px-3 py-1.5 rounded-full text-[11px] font-bold border tracking-wider uppercase"
              style={{ 
                background: 'rgba(255,255,255,0.9)', 
                color: 'var(--teal-dark)',
                borderColor: 'rgba(0,151,178,0.15)'
              }}
            >
              Week 8
            </div>
          </div>

          {/* Daily affirmation (Redesigned) */}
          <div
            className="rounded-[20px] p-6 mb-8 relative overflow-hidden group"
            style={{ 
              background: 'linear-gradient(135deg, #F0F8F9 0%, #F5FBFC 100%)',
              border: '1px solid rgba(0, 151, 178, 0.08)',
              boxShadow: 'inset 0 2px 10px rgba(255,255,255,1)'
            }}
          >
            <Quote 
              size={80} 
              className="absolute -top-4 -right-4 text-teal-900 opacity-[0.03] transform -rotate-12 transition-transform duration-700 group-hover:scale-110 group-hover:-rotate-6"
            />
            <p
              className="text-[11px] font-bold mb-3 uppercase tracking-[0.2em]"
              style={{ color: 'var(--teal-dark)' }}
            >
              Daily Reflection
            </p>
            <p
              className="text-[17px] leading-relaxed relative z-10"
              style={{
                color: 'var(--text)',
                fontFamily: 'var(--font-display)',
                fontStyle: 'italic',
              }}
            >
              "Healing is not linear. Every small step forward is a victory."
            </p>
          </div>

          {/* Mood check-in (Premium Segmented Control) */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <p
                className="text-[13px] font-semibold tracking-wide"
                style={{ color: 'var(--text-2)' }}
              >
                How are you feeling today?
              </p>
              <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: moods[selectedMood].color }}>
                {moods[selectedMood].label}
              </span>
            </div>
            
            <div className="flex justify-between items-center p-2 rounded-2xl relative" style={{ background: '#F8F6F2', border: '1px solid rgba(26, 46, 50, 0.04)', boxShadow: 'inset 0 2px 4px rgba(26, 46, 50, 0.02)' }}>
              {moods.map((mood, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedMood(i)}
                  className="relative z-10 flex flex-col items-center justify-center w-full h-10 rounded-xl transition-all duration-300 group focus:outline-none"
                >
                  <span 
                    className="rounded-full transition-all duration-400 ease-out flex items-center justify-center"
                    style={{ 
                      width: selectedMood === i ? '24px' : '16px',
                      height: selectedMood === i ? '24px' : '16px',
                      background: mood.color,
                      border: selectedMood === i ? '3px solid #ffffff' : '0px solid transparent',
                      boxShadow: selectedMood === i ? `0 4px 16px ${mood.color}60` : 'none',
                      opacity: selectedMood !== i ? 0.3 : 1,
                    }} 
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Next session (Calendar Ticket) */}
          <div className="mb-6 p-4 rounded-2xl bg-white border border-gray-100/80 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow duration-300">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-teal-400 to-teal-600 rounded-l-2xl opacity-80" />
            <div className="flex items-center gap-4">
              <div
                className="w-12 h-12 rounded-full flex-shrink-0"
                style={{ 
                  background: 'url(/priya.png) center/cover no-repeat',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
                }}
              />
              <div className="flex-1">
                <p className="text-[15px] font-semibold text-gray-900 mb-1 leading-tight">
                  Dr. Priya Sharma
                </p>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium">
                    <Calendar size={13} className="text-teal-600" />
                    <span>Today</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium">
                    <Clock size={13} className="text-teal-600" />
                    <span>3:00 PM</span>
                  </div>
                </div>
              </div>
              <span className="pulse-dot mr-1" />
            </div>
          </div>

          {/* Begin session */}
          <button
            className="group relative w-full py-4 rounded-2xl text-[15px] font-semibold text-white overflow-hidden transition-all duration-300 hover:-translate-y-0.5"
            style={{
              background: 'linear-gradient(135deg, var(--teal-dark), var(--teal))',
              boxShadow: '0 12px 28px rgba(0, 151, 178, 0.25)',
            }}
          >
            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
            <span className="relative z-10 flex items-center justify-center gap-2">
              Enter Safe Space
              <ArrowRight size={18} className="transition-transform duration-300 group-hover:translate-x-1" />
            </span>
          </button>
        </div>
      </div>

      {/* Floating badge — top left — "Safe Space" */}
      <div
        className="absolute rounded-[18px] px-5 py-3"
        style={{
          top: '-15px',
          left: '-25px',
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 12px 32px rgba(26,46,50,0.08), 0 2px 8px rgba(26,46,50,0.04)',
          border: '1px solid rgba(255,255,255,1)',
          borderTop: '1px solid rgba(255,255,255,0.8)',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          animation: 'float-card 7s ease-in-out infinite reverse',
        }}
      >
        <div className="w-8 h-8 rounded-full bg-teal-50 flex items-center justify-center border border-teal-100">
          <ShieldCheck size={16} className="text-teal-600" />
        </div>
        <span className="text-[13px] font-bold tracking-wide" style={{ color: 'var(--text-2)' }}>
          100% Confidential
        </span>
      </div>

      {/* Floating badge — bottom right — sessions */}
      <div
        className="absolute rounded-[20px] p-4"
        style={{
          bottom: '-20px',
          right: '-30px',
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 16px 40px rgba(26,46,50,0.1), 0 4px 12px rgba(26,46,50,0.05)',
          border: '1px solid rgba(255,255,255,1)',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          animation: 'float-card 8s ease-in-out infinite 1s',
        }}
      >
        {/* SVG Progress Ring */}
        <div className="relative w-12 h-12 flex items-center justify-center">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
            <path
              className="text-gray-100"
              strokeWidth="3.5"
              stroke="currentColor"
              fill="none"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
            <path
              className="text-teal-500"
              strokeWidth="3.5"
              strokeDasharray="66.6, 100"
              strokeLinecap="round"
              stroke="currentColor"
              fill="none"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
          </svg>
          <div className="absolute flex items-center justify-center inset-0 text-teal-700 font-bold text-xs font-mono">
            8
          </div>
        </div>
        
        <div>
          <div className="text-[13px] font-bold" style={{ color: 'var(--text)', lineHeight: 1.2 }}>
            Sessions
          </div>
          <div className="text-[11px] font-medium tracking-wide uppercase mt-0.5" style={{ color: 'var(--text-3)', lineHeight: 1.2 }}>
            Completed
          </div>
        </div>
      </div>
    </div>
  );
};

/* ─── Animated hero headline line ────────────────────────────── */
const HeroLine: React.FC<{ children: React.ReactNode; delay?: number; italic?: boolean; color?: string }> = ({
  children, delay = 0, italic = false, color
}) => {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return (
    <span className="block overflow-hidden" style={{ display: 'block', paddingBottom: '8px' }}>
      <span
        style={{
          display: 'block',
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: `opacity 1s cubic-bezier(0.16,1,0.3,1), transform 1s cubic-bezier(0.16,1,0.3,1)`,
          fontStyle: italic ? 'italic' : 'normal',
          color: color || 'inherit',
        }}
      >
        {children}
      </span>
    </span>
  );
};

/* ─── Hero Section ───────────────────────────────────────────── */
const HeroSection: React.FC = () => {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <section
      className="relative overflow-hidden grain-texture"
      style={{
        minHeight: '100vh',
        background: 'var(--bg)',
      }}
    >
      {/* Soft, warm, immersive background gradients */}
      <div 
        className="absolute top-[-20%] left-[-15%] w-[70vw] h-[70vw] rounded-full mix-blend-multiply filter blur-[100px] opacity-40"
        style={{ background: 'radial-gradient(circle, rgba(0,151,178,0.15) 0%, transparent 70%)', animation: 'blob-drift 25s ease-in-out infinite alternate' }}
      />
      <div 
        className="absolute bottom-[-10%] right-[-15%] w-[60vw] h-[60vw] rounded-full mix-blend-multiply filter blur-[100px] opacity-40"
        style={{ background: 'radial-gradient(circle, rgba(107,168,136,0.15) 0%, transparent 70%)', animation: 'blob-drift-2 20s ease-in-out infinite alternate' }}
      />
      <div 
        className="absolute top-[30%] right-[20%] w-[40vw] h-[40vw] rounded-full mix-blend-multiply filter blur-[80px] opacity-30"
        style={{ background: 'radial-gradient(circle, rgba(196,168,130,0.15) 0%, transparent 70%)', animation: 'blob-drift 30s ease-in-out infinite alternate-reverse' }}
      />

      {/* Decorative organic leaf — large, top right */}
      <LeafDecor
        style={{
          top: '-40px',
          right: '-40px',
          width: '320px',
          height: '320px',
          transform: 'rotate(45deg)',
          opacity: 0.8
        }}
      />
      {/* Small leaf — bottom left */}
      <LeafDecor
        style={{
          bottom: '10%',
          left: '-30px',
          width: '200px',
          height: '200px',
          transform: 'rotate(-15deg) scaleX(-1)',
          opacity: 0.4,
        }}
      />

      {/* Content */}
      <div
        className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col justify-center"
        style={{
          minHeight: '100vh',
          paddingTop: '80px',
          paddingBottom: '80px',
        }}
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">

          {/* ── Left: Text ── */}
          <div className="lg:col-span-7 lg:pr-12 xl:pr-16">
            {/* Eyebrow */}
            <div
              className="inline-flex items-center gap-3 mb-8 px-4 py-2 rounded-full bg-white/60 backdrop-blur-sm border border-gray-100 shadow-sm"
              style={{
                opacity: 0,
                animation: 'fade-up 0.8s 0.2s cubic-bezier(0.16,1,0.3,1) forwards',
              }}
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500"></span>
              </span>
              <span
                className="text-xs font-semibold tracking-widest uppercase"
                style={{ color: 'var(--teal-dark)' }}
              >
                A Safe Space For Your Mind
              </span>
            </div>

            {/* Headline */}
            <h1
              className="mb-8 leading-[1.1]"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(48px, 6.5vw, 88px)',
                color: 'var(--text)',
                letterSpacing: 'normal',
                wordSpacing: '0.05em',
              }}
            >
              <HeroLine delay={300}>Your mind</HeroLine>
              <HeroLine delay={450} italic color="var(--teal)">
                deserves the same
              </HeroLine>
              <HeroLine delay={600}>
                care as your body.
              </HeroLine>
            </h1>

            {/* Subtext */}
            <p
              className="mb-12 max-w-lg leading-relaxed text-lg sm:text-xl"
              style={{
                color: 'var(--text-2)',
                fontFamily: 'var(--font-body)',
                opacity: 0,
                animation: 'fade-up 0.8s 0.8s cubic-bezier(0.16,1,0.3,1) forwards',
              }}
            >
              Connect with India's most empathetic therapists. A thoughtfully designed platform for progress tracking, warm conversations, and healing at your own pace.
            </p>

            {/* CTAs */}
            <div
              className="flex flex-wrap items-center gap-4 mb-12"
              style={{
                opacity: 0,
                animation: 'fade-up 0.8s 1s cubic-bezier(0.16,1,0.3,1) forwards',
              }}
            >
              <button
                onClick={() => navigate('/choose-professional')}
                className="group relative inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full text-base font-semibold text-white overflow-hidden transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-teal-500/30"
                style={{
                  background: 'linear-gradient(135deg, var(--teal-dark), var(--teal))',
                }}
              >
                <span className="relative z-10 flex items-center gap-2">
                  Find Your Therapist
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="transition-transform duration-300 group-hover:translate-x-1">
                    <path d="M3.33334 8H12.6667M12.6667 8L8 3.33334M12.6667 8L8 12.6667" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
              </button>

              <button
                onClick={() => {
                  document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="inline-flex items-center gap-2 px-8 py-4 rounded-full text-base font-medium transition-all duration-300 hover:bg-white/60"
                style={{
                  color: 'var(--text-2)',
                  border: '1px solid transparent',
                }}
              >
                Learn how it works
              </button>
            </div>

            {/* Social proof */}
            <div
              className="flex items-center gap-4"
              style={{
                opacity: 0,
                animation: 'fade-up 0.8s 1.1s cubic-bezier(0.16,1,0.3,1) forwards',
              }}
            >
              <div className="flex -space-x-3">
                <img src="/priya.png" alt="User" className="w-10 h-10 rounded-full border-2 border-white object-cover shadow-sm" />
                <img src="/rohit.png" alt="User" className="w-10 h-10 rounded-full border-2 border-white object-cover shadow-sm" />
                <img src="/anjali.png" alt="User" className="w-10 h-10 rounded-full border-2 border-white object-cover shadow-sm" />
                <div className="w-10 h-10 rounded-full border-2 border-white bg-teal-50 flex items-center justify-center text-teal-700 text-xs font-bold shadow-sm">+1k</div>
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1 mb-0.5">
                  {[...Array(5)].map((_, i) => (
                    <svg key={i} width="14" height="14" viewBox="0 0 20 20" fill="#F59E0B">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-2)' }}>
                  Trusted by 1,000+ Indians
                </p>
              </div>
            </div>
          </div>

          {/* ── Right: Wellness Card ── */}
          <div
            className="hidden lg:flex lg:col-span-5 items-center justify-center relative"
            style={{
              opacity: 0,
              animation: 'fade-up 1s 0.6s cubic-bezier(0.16,1,0.3,1) forwards',
            }}
          >
            <WellnessCard />
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3"
        style={{
          opacity: scrolled ? 0 : 1,
          transition: 'opacity 0.6s ease',
        }}
      >
        <span
          className="text-xs font-semibold tracking-[0.2em] uppercase"
          style={{ color: 'var(--text-3)' }}
        >
          Scroll
        </span>
        <div className="w-[1px] h-12 relative overflow-hidden bg-gray-200">
          <div className="absolute top-0 left-0 w-full h-1/2 bg-teal-400 animate-[shimmer_2s_infinite]" />
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
