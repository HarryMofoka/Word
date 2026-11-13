import React, { useState } from 'react';
import { Check, CheckCircle2, Copy, Eye, EyeOff, Shield } from 'lucide-react';
import type { PaymentRecord, WalletState } from '../types';

interface WalletOverviewViewProps {
  wallet: WalletState;
  balanceHidden: boolean;
  onToggleBalance: () => void;
  records: PaymentRecord[];
  onOpenSecurity: () => void;
}

export const WalletOverviewView: React.FC<WalletOverviewViewProps> = ({
  wallet,
  balanceHidden,
  onToggleBalance,
  records,
  onOpenSecurity,
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className="ws-grid">
        <div className="ws-card ws-balance-card">
          <div className="ws-balance-accent" aria-hidden="true" />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '14px',
            }}
          >
            <p className="eyebrow">WALLET OVERVIEW</p>
            <button
              type="button"
              className="ws-ghost-btn"
              onClick={onToggleBalance}
            >
              {balanceHidden ? <Eye size={14} /> : <EyeOff size={14} />}
              <span>{balanceHidden ? 'Show' : 'Hide'}</span>
            </button>
          </div>

          <p className="ws-balance-amount">
            {balanceHidden ? '•••••• USDT' : '240.00 USDT'}
          </p>
          <p className="body-sm" style={{ marginTop: '8px', marginBottom: '22px' }}>
            Available balance · {wallet.network} UI preview
          </p>

          <div
            style={{
              backgroundColor: 'var(--bg)',
              border: '1px solid var(--line)',
              borderRadius: '14px',
              padding: '16px',
            }}
          >
            <p className="eyebrow" style={{ marginBottom: '6px' }}>
              CONNECTED ADDRESS
            </p>
            <p
              style={{
                fontSize: '13.5px',
                fontWeight: 500,
                color: 'var(--ink)',
                wordBreak: 'break-all',
                marginBottom: '12px',
              }}
            >
              {wallet.address}
            </p>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button type="button" className="ws-ghost-btn" onClick={handleCopy}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copied address' : 'Copy address'}
              </button>
              <button type="button" className="ws-ghost-btn" onClick={onOpenSecurity}>
                <Shield size={14} />
                Recovery &amp; security
              </button>
            </div>
          </div>
        </div>

        <div className="ws-card">
          <p className="eyebrow" style={{ marginBottom: '12px' }}>
            CUSTODY &amp; NETWORK
          </p>
          <h2 className="heading-md" style={{ marginBottom: '16px' }}>
            Self-custody status
          </h2>
          <div className="ws-setting-row">
            <span className="body-sm">Active network</span>
            <span style={{ fontSize: '14px', fontWeight: 500 }}>{wallet.network}</span>
          </div>
          <div className="ws-setting-row">
            <span className="body-sm">Wallet method</span>
            <span style={{ fontSize: '14px', fontWeight: 500, textTransform: 'capitalize' }}>
              {wallet.method}
            </span>
          </div>
          <div className="ws-setting-row">
            <span className="body-sm">Approval model</span>
            <span style={{ fontSize: '14px', fontWeight: 500 }}>Explicit user signing</span>
          </div>
          <div className="ws-setting-row">
            <span className="body-sm">Backend connection</span>
            <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--mute)' }}>
              UI preview only
            </span>
          </div>
        </div>
      </div>

      <div className="ws-card">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px',
          }}
        >
          <p className="eyebrow">RECENT TRANSACTIONS</p>
          <span className="mono-label">{records.length} RECORDS</span>
        </div>

        {records.map((rec) => (
          <div key={rec.id} className="ws-record-item">
            <div>
              <p style={{ fontSize: '14.5px', fontWeight: 500, color: 'var(--ink)' }}>
                {rec.recipient} · {rec.amount}
              </p>
              <p className="body-sm">
                {rec.purpose} · {rec.address} · {rec.network}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  fontSize: '12.5px',
                  fontWeight: 500,
                  color: rec.status === 'Confirmed' ? '#1a8f4d' : 'var(--sub)',
                }}
              >
                <CheckCircle2 size={13} />
                {rec.status}
              </span>
              <p className="body-sm" style={{ fontSize: '12px', color: 'var(--mute)' }}>
                {rec.timestamp}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
