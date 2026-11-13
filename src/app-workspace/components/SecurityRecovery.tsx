import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import type { WalletState } from '../types';

interface SecurityRecoveryProps {
  wallet: WalletState;
  isOnboarding: boolean;
  onBack: () => void;
  onConfirmBackup: () => void;
}

export const SecurityRecovery: React.FC<SecurityRecoveryProps> = ({
  wallet,
  isOnboarding,
  onBack,
  onConfirmBackup,
}) => {
  const [revealed, setRevealed] = useState(false);
  const [checked, setChecked] = useState(wallet.recoveryBackedUp);

  return (
    <div className="ws-card">
      <p className="eyebrow" style={{ marginBottom: '12px' }}>
        RECOVERY AND SECURITY
      </p>
      <h1 className="heading-lg" style={{ marginBottom: '12px' }}>
        Keep your recovery phrase safe.
      </h1>
      <p className="body-md" style={{ marginBottom: '20px' }}>
        Word does not store private keys or recovery phrases. Anyone with your recovery phrase can
        control your wallet, and Word cannot recover lost phrases.
      </p>

      {wallet.demoSeedWords && wallet.demoSeedWords.length > 0 && (
        <div style={{ marginBottom: '22px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              marginBottom: '8px',
            }}
          >
            <span className="field-label">Testnet demonstration recovery phrase</span>
            <button
              type="button"
              className="ws-ghost-btn"
              onClick={() => setRevealed((prev) => !prev)}
            >
              {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
              {revealed ? 'Hide phrase' : 'Reveal phrase'}
            </button>
          </div>

          <div
            className="ws-seed-grid"
            style={{
              filter: revealed ? 'none' : 'blur(6px)',
              userSelect: revealed ? 'text' : 'none',
              transition: 'filter 0.2s ease',
            }}
          >
            {wallet.demoSeedWords.map((word, idx) => (
              <div key={word} className="ws-seed-word">
                <span className="ws-seed-idx">{idx + 1}.</span>
                <span>{word}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '22px' }}>
        <div className="ws-notice">
          <strong>Self-custody:</strong> Your keys stay with you. Word cannot independently sign
          or submit payments without your explicit approval.
        </div>
        <div className="ws-notice">
          <strong>Verification &amp; irreversibility:</strong> Wallet-control verification confirms
          address control, not real-world identity. Confirmed blockchain transfers cannot be
          reversed.
        </div>
      </div>

      {isOnboarding && (
        <label
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            fontSize: '14px',
            color: 'var(--ink)',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            style={{ marginTop: '4px', width: '16px', height: '16px' }}
          />
          <span>
            I understand that I am responsible for my recovery phrase and for verifying payment
            details before approving.
          </span>
        </label>
      )}

      <div className="ws-actions-row">
        <button type="button" className="auth-back-link" onClick={onBack}>
          <ArrowLeft size={15} /> Back
        </button>

        {isOnboarding ? (
          <Button
            onClick={onConfirmBackup}
            disabled={!checked}
            style={!checked ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
          >
            Continue <ArrowRight size={14} />
          </Button>
        ) : (
          <Button onClick={onBack}>
            Return to workspace <ArrowRight size={14} />
          </Button>
        )}
      </div>
    </div>
  );
};

