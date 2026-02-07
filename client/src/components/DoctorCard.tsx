import React from 'react';

type DoctorCardProps = {
  name: string;
  experience: string;
  qualification: string;
  pricing: string;
  language: string;
  treatsFor: string;
  imageSrc: string;
  bgColor?: string;
  rating?: {
    average: number;
    totalReviews: number;
  };
  onBookSession?: () => void;
  onViewProfile?: () => void;
  isPrevious?: boolean;
};

const DoctorCard: React.FC<DoctorCardProps> = ({
  name,
  experience,
  qualification,
  pricing,
  language,
  treatsFor,
  imageSrc,
  bgColor = '#ABA5D1',
  rating = { average: 0, totalReviews: 0 },
  onBookSession,
  onViewProfile,
  isPrevious = false,
}) => {
  return (
    <div
      className={`bg-white border rounded-xl overflow-hidden hover:shadow-md transition-all ${onViewProfile ? 'cursor-pointer' : ''} ${isPrevious ? 'border-teal-500 ring-1 ring-teal-500' : 'border-gray-200 hover:border-teal-300'}`}
      onClick={onViewProfile}
    >
      {/* Top Section with Image and Info */}
      <div className="flex relative">
        {/* Previous Selection Tag */}
        {isPrevious && (
          <div className="absolute top-0 left-0 bg-teal-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-br-lg z-10 font-sans tracking-wide">
            YOUR THERAPIST
          </div>
        )}

        {/* Doctor Image */}
        <div className="w-32 h-44 flex-shrink-0">
          <img
            src={imageSrc}
            alt={name}
            className="w-full h-full object-cover"
          />
        </div>

        {/* Doctor Info */}
        <div className="flex-1 p-4 flex flex-col justify-center" style={{ backgroundColor: bgColor }}>
          <div className="text-white space-y-1.5">
            <h3 className="text-base font-bold leading-tight mb-2" style={{ fontFamily: 'Bree Serif, serif' }}>{name}</h3>
            <div className="space-y-1 text-xs leading-tight" style={{ fontFamily: 'Inter, sans-serif' }}>
              <p className="text-white/90"><span className="font-semibold text-white">Experience:</span> {experience}</p>
              <p className="text-white/90"><span className="font-semibold text-white">Qualification:</span> {qualification}</p>
              <p className="text-white/90"><span className="font-semibold text-white">Pricing:</span> {pricing}</p>
              <p className="text-white/90"><span className="font-semibold text-white">Language:</span> {language}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Section */}
      <div className="px-4 py-3 bg-white">
        {/* Treats For */}
        <div className="mb-3">
          <p className="text-gray-700 text-xs leading-tight" style={{ fontFamily: 'Inter, sans-serif' }}>
            <span className="font-semibold text-gray-900">Treats for:</span> {treatsFor}
          </p>
        </div>

        {/* Rating and Book Button */}
        <div className="flex items-center justify-between">
          {/* Star Rating */}
          <div className="flex items-center gap-1">
            {rating.totalReviews === 0 ? (
              <span className="text-xs font-medium text-teal-600 bg-teal-50 px-2 py-0.5 rounded" style={{ fontFamily: 'Inter, sans-serif' }}>
                New
              </span>
            ) : (
              <>
                {[...Array(5)].map((_, i) => (
                  <svg key={i} className={`w-4 h-4 fill-current ${i < Math.round(rating.average) ? 'text-amber-400' : 'text-gray-300'
                    }`} viewBox="0 0 20 20">
                    <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                  </svg>
                ))}
                <span className="text-xs text-gray-600 ml-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                  ({rating.totalReviews})
                </span>
              </>
            )}
          </div>

          {/* Book Session Button */}
          <button
            onClick={(e) => {
              e.stopPropagation(); // Prevent triggering card click
              onBookSession?.();
            }}
            className={`font-semibold py-1.5 px-4 rounded-lg text-xs transition-colors ${isPrevious
              ? 'bg-teal-700 text-white hover:bg-teal-800 ring-2 ring-teal-700 ring-offset-1'
              : 'bg-teal-600 text-white hover:bg-teal-700'
              }`}
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            {isPrevious ? 'Book Again' : 'Book Session'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DoctorCard;
