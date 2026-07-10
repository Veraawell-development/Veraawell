import React from 'react';

type DoctorCardProps = {
  name: string;
  experience: string;
  qualification: string;
  pricing: string;
  language: string;
  treatsFor: string;
  imageSrc: string;
  rating?: {
    average: number;
    totalReviews: number;
  };
  onBookSession?: () => void;
  onViewProfile?: () => void;
  isPrevious?: boolean;
  isOnline?: boolean;
  bgColor?: string;
};

const DoctorCard: React.FC<DoctorCardProps> = ({
  name,
  experience,
  qualification,
  pricing, // The original design doesn't show pricing in this card, but we can pass it if needed later
  language,
  treatsFor,
  imageSrc,
  rating = { average: 0, totalReviews: 0 },
  onBookSession,
  onViewProfile,
  isPrevious = false,
  isOnline = false,
  bgColor = '#0097B2',
}) => {
  return (
    <div
      className={`therapist-card rounded-2xl overflow-hidden cursor-pointer flex flex-col h-full transition-all duration-300 hover:-translate-y-1 hover:shadow-lg`}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
      }}
      onClick={onViewProfile}
    >
      {/* Card header with avatar */}
      <div
        className="px-6 pt-7 pb-5"
        style={{
          background: `linear-gradient(135deg, ${bgColor}10, ${bgColor}05)`,
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div className="flex items-center gap-4">
          {/* Avatar */}
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold text-white flex-shrink-0"
            style={{ 
              background: imageSrc ? `url(${imageSrc}) center/cover no-repeat` : bgColor,
              border: `2px solid ${bgColor}40`,
            }}
          >
            {!imageSrc && name.charAt(4)} {/* Fallback initial assuming "Dr. X" */}
          </div>
          <div>
            <h3
              className="text-base font-semibold leading-tight mb-0.5"
              style={{ color: 'var(--text)' }}
            >
              {name}
            </h3>
            <p
              className="text-xs"
              style={{ color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}
            >
              {qualification}
            </p>
          </div>
        </div>
      </div>

      {/* Card body */}
      <div className="p-6 flex flex-col flex-1">
        {/* Specialisations */}
        <div className="flex flex-wrap gap-1.5 mb-5 h-[28px] overflow-hidden">
          {treatsFor.split(',').slice(0, 3).map((tag, index) => {
            const cleanTag = tag.trim();
            if (!cleanTag) return null;
            return (
              <span
                key={index}
                className="text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap"
                style={{
                  background: `${bgColor}12`,
                  color: bgColor,
                }}
              >
                {cleanTag}
              </span>
            );
          })}
        </div>

        {/* Stats row */}
        <div
          className="flex items-center justify-between mb-5 py-3 px-3 rounded-xl"
          style={{ background: 'var(--bg-2)' }}
        >
          <div>
            <div
              className="text-[10px] uppercase tracking-wider font-semibold mb-0.5"
              style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}
            >
              Experience
            </div>
            <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
              {experience}
            </div>
          </div>
          <div
            className="w-px h-8"
            style={{ background: 'var(--border)' }}
          />
          <div>
            <div
              className="text-[10px] uppercase tracking-wider font-semibold mb-0.5"
              style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}
            >
              Rating
            </div>
            <div
              className="text-sm font-semibold flex items-center gap-1"
              style={{ color: 'var(--text)' }}
            >
              <span style={{ color: '#F59E0B' }}>★</span>
              {rating.totalReviews > 0 ? rating.average.toFixed(1) : 'New'}
              {rating.totalReviews > 0 && (
                <span
                  className="font-normal"
                  style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}
                >
                  ({rating.totalReviews})
                </span>
              )}
            </div>
          </div>
          <div
            className="w-px h-8"
            style={{ background: 'var(--border)' }}
          />
          <div>
            <div
              className="text-[10px] uppercase tracking-wider font-semibold mb-0.5"
              style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}
            >
              Status
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: isOnline ? '#10B981' : '#F59E0B' }}
              />
              <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>
                {isOnline ? 'Available' : 'Busy'}
              </span>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-auto pt-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onBookSession ? onBookSession() : onViewProfile?.();
            }}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-center"
            style={{
              border: `1.5px solid ${bgColor}`,
              color: bgColor,
              background: 'transparent',
              transition: 'all 0.2s var(--ease-spring)',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = bgColor;
              (e.currentTarget as HTMLButtonElement).style.color = 'white';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              (e.currentTarget as HTMLButtonElement).style.color = bgColor;
            }}
          >
            {isPrevious ? 'Book Again →' : (onBookSession ? 'Book Session →' : 'View Profile →')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DoctorCard;
