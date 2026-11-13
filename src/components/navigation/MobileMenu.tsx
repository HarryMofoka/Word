import React, { useEffect } from 'react';
import type { AuthModalMode, NavLinkItem } from '../../types';

interface MobileMenuProps {
  isOpen: boolean;
  links: NavLinkItem[];
  onClose: () => void;
  onOpenAuth: (mode: AuthModalMode) => void;
}

export const MobileMenu: React.FC<MobileMenuProps> = ({
  isOpen,
  links,
  onClose,
  onOpenAuth,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div id="mobile-nav-panel" className="mobile-menu-panel">
      <nav className="mobile-menu-links" aria-label="Mobile Navigation">
        {links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="mobile-menu-link"
            onClick={onClose}
          >
            {link.label}
          </a>
        ))}
      </nav>
      <div className="mobile-menu-actions">
        <button
          type="button"
          className="navbar-signin"
          onClick={() => {
            onClose();
            onOpenAuth('get-started');
          }}
        >
          Get started
        </button>
        <button
          type="button"
          className="navbar-get-started"
          onClick={() => {
            onClose();
            onOpenAuth('signin');
          }}
        >
          Sign in
        </button>
      </div>
    </div>
  );
};

