import React from 'react';
import { Container } from '../layout/Container';
import { Section } from '../layout/Section';
import { SectionHeading } from '../ui/SectionHeading';
import { useRevealOnScroll } from '../../hooks/useScrollProgress';
import './Sections.css';

export const Ecosystem: React.FC = () => {
  const { ref, isVisible } = useRevealOnScroll<HTMLDivElement>();

  return (
    <Section id="ecosystem" variant="soft">
      <Container>
        <SectionHeading
          eyebrow="ECOSYSTEM"
          title="Exploring a more trustworthy payment future."
          subtitle="Word is being developed within the W3Node BuilderBase Hackathon ecosystem, exploring how blockchain technology can improve transparency and trust in everyday digital payments."
        />

        <div ref={ref} className={`reveal-up ${isVisible ? 'is-visible' : ''}`}>
          <p className="eyebrow" style={{ marginBottom: '14px' }}>
            HACKATHON SPONSORS
          </p>

          <div className="sponsors-row" aria-label="Hackathon sponsors">
            <span className="sponsor-wordmark">Tether</span>
            <span className="sponsor-wordmark">Ripple</span>
            <span className="sponsor-wordmark">BuilderBase</span>
          </div>

          <p className="body-sm" style={{ maxWidth: '680px' }}>
            Tether, Ripple, and BuilderBase are recognised as hackathon sponsors within the W3Node
            BuilderBase Hackathon ecosystem. Hackathon sponsorship does not constitute product
            endorsement, partnership, or technical integration.
          </p>
        </div>
      </Container>
    </Section>
  );
};

