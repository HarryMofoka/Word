import React from 'react';
import { Container } from '../layout/Container';
import { Section } from '../layout/Section';
import { SectionHeading } from '../ui/SectionHeading';
import { useRevealOnScroll } from '../../hooks/useScrollProgress';
import './Sections.css';

const STEPS = [
  {
    num: '01',
    title: 'Create a request',
    description:
      'A sender creates a structured payment request containing the recipient, amount, token, network and payment purpose.',
  },
  {
    num: '02',
    title: 'Verify the details',
    description:
      'Word checks wallet control, destination details, network, token and available risk indicators.',
  },
  {
    num: '03',
    title: 'Review and approve',
    description:
      'The user sees the payment information, fees and risk assessment before explicitly approving the transaction.',
  },
  {
    num: '04',
    title: 'Track and keep proof',
    description:
      'The transaction is monitored until its blockchain status is verified. Relevant payment records remain available to both parties.',
  },
];

export const HowItWorks: React.FC = () => {
  const { ref, isVisible } = useRevealOnScroll<HTMLDivElement>();

  return (
    <Section id="how-it-works" variant="soft">
      <Container>
        <SectionHeading
          eyebrow="HOW IT WORKS"
          title="A more considered way to send money."
          subtitle="From the first payment request to the final transaction record, Word helps both parties understand what is happening."
        />

        <div ref={ref} className={`steps-grid reveal-up ${isVisible ? 'is-visible' : ''}`}>
          {STEPS.map((step, index) => (
            <div key={step.num} className="step-card">
              <div className="step-header">
                <span className="step-num">{step.num}</span>
                {index < STEPS.length - 1 && <span className="step-line" aria-hidden="true" />}
              </div>
              <h3 className="heading-sm" style={{ marginBottom: '10px' }}>
                {step.title}
              </h3>
              <p className="body-md">{step.description}</p>
            </div>
          ))}
        </div>
      </Container>
    </Section>
  );
};

