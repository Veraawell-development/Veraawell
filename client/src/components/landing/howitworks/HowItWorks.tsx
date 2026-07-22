import React, { useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useScrollReveal } from '../../../hooks/useScrollReveal';

/* ─── Step Connector SVG ─────────────────────────────────────── */
const StepConnector: React.FC = () => {
  const pathRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    const el = pathRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.style.strokeDashoffset = '0';
          observer.unobserve(el);
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="hidden lg:flex items-center justify-center w-16 flex-shrink-0 mt-20 z-0">
      <svg width="64" height="20" viewBox="0 0 64 20" fill="none">
        <path
          ref={pathRef}
          d="M0 10 Q32 10 64 10"
          stroke="url(#gradient-line)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="64"
          strokeDashoffset="64"
          style={{ transition: 'stroke-dashoffset 1s ease-out' }}
        />
        <defs>
          <linearGradient id="gradient-line" x1="0" y1="0" x2="64" y2="0" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--teal)" stopOpacity="0.4" />
            <stop offset="1" stopColor="var(--teal)" stopOpacity="0.8" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
};

const HowItWorks: React.FC = () => {
  const sectionRef = useScrollReveal<HTMLElement>();

  return (
    <section
      id="how-it-works"
      ref={sectionRef}
      className="section-white relative overflow-hidden"
      style={{ padding: 'clamp(64px, 8vw, 112px) 1rem', background: '#FAFAFA' }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Header */}
        <div className="text-center mb-20" data-reveal>
          <span
            className="text-xs font-bold tracking-widest uppercase block mb-4"
            style={{ color: 'var(--teal)', fontFamily: 'var(--font-mono)' }}
          >
            — How It Works
          </span>
          <h2
            className="leading-[1.15] mx-auto font-normal tracking-normal"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(32px, 4vw, 52px)',
              color: 'var(--text)',
              maxWidth: '600px',
            }}
          >
            Three steps to a healthier mind.
          </h2>
        </div>

        {/* Steps */}
        <div className="flex flex-col lg:flex-row items-center lg:items-stretch gap-8 lg:gap-0 relative">
          
          {/* Step 1 */}
          <div data-reveal data-delay="1" className="flex-1 w-full relative group">
            <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-[0_4px_24px_rgba(0,0,0,0.02)] hover:shadow-xl transition-all duration-500 ease-out hover:-translate-y-1 h-full flex flex-col relative z-10 overflow-hidden">
              <span className="absolute top-6 right-6 text-[11px] font-bold tracking-widest text-teal-600/40 uppercase">01</span>
              
              {/* Custom UI: Search Bar */}
              <div className="h-32 rounded-2xl bg-teal-50/80 border border-teal-100 mb-8 p-4 flex flex-col justify-center gap-3 relative overflow-hidden group-hover:bg-teal-100/50 transition-colors duration-500">
                <div className="h-10 bg-white rounded-xl shadow-sm border border-teal-200/60 flex items-center px-3 gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-teal-500"><path d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  <div className="h-2 w-20 bg-gray-200 rounded-full" />
                </div>
                <div className="flex gap-2">
                  <div className="h-6 px-3 bg-white rounded-full border border-teal-100 flex items-center shadow-sm">
                    <div className="h-1.5 w-10 bg-teal-300 rounded-full" />
                  </div>
                  <div className="h-6 px-3 bg-white rounded-full border border-sage-100 flex items-center shadow-sm">
                    <div className="h-1.5 w-12 bg-sage-300 rounded-full" />
                  </div>
                </div>
              </div>

              <h3 className="text-[22px] font-bold mb-3 leading-snug tracking-tight" style={{ color: 'var(--text)', fontFamily: 'var(--font-body)' }}>Find Your Therapist</h3>
              <p className="text-[15px] leading-relaxed text-gray-500">Browse our network of verified psychologists. Filter by specialisation, language, price, and availability.</p>
            </div>
          </div>

          <StepConnector />

          {/* Step 2 */}
          <div data-reveal data-delay="2" className="flex-1 w-full relative group">
            <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-[0_4px_24px_rgba(0,0,0,0.02)] hover:shadow-xl transition-all duration-500 ease-out hover:-translate-y-1 h-full flex flex-col relative z-10 overflow-hidden">
              <span className="absolute top-6 right-6 text-[11px] font-bold tracking-widest text-teal-600/40 uppercase">02</span>
              
              {/* Custom UI: Calendar */}
              <div className="h-32 rounded-2xl bg-slate-50 border border-slate-200/60 mb-8 p-4 flex flex-col justify-center items-center relative overflow-hidden group-hover:bg-slate-100/80 transition-colors duration-500">
                <div className="w-4/5 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="h-3 bg-teal-500/20 w-full" />
                  <div className="p-2 grid grid-cols-4 gap-1">
                    {[...Array(8)].map((_, i) => (
                      <div key={i} className={`h-4 rounded ${i === 5 ? 'bg-teal-400 shadow-sm shadow-teal-200' : 'bg-gray-100'}`} />
                    ))}
                  </div>
                </div>
              </div>

              <h3 className="text-[22px] font-bold mb-3 leading-snug tracking-tight" style={{ color: 'var(--text)', fontFamily: 'var(--font-body)' }}>Book a Session</h3>
              <p className="text-[15px] leading-relaxed text-gray-500">Pick a time that works for you. Instant booking, flexible scheduling — sessions in as little as a few hours.</p>
            </div>
          </div>

          <StepConnector />

          {/* Step 3 */}
          <div data-reveal data-delay="3" className="flex-1 w-full relative group">
            <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-[0_4px_24px_rgba(0,0,0,0.02)] hover:shadow-xl transition-all duration-500 ease-out hover:-translate-y-1 h-full flex flex-col relative z-10 overflow-hidden">
              <span className="absolute top-6 right-6 text-[11px] font-bold tracking-widest text-teal-600/40 uppercase">03</span>
              
              {/* Custom UI: Progress Chart */}
              <div className="h-32 rounded-2xl bg-amber-50/60 border border-amber-200/50 mb-8 p-4 flex items-end relative overflow-hidden group-hover:bg-amber-100/50 transition-colors duration-500">
                <svg viewBox="0 0 100 40" className="w-full h-24 text-amber-500 drop-shadow-sm opacity-100" preserveAspectRatio="none">
                  <path d="M0,40 L0,30 C10,30 20,35 30,25 C40,15 50,25 60,15 C70,5 80,15 100,5 L100,40 Z" fill="currentColor" fillOpacity="0.15" />
                  <path d="M0,30 C10,30 20,35 30,25 C40,15 50,25 60,15 C70,5 80,15 100,5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                  <circle cx="60" cy="15" r="3.5" fill="white" stroke="currentColor" strokeWidth="2" />
                  <circle cx="100" cy="5" r="3.5" fill="white" stroke="currentColor" strokeWidth="2" />
                </svg>
              </div>

              <h3 className="text-[22px] font-bold mb-3 leading-snug tracking-tight" style={{ color: 'var(--text)', fontFamily: 'var(--font-body)' }}>Track Your Progress</h3>
              <p className="text-[15px] leading-relaxed text-gray-500">After every session, receive a detailed report. Watch your mental wellness improve over time with your personal dashboard.</p>
            </div>
          </div>
        </div>

        {/* CTA below steps */}
        <div className="text-center mt-20" data-reveal data-delay="4">
          <p className="text-[16px] font-semibold mb-6 tracking-wide text-gray-600" style={{ fontFamily: 'var(--font-body)' }}>
            Ready to take the first step?
          </p>
          <Link
            to="/choose-professional"
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full text-sm font-bold text-white transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:bg-[var(--teal-dark)]"
            style={{
              background: 'var(--teal)',
              boxShadow: 'var(--shadow-teal)',
              textDecoration: 'none',
            }}
          >
            Get Started Today →
          </Link>
        </div>

      </div>
    </section>
  );
};

export default HowItWorks;
