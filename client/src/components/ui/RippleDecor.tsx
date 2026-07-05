import React from 'react';

const RippleDecor: React.FC<{ style?: React.CSSProperties; color?: string }> = ({ 
  style, 
  color = 'var(--teal)' 
}) => (
  <svg
    className="ripple-decor"
    width="220"
    height="220"
    viewBox="0 0 220 220"
    fill="none"
    style={{ ...style, transition: 'all 2s ease-in-out' }}
  >
    <circle cx="110" cy="110" r="100" stroke={color} strokeWidth="1" opacity="0.15" strokeDasharray="4 4" />
    <circle cx="110" cy="110" r="75" stroke={color} strokeWidth="2" opacity="0.3" />
    <circle cx="110" cy="110" r="50" stroke={color} strokeWidth="3" opacity="0.5" />
    <circle cx="110" cy="110" r="25" fill={color} opacity="0.8" />
  </svg>
);

export default RippleDecor;
