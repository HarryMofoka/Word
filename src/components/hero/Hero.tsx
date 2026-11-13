import React from 'react';
import { ArrowDown } from 'lucide-react';
import type { AuthModalMode } from '../../types';
import { Button } from '../ui/Button';
import { HeroCanvas } from './HeroCanvas';
import { DotMatrixHands } from './DotMatrixHands';
import './Hero.css';

interface HeroProps {
  onOpenAuth: (mode: AuthModalMode) => void;
}

export const Hero: React.FC<HeroProps> = ({ onOpenAuth }) => {
  return (
    <section id="top" className="hero" aria-label="Word hero">
      <HeroCanvas />
      <DotMatrixHands />

      <div className="container">
        <div className="hero-content">
          <p className="eyebrow hero-eyebrow">TRUST-FIRST PEER-TO-PEER PAYMENTS</p>

          <h1 className="heading-xl hero-headline">
            <span className="hero-headline-muted">Trust every</span>
            <span className="hero-headline-ink">Transaction.</span>
          </h1>

          <p className="body-lg hero-sub">
            Sending money should not mean trusting blindly. Know who you&apos;re paying, understand
            what you&apos;re approving and keep a record of every transaction.
          </p>

          <div className="hero-actions">
            <Button onClick={() => onOpenAuth('get-started')}>Get started</Button>
            <a href="#how-it-works" className="text-link">
              How it works <ArrowDown size={14} />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};

