import React from 'react';
import { Container } from '../layout/Container';
import { Section } from '../layout/Section';
import { SectionHeading } from '../ui/SectionHeading';
import { useRevealOnScroll } from '../../hooks/useScrollProgress';
import './Sections.css';

const PROBLEMS = [
  {
    num: '01',
    title: 'Fake payment requests',
    description:
      'Manipulated or misleading payment instructions can cause users to send funds to the wrong destination.',
  },
  {
    num: '02',
    title: 'Recipient uncertainty',
    description:
      'Users may struggle to establish whether a wallet address actually belongs to the person they intend to pay.',
  },
  {
    num: '03',
    title: 'Unclear agreements',
    description:
      'Buyers and sellers can have different expectations about what a payment is for and what was agreed.',
  },
  {
    num: '04',
    title: 'Limited accountability',
    description:
      'When something goes wrong, finding transaction information and organising supporting evidence can be difficult.',
  },
];

export const Problem: React.FC = () => {
  const { ref, isVisible } = useRevealOnScroll<HTMLDivElement>();

  return (
    <Section id="problem">
      <Container>
        <SectionHeading
          eyebrow="THE PROBLEM"
          title="Sending money is easy. Knowing who you're sending it to is harder."
          subtitle="Peer-to-peer payments have become easier, but trust has not always kept up."
        />

        <div ref={ref} className={`problem-grid reveal-up ${isVisible ? 'is-visible' : ''}`}>
          {PROBLEMS.map((item) => (
            <div key={item.num} className="problem-item">
              <span className="problem-num">{item.num}</span>
              <h3 className="heading-sm" style={{ marginBottom: '10px' }}>
                {item.title}
              </h3>
              <p className="body-md">{item.description}</p>
            </div>
          ))}
        </div>

        <p className="problem-closing">
          Word brings more clarity to the moments before, during and after a payment.
        </p>
      </Container>
    </Section>
  );
};

