import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  withGlow?: boolean;
  compact?: boolean;
  href?: string;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  withGlow = true,
  compact = false,
  href,
  className = '',
  ...rest
}) => {
  const btnClass = `pill-btn ${compact ? 'pill-btn--compact' : ''} ${className}`.trim();

  if (href) {
    return (
      <span className="pill-btn-wrap">
        {withGlow && <span className="pill-btn-glow" aria-hidden="true" />}
        <a href={href} className={btnClass}>
          {children}
        </a>
      </span>
    );
  }

  return (
    <span className="pill-btn-wrap">
      {withGlow && <span className="pill-btn-glow" aria-hidden="true" />}
      <button type="button" className={btnClass} {...rest}>
        {children}
      </button>
    </span>
  );
};

