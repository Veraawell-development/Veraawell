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
  pricing,
  language,
  treatsFor,
  imageSrc,
  rating = { average: 0, totalReviews: 0 },
  onBookSession,
  onViewProfile,
  isPrevious = false,
  isOnline = false,
  bgColor,
}) => {
  return (
    <div
      className={`group rounded-3xl p-6 transition-all duration-300 flex flex-col h-full relative overflow-hidden ${onViewProfile ? 'cursor-pointer' : ''}`}
      onClick={onViewProfile}
      style={{ 
        background: 'rgba(255, 255, 255, 0.7)',
        border: '1px solid rgba(255, 255, 255, 0.8)',
        backdropFilter: 'blur(16px)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.03)'
      }}
    >
      {/* Hover Glow */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{ background: 'radial-gradient(circle at 50% 0%, rgba(0, 151, 178, 0.05), transparent 70%)' }}
      />

      {/* Header: Image & Basic Info */}
      <div className="flex gap-4 items-start relative z-10">
        <img
          src={imageSrc}
          alt={name}
          className="w-16 h-16 rounded-full object-cover shadow-md"
          style={{ border: `2px solid ${bgColor || 'rgba(0,151,178,0.2)'}` }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 flex-wrap">
              {isOnline && (
                <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full"
                  style={{ background: 'rgba(107, 168, 136, 0.1)', border: '1px solid rgba(107, 168, 136, 0.2)' }}>
                  <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--sage)' }}></div>
                  <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--sage)' }}>Online</span>
                </span>
              )}
              {isPrevious && (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                  style={{ background: 'rgba(0, 151, 178, 0.1)', border: '1px solid rgba(0, 151, 178, 0.2)', color: 'var(--teal)' }}>
                  Your Therapist
                </span>
              )}
            </div>
            <h3 className="text-[19px] font-semibold truncate mt-1" style={{ color: 'var(--text)' }}>
              {name}
            </h3>
            
            <p className="text-[13px] truncate" style={{ color: 'var(--text-2)' }} title={qualification}>
              {qualification}
            </p>
          </div>
          
          {/* Star Rating */}
          <div className="flex items-center gap-1.5 mt-2">
            {rating.totalReviews === 0 ? (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-md" style={{ background: 'rgba(0,0,0,0.04)', color: 'var(--text-2)' }}>New</span>
            ) : (
              <div className="flex items-center">
                <svg className="w-4 h-4" style={{ color: 'var(--gold)' }} fill="currentColor" viewBox="0 0 20 20">
                   <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                <span className="text-[13px] font-bold ml-1" style={{ color: 'var(--text)' }}>{rating.average.toFixed(1)}</span>
                <span className="text-[12px] ml-1" style={{ color: 'var(--text-2)' }}>({rating.totalReviews})</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <hr className="my-5 border-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(0,0,0,0.05), transparent)' }} />

      {/* Info List */}
      <div className="space-y-3 flex-1 relative z-10">
        <div className="flex justify-between items-center text-[13px]">
          <span style={{ color: 'var(--text-2)' }}>Experience</span>
          <span className="font-semibold" style={{ color: 'var(--text)' }}>{experience}</span>
        </div>
        <div className="flex justify-between items-center text-[13px]">
          <span style={{ color: 'var(--text-2)' }}>Session Fee</span>
          <span className="font-semibold" style={{ color: 'var(--text)' }}>{pricing}</span>
        </div>
        <div className="flex justify-between items-center text-[13px]">
          <span style={{ color: 'var(--text-2)' }}>Language</span>
          <span className="font-semibold truncate ml-4 text-right" style={{ color: 'var(--text)' }} title={language}>{language}</span>
        </div>
        
        {/* Treats For */}
        <div className="pt-2">
          <span className="block mb-1 text-[13px]" style={{ color: 'var(--text-2)' }}>Expertise</span>
          <p className="text-[14px] font-medium leading-snug line-clamp-2" style={{ color: 'var(--text)' }} title={treatsFor}>
            {treatsFor || 'General Consultation'}
          </p>
        </div>
      </div>

      {/* Action Button */}
      <div className="pt-6 mt-auto relative z-10">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onBookSession?.();
          }}
          className="w-full py-3 text-white text-[14px] font-bold rounded-full transition-all duration-300 shadow-md hover:-translate-y-1"
          style={{ background: 'var(--teal)', boxShadow: '0 8px 20px rgba(0,151,178,0.2)' }}
        >
          {isPrevious ? 'Book Again' : 'Book Session'}
        </button>
      </div>
    </div>
  );
};

export default DoctorCard;
