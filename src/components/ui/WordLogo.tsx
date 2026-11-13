import React from 'react';

interface WordLogoProps {
  size?: number;
}

export const WordLogo: React.FC<WordLogoProps> = ({ size = 22 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect
        x="1.5"
        y="1.5"
        width="21"
        height="21"
        rx="6"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M6.5 8.5L9.2 15.5L12 10.5L14.8 15.5L17.5 8.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

