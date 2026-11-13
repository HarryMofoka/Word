import React from 'react';
import { Container } from '../layout/Container';
import { Section } from '../layout/Section';
import { useRevealOnScroll } from '../../hooks/useScrollProgress';
import './Sections.css';

export const Assistant: React.FC = () => {
  const { ref, isVisible } = useRevealOnScroll<HTMLDivElement>();

  return (
    <Section id="assistant">
      <Container>
        <div ref={ref} className={`assistant-layout reveal-up ${isVisible ? 'is-visible' : ''}`}>
          <div>
            <p className="eyebrow" style={{ marginBottom: '14px' }}>
              AI PAYMENT ASSISTANT
            </p>
            <h2 className="heading-lg" style={{ marginBottom: '18px' }}>
              Understand your payments before you make them.
            </h2>
            <p className="body-lg">
              Complex payment information should not require technical expertise. Word&apos;s AI
              assistant helps explain payment details, identify potential concerns and make payment
              information easier to understand.
            </p>
          </div>

          <div className="chat-frame" aria-label="Word AI Payment Assistant example">
            <div className="chat-header">
              <div className="chat-identity">
                <span className="chat-dot-ring" aria-hidden="true">
                  <span className="chat-dot-inner" />
                </span>
                <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--ink)' }}>
                  Word Assistant
                </span>
              </div>
              <span className="mono-label">ADVISORY</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="chat-bubble-user">
                &ldquo;I want to send 20 USDT to Thabo for a laptop.&rdquo;
              </div>

              <div className="chat-bubble-assistant">
                &ldquo;I can help prepare that payment. Before you approve, let&apos;s verify the
                recipient wallet, payment destination, network and transaction fee. I&apos;ll
                explain anything that needs your attention before you sign.&rdquo;
              </div>
            </div>

            <p className="chat-note">
              The AI assistant does not access private keys, independently sign transactions, or
              override security checks.
            </p>
          </div>
        </div>
      </Container>
    </Section>
  );
};

