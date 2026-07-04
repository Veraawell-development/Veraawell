import React from 'react';

type ServiceCardProps = {
  title: string;
  description: string;
  imageSrc?: string; // Made optional
  imageClassName?: string; // Custom positioning per image
  bgColor?: string;
  onClick?: () => void;
};

const ServiceCard: React.FC<ServiceCardProps> = ({
  title,
  description,
  imageSrc,
  imageClassName,
  bgColor = '#38ABAE',
  onClick,
}) => {
  return (
    <div
      className="relative rounded-[20px] text-white shadow-sm hover:shadow-md transition-shadow duration-300 px-6 pt-8 pb-32 min-h-[360px] border border-white/20 flex flex-col items-center"
      style={{ backgroundColor: bgColor }}
    >
      {/* Heading */}
      <h3
        className="text-center text-[26px] md:text-[32px] font-extrabold tracking-wide mb-3 drop-shadow-sm"
        style={{ fontFamily: 'Inter, sans-serif' }}
      >
        {title}
      </h3>

      {/* Description */}
      <p 
        className="text-center text-[15px] md:text-[17px] leading-relaxed max-w-[95%] mx-auto text-white/95"
        style={{ fontFamily: 'Inter, sans-serif' }}
      >
        {description}
      </p>

      {/* CTA Button */}
      <button
        onClick={onClick}
        className="absolute left-1/2 -translate-x-1/2 bottom-8 inline-flex items-center justify-center rounded-full bg-white px-8 py-3 text-[16px] md:text-[18px] font-bold shadow-sm hover:scale-105 hover:-translate-y-1 hover:shadow-lg transition-all duration-300 z-30"
        style={{ fontFamily: 'Inter, sans-serif', color: bgColor !== '#ffffff' ? bgColor : '#38ABAE' }}
      >
        View Therapist
      </button>

      {/* Illustration - Only render if imageSrc is provided */}
      {imageSrc && (
        <img
          src={imageSrc}
          alt={title}
          className={`absolute z-20 h-auto object-contain select-none pointer-events-none drop-shadow-[0_12px_18px_rgba(0,0,0,0.4)] transition-transform duration-300 hover:scale-105 ${imageClassName || '-bottom-4 -left-6 w-32 md:w-40 lg:w-48'}`}
        />
      )}
    </div>
  );
};

export default ServiceCard;
