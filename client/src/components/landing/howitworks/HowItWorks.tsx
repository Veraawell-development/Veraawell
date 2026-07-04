import React, { useRef, useEffect } from 'react';
import { useScrollReveal } from '../../../hooks/useScrollReveal';

const steps = [
  {
    num: '01',
    title: 'Find Your Therapist',
    description:
      'Browse our network of verified psychologists. Filter by specialisation, language, price, and availability.',
    icon: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
        <circle cx="14" cy="13" r="7" stroke="currentColor" strokeWidth="2"/>
        <path d="M19 19l7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        <path d="M11 13h6M14 10v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
      </svg>
    ),
  },
  {
    num: '02',
    title: 'Book a Session',
    description:
      'Pick a time that works for you. Instant booking, flexible scheduling — sessions in as little as a few hours.',
    icon: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
        <rect x="4" y="6" width="24" height="22" rx="4" stroke="currentColor" strokeWidth="2"/>
        <path d="M4 13h24" stroke="currentColor" strokeWidth="1.5" opacity="0.5"/>
        <path d="M10 4v4M22 4v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        <path d="M10 19l3 3 7-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    num: '03',
    title: 'Track Your Progress',
    description:
      'After every session, receive a detailed report. Watch your mental wellness improve over time with your personal dashboard.',
    icon: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
        <path d="M6 24L12 16L17 20L23 11L27 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="6" cy="24" r="2" fill="currentColor"/>
        <circle cx="12" cy="16" r="2" fill="currentColor"/>
        <circle cx="17" cy="20" r="2" fill="currentColor"/>
        <circle cx="23" cy="11" r="2" fill="currentColor"/>
        <circle cx="27" cy="14" r="2" fill="currentColor"/>
      </svg>
    ),
  },
];

/* ─── Step Connector SVG ─────────────────────────────────────── */
const StepConnector: React.FC<{ index: number }> = ({ index }) => {
  const pathRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    const el = pathRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('revealed');
          observer.unobserve(el);
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="hidden lg:flex items-center justify-center w-16 flex-shrink-0 mt-8">
      <svg width="64" height="20" viewBox="0 0 64 20" fill="none">
        <path
          ref={pathRef}
          d="M4 10 Q32 2 60 10"
          stroke="var(--border-strong)"
          strokeWidth="1.5"
          strokeDasharray="4 4"
          fill="none"
          className="step-connector"
        />
        <circle cx="60" cy="10" r="3" fill="var(--teal-soft)" opacity="0.6" />
      </svg>
    </div>
  );
};

/* ─── How It Works Section ───────────────────────────────────── */
const HowItWorks: React.FC = () => {
  const sectionRef = useScrollReveal<HTMLElement>();

  return (
    <section
      id="how-it-works"
      ref={sectionRef}
      className="section-white"
      style={{ padding: 'clamp(64px, 8vw, 112px) 1rem' }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="text-center mb-16" data-reveal>
          <span
            className="text-xs font-medium tracking-widest uppercase block mb-4"
            style={{ color: 'var(--teal)', fontFamily: 'var(--font-mono)' }}
          >
            — How It Works
          </span>
          <h2
            className="leading-tight mx-auto"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(28px, 3.5vw, 48px)',
              color: 'var(--text)',
              letterSpacing: '-0.02em',
              maxWidth: '500px',
            }}
          >
            Three steps to a healthier mind.
          </h2>
        </div>

        {/* Steps */}
        <div className="flex flex-col lg:flex-row items-start lg:items-stretch gap-8 lg:gap-0">
          {steps.map((step, i) => (
            <React.Fragment key={step.num}>
              {/* Step Card */}
              <div
                data-reveal
                data-delay={`${i + 1}` as any}
                className="flex-1 rounded-2xl p-8 relative"
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                }}
              >
                {/* Number badge */}
                <span
                  className="absolute top-6 right-6 text-xs font-medium"
                  style={{
                    color: 'var(--text-3)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {step.num}
                </span>

                {/* Icon */}
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6"
                  style={{
                    background: 'var(--teal-muted)',
                    color: 'var(--teal)',
                  }}
                >
                  {step.icon}
                </div>

                {/* Content */}
                <h3
                  className="text-xl font-semibold mb-3 leading-snug"
                  style={{ color: 'var(--text)', fontFamily: 'var(--font-body)' }}
                >
                  {step.title}
                </h3>
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: 'var(--text-2)' }}
                >
                  {step.description}
                </p>

                {/* Colored bottom accent */}
                <div
                  className="absolute bottom-0 left-8 right-8 h-0.5 rounded-full"
                  style={{
                    background: `linear-gradient(90deg, var(--teal), var(--teal-soft))`,
                    opacity: 0.3,
                  }}
                />
              </div>

              {/* Connector (between steps) */}
              {i < steps.length - 1 && <StepConnector index={i} />}
            </React.Fragment>
          ))}
        </div>

        {/* CTA below steps */}
        <div
          className="text-center mt-14"
          data-reveal
          data-delay="4"
        >
          <p
            className="text-sm mb-5"
            style={{ color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}
          >
            Ready to take the first step?
          </p>
          <a
            href="/choose-professional"
            className="btn-shimmer inline-flex items-center gap-2 px-8 py-3.5 rounded-full text-sm font-semibold text-white"
            style={{
              background: 'var(--teal)',
              boxShadow: 'var(--shadow-teal)',
              textDecoration: 'none',
              transition: 'all 0.2s var(--ease-spring)',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(-2px)';
              (e.currentTarget as HTMLAnchorElement).style.background = 'var(--teal-dark)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(0)';
              (e.currentTarget as HTMLAnchorElement).style.background = 'var(--teal)';
            }}
          >
            Get Started Today →
          </a>
        </div>

      </div>
    </section>
  );
};

export default HowItWorks;
