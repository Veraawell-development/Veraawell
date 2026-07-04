import React from 'react';

const LeafDecor: React.FC<{ style?: React.CSSProperties }> = ({ style }) => (
  <svg
    className="leaf-decor"
    width="220"
    height="220"
    viewBox="0 0 220 220"
    fill="none"
    style={{ ...style, transition: 'all 2s ease-in-out' }}
  >
    <path
      d="M20 180 C20 180 40 80 110 40 C140 25 170 30 190 50
         C210 70 215 110 200 140 C180 175 140 195 100 200
         C60 205 20 180 20 180 Z"
      fill="var(--teal)"
    />
    <path
      d="M110 40 C110 40 115 120 90 180"
      stroke="var(--teal-dark)"
      strokeWidth="2"
      opacity="0.3"
    />
  </svg>
);

export default LeafDecor;
