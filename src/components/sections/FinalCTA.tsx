import React from 'react';
import { ArrowRight } from 'lucide-react';
import type { AuthModalMode } from '../../types';
import { Container } from '../layout/Container';
import { Section } from '../layout/Section';
import { Button } from '../ui/Button';
import './Sections.css';

interface FinalCTAProps {
  onOpenAuth: (mode: AuthModalMode) => void;
}

export const FinalCTA: React.FC<FinalCTAProps> = ({ onOpenAuth }) => {
  return (
    <Section className="final-cta" variant="soft">
      <div className="final-cta-dots dot-motif" aria-hidden="true" />
      <Container>
        <div style={{ position: 'relative', zIndex: 1, maxWidth: '640px', marginInline: 'auto' }}>
          <p className="eyebrow" style={{ marginBottom: '16px' }}>
            GET STARTED
          </p>
          <h2 className="heading-lg" style={{ marginBottom: '18px' }}>
            Don&apos;t just send money. Send it with confidence.
          </h2>
          <p className="body-lg" style={{ marginBottom: '34px' }}>
            Know who you&apos;re paying. Understand what you&apos;re approving. Keep a record of
            every transaction.
          </p>

          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '24px',
              flexWrap: 'wrap',
            }}
          >
            <Button onClick={() => onOpenAuth('get-started')}>Get started</Button>
            <a href="#how-it-works" className="text-link">
              Explore how it works <ArrowRight size={14} />
            </a>
          </div>
        </div>
      </Container>
    </Section>
  );
};

