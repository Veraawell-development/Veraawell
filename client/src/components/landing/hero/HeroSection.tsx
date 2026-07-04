import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import LeafDecor from '../../ui/LeafDecor';

/* ─── Wellness Companion Card (hero right side) ──────────────── */
const WellnessCard: React.FC = () => {
  const [selectedMood, setSelectedMood] = useState(3);

  // Replaced childish emojis with a premium color-scale mood selector
  const moods = [
    { color: '#E8956D', bg: '#FDF6F3', label: 'Low' },       // Warm/Rose
    { color: '#F4A261', bg: '#FEF8F3', label: 'Okay' },      // Orange
    { color: '#C4A882', bg: '#FDFCF9', label: 'Good' },      // Gold
    { color: '#6BA888', bg: '#F2F8F5', label: 'Great' },     // Sage
    { color: '#0097B2', bg: '#F0FBFC', label: 'Amazing' },   // Teal
  ];

  return (
    <div className="relative select-none" style={{ maxWidth: '380px', width: '100%' }}>
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
        <div style={{ padding: '32px 28px' }}>
          {/* Greeting */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <p
                className="text-xs font-semibold mb-1 uppercase tracking-widest"
                style={{ color: 'var(--sage)' }}
              >
                Good Morning
              </p>
              <h3
                className="text-xl font-medium"
                style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}
              >
                Isha ☀️
              </h3>
            </div>
            <div
              className="px-3 py-1.5 rounded-full text-xs font-medium border"
              style={{ 
                background: 'rgba(255,255,255,0.8)', 
                color: 'var(--teal-dark)',
                borderColor: 'rgba(0,151,178,0.2)'
              }}
            >
              Week 8
            </div>
          </div>

          {/* Daily affirmation */}
          <div
            className="rounded-2xl p-5 mb-6 relative overflow-hidden"
            style={{ 
              background: 'rgba(240, 248, 249, 0.7)',
              border: '1px solid rgba(0, 151, 178, 0.1)' 
            }}
          >
            <div className="absolute top-0 right-0 w-24 h-24 bg-white rounded-full mix-blend-overlay filter blur-xl opacity-50 transform translate-x-1/2 -translate-y-1/2" />
            <p
              className="text-xs font-semibold mb-2 uppercase tracking-widest"
              style={{ color: 'var(--teal-dark)' }}
            >
              Daily Reflection
            </p>
            <p
              className="text-base leading-relaxed font-serif"
              style={{
                color: 'var(--text)',
                fontFamily: 'var(--font-display)',
                lineHeight: 1.5,
              }}
            >
              "Healing is not linear. Every small step forward is a victory."
            </p>
          </div>

          {/* Mood check-in (Premium Color Scale) */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <p
                className="text-sm font-medium"
                style={{ color: 'var(--text-2)' }}
              >
                How are you feeling today?
              </p>
              <span className="text-xs font-medium" style={{ color: moods[selectedMood].color }}>
                {moods[selectedMood].label}
              </span>
            </div>
            
            <div className="flex justify-between items-center bg-white p-2.5 rounded-2xl border border-gray-100 shadow-sm relative overflow-hidden">
              {/* Dynamic background highlight */}
              <div 
                className="absolute top-2 bottom-2 rounded-xl transition-all duration-500 ease-out"
                style={{
                  width: 'calc(20% - 8px)',
                  left: `calc(${selectedMood * 20}% + 4px)`,
                  background: moods[selectedMood].bg,
                  border: `1px solid ${moods[selectedMood].color}30`,
                }}
              />
              
              {moods.map((mood, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedMood(i)}
                  className="relative z-10 flex flex-col items-center justify-center w-full h-10 rounded-xl transition-all duration-300 group"
                >
                  <span 
                    className="w-5 h-5 rounded-full transition-all duration-400 ease-out group-hover:scale-110"
                    style={{ 
                      background: mood.color,
                      transform: selectedMood === i ? 'scale(1.3)' : 'scale(1)',
                      boxShadow: selectedMood === i ? `0 4px 12px ${mood.color}40` : 'none',
                      opacity: selectedMood !== i ? 0.4 : 1,
                    }} 
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Next session */}
          <div className="flex items-center gap-4 mb-5 p-3 rounded-2xl bg-white border border-gray-100 shadow-sm">
            <div
              className="w-12 h-12 rounded-full flex-shrink-0"
              style={{ 
                background: 'url(/priya.png) center/cover no-repeat',
                border: '2px solid var(--teal-muted)',
                boxShadow: '0 4px 10px rgba(0,0,0,0.05)'
              }}
            />
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900 mb-0.5">
                Dr. Priya Sharma
              </p>
              <p className="text-xs text-gray-500 flex items-center gap-1.5">
                <span>Today, 3:00 PM</span>
                <span className="w-1 h-1 rounded-full bg-gray-300" />
                <span>45 min</span>
              </p>
            </div>
            <span className="pulse-dot mr-2" />
          </div>

          {/* Begin session */}
          <button
            className="w-full py-3.5 rounded-2xl text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5"
            style={{
              background: 'linear-gradient(135deg, var(--teal-dark), var(--teal))',
              boxShadow: '0 8px 24px rgba(0, 151, 178, 0.25)',
            }}
          >
            Enter Safe Space →
          </button>
        </div>
      </div>

      {/* Floating badge — top left — "Safe Space" */}
      <div
        className="absolute rounded-2xl px-4 py-2.5"
        style={{
          top: '-20px',
          left: '-30px',
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 12px 32px rgba(26,46,50,0.08), 0 2px 8px rgba(26,46,50,0.04)',
          border: '1px solid rgba(255,255,255,1)',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          animation: 'float-card 7s ease-in-out infinite reverse',
        }}
      >
        <span className="w-6 h-6 rounded-full bg-green-50 flex items-center justify-center text-green-600 text-sm">🌿</span>
        <span className="text-xs font-semibold" style={{ color: 'var(--text-2)' }}>
          100% Confidential
        </span>
      </div>

      {/* Floating badge — bottom right — sessions */}
      <div
        className="absolute rounded-2xl px-5 py-3"
        style={{
          bottom: '-10px',
          right: '-25px',
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 12px 32px rgba(26,46,50,0.08), 0 2px 8px rgba(26,46,50,0.04)',
          border: '1px solid rgba(255,255,255,1)',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          animation: 'float-card 8s ease-in-out infinite 1s',
        }}
      >
        <div
          className="text-2xl font-bold"
          style={{ color: 'var(--teal)', fontFamily: 'var(--font-display)' }}
        >
          8/12
        </div>
        <div>
          <div className="text-sm font-semibold" style={{ color: 'var(--text)', lineHeight: 1.2 }}>
            Sessions
          </div>
          <div className="text-xs" style={{ color: 'var(--text-2)', lineHeight: 1.2 }}>
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
        className="absolute top-[-20%] left-[-10%] w-[70vw] h-[70vw] rounded-full mix-blend-multiply filter blur-[100px] opacity-40"
        style={{ background: 'radial-gradient(circle, rgba(0,151,178,0.15) 0%, transparent 70%)', animation: 'blob-drift 25s ease-in-out infinite alternate' }}
      />
      <div 
        className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] rounded-full mix-blend-multiply filter blur-[100px] opacity-40"
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
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">

          {/* ── Left: Text ── */}
          <div className="lg:col-span-6 lg:pr-8">
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
              className="mb-8 leading-[1.05]"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(48px, 6.5vw, 88px)',
                color: 'var(--text)',
                letterSpacing: '-0.02em',
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
            className="hidden lg:flex lg:col-span-6 items-center justify-center relative"
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
