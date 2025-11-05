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
    <div className="bg-white rounded-lg overflow-hidden w-full mx-auto" style={{ boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)' }}>
      {/* Top Section with Image and Info */}
      <div className="flex">
        {/* Doctor Image */}
        <div className="w-[110px] sm:w-[120px] md:w-[130px] h-[155px] sm:h-[165px] md:h-[175px] flex-shrink-0">
          <img 
            src={imageSrc} 
            alt={name}
            className="w-full h-full object-cover"
          />
        </div>
        
        {/* Doctor Info */}
        <div className="flex-1 p-2 sm:p-2.5 md:p-3 flex flex-col justify-center" style={{ backgroundColor: bgColor }}>
          <div className="text-white space-y-0.5 sm:space-y-1">
            <h3 className="text-sm sm:text-base font-bold leading-tight" style={{ fontFamily: 'Inter, sans-serif' }}>{name}</h3>
            <div className="space-y-0.5 text-[9px] sm:text-[10px] md:text-xs leading-tight" style={{ fontFamily: 'Inter, sans-serif' }}>
              <p className="text-white"><span className="font-semibold">Experience:</span> {experience}</p>
              <p className="text-white"><span className="font-semibold">Qualification:</span> {qualification}</p>
              <p className="text-white"><span className="font-semibold">Pricing (INR):</span> {pricing}</p>
              <p className="text-white"><span className="font-semibold">Language:</span> {language}</p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Bottom Section */}
      <div className="px-2 sm:px-2.5 md:px-3 py-1.5 sm:py-2 bg-white">
        {/* Treats For */}
        <div className="mb-1.5 sm:mb-2">
          <p className="text-gray-800 text-[9px] sm:text-[10px] md:text-xs leading-tight" style={{ fontFamily: 'Inter, sans-serif' }}>
            <span className="font-semibold">Treats for:</span> {treatsFor}
          </p>
        </div>
        
        {/* Rating and Book Button */}
        <div className="flex items-center justify-between">
          {/* Star Rating */}
          <div className="flex gap-0.5">
            {[...Array(5)].map((_, i) => (
              <svg key={i} className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 fill-current text-orange-400" viewBox="0 0 20 20">
                <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z"/>
              </svg>
            ))}
          </div>
          
          {/* Book Session Button */}
          <button 
            onClick={onBookSession}
            className="text-white font-semibold py-1 sm:py-1.5 px-2.5 sm:px-3 md:px-4 rounded-full text-[9px] sm:text-[10px] md:text-xs transition-all hover:opacity-90"
            style={{ backgroundColor: bgColor, fontFamily: 'Inter, sans-serif' }}
          >
            Book Session
          </button>
        </div>
      </div>
    </div>
  );
};

export default DoctorCard;
