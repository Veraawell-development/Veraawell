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
    <div className="bg-white rounded-t-3xl shadow-xl overflow-hidden max-w-sm mx-auto">
      {/* Top Section with Image and Info */}
      <div className="flex h-48">
        {/* Doctor Image */}
        <div className="w-2/5">
          <img 
            src={imageSrc} 
            alt={name}
            className="w-full h-full object-cover rounded-l-3xl"
          />
        </div>
        
        {/* Doctor Info */}
        <div className="w-3/5 p-4 flex flex-col justify-center" style={{ backgroundColor: bgColor }}>
          <div className="text-white space-y-2">
            <h3 className="text-xl font-bold font-serif text-white">{name}</h3>
            <div className="space-y-1 text-sm font-medium">
              <p className="text-white"><span className="font-semibold">Experience:</span> {experience}</p>
              <p className="text-white"><span className="font-semibold">Qualification:</span> {qualification}</p>
              <p className="text-white"><span className="font-semibold">Pricing:</span> {pricing}</p>
              <p className="text-white"><span className="font-semibold">Language:</span> {language}</p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Bottom Section */}
      <div className="p-4">
        {/* Treats For */}
        <div className="mb-4">
          <p className="text-gray-700 font-semibold font-serif text-base">
            <span className="font-bold">Treats for:</span> {treatsFor}
          </p>
        </div>
        
        {/* Rating and Book Button */}
        <div className="flex items-center justify-between">
          {/* Star Rating */}
          <div className="flex text-orange-400">
            {[...Array(5)].map((_, i) => (
              <svg key={i} className="w-5 h-5 fill-current" viewBox="0 0 20 20">
                <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z"/>
              </svg>
            ))}
          </div>
          
          {/* Book Session Button */}
          <button 
            onClick={onBookSession}
            className="text-white font-bold py-2 px-4 rounded-full font-serif text-sm shadow-lg transition-transform transform hover:scale-105"
            style={{ backgroundColor: bgColor }}
          >
            Book Session
          </button>
        </div>
      </div>
    </div>
  );
};

export default DoctorCard;
