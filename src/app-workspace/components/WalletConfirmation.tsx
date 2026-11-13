import React, { useState } from 'react';
import { ArrowRight, Check, CheckCircle2, Copy } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import type { WalletState } from '../types';

interface WalletConfirmationProps {
  wallet: WalletState;
  onOpenSecurity: () => void;
  onContinue: () => void;
}

export const WalletConfirmation: React.FC<WalletConfirmationProps> = ({
  wallet,
  onOpenSecurity,
  onContinue,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(wallet.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const methodLabel =
    wallet.method === 'created'
      ? 'Created in Word (Testnet demo)'
      : wallet.method === 'imported'
        ? 'Imported via recovery phrase'
        : 'Connected wallet';

  return (
    <div className="ws-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
        <CheckCircle2 size={20} style={{ color: '#25b864' }} aria-hidden="true" />
        <span className="eyebrow" style={{ color: 'var(--ink)' }}>
          STEP 3 OF 3 · WALLET READY
        </span>
      </div>

      <h1 className="heading-lg" style={{ marginBottom: '12px' }}>
        Wallet connected.
      </h1>
      <p className="body-md" style={{ marginBottom: '24px' }}>
        Your wallet is linked to this Word session. Review your connection details below before
        entering the workspace.
      </p>

      <div
        style={{
          backgroundColor: 'var(--bg)',
          border: '1px solid var(--line)',
          borderRadius: '14px',
          padding: '18px 20px',
          marginBottom: '22px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            paddingBottom: '12px',
            borderBottom: '1px solid var(--line)',
          }}
        >
          <div>
            <p className="eyebrow" style={{ marginBottom: '4px' }}>
              WALLET ADDRESS
            </p>
            <p
              style={{
                fontSize: '13.5px',
                fontWeight: 500,
                color: 'var(--ink)',
                wordBreak: 'break-all',
              }}
            >
              {wallet.address}
            </p>
          </div>
          <button type="button" className="ws-ghost-btn" onClick={handleCopy}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: '12px',
            paddingTop: '12px',
          }}
        >
          <div>
            <p className="eyebrow" style={{ marginBottom: '3px' }}>
              METHOD
            </p>
            <p className="body-sm" style={{ color: 'var(--ink)', fontWeight: 500 }}>
              {methodLabel}
            </p>
          </div>
          <div>
            <p className="eyebrow" style={{ marginBottom: '3px' }}>
              NETWORK
            </p>
            <p className="body-sm" style={{ color: 'var(--ink)', fontWeight: 500 }}>
              {wallet.network}
            </p>
          </div>
        </div>
      </div>

      <div className="ws-actions-row">
        <button
          type="button"
          className="text-link"
          style={{ background: 'transparent', border: 'none' }}
          onClick={onOpenSecurity}
        >
          Review recovery &amp; security
        </button>

        <Button onClick={onContinue}>
          Open Word workspace <ArrowRight size={14} />
        </Button>
      </div>
    </div>
  );
};

