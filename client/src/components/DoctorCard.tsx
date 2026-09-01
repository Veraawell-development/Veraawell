import React, { useState } from 'react';

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
  const [tagsExpanded, setTagsExpanded] = useState(false);

  const startingPriceMatch = pricing?.match(/₹\s*(\d+)/);
  const startingPrice = startingPriceMatch ? startingPriceMatch[1] : null;

  const allTags = treatsFor
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
  const visibleTags = tagsExpanded ? allTags : allTags.slice(0, 3);
  const hiddenCount = allTags.length - 3;

  return (
    <div
      className="therapist-card rounded-[24px] overflow-hidden cursor-pointer flex flex-col h-full transition-all duration-300 hover:-translate-y-1.5"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
      }}
      onClick={onViewProfile}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = `var(--shadow-lg), 0 12px 32px -12px ${bgColor}40`; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-sm)'; }}
    >
      {/* Card header with avatar */}
      <div
        className="px-6 pt-7 pb-5 relative"
        style={{
          background: `linear-gradient(135deg, ${bgColor}12, ${bgColor}04)`,
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-4 min-w-0">
            {/* Avatar */}
            <div
              className="w-14 h-14 rounded-[18px] flex items-center justify-center text-xl font-bold text-white flex-shrink-0"
              style={{
                background: imageSrc ? `url(${imageSrc}) center/cover no-repeat` : bgColor,
                border: `2px solid ${bgColor}40`,
                boxShadow: `0 4px 14px -4px ${bgColor}50`,
              }}
            >
              {!imageSrc && name.charAt(4)} {/* Fallback initial assuming "Dr. X" */}
            </div>
            <div className="min-w-0">
              <h3
                className="text-[17px] font-semibold leading-tight mb-1 truncate tracking-tight"
                style={{ color: 'var(--text)', fontFamily: 'var(--font-body)' }}
              >
                {name}
              </h3>
              <p
                className="text-xs truncate"
                style={{ color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}
              >
                {qualification}
              </p>
            </div>
          </div>

          {startingPrice && (
            <span
              className="flex-none rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap"
              style={{ background: `${bgColor}12`, color: bgColor }}
            >
              ₹{startingPrice}<span style={{ opacity: 0.7, fontWeight: 500 }}>/session</span>
            </span>
          )}
        </div>
      </div>

      {/* Card body */}
      <div className="p-6 flex flex-col flex-1">
        {/* Specialisations */}
        <div
          className={`flex flex-wrap gap-1.5 mb-5 overflow-hidden ${tagsExpanded ? '' : 'h-[28px]'}`}
        >
          {visibleTags.map((cleanTag, index) => (
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
          ))}
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setTagsExpanded((prev) => !prev);
              }}
              className="text-xs px-2.5 py-1 rounded-full font-semibold whitespace-nowrap transition-colors"
              style={{
                background: 'var(--bg-2)',
                color: 'var(--text-2)',
                border: '1px solid var(--border)',
              }}
            >
              {tagsExpanded ? 'Show less' : `+${hiddenCount} more`}
            </button>
          )}
        </div>

        {/* Stats row */}
        <div
          className="flex items-center justify-between mb-5 py-3 px-3 rounded-2xl"
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
              <span className="relative inline-flex" style={{ width: 6, height: 6 }}>
                <span className="absolute inset-0 rounded-full" style={{ background: isOnline ? '#10B981' : '#F59E0B' }} />
                {isOnline && (
                  <span
                    className="absolute inset-0 rounded-full"
                    style={{ background: '#10B981', animation: 'pulse-ring 2s ease-out infinite' }}
                  />
                )}
              </span>
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
            className="w-full py-2.5 rounded-full text-sm font-semibold text-center"
            style={{
              border: `1.5px solid ${bgColor}`,
              color: bgColor,
              background: 'transparent',
              transition: 'all 0.2s var(--ease-spring)',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = bgColor;
              (e.currentTarget as HTMLButtonElement).style.color = 'white';
              (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 8px 20px -6px ${bgColor}70`;
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              (e.currentTarget as HTMLButtonElement).style.color = bgColor;
              (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
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
