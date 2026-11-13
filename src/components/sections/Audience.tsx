import React from 'react';
import { Container } from '../layout/Container';
import { Section } from '../layout/Section';
import { SectionHeading } from '../ui/SectionHeading';
import { useRevealOnScroll } from '../../hooks/useScrollProgress';
import './Sections.css';

const AUDIENCES = [
  {
    num: '01',
    title: 'Online buyers and sellers',
    description: 'More transparency when paying people they do not know.',
  },
  {
    num: '02',
    title: 'Freelancers',
    description: 'Keep clear records of payment purposes and agreed terms.',
  },
  {
    num: '03',
    title: 'Small businesses',
    description: 'Create structured payment requests and maintain transaction records.',
  },
  {
    num: '04',
    title: 'Friends and communities',
    description: 'Make shared payments easier to understand and track.',
  },
];

export const Audience: React.FC = () => {
  const { ref, isVisible } = useRevealOnScroll<HTMLDivElement>();

  return (
    <Section id="audience" variant="soft">
      <Container>
        <SectionHeading
          eyebrow="WHO WORD IS FOR"
          title="Built for the way people transact."
        />

        <div ref={ref} className={`audience-grid reveal-up ${isVisible ? 'is-visible' : ''}`}>
          {AUDIENCES.map((item) => (
            <div key={item.num} className="audience-item">
              <span className="mono-label" style={{ display: 'block', marginBottom: '12px' }}>
                {item.num}
              </span>
              <h3 className="heading-sm" style={{ marginBottom: '8px' }}>
                {item.title}
              </h3>
              <p className="body-md">{item.description}</p>
            </div>
          ))}
        </div>
      </Container>
    </Section>
  );
};

