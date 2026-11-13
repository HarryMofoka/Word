import React from 'react';
import { useRevealOnScroll } from '../../hooks/useScrollProgress';

interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  align?: 'left' | 'center';
}

export const SectionHeading: React.FC<SectionHeadingProps> = ({
  eyebrow,
  title,
  subtitle,
  align = 'left',
}) => {
  const { ref, isVisible } = useRevealOnScroll<HTMLDivElement>();

  return (
    <div
      ref={ref}
      className={`reveal-up ${isVisible ? 'is-visible' : ''}`}
      style={{
        textAlign: align,
        maxWidth: align === 'center' ? '680px' : '640px',
        marginInline: align === 'center' ? 'auto' : undefined,
        marginBottom: 'clamp(40px, 5vw, 64px)',
      }}
    >
      {eyebrow && (
        <p className="eyebrow" style={{ marginBottom: '14px' }}>
          {eyebrow}
        </p>
      )}
      <h2 className="heading-lg" style={{ marginBottom: subtitle ? '16px' : 0 }}>
        {title}
      </h2>
      {subtitle && <p className="body-lg">{subtitle}</p>}
    </div>
  );
};

