import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useScrollReveal } from '../../../hooks/useScrollReveal';
import LeafDecor from '../../ui/LeafDecor';
import DoctorCard from '../../DoctorCard';

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
    startingPrice: 499,
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
    startingPrice: 599,
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
    startingPrice: 449,
  },
];

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
              className="leading-[1.15] font-normal tracking-normal"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(32px, 4vw, 52px)',
                color: 'var(--text)',
                maxWidth: '460px',
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

        {/* Cards Grid — reuses the same DoctorCard used everywhere else, so this stays in sync */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {therapists.map((t, i) => (
            <div key={t.name} data-reveal data-delay={`${i + 1}` as any}>
              <DoctorCard
                name={t.name}
                experience={t.experience}
                qualification={t.credential}
                pricing={`₹${t.startingPrice}`}
                language=""
                treatsFor={t.specialisations.join(', ')}
                imageSrc={t.image}
                rating={{ average: t.rating, totalReviews: t.reviews }}
                isOnline={t.available}
                bgColor={t.color}
                onViewProfile={() => navigate('/choose-professional')}
              />
            </div>
          ))}
        </div>

        {/* Bottom note */}
        <p
          className="text-center mt-10 text-sm font-medium"
          style={{ color: 'var(--text-2)', fontFamily: 'var(--font-body)' }}
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
