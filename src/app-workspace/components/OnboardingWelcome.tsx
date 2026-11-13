import React from 'react';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import type { UserSession } from '../types';

interface OnboardingWelcomeProps {
  session: UserSession;
  onContinue: () => void;
}

const HIGHLIGHTS = [
  {
    title: 'Verify before sending',
    desc: 'Check cryptographic wallet control and destination details before approving.',
  },
  {
    title: 'Clear payment agreements',
    desc: 'Keep recipient, amount, network, and payment purpose together in one view.',
  },
  {
    title: 'Self-custody always',
    desc: 'Private keys remain under your control. Word never signs without your approval.',
  },
];

export const OnboardingWelcome: React.FC<OnboardingWelcomeProps> = ({
  session,
  onContinue,
}) => {
  return (
    <div className="ws-card">
      <p className="eyebrow" style={{ marginBottom: '12px' }}>
        STEP 1 OF 3 · WELCOME
      </p>
      <h1 className="heading-lg" style={{ marginBottom: '12px' }}>
        {session.displayName ? `Welcome, ${session.displayName}.` : 'Welcome to Word.'}
      </h1>
      <p className="body-md" style={{ marginBottom: '24px' }}>
        Let&apos;s set up your self-custody wallet in a few quick steps so you can review payment
        requests, verify recipients, and keep clear transaction records.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '28px' }}>
        {HIGHLIGHTS.map((item) => (
          <div
            key={item.title}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
              padding: '14px 16px',
              borderRadius: '12px',
              backgroundColor: 'var(--bg)',
              border: '1px solid var(--line)',
            }}
          >
            <CheckCircle2
              size={18}
              style={{ flexShrink: 0, marginTop: '2px', color: 'var(--ink)' }}
              aria-hidden="true"
            />
            <div>
              <h2 className="heading-sm" style={{ fontSize: '15px', marginBottom: '3px' }}>
                {item.title}
              </h2>
              <p className="body-sm">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="ws-actions-row" style={{ marginTop: 0 }}>
        <span className="body-sm" style={{ color: 'var(--mute)' }}>
          Testnet demonstration environment
        </span>
        <Button onClick={onContinue}>
          Set up wallet <ArrowRight size={14} />
        </Button>
      </div>
    </div>
  );
};

