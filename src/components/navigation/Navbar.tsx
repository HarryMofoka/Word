import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';
import type { AppRoute, NavLinkItem } from '../../types';
import { WordLogo } from '../ui/WordLogo';
import { MobileMenu } from './MobileMenu';
import './Navbar.css';

const NAV_LINKS: NavLinkItem[] = [
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Features', href: '#features' },
  { label: 'Security', href: '#security' },
  { label: 'About', href: '#ecosystem' },
];

interface NavbarProps {
  onNavigate: (route: AppRoute, hash?: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onNavigate }) => {
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleAnchorClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    onNavigate('home', href);
  };

  return (
    <header className="navbar">
      <div className="container navbar-inner">
        <a
          href="#top"
          className="navbar-brand"
          aria-label="Word home"
          onClick={(e) => handleAnchorClick(e, '#top')}
        >
          <WordLogo size={22} />
          <span>Word</span>
        </a>

        <nav className="navbar-links" aria-label="Primary Navigation">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="navbar-link"
              onClick={(e) => handleAnchorClick(e, link.href)}
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="navbar-actions">
          <button
            type="button"
            className="navbar-get-started"
            onClick={() => onNavigate('signup')}
          >
            Get started
          </button>
          <button
            type="button"
            className="navbar-signin"
            onClick={() => onNavigate('signin')}
          >
            Sign in
          </button>
        </div>

        <div className="navbar-mobile-controls">
          <button
            type="button"
            className="navbar-signin"
            style={{ padding: '7px 14px', fontSize: '12.5px' }}
            onClick={() => onNavigate('signin')}
          >
            Sign in
          </button>
          <button
            type="button"
            className="navbar-burger"
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav-panel"
            onClick={() => setMobileOpen((prev) => !prev)}
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      <MobileMenu
        isOpen={mobileOpen}
        links={NAV_LINKS}
        onClose={() => setMobileOpen(false)}
        onNavigate={onNavigate}
      />
    </header>
  );
};
