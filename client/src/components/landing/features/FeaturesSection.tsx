import React from 'react';
import { useScrollReveal } from '../../../hooks/useScrollReveal';
import LeafDecor from '../../ui/LeafDecor';

const features = [
  {
    id: 1,
    icon: (
      <svg width="32" height="32" viewBox="0 0 28 28" fill="none">
        <path d="M4 20L10 13L14 17L20 9L24 14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M4 24H24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.4"/>
      </svg>
    ),
    label: '01',
    title: 'Progress-Tracking Dashboard',
    description: 'Visualise your healing journey with detailed analytics and session history. See how far you\'ve come.',
    accentColor: 'var(--teal)',
    accentBg: 'var(--teal-muted)',
    hoverBg: '#F0FBFC',
  },
  {
    id: 2,
    icon: (
      <svg width="32" height="32" viewBox="0 0 28 28" fill="none">
        <circle cx="10" cy="10" r="5" stroke="currentColor" strokeWidth="2.5"/>
        <circle cx="20" cy="10" r="5" stroke="currentColor" strokeWidth="2.5"/>
        <path d="M3 24c0-4 3-6 7-6M18 18c4 0 7 2 7 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
      </svg>
    ),
    label: '02',
    title: 'Network of Experts',
    description: 'Verified specialists in CBT, mindfulness, trauma, & couples therapy.',
    accentColor: 'var(--sage)',
    accentBg: 'rgba(107, 168, 136, 0.15)',
    hoverBg: '#F2F8F5',
  },
  {
    id: 3,
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <rect x="5" y="4" width="18" height="22" rx="3" stroke="currentColor" strokeWidth="2.5"/>
        <path d="M9 12h10M9 16h7M9 20h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
        <circle cx="9" cy="8" r="1.5" fill="currentColor"/>
      </svg>
    ),
    label: '03',
    title: 'Session-Wise Reports',
    description: 'Detailed post-session notes and therapist insights after every appointment.',
    accentColor: 'var(--gold)',
    accentBg: 'rgba(196, 168, 130, 0.15)',
    hoverBg: '#FDFCF9',
  },
  {
    id: 4,
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <rect x="4" y="8" width="20" height="14" rx="4" stroke="currentColor" strokeWidth="2.5"/>
        <path d="M10 8V6a4 4 0 018 0v2" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
        <path d="M12 15l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    label: '04',
    title: 'Private & Secure',
    description: 'Bank-level encryption for all your video sessions and personal messages.',
    accentColor: 'var(--teal-dark)',
    accentBg: 'rgba(0, 122, 142, 0.12)',
    hoverBg: '#F0F9FA',
  },
  {
    id: 5,
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <path d="M14 4v20M6 8l8-4 8 4M6 20l8 4 8-4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M6 14h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
      </svg>
    ),
    label: '05',
    title: 'Flexible Pricing',
    description: 'Pay per session or subscribe. Transparent pricing with no hidden fees.',
    accentColor: 'var(--warm)',
    accentBg: 'rgba(232, 149, 109, 0.15)',
    hoverBg: '#FDF6F3',
  },
];

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
                className="text-xs font-semibold tracking-widest uppercase"
                style={{ color: 'var(--teal)', fontFamily: 'var(--font-mono)' }}
              >
                Our Platform
              </span>
            </div>
            <h2
              className="leading-tight"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(36px, 4.5vw, 56px)',
                color: 'var(--text)',
                letterSpacing: '-0.02em',
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

        {/* Premium Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

          {/* Card 1 — Large Focus (col-span-1 md:col-span-2 lg:col-span-2) */}
          <div
            data-reveal
            data-delay="1"
            className="md:col-span-2 lg:col-span-2 feature-card rounded-[32px] p-8 sm:p-10 cursor-pointer overflow-hidden relative group"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-sm)',
              transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-lg)';
              (e.currentTarget as HTMLDivElement).style.background = features[0].hoverBg;
              (e.currentTarget as HTMLDivElement).style.borderColor = 'transparent';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-sm)';
              (e.currentTarget as HTMLDivElement).style.background = 'var(--surface)';
              (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)';
            }}
          >
            {/* Background Graphic Decor */}
            <div 
              className="absolute -bottom-10 -right-10 w-64 h-64 rounded-full opacity-10 transition-transform duration-700 group-hover:scale-110"
              style={{ background: 'radial-gradient(circle, var(--teal) 0%, transparent 70%)' }}
            />

            <div className="relative z-10 flex flex-col h-full justify-between">
              <div>
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center mb-8 transition-transform duration-300 group-hover:-translate-y-1"
                  style={{ background: features[0].accentBg, color: features[0].accentColor }}
                >
                  {features[0].icon}
                </div>
                <h3
                  className="text-2xl sm:text-3xl font-semibold mb-4 leading-tight"
                  style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}
                >
                  {features[0].title}
                </h3>
                <p className="text-base leading-relaxed max-w-md" style={{ color: 'var(--text-2)' }}>
                  {features[0].description}
                </p>
              </div>
              
              <div
                className="mt-10 text-sm font-semibold flex items-center gap-2 group-hover:gap-3 transition-all duration-300"
                style={{ color: features[0].accentColor }}
              >
                <span style={{ borderBottom: `1.5px solid ${features[0].accentBg}`, paddingBottom: '2px' }}>Explore Dashboard</span>
                <span>→</span>
              </div>
            </div>
          </div>

          {/* Card 2 - Vertical Focus */}
          <div
            data-reveal
            data-delay="2"
            className="feature-card rounded-[32px] p-8 cursor-pointer relative group overflow-hidden"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-sm)',
              transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-md)';
              (e.currentTarget as HTMLDivElement).style.background = features[1].hoverBg;
              (e.currentTarget as HTMLDivElement).style.borderColor = 'transparent';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-sm)';
              (e.currentTarget as HTMLDivElement).style.background = 'var(--surface)';
              (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)';
            }}
          >
            <div className="relative z-10">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6 transition-transform duration-300 group-hover:rotate-3"
                style={{ background: features[1].accentBg, color: features[1].accentColor }}
              >
                {features[1].icon}
              </div>
              <h3
                className="text-xl font-semibold mb-3 leading-snug"
                style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}
              >
                {features[1].title}
              </h3>
              <p className="text-sm leading-relaxed mb-6" style={{ color: 'var(--text-2)' }}>
                {features[1].description}
              </p>
            </div>
          </div>

          {/* Cards 3, 4, 5 — Bottom Row */}
          {[2, 3, 4].map((fi) => (
            <div
              key={fi}
              data-reveal
              data-delay={`${fi + 1}` as any}
              className="feature-card rounded-[28px] p-7 cursor-pointer group"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-sm)',
                transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-md)';
                (e.currentTarget as HTMLDivElement).style.background = features[fi].hoverBg;
                (e.currentTarget as HTMLDivElement).style.borderColor = 'transparent';
                (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-4px)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-sm)';
                (e.currentTarget as HTMLDivElement).style.background = 'var(--surface)';
                (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)';
                (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
              }}
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mb-5 transition-transform duration-300 group-hover:scale-105"
                style={{ background: features[fi].accentBg, color: features[fi].accentColor }}
              >
                {features[fi].icon}
              </div>
              <h3
                className="text-lg font-semibold mb-2 leading-snug"
                style={{ color: 'var(--text)', fontFamily: 'var(--font-body)' }}
              >
                {features[fi].title}
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-2)' }}>
                {features[fi].description}
              </p>
            </div>
          ))}

        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
