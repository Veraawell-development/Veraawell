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
  onBookSession?: () => void;
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
  onBookSession,
}) => {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:border-teal-300 hover:shadow-md transition-all">
      {/* Top Section with Image and Info */}
      <div className="flex">
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
          <div className="flex gap-0.5">
            {[...Array(5)].map((_, i) => (
              <svg key={i} className="w-4 h-4 fill-current text-amber-400" viewBox="0 0 20 20">
                <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
              </svg>
            ))}
          </div>

          {/* Book Session Button */}
          <button
            onClick={onBookSession}
            className="bg-teal-600 text-white font-semibold py-1.5 px-4 rounded-lg text-xs transition-colors hover:bg-teal-700"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            Book Session
          </button>
        </div>
      </div>
    </div>
  );
};

export default DoctorCard;
