import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useScrollReveal } from '../../../hooks/useScrollReveal';

const AboutSection: React.FC = () => {
  const navigate = useNavigate();
  const sectionRef = useScrollReveal<HTMLElement>();

  return (
    <section
      ref={sectionRef}
      className="section-tinted"
      style={{ padding: 'clamp(64px, 8vw, 112px) 1rem' }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center">

          {/* Left: Text */}
          <div>
            <span
              data-reveal
              className="text-xs font-medium tracking-widest uppercase block mb-4"
              style={{ color: 'var(--teal)', fontFamily: 'var(--font-mono)' }}
            >
              — About Veraawell
            </span>

            <h2
              data-reveal
              data-delay="1"
              className="leading-[1.15] mb-6 font-normal tracking-normal"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(32px, 4vw, 52px)',
                color: 'var(--text)',
              }}
            >
              We're closing the gap between{' '}
              <em style={{ color: 'var(--teal)' }}>seeking help</em> and finding it.
            </h2>

            <p
              data-reveal
              data-delay="2"
              className="mb-6 leading-relaxed"
              style={{ color: 'var(--text-2)', fontSize: '17px' }}
            >
              <strong style={{ color: 'var(--text)', fontWeight: 600 }}>Veraawell</strong> is a
              platform aimed at revolutionising the culture of mental health in India. We bridge
              the gap between people who seek professional help and psychologists — giving users
              the freedom to operate at their own pace and track their journey.
            </p>

            <div
              data-reveal
              data-delay="3"
              className="w-12 h-px mb-6"
              style={{ background: 'var(--teal-soft)', opacity: 0.5 }}
            />

            <p
              data-reveal
              data-delay="3"
              className="text-lg font-semibold mb-7 leading-snug tracking-wide"
              style={{
                color: 'var(--text-2)',
                fontFamily: 'var(--font-body)',
              }}
            >
              Find the perfect therapist for your mental health journey.
            </p>

            <button
              data-reveal
              data-delay="4"
              onClick={() => navigate('/choose-professional')}
              className="btn-shimmer inline-flex items-center gap-2 px-8 py-3.5 rounded-full text-sm font-bold text-white transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:bg-[var(--teal-dark)]"
              style={{
                background: 'var(--teal)',
                boxShadow: 'var(--shadow-teal)',
              }}
            >
              View Therapists →
            </button>
          </div>

          {/* Right: Stats panel */}
          <div data-reveal="right" data-delay="2">
            <div
              className="rounded-2xl p-8"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-md)',
              }}
            >
              {/* Big stat */}
              <div className="mb-8">
                <div
                  className="leading-none mb-2"
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 'clamp(56px, 7vw, 80px)',
                    color: 'var(--teal)',
                    letterSpacing: '-0.03em',
                  }}
                >
                  1,000+
                </div>
                <p className="text-sm" style={{ color: 'var(--text-2)' }}>
                  Indians have started their healing journey through Veraawell
                </p>
              </div>

              {/* Divider */}
              <div
                className="w-full h-px mb-8"
                style={{ background: 'var(--border)' }}
              />

              {/* Testimonial pull-quote */}
              <blockquote>
                <div
                  className="text-5xl leading-none mb-3"
                  style={{
                    fontFamily: 'var(--font-display)',
                    color: 'var(--teal-soft)',
                    opacity: 0.5,
                  }}
                >
                  "
                </div>
                <p
                  className="text-xl leading-relaxed mb-6 font-normal tracking-normal"
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontStyle: 'italic',
                    color: 'var(--text)',
                  }}
                >
                  "I came in feeling lost, and today I feel stronger and more
                  in control of my life."
                </p>
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                    style={{ background: 'var(--teal)' }}
                  >
                    I
                  </div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Isha M.</p>
                    <div className="flex gap-0.5 mt-0.5">
                      {[...Array(5)].map((_, i) => (
                        <span key={i} style={{ color: '#F59E0B', fontSize: '11px' }}>★</span>
                      ))}
                    </div>
                  </div>
                </div>
              </blockquote>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};

export default AboutSection;
