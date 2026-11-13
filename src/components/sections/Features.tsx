import React from 'react';
import {
  KeyRound,
  QrCode,
  AlertCircle,
  FileText,
  Receipt,
  MessageSquare,
} from 'lucide-react';
import { Container } from '../layout/Container';
import { Section } from '../layout/Section';
import { SectionHeading } from '../ui/SectionHeading';
import { useRevealOnScroll } from '../../hooks/useScrollProgress';
import './Sections.css';

const FEATURES = [
  {
    id: 'verification',
    category: 'VERIFICATION',
    title: 'Recipient verification',
    description:
      'Verify control of a wallet through cryptographic signatures and help identify destination mismatches before payment.',
    Icon: KeyRound,
  },
  {
    id: 'requests',
    category: 'PAYMENT CLARITY',
    title: 'Smart payment requests',
    description:
      'Create structured payment requests with QR codes, amounts, recipient details and payment descriptions.',
    Icon: QrCode,
  },
  {
    id: 'risk',
    category: 'RISK INTELLIGENCE',
    title: 'Scam intelligence',
    description:
      'Identify suspicious payment details and explain potential risks before users approve a transaction.',
    Icon: AlertCircle,
  },
  {
    id: 'agreements',
    category: 'AGREEMENTS',
    title: 'Payment agreements',
    description:
      'Record what both parties agreed the payment was for, including its purpose and agreed terms.',
    Icon: FileText,
  },
  {
    id: 'records',
    category: 'ACCOUNTABILITY',
    title: 'Verifiable transaction records',
    description:
      'Track payment status and maintain transaction records supported by blockchain evidence.',
    Icon: Receipt,
  },
  {
    id: 'assistant',
    category: 'GUIDANCE',
    title: 'AI payment assistant',
    description:
      'Get plain-language explanations of payment details, transaction status and potential security warnings.',
    Icon: MessageSquare,
  },
];

export const Features: React.FC = () => {
  const { ref, isVisible } = useRevealOnScroll<HTMLDivElement>();

  return (
    <Section id="features">
      <Container>
        <SectionHeading
          eyebrow="CORE CAPABILITIES"
          title="Everything you need to make more informed payments."
          subtitle="A collection of tools designed to make peer-to-peer payments easier to understand, verify and track."
        />

        <div ref={ref} className={`features-grid reveal-up ${isVisible ? 'is-visible' : ''}`}>
          {FEATURES.map(({ id, category, title, description, Icon }) => (
            <div key={id} className="feature-cell">
              <div className="feature-meta">
                <Icon size={16} strokeWidth={1.6} aria-hidden="true" />
                <span className="eyebrow" style={{ letterSpacing: '0.14em' }}>
                  {category}
                </span>
              </div>
              <h3 className="heading-sm" style={{ marginBottom: '10px' }}>
                {title}
              </h3>
              <p className="body-md">{description}</p>
            </div>
          ))}
        </div>
      </Container>
    </Section>
  );
};

