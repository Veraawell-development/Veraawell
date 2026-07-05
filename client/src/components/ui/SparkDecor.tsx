import React from 'react';

const SparkDecor: React.FC<{ style?: React.CSSProperties; color?: string }> = ({ 
  style, 
  color = 'var(--teal)' 
}) => (
  <svg
    className="spark-decor"
    width="220"
    height="220"
    viewBox="0 0 220 220"
    fill="none"
    style={{ ...style, transition: 'all 2s ease-in-out' }}
  >
    <path
      d="M110 10 C110 80 80 110 10 110 C80 110 110 140 110 210 C110 140 140 110 210 110 C140 110 110 80 110 10 Z"
      fill={color}
      opacity="0.8"
    />
  </svg>
);

export default SparkDecor;
