import React from 'react';
import { Container } from '../layout/Container';
import { WordLogo } from '../ui/WordLogo';
import './Footer.css';

export const Footer: React.FC = () => {
  return (
    <footer className="footer">
      <Container>
        <div className="footer-grid">
          <div>
            <a
              href="#top"
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
                <a href="#how-it-works" className="footer-link">
                  How it works
                </a>
              </li>
              <li>
                <a href="#features" className="footer-link">
                  Features
                </a>
              </li>
              <li>
                <a href="#security" className="footer-link">
                  Security
                </a>
              </li>
              <li>
                <a href="#assistant" className="footer-link">
                  AI assistant
                </a>
              </li>
              <li>
                <a href="#accountability" className="footer-link">
                  Payment records
                </a>
              </li>
            </ul>
          </div>

          <div>
            <p className="footer-col-title">Company</p>
            <ul className="footer-links">
              <li>
                <a href="#problem" className="footer-link">
                  About Word
                </a>
              </li>
              <li>
                <a href="#ecosystem" className="footer-link">
                  Hackathon information
                </a>
              </li>
            </ul>
          </div>

          <div>
            <p className="footer-col-title">Resources</p>
            <ul className="footer-links">
              <li>
                <a href="#faq" className="footer-link">
                  Frequently asked questions
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

