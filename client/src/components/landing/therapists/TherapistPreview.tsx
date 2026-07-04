import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useScrollReveal } from '../../../hooks/useScrollReveal';
import LeafDecor from '../../ui/LeafDecor';

/* ─── Placeholder Therapist Data ─────────────────────────────── */
const therapists = [
  {
    initials: 'PS',
    image: '/priya.png',
    name: 'Dr. Priya Sharma',
    credential: 'Ph.D. Clinical Psychology',
    specialisations: ['Anxiety', 'CBT', 'Trauma'],
    experience: '8 years',
    rating: 4.9,
    reviews: 142,
    color: '#0097B2',
    available: true,
  },
  {
    initials: 'RK',
    image: '/rohit.png',
    name: 'Dr. Rohit Kumar',
    credential: 'M.Phil Psychiatry',
    specialisations: ['Depression', 'Relationships', 'Grief'],
    experience: '11 years',
    rating: 4.8,
    reviews: 201,
    color: '#6BA888',
    available: true,
  },
  {
    initials: 'AN',
    image: '/anjali.png',
    name: 'Dr. Anjali Nair',
    credential: 'M.Sc. Counselling',
    specialisations: ['Mindfulness', 'Stress', 'Women\'s Health'],
    experience: '6 years',
    rating: 4.7,
    reviews: 98,
    color: '#C4A882',
    available: false,
  },
];

/* ─── Single Therapist Card ──────────────────────────────────── */
const TherapistCard: React.FC<{ therapist: typeof therapists[0]; delay: number }> = ({
  therapist,
  delay,
}) => {
  const navigate = useNavigate();
  return (
    <div
      data-reveal
      data-delay={`${delay}` as any}
      className="therapist-card rounded-2xl overflow-hidden cursor-pointer"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
      }}
      onClick={() => navigate('/choose-professional')}
    >
      {/* Card header with avatar */}
      <div
        className="px-6 pt-7 pb-5"
        style={{
          background: `linear-gradient(135deg, ${therapist.color}10, ${therapist.color}05)`,
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div className="flex items-center gap-4">
          {/* Avatar */}
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold text-white flex-shrink-0"
            style={{ 
              background: therapist.image ? `url(${therapist.image}) center/cover no-repeat` : therapist.color,
              border: `2px solid ${therapist.color}40`,
            }}
          >
            {!therapist.image && therapist.initials}
          </div>
          <div>
            <h3
              className="text-base font-semibold leading-tight mb-0.5"
              style={{ color: 'var(--text)' }}
            >
              {therapist.name}
            </h3>
            <p
              className="text-xs"
              style={{ color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}
            >
              {therapist.credential}
            </p>
          </div>
        </div>
      </div>

      {/* Card body */}
      <div className="p-6">
        {/* Specialisations */}
        <div className="flex flex-wrap gap-1.5 mb-5">
          {therapist.specialisations.map((tag) => (
            <span
              key={tag}
              className="text-xs px-2.5 py-1 rounded-full font-medium"
              style={{
                background: `${therapist.color}12`,
                color: therapist.color,
              }}
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Stats row */}
        <div
          className="flex items-center justify-between mb-5 py-3 px-3 rounded-xl"
          style={{ background: 'var(--bg-2)' }}
        >
          <div>
            <div
              className="text-xs"
              style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}
            >
              Experience
            </div>
            <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
              {therapist.experience}
            </div>
          </div>
          <div
            className="w-px h-8"
            style={{ background: 'var(--border)' }}
          />
          <div>
            <div
              className="text-xs"
              style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}
            >
              Rating
            </div>
            <div
              className="text-sm font-semibold flex items-center gap-1"
              style={{ color: 'var(--text)' }}
            >
              <span style={{ color: '#F59E0B' }}>★</span>
              {therapist.rating}
              <span
                className="font-normal"
                style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}
              >
                ({therapist.reviews})
              </span>
            </div>
          </div>
          <div
            className="w-px h-8"
            style={{ background: 'var(--border)' }}
          />
          <div>
            <div
              className="text-xs"
              style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}
            >
              Status
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: therapist.available ? '#10B981' : '#F59E0B' }}
              />
              <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>
                {therapist.available ? 'Available' : 'Busy'}
              </span>
            </div>
          </div>
        </div>

        {/* CTA */}
        <button
          className="w-full py-2.5 rounded-xl text-sm font-semibold text-center"
          style={{
            border: `1.5px solid ${therapist.color}`,
            color: therapist.color,
            background: 'transparent',
            transition: 'all 0.2s var(--ease-spring)',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = therapist.color;
            (e.currentTarget as HTMLButtonElement).style.color = 'white';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            (e.currentTarget as HTMLButtonElement).style.color = therapist.color;
          }}
        >
          View Profile →
        </button>
      </div>
    </div>
  );
};

/* ─── Therapist Preview Section ──────────────────────────────── */
const TherapistPreview: React.FC = () => {
  const navigate = useNavigate();
  const sectionRef = useScrollReveal<HTMLElement>();

  return (
    <section
      ref={sectionRef}
      className="section-white relative overflow-hidden"
      style={{ padding: 'clamp(64px, 8vw, 112px) 1rem' }}
    >
      {/* Decorative Leaves */}
      <LeafDecor
        style={{
          top: '-80px',
          right: '-40px',
          width: '280px',
          height: '280px',
          transform: 'rotate(70deg)',
          opacity: 0.04,
        }}
      />
      <LeafDecor
        style={{
          bottom: '20px',
          left: '-100px',
          width: '320px',
          height: '320px',
          transform: 'rotate(-10deg)',
          opacity: 0.03,
        }}
      />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">

        {/* Header */}
        <div
          className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6 mb-14"
          data-reveal
        >
          <div>
            <span
              className="text-xs font-medium tracking-widest uppercase block mb-4"
              style={{ color: 'var(--teal)', fontFamily: 'var(--font-mono)' }}
            >
              — Meet Our Therapists
            </span>
            <h2
              className="leading-tight"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(28px, 3.5vw, 48px)',
                color: 'var(--text)',
                letterSpacing: '-0.02em',
                maxWidth: '420px',
              }}
            >
              Verified experts, real{' '}
              <em style={{ color: 'var(--teal)' }}>connections.</em>
            </h2>
          </div>
          <button
            onClick={() => navigate('/choose-professional')}
            className="flex-shrink-0 inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold self-start sm:self-auto"
            style={{
              border: '1.5px solid var(--border-strong)',
              color: 'var(--text)',
              background: 'transparent',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--teal)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--teal)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-strong)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)';
            }}
          >
            See All Therapists →
          </button>
        </div>

        {/* Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {therapists.map((t, i) => (
            <TherapistCard key={t.name} therapist={t} delay={i + 1} />
          ))}
        </div>

        {/* Bottom note */}
        <p
          className="text-center mt-10 text-sm"
          style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}
          data-reveal
          data-delay="4"
        >
          All therapists are verified, credentialed, and background-checked.
        </p>

      </div>
    </section>
  );
};

export default TherapistPreview;
