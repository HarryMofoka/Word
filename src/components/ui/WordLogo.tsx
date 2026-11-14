import React from 'react';

interface WordLogoProps {
  size?: number;
}

export const WordLogo: React.FC<WordLogoProps> = ({ size = 22 }) => {
  return (
    <img
      src="/word-mark.png"
      alt=""
      width={size}
      height={size}
      aria-hidden="true"
      style={{
        display: 'block',
        width: `${size}px`,
        height: `${size}px`,
        objectFit: 'contain',
        flexShrink: 0,
      }}
    />
  );
};
