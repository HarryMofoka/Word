import React from 'react';
import { Container } from '../layout/Container';
import { Section } from '../layout/Section';
import { SectionHeading } from '../ui/SectionHeading';
import { useRevealOnScroll } from '../../hooks/useScrollProgress';
import './Sections.css';

const PRINCIPLES = [
  {
    title: 'Self-custody',
    description: "Private keys remain under the user's control.",
  },
  {
    title: 'Explicit approval',
    description: 'Payments require deliberate user authorisation.',
  },
  {
    title: 'Transaction validation',
    description: 'Recipient, destination, network, token and payment details are checked before signing.',
  },
  {
    title: 'Explainable risk',
    description: 'Users receive understandable explanations when potential risks are identified.',
  },
  {
    title: 'Verifiable settlement',
    description: 'Word distinguishes between pending, confirmed and failed transaction states.',
  },
];

export const Security: React.FC = () => {
  const { ref, isVisible } = useRevealOnScroll<HTMLDivElement>();

  return (
    <Section id="security" variant="soft">
      <Container>
        <SectionHeading
          eyebrow="SECURITY AND TRUST"
          title="Security should never be an afterthought."
          subtitle="Word is designed to give users more visibility and control over their payment decisions."
        />

        <div ref={ref} className={`security-layout reveal-up ${isVisible ? 'is-visible' : ''}`}>
          <div className="security-statement-box">
            <div className="security-dot-accent dot-motif" aria-hidden="true" />
            <p className="eyebrow" style={{ marginBottom: '16px', position: 'relative' }}>
              CORE PRINCIPLE
            </p>
            <h3 className="heading-xl" style={{ position: 'relative', marginBottom: '18px' }}>
              Know what you&apos;re approving.
            </h3>
            <p className="body-md" style={{ position: 'relative' }}>
              Wallet-control verification confirms signature control over an address—it is not
              proof of real-world identity. Word surfaces checks and context so you stay in control
              before signing.
            </p>
          </div>

          <div className="security-principles">
            {PRINCIPLES.map((item) => (
              <div key={item.title} className="security-principle-row">
                <h3 className="heading-sm" style={{ marginBottom: '4px' }}>
                  {item.title}
                </h3>
                <p className="body-md">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </Section>
  );
};

