import React from 'react';

interface SectionProps {
  id?: string;
  children: React.ReactNode;
  variant?: 'default' | 'soft';
  noBorder?: boolean;
  className?: string;
}

export const Section: React.FC<SectionProps> = ({
  id,
  children,
  variant = 'default',
  noBorder = false,
  className = '',
}) => {
  const classes = [
    'section',
    variant === 'soft' ? 'section--soft' : '',
    noBorder ? 'section--no-border' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <section id={id} className={classes}>
      {children}
    </section>
  );
};

