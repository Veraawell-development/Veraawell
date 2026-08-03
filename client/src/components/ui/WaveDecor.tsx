import React from 'react';

const WaveDecor: React.FC<{ style?: React.CSSProperties; color?: string }> = ({
  style,
  color = 'var(--teal)'
}) => (
  <svg
    className="wave-decor"
    width="220"
    height="220"
    viewBox="0 0 220 220"
    fill="none"
    style={{ ...style, transition: 'all 2s ease-in-out' }}
  >
    <path
      d="M10 130 C 40 90, 70 90, 100 130 S 160 170, 190 130"
      stroke={color}
      strokeWidth="6"
      strokeLinecap="round"
      opacity="0.7"
    />
    <path
      d="M10 170 C 40 130, 70 130, 100 170 S 160 210, 190 170"
      stroke={color}
      strokeWidth="3"
      strokeLinecap="round"
      opacity="0.35"
    />
  </svg>
);

export default WaveDecor;
