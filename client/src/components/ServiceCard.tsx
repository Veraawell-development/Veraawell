import React from 'react';
import SparkDecor from './ui/SparkDecor';

type ServiceCardProps = {
  title: string;
  description: string;
  accent?: string;
  icon?: React.ReactNode;
  index: number;
  onClick?: () => void;
};

const ServiceCard: React.FC<ServiceCardProps> = ({
  title,
  description,
  accent = 'var(--teal)',
  icon,
  index,
  onClick,
}) => {
  const revealDelay = (index % 6) + 1;

  return (
    <div
      onClick={onClick}
      data-reveal="scale"
      data-delay={revealDelay}
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

      {/* Corner sparkle, tinted to this card's own accent — peeks in on hover */}
      <div className="absolute -top-6 -right-6 pointer-events-none z-0 opacity-[0.07] group-hover:opacity-20 transition-opacity duration-700">
        <SparkDecor color={accent} style={{ width: '110px', height: '110px' }} />
      </div>

      <div className="relative z-20 flex flex-col h-full">
        {/* Top Header Row (Number + Icon) */}
        <div className="flex justify-between items-start mb-10">
          {/* Overline Number */}
          <div
            className="text-xs font-bold tracking-[0.2em]"
            style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}
          >
            {String(index + 1).padStart(2, '0')}
          </div>

          {/* Topic Icon */}
          {icon && (
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-6"
              style={{ background: `${accent}14`, color: accent }}
            >
              {icon}
            </div>
          )}
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
