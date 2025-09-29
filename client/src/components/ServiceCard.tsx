import React from 'react';

type ServiceCardProps = {
  title: string;
  description: string;
  imageSrc: string;
  bgColor?: string; 
  onClick?: () => void;
};

const ServiceCard: React.FC<ServiceCardProps> = ({
  title,
  description,
  imageSrc,
  bgColor = '#38ABAE',
  onClick,
}) => {
  return (
    <div
      className="relative overflow-hidden rounded-[22px] text-white shadow-[0_10px_30px_rgba(0,0,0,0.25)] px-6 pt-6 pb-24 min-h-[320px]"
      style={{ backgroundColor: bgColor }}
    >
      {/* Heading */}
      <h3
        className="text-center text-3xl md:text-4xl font-extrabold tracking-wide"
        style={{
          textShadow:
            '0 2px 0 rgba(0,0,0,0.25), 0 0 0.5px rgba(0,0,0,0.35), 0 4px 10px rgba(0,0,0,0.15)',
          letterSpacing: '0.02em',
        }}
      >
        {title}
      </h3>

      {/* Description */}
      <p className="mt-5 text-center text-base md:text-lg leading-relaxed max-w-[90%] mx-auto">
        {description}
      </p>

      {/* CTA Button */}
      <button
        onClick={onClick}
        className="absolute left-1/2 -translate-x-1/2 bottom-6 inline-flex items-center justify-center rounded-full border-[6px] border-white bg-white/20 px-7 md:px-8 py-2.5 md:py-3 text-lg md:text-xl font-extrabold shadow-[0_6px_0_rgba(255,255,255,0.35),0_10px_22px_rgba(0,0,0,0.25)] backdrop-blur-[1px] hover:bg-white/30 transition"
      >
        View Therapist
      </button>

      {/* Illustration */}
      <img
        src={imageSrc}
        alt={title}
        className="absolute bottom-0 left-0 w-28 md:w-32 lg:w-40 h-auto object-contain select-none pointer-events-none" // Adjust width here to control image size
      />
    </div>
  );
};

export default ServiceCard;
