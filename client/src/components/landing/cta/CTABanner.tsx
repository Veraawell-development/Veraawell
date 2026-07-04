import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useScrollReveal } from '../../../hooks/useScrollReveal';
import LeafDecor from '../../ui/LeafDecor';

const CTABanner: React.FC = () => {
  const navigate = useNavigate();
  const ref = useScrollReveal<HTMLDivElement>();

  return (
    <section
      style={{ padding: 'clamp(48px, 6vw, 80px) 1rem', background: 'var(--surface)' }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div
          ref={ref}
          className="cta-banner-bg rounded-3xl overflow-hidden relative"
          style={{
            padding: 'clamp(52px, 7vw, 88px) clamp(32px, 6vw, 80px)',
            border: '1px solid rgba(0, 151, 178, 0.25)',
            boxShadow: '0 0 80px rgba(0, 151, 178, 0.15), 0 32px 80px rgba(0, 0, 0, 0.2)',
          }}
        >
          {/* Subtle leaves in the dark background */}
          <LeafDecor 
            style={{ 
              position: 'absolute', 
              top: '-40px', 
              right: '-40px', 
              width: '300px', 
              height: '300px', 
              transform: 'rotate(45deg)', 
              opacity: 0.05, 
              zIndex: 1,
              filter: 'invert(1)'
            }} 
          />

          {/* Inner content */}
          <div className="relative z-10 max-w-2xl mx-auto text-center">

            <span
              data-reveal
              className="text-xs font-semibold tracking-widest uppercase block mb-5"
              style={{ color: '#F4A261', fontFamily: 'var(--font-mono)' }}
            >
              — Start Today
            </span>

            <h2
              data-reveal
              data-delay="1"
              className="mb-5 leading-tight"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(36px, 5vw, 64px)',
                color: '#FDFCF9',
                letterSpacing: '-0.02em',
              }}
            >
              Your healing journey{' '}
              <em style={{ color: '#C4A882' }}>starts</em> with
              one step.
            </h2>

            <p
              data-reveal
              data-delay="2"
              className="mb-10 leading-relaxed mx-auto"
              style={{
                color: 'rgba(253,252,249, 0.75)',
                fontSize: '17px',
                maxWidth: '460px',
              }}
            >
              Join thousands of Indians who've taken control of their mental
              health with Veraawell's network of verified therapists.
            </p>

            <div
              data-reveal
              data-delay="3"
              className="flex flex-wrap gap-4 justify-center"
            >
              <button
                onClick={() => navigate('/choose-professional')}
                className="btn-shimmer inline-flex items-center gap-2 px-8 py-4 rounded-full text-[15px] font-bold"
                style={{
                  background: '#FDFCF9',
                  color: '#005463',
                  boxShadow: '0 8px 32px rgba(253, 252, 249, 0.2)',
                  transition: 'all 0.2s var(--ease-spring)',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-3px)';
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 14px 40px rgba(253, 252, 249, 0.3)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 8px 32px rgba(253, 252, 249, 0.2)';
                }}
              >
                Find a Therapist →
              </button>

              <button
                onClick={() => navigate('/about')}
                className="inline-flex items-center gap-2 px-8 py-4 rounded-full text-[15px] font-semibold"
                style={{
                  color: '#FDFCF9',
                  border: '1px solid rgba(253, 252, 249, 0.2)',
                  background: 'rgba(253, 252, 249, 0.05)',
                  backdropFilter: 'blur(12px)',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(253, 252, 249, 0.12)';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(253, 252, 249, 0.3)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(253, 252, 249, 0.05)';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(253, 252, 249, 0.2)';
                }}
              >
                Learn More
              </button>
            </div>

            {/* Small trust signal */}
            <p
              data-reveal
              data-delay="4"
              className="mt-10 text-[11px] uppercase tracking-widest"
              style={{ color: 'rgba(253,252,249, 0.4)', fontFamily: 'var(--font-mono)' }}
            >
              No commitment required · Cancel anytime · 100% confidential
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CTABanner;
