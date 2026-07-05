import React from 'react';

const ArchDecor: React.FC<{ style?: React.CSSProperties; color?: string }> = ({ 
  style, 
  color = 'var(--teal)' 
}) => (
  <svg
    className="arch-decor"
    width="220"
    height="220"
    viewBox="0 0 220 220"
    fill="none"
    style={{ ...style, transition: 'all 2s ease-in-out' }}
  >
    <path
      d="M40 220 L40 110 C40 70 70 40 110 40 C150 40 180 70 180 110 L180 220"
      stroke={color}
      strokeWidth="4"
      opacity="0.6"
      strokeLinecap="round"
    />
    <path
      d="M75 220 L75 110 C75 90 90 75 110 75 C130 75 145 90 145 110 L145 220"
      stroke={color}
      strokeWidth="2"
      opacity="0.3"
      strokeLinecap="round"
    />
  </svg>
);

export default ArchDecor;
