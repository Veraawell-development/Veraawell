import React from 'react';
import { useScrollReveal } from '../../../hooks/useScrollReveal';
import LeafDecor from '../../ui/LeafDecor';

const FeaturesSection: React.FC = () => {
  const sectionRef = useScrollReveal<HTMLElement>();

  return (
    <section
      ref={sectionRef}
      className="section-white relative overflow-hidden"
      style={{ padding: 'clamp(80px, 10vw, 140px) 1rem' }}
    >
      {/* Decorative Leaves */}
      <LeafDecor
        style={{
          top: '20px',
          left: '-60px',
          width: '240px',
          height: '240px',
          transform: 'rotate(-45deg)',
          opacity: 0.03,
        }}
      />
      <LeafDecor
        style={{
          bottom: '80px',
          right: '-80px',
          width: '320px',
          height: '320px',
          transform: 'rotate(135deg)',
          opacity: 0.05,
        }}
      />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">

        {/* Header */}
        <div className="mb-16 sm:mb-20 text-center sm:text-left flex flex-col sm:flex-row justify-between items-end gap-6" data-reveal data-delay="0">
          <div>
            <div className="flex items-center gap-2 mb-4 justify-center sm:justify-start">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--teal)' }} />
              <span
                className="text-xs font-bold tracking-widest uppercase"
                style={{ color: 'var(--teal)', fontFamily: 'var(--font-mono)' }}
              >
                Our Platform
              </span>
            </div>
            <h2
              className="leading-[1.1]"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(36px, 4.5vw, 56px)',
                color: 'var(--text)',
                letterSpacing: 'normal',
                wordSpacing: '0.05em',
                maxWidth: '600px',
              }}
            >
              Everything you need for your <em style={{ color: 'var(--teal)' }}>wellness journey.</em>
            </h2>
          </div>
          <p 
            className="text-base sm:text-lg max-w-sm text-center sm:text-left" 
            style={{ color: 'var(--text-2)', fontFamily: 'var(--font-body)' }}
          >
            A thoughtful space designed to make seeking help intuitive, secure, and encouraging.
          </p>
        </div>

        {/* Premium Bento Grid - Illustrated */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

          {/* Card 1 — Large Focus (Dashboard) */}
          <div
            data-reveal
            data-delay="1"
            className="md:col-span-2 lg:col-span-2 rounded-[32px] p-8 sm:p-10 cursor-pointer overflow-hidden relative group bg-[var(--surface)] border border-[var(--border)] shadow-sm hover:shadow-xl hover:border-transparent transition-all duration-500 ease-out hover:-translate-y-1 hover:bg-[#F0FBFC]"
          >
            {/* Soft background glow */}
            <div 
              className="absolute -bottom-20 -right-20 w-96 h-96 rounded-full opacity-10 transition-transform duration-700 group-hover:scale-125"
              style={{ background: 'radial-gradient(circle, var(--teal) 0%, transparent 70%)' }}
            />

            <div className="relative z-10 flex flex-col h-full justify-between w-full sm:w-1/2">
              <div>
                <p className="text-[11px] font-bold mb-3 tracking-widest uppercase" style={{ color: 'var(--teal)' }}>01</p>
                <h3
                  className="text-2xl sm:text-[28px] font-bold mb-4 leading-tight tracking-tight"
                  style={{ color: 'var(--text)', fontFamily: 'var(--font-body)' }}
                >
                  Progress-Tracking Dashboard
                </h3>
                <p className="text-[15px] leading-relaxed max-w-md" style={{ color: 'var(--text-2)' }}>
                  Visualise your healing journey with detailed analytics and session history. See how far you've come.
                </p>
              </div>
              
              <div
                className="mt-10 text-[13px] font-bold flex items-center gap-2 group-hover:gap-3 transition-all duration-300 uppercase tracking-widest"
                style={{ color: 'var(--teal)' }}
              >
                <span>Explore Dashboard</span>
                <span>→</span>
              </div>
            </div>

            {/* Custom UI Illustration: Mini Dashboard */}
            <div className="hidden sm:block absolute right-0 top-0 bottom-0 w-1/2">
              <div className="absolute inset-y-8 right-8 left-4 rounded-2xl bg-white/60 backdrop-blur-md border border-white shadow-[0_8px_32px_rgba(0,151,178,0.08)] p-5 flex flex-col gap-4 transform transition-transform duration-500 group-hover:-translate-x-2 group-hover:-translate-y-2">
                {/* Chart Mock */}
                <div className="flex-1 rounded-xl bg-gradient-to-tr from-[#E6F5F7] to-white border border-[#D0EDF2] relative overflow-hidden flex items-end shadow-inner">
                  <svg viewBox="0 0 100 40" className="w-full h-full text-[var(--teal)] opacity-80" preserveAspectRatio="none">
                    <path d="M0,40 L0,20 C10,20 15,30 25,30 C35,30 40,10 50,10 C60,10 65,25 75,25 C85,25 90,5 100,5 L100,40 Z" fill="currentColor" fillOpacity="0.1" />
                    <path d="M0,20 C10,20 15,30 25,30 C35,30 40,10 50,10 C60,10 65,25 75,25 C85,25 90,5 100,5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
                {/* Stats Mock */}
                <div className="h-14 rounded-xl bg-white/90 border border-gray-100 flex items-center px-4 gap-3 shadow-sm">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: 'var(--teal-muted)', color: 'var(--teal-dark)' }}>12</div>
                  <div className="flex-1 space-y-1.5">
                    <div className="h-2 w-16 bg-gray-200 rounded-full" />
                    <div className="h-2 w-full bg-gray-100 rounded-full" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2 - Vertical Focus (Network) */}
          <div
            data-reveal
            data-delay="2"
            className="rounded-[32px] p-8 cursor-pointer relative group overflow-hidden bg-[var(--surface)] border border-[var(--border)] shadow-sm hover:shadow-xl hover:border-transparent transition-all duration-500 ease-out hover:-translate-y-1 hover:bg-[#F2F8F5]"
          >
            <div className="relative z-10 flex flex-col h-full justify-between">
              <div>
                <p className="text-[11px] font-bold mb-3 tracking-widest uppercase" style={{ color: 'var(--sage)' }}>02</p>
                <h3
                  className="text-[22px] font-bold mb-3 leading-snug tracking-tight"
                  style={{ color: 'var(--text)', fontFamily: 'var(--font-body)' }}
                >
                  Network of Experts
                </h3>
                <p className="text-[14px] leading-relaxed mb-12" style={{ color: 'var(--text-2)' }}>
                  Verified specialists in CBT, mindfulness, trauma, & couples therapy.
                </p>
              </div>

              {/* Custom UI Illustration: Avatar Cluster */}
              <div className="relative h-16 mt-auto">
                <div className="absolute bottom-0 right-0 flex -space-x-3 transition-transform duration-500 group-hover:scale-105 group-hover:-translate-y-1">
                  <div className="w-12 h-12 rounded-full border-[3px] border-white shadow-md z-30" style={{ background: 'url(/priya.png) center/cover', backgroundColor: '#e2e8f0' }} />
                  <div className="w-12 h-12 rounded-full border-[3px] border-white shadow-md z-20 flex items-center justify-center text-xs font-bold" style={{ background: 'rgba(107, 168, 136, 0.2)', color: 'var(--sage)' }}>JS</div>
                  <div className="w-12 h-12 rounded-full border-[3px] border-white shadow-md z-10 flex items-center justify-center text-xs font-bold" style={{ background: 'rgba(0, 151, 178, 0.15)', color: 'var(--teal)' }}>AM</div>
                </div>
              </div>
            </div>
          </div>

          {/* Card 3 - Session Reports */}
          <div
            data-reveal
            data-delay="3"
            className="rounded-[28px] p-8 cursor-pointer relative group overflow-hidden bg-[var(--surface)] border border-[var(--border)] shadow-sm hover:shadow-lg hover:border-transparent transition-all duration-500 ease-out hover:-translate-y-1 hover:bg-[#FDFCF9]"
          >
            <div className="relative z-10">
              <p className="text-[11px] font-bold mb-2 tracking-widest uppercase" style={{ color: 'var(--gold)' }}>03</p>
              <h3
                className="text-[19px] font-bold mb-2 leading-snug tracking-tight"
                style={{ color: 'var(--text)', fontFamily: 'var(--font-body)' }}
              >
                Session-Wise Reports
              </h3>
              <p className="text-[14px] leading-relaxed relative z-20" style={{ color: 'var(--text-2)' }}>
                Detailed post-session notes and therapist insights after every appointment.
              </p>
            </div>
            
            {/* Custom UI Illustration: Document */}
            <div className="absolute -bottom-6 -right-6 w-36 h-36 rounded-tl-[40px] rounded-br-[28px] border-l-2 border-t-2 flex items-center justify-center transition-all duration-500 group-hover:-translate-x-2 group-hover:-translate-y-2 group-hover:shadow-[-8px_-8px_24px_rgba(196,168,130,0.1)]" style={{ background: 'rgba(196, 168, 130, 0.1)', borderColor: 'rgba(196, 168, 130, 0.3)' }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--gold)' }} className="opacity-80">
                <path d="M14 2H6C4.89543 2 4 2.89543 4 4V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V8L14 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M14 2V8H20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M16 13H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M16 17H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M10 9H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>

          {/* Card 4 - Secure */}
          <div
            data-reveal
            data-delay="4"
            className="rounded-[28px] p-8 cursor-pointer relative group overflow-hidden bg-[var(--surface)] border border-[var(--border)] shadow-sm hover:shadow-lg hover:border-transparent transition-all duration-500 ease-out hover:-translate-y-1 hover:bg-[#F0F9FA]"
          >
            <div className="relative z-10 w-2/3">
              <p className="text-[11px] font-bold mb-2 tracking-widest uppercase" style={{ color: 'var(--teal-dark)' }}>04</p>
              <h3
                className="text-[19px] font-bold mb-2 leading-snug tracking-tight"
                style={{ color: 'var(--text)', fontFamily: 'var(--font-body)' }}
              >
                Private & Secure
              </h3>
              <p className="text-[14px] leading-relaxed" style={{ color: 'var(--text-2)' }}>
                Bank-level encryption for video sessions and messages.
              </p>
            </div>

            {/* Custom UI Illustration: Shield */}
            <div className="absolute top-1/2 right-4 -translate-y-1/2 w-24 h-24 flex items-center justify-center transition-transform duration-500 group-hover:scale-110">
              <div className="absolute inset-0 rounded-full border border-teal-200 opacity-20 animate-ping" />
              <div className="absolute inset-3 rounded-full border border-teal-300/40" />
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--teal-dark)' }} className="relative z-10">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>

          {/* Card 5 - Pricing */}
          <div
            data-reveal
            data-delay="5"
            className="rounded-[28px] p-8 cursor-pointer relative group overflow-hidden bg-[var(--surface)] border border-[var(--border)] shadow-sm hover:shadow-lg hover:border-transparent transition-all duration-500 ease-out hover:-translate-y-1 hover:bg-[#FDF6F3]"
          >
            <div className="relative z-10">
              <p className="text-[11px] font-bold mb-2 tracking-widest uppercase" style={{ color: 'var(--warm)' }}>05</p>
              <h3
                className="text-[19px] font-bold mb-2 leading-snug tracking-tight"
                style={{ color: 'var(--text)', fontFamily: 'var(--font-body)' }}
              >
                Flexible Pricing
              </h3>
              <p className="text-[14px] leading-relaxed relative z-20" style={{ color: 'var(--text-2)' }}>
                Pay per session or subscribe. No hidden fees.
              </p>
            </div>

            {/* Custom UI Illustration: Toggle */}
            <div className="absolute -bottom-4 -right-4 w-32 h-24 rounded-tl-[32px] border-l-2 border-t-2 flex items-center justify-center transition-transform duration-500 group-hover:-translate-x-2 group-hover:-translate-y-2" style={{ background: 'rgba(232, 149, 109, 0.1)', borderColor: 'rgba(232, 149, 109, 0.2)' }}>
              <div className="w-14 h-7 bg-white rounded-full border flex items-center px-1 shadow-inner" style={{ borderColor: 'rgba(232, 149, 109, 0.3)' }}>
                <div className="w-5 h-5 rounded-full shadow-sm transition-transform duration-500 group-hover:translate-x-7" style={{ background: 'var(--warm)' }} />
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
