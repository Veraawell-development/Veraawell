import React from 'react';

type ServiceCardProps = {
  title: string;
  description: string;
  accent?: string;
  index: number;
  onClick?: () => void;
};

const ServiceCard: React.FC<ServiceCardProps> = ({
  title,
  description,
  accent = 'var(--teal)',
  index,
  onClick,
}) => {
  return (
    <div
      onClick={onClick}
      className="feature-card relative rounded-[32px] p-8 md:p-10 flex flex-col h-full min-h-[360px] overflow-hidden cursor-pointer group"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
      }}
    >
      {/* Decorative subtle background gradient on hover */}
      <div 
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none z-0"
        style={{
          background: `radial-gradient(circle at bottom right, ${accent}15, transparent 70%)`
        }}
      />

      <div className="relative z-20 flex flex-col h-full">
        {/* Top Header Row (Number) */}
        <div className="flex justify-between items-start mb-10">
          {/* Overline Number */}
          <div 
            className="text-xs font-bold tracking-[0.2em]"
            style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}
          >
            {String(index + 1).padStart(2, '0')}
          </div>
        </div>

        {/* Title */}
        <h3 
          className="text-[26px] md:text-[28px] font-bold mb-4 drop-shadow-sm"
          style={{ color: 'var(--text)', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}
        >
          {title}
        </h3>

        {/* Description */}
        <p 
          className="text-[15px] leading-relaxed max-w-[95%] sm:max-w-[90%]"
          style={{ color: 'var(--text-2)' }}
        >
          {description}
        </p>

        {/* Action Link */}
        <div 
          className="mt-auto pt-12 flex items-center gap-2 font-semibold text-[15px] transition-colors"
          style={{ color: accent }}
        >
          View therapists
          <svg className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </div>
      </div>
    </div>
  );
};

export default ServiceCard;
