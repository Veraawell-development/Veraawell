import React, { useState, useEffect, useRef } from 'react';
import { useScrollReveal } from '../../../hooks/useScrollReveal';

/* ─── CountUp Component (preserved from original) ────────────── */
const CountUp: React.FC<{ end: number; duration: number; prefix?: string }> = ({
  end,
  duration,
  prefix = '',
}) => {
  const [count, setCount] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const elementRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasStarted) setHasStarted(true);
      },
      { threshold: 0.2 }
    );
    if (elementRef.current) observer.observe(elementRef.current);
    return () => observer.disconnect();
  }, [hasStarted]);

  useEffect(() => {
    if (!hasStarted) return;
    let start = 0;
    const increment = end / (duration / 16);
    const timer = setInterval(() => {
      start += increment;
      if (start >= end) {
        setCount(end);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, 16);
    return () => clearInterval(timer);
  }, [hasStarted, end, duration]);

  return (
    <span ref={elementRef}>
      {prefix}{count.toLocaleString()}+
    </span>
  );
};

/* ─── Stats Data ─────────────────────────────────────────────── */
const stats = [
  {
    end: 500,
    duration: 1500,
    label: 'Sessions Conducted',
    sublabel: 'on our platform',
    accent: '#0097B2', /* Teal */
  },
  {
    end: 1000,
    duration: 1500,
    label: 'Monthly Active Users',
    sublabel: 'and growing every day',
    accent: '#6BA888', /* Sage */
  },
  {
    end: 50,
    duration: 1500,
    label: 'Partner Organisations',
    sublabel: 'across India',
    accent: '#C4A882', /* Gold */
  },
];

/* ─── Mission Stats Section ──────────────────────────────────── */
const MissionStats: React.FC = () => {
  const sectionRef = useScrollReveal<HTMLElement>();

  return (
    <section
      ref={sectionRef}
      className="section-tinted relative overflow-hidden"
      style={{ padding: 'clamp(64px, 8vw, 112px) 1rem' }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">

        {/* Mission Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center mb-20">

          {/* Left: Premium Therapist Collage */}
          <div
            data-reveal
            data-delay="1"
            className="order-2 lg:order-1 relative w-full aspect-square sm:aspect-[4/3] group"
          >
            {/* Organic background shape behind collage */}
            <div
              className="absolute inset-0"
              style={{
                background: 'linear-gradient(135deg, rgba(107, 168, 136, 0.15) 0%, rgba(0, 151, 178, 0.1) 100%)',
                borderRadius: '40% 60% 70% 30% / 40% 50% 60% 50%',
                transform: 'scale(1.05) rotate(-3deg)',
                zIndex: 0,
                transition: 'transform 0.5s ease-out',
              }}
            />
            
            <div className="relative z-10 w-full h-full rounded-[32px] overflow-visible">
              {/* Photo 1: Top Left */}
              <div 
                className="absolute top-4 left-4 sm:top-8 sm:left-8 w-[50%] aspect-[4/5] rounded-[24px] overflow-hidden shadow-xl border-4 border-white transition-all duration-500 ease-out z-10"
                style={{ transform: 'rotate(-6deg)' }}
              >
                <img src="/anjali.png" alt="Dr. Priya" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-60" />
              </div>

              {/* Photo 2: Bottom Right */}
              <div 
                className="absolute bottom-8 right-4 sm:bottom-12 sm:right-8 w-[45%] aspect-square rounded-[24px] overflow-hidden shadow-xl border-4 border-white transition-all duration-500 ease-out z-20"
                style={{ transform: 'rotate(4deg)' }}
              >
                <img src="/rohit.png" alt="Dr. Rohit" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-60" />
              </div>

              {/* Photo 3: Center Overlapping Circle */}
              <div 
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[40%] w-[38%] aspect-square rounded-full overflow-hidden shadow-2xl border-4 border-white transition-all duration-500 ease-out z-30 group-hover:scale-105"
              >
                <img src="/priya.png" alt="Dr. Anjali" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
              </div>

              {/* Floating glass badge */}
              <div 
                className="absolute bottom-2 left-2 sm:bottom-4 sm:left-4 z-40 px-5 py-3 rounded-2xl flex items-center gap-3 transition-transform duration-500 hover:-translate-y-1"
                style={{
                  background: 'rgba(255, 255, 255, 0.95)',
                  backdropFilter: 'blur(16px)',
                  boxShadow: '0 12px 32px rgba(26,46,50,0.12)',
                  border: '1px solid rgba(255,255,255,1)',
                }}
              >
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sage-400 opacity-75" style={{ background: 'var(--sage)' }}></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-sage-500" style={{ background: 'var(--sage)' }}></span>
                </span>
                <span className="text-sm font-semibold tracking-wide" style={{ color: 'var(--text)' }}>
                  50+ Verified Experts
                </span>
              </div>
            </div>
          </div>

          {/* Right: Text */}
          <div className="order-1 lg:order-2">
            <span
              data-reveal
              className="text-xs font-medium tracking-widest uppercase block mb-4"
              style={{ color: 'var(--teal)', fontFamily: 'var(--font-mono)' }}
            >
              — Our Mission
            </span>

            <h2
              data-reveal
              data-delay="1"
              className="leading-tight mb-6"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(28px, 3.5vw, 48px)',
                color: 'var(--text)',
                letterSpacing: '-0.02em',
              }}
            >
              We've made your mental health{' '}
              <em style={{ color: 'var(--teal)' }}>our mission.</em>
            </h2>

            <p
              data-reveal
              data-delay="2"
              className="leading-relaxed"
              style={{ color: 'var(--text-2)', fontSize: '17px', maxWidth: '480px' }}
            >
              At Veraawell, we've built a diverse team of 50+ experts from the
              fields of therapy, psychiatry, technology, and business — each
              bringing unique skills and perspectives to support your mental
              wellness journey.
            </p>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {stats.map((stat, i) => (
            <div
              key={i}
              data-reveal
              data-delay={`${i + 1}` as any}
              className="stat-card rounded-2xl p-7"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-sm)',
                borderLeft: `3px solid ${stat.accent}`,
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLDivElement).style.background = `${stat.accent}08`;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.background = 'var(--surface)';
              }}
            >
              <div
                className="leading-none mb-2"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'clamp(48px, 5vw, 64px)',
                  color: stat.accent,
                  letterSpacing: '-0.03em',
                }}
              >
                <CountUp end={stat.end} duration={stat.duration} />
              </div>
              <p
                className="text-sm font-semibold mb-1"
                style={{ color: 'var(--text)' }}
              >
                {stat.label}
              </p>
              <p
                className="text-xs"
                style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}
              >
                {stat.sublabel}
              </p>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
};

export default MissionStats;
