import React from 'react';
import { Container } from '../layout/Container';
import { Section } from '../layout/Section';
import { useRevealOnScroll } from '../../hooks/useScrollProgress';
import './Sections.css';

const CAPABILITIES = [
  'Shared payment records',
  'Original agreement terms',
  'Transaction details',
  'Dispute reporting',
  'Supporting evidence',
  'Dispute status tracking',
];

const RECORD_ROWS = [
  { key: 'Recipient', val: 'Thabo' },
  { key: 'Amount', val: '20 USDT' },
  { key: 'Purpose', val: 'Laptop purchase' },
  { key: 'Network', val: 'Testnet' },
  { key: 'Agreement', val: 'Accepted' },
  { key: 'Transaction', val: 'Confirmed' },
  { key: 'Record status', val: 'Available' },
];

export const Accountability: React.FC = () => {
  const { ref, isVisible } = useRevealOnScroll<HTMLDivElement>();

  return (
    <Section id="accountability">
      <Container>
        <div
          ref={ref}
          className={`accountability-layout reveal-up ${isVisible ? 'is-visible' : ''}`}
        >
          <div>
            <p className="eyebrow" style={{ marginBottom: '14px' }}>
              DISPUTES AND ACCOUNTABILITY
            </p>
            <h2 className="heading-lg" style={{ marginBottom: '18px' }}>
              Every payment deserves a record.
            </h2>
            <p className="body-lg" style={{ marginBottom: '12px' }}>
              A payment should not disappear into a transaction history without context.
            </p>
            <p className="body-md" style={{ marginBottom: '28px' }}>
              Word helps users maintain a clearer record of what was agreed and what happened.
            </p>

            <ul
              style={{
                listStyle: 'none',
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: '10px 20px',
                marginBottom: '24px',
              }}
            >
              {CAPABILITIES.map((cap) => (
                <li
                  key={cap}
                  style={{
                    fontSize: '14px',
                    color: 'var(--ink)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <span
                    style={{
                      width: '5px',
                      height: '5px',
                      borderRadius: '999px',
                      backgroundColor: 'var(--ink)',
                      flexShrink: 0,
                    }}
                    aria-hidden="true"
                  />
                  {cap}
                </li>
              ))}
            </ul>

            <p className="body-sm">
              Dispute reporting organises information and evidence for both parties. It does not
              automatically reverse blockchain payments or guarantee recovery of funds.
            </p>
          </div>

          <div className="record-document" aria-label="Sample payment record">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingBottom: '16px',
                marginBottom: '10px',
                borderBottom: '1px solid var(--line)',
              }}
            >
              <span className="eyebrow" style={{ color: 'var(--ink)' }}>
                PAYMENT RECORD
              </span>
              <span className="mono-label">SAMPLE</span>
            </div>

            {RECORD_ROWS.map((row) => (
              <div key={row.key} className="record-row">
                <span className="record-key">{row.key}</span>
                <span className="record-val">{row.val}</span>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </Section>
  );
};

