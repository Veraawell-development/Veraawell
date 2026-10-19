import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useScrollReveal } from '../../../hooks/useScrollReveal';
import LeafDecor from '../../ui/LeafDecor';
import DoctorCard from '../../DoctorCard';
import { useQuery } from '@tanstack/react-query';
import { API_BASE_URL } from '../../../config/api';
import { getDoctorAccentColor } from '../../../utils/doctorColor';
import { getDoctorImage } from '../../../utils/doctorImage';

/**
 * The real, bookable therapists (the directory's own list and cache). This
 * section used to show three invented ones — "Dr. Priya Sharma, 4.9 (142)" —
 * that a visitor could not find or book.
 */
const useFeaturedTherapists = () => useQuery<any[]>({
  queryKey: ['doctors', 'all'],
  queryFn: async () => {
    const response = await fetch(`${API_BASE_URL}/sessions/doctors`);
    if (!response.ok) throw new Error('Failed to fetch doctors');
    return response.json();
  },
});

const priceText = (pricing?: { min?: number; max?: number }) => {
  const min = pricing?.min || 0;
  const max = pricing?.max || 0;
  if (!min && !max) return '';
  return !max || min === max ? `₹${min || max}` : `₹${min} - ₹${max}`;
};


/* ─── Therapist Preview Section ──────────────────────────────── */
const TherapistPreview: React.FC = () => {
  const { data: doctors = [] } = useFeaturedTherapists();
  const featured = doctors.slice(0, 3);
  // Nobody to show yet: no section, rather than an empty grid. The section
  // mounts once the list is here, so its scroll-reveal finds the cards.
  if (featured.length === 0) return null;
  return <TherapistPreviewSection featured={featured} />;
};

const TherapistPreviewSection: React.FC<{ featured: any[] }> = ({ featured }) => {
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
          {featured.map((doctor, i) => (
            <div key={doctor._id} data-reveal data-delay={`${i + 1}` as any}>
              <DoctorCard
                name={`Dr. ${doctor.userId.firstName} ${doctor.userId.lastName}`}
                experience={doctor.experience ? `${doctor.experience} years` : ''}
                qualification={(doctor.qualification || []).join(', ')}
                pricing={priceText(doctor.pricing)}
                language={(doctor.languages || []).join(', ')}
                treatsFor={(doctor.treatsFor || []).join(', ')}
                imageSrc={getDoctorImage(doctor)}
                rating={doctor.rating}
                bgColor={getDoctorAccentColor(doctor.userId._id)}
                onViewProfile={() => navigate(`/doctor/${doctor.userId._id}`)}
                onBookSession={() => navigate(`/doctor/${doctor.userId._id}`)}
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
