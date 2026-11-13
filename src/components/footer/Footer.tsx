import React from 'react';
import type { AppRoute } from '../../types';
import { Container } from '../layout/Container';
import { WordLogo } from '../ui/WordLogo';
import './Footer.css';

interface FooterProps {
  onNavigate: (route: AppRoute, hash?: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  const handleAnchor = (e: React.MouseEvent<HTMLAnchorElement>, hash: string) => {
    e.preventDefault();
    onNavigate('home', hash);
  };

  const handleRoute = (e: React.MouseEvent<HTMLAnchorElement>, route: AppRoute) => {
    e.preventDefault();
    onNavigate(route);
  };

  return (
    <footer className="footer">
      <Container>
        <div className="footer-grid">
          <div>
            <a
              href="#top"
              onClick={(e) => handleAnchor(e, '#top')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
                color: 'var(--ink)',
                fontSize: '15px',
                fontWeight: 500,
                letterSpacing: '-0.02em',
                marginBottom: '14px',
              }}
            >
              <WordLogo size={20} />
              <span>Word</span>
            </a>
            <p className="body-sm" style={{ maxWidth: '290px' }}>
              Trust-first peer-to-peer payments. More clarity, verification and accountability in
              every transaction.
            </p>
          </div>

          <div>
            <p className="footer-col-title">Product</p>
            <ul className="footer-links">
              <li>
                <a
                  href="#how-it-works"
                  className="footer-link"
                  onClick={(e) => handleAnchor(e, '#how-it-works')}
                >
                  How it works
                </a>
              </li>
              <li>
                <a
                  href="#features"
                  className="footer-link"
                  onClick={(e) => handleAnchor(e, '#features')}
                >
                  Features
                </a>
              </li>
              <li>
                <a
                  href="#security"
                  className="footer-link"
                  onClick={(e) => handleAnchor(e, '#security')}
                >
                  Security
                </a>
              </li>
              <li>
                <a
                  href="#assistant"
                  className="footer-link"
                  onClick={(e) => handleAnchor(e, '#assistant')}
                >
                  AI assistant
                </a>
              </li>
              <li>
                <a
                  href="#accountability"
                  className="footer-link"
                  onClick={(e) => handleAnchor(e, '#accountability')}
                >
                  Payment records
                </a>
              </li>
            </ul>
          </div>

          <div>
            <p className="footer-col-title">Company</p>
            <ul className="footer-links">
              <li>
                <a
                  href="/about"
                  className="footer-link"
                  onClick={(e) => handleRoute(e, 'about')}
                >
                  About Word
                </a>
              </li>
              <li>
                <a
                  href="/contact"
                  className="footer-link"
                  onClick={(e) => handleRoute(e, 'contact')}
                >
                  Contact
                </a>
              </li>
              <li>
                <a
                  href="#ecosystem"
                  className="footer-link"
                  onClick={(e) => handleAnchor(e, '#ecosystem')}
                >
                  Hackathon information
                </a>
              </li>
            </ul>
          </div>

          <div>
            <p className="footer-col-title">Resources</p>
            <ul className="footer-links">
              <li>
                <a
                  href="#faq"
                  className="footer-link"
                  onClick={(e) => handleAnchor(e, '#faq')}
                >
                  Frequently asked questions
                </a>
              </li>
              <li>
                <a
                  href="/docs"
                  className="footer-link"
                  onClick={(e) => handleRoute(e, 'docs')}
                >
                  Documentation
                </a>
              </li>
              <li>
                <a
                  href="/privacy"
                  className="footer-link"
                  onClick={(e) => handleRoute(e, 'privacy')}
                >
                  Privacy policy
                </a>
              </li>
              <li>
                <a
                  href="/terms"
                  className="footer-link"
                  onClick={(e) => handleRoute(e, 'terms')}
                >
                  Terms of service
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          <p className="body-sm">© 2026 Word. All rights reserved.</p>
          <p className="body-sm" style={{ maxWidth: '560px', color: 'var(--mute)' }}>
            Word is a payment technology demonstration operating in a testnet environment. Always
            verify transaction details before approving a blockchain payment.
          </p>
        </div>
      </Container>
    </footer>
  );
};
