import React from 'react';
import { Container } from '../layout/Container';
import { Section } from '../layout/Section';
import { SectionHeading } from '../ui/SectionHeading';
import { useRevealOnScroll } from '../../hooks/useScrollProgress';
import './Sections.css';

const AUDIENCE_BENTO = [
  {
    num: '01',
    title: 'Online buyers and sellers',
    description: 'More transparency when paying people they do not know.',
    span: 'wide' as const,
    image:
      'https://images.pexels.com/photos/4050315/pexels-photo-4050315.jpeg?auto=compress&cs=tinysrgb&w=1200',
    alt: 'Person reviewing payment details on a laptop at a clean white table',
  },
  {
    num: '02',
    title: 'Freelancers',
    description: 'Keep clear records of payment purposes and agreed terms.',
    span: 'narrow' as const,
    image:
      'https://images.pexels.com/photos/6694543/pexels-photo-6694543.jpeg?auto=compress&cs=tinysrgb&w=1200',
    alt: 'Minimal workspace with laptop, smartphone, and financial records',
  },
  {
    num: '03',
    title: 'Small businesses',
    description: 'Create structured payment requests and maintain transaction records.',
    span: 'narrow' as const,
    image:
      'https://images.pexels.com/photos/4968630/pexels-photo-4968630.jpeg?auto=compress&cs=tinysrgb&w=1200',
    alt: 'Small business counter with payment terminal and written order notes',
  },
  {
    num: '04',
    title: 'Friends and communities',
    description: 'Make shared payments easier to understand and track.',
    span: 'wide' as const,
    image:
      'https://images.pexels.com/photos/3184418/pexels-photo-3184418.jpeg?auto=compress&cs=tinysrgb&w=1200',
    alt: 'Hands joined together over a wooden table with a notebook and laptop',
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

        <div ref={ref} className={`audience-bento reveal-up ${isVisible ? 'is-visible' : ''}`}>
          {AUDIENCE_BENTO.map((item) => (
            <article
              key={item.num}
              className={`bento-card bento-card--${item.span}`}
            >
              <div className="bento-media">
                <img src={item.image} alt={item.alt} loading="lazy" />
              </div>
              <div className="bento-body">
                <span className="mono-label" style={{ display: 'block', marginBottom: '10px' }}>
                  {item.num}
                </span>
                <h3 className="heading-sm" style={{ marginBottom: '8px' }}>
                  {item.title}
                </h3>
                <p className="body-md">{item.description}</p>
              </div>
            </article>
          ))}
        </div>
      </Container>
    </Section>
  );
};
