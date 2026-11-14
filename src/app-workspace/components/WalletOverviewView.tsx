import React, { useState } from 'react';
import { Check, CheckCircle2, Copy, Eye, EyeOff, Plus, RefreshCw, Shield, UserCheck } from 'lucide-react';
import type { PaymentRecord, UserSession, WalletState } from '../types';
import type { WalletBalances } from '../../services/wdkWalletService';

interface WalletOverviewViewProps {
  session?: UserSession;
  wallet: WalletState;
  balances: WalletBalances | null;
  balancesLoading: boolean;
  onRefreshBalances: () => void;
  onCreateNewSimulatedWallet?: () => void;
  balanceHidden: boolean;
  onToggleBalance: () => void;
  records: PaymentRecord[];
  onSelectRecord: (recordId: string) => void;
  onOpenSecurity: () => void;
}

export const WalletOverviewView: React.FC<WalletOverviewViewProps> = ({
  session,
  wallet,
  balances,
  balancesLoading,
  onRefreshBalances,
  onCreateNewSimulatedWallet,
  balanceHidden,
  onToggleBalance,
  records,
  onSelectRecord,
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
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="ws-ghost-btn"
                onClick={onRefreshBalances}
                disabled={balancesLoading}
              >
                <RefreshCw size={14} />
                <span>{balancesLoading ? 'Syncing' : 'Refresh'}</span>
              </button>
              <button
                type="button"
                className="ws-ghost-btn"
                onClick={onToggleBalance}
              >
                {balanceHidden ? <Eye size={14} /> : <EyeOff size={14} />}
                <span>{balanceHidden ? 'Show' : 'Hide'}</span>
              </button>
            </div>
          </div>

          <p className="ws-balance-amount">
            {balanceHidden
              ? '•••••• USDT'
              : balancesLoading && !balances
                ? 'Loading USDT...'
                : `${balances?.usdtBalance ?? '2500.00'} USDT`}
          </p>
          <p className="body-sm" style={{ marginTop: '8px', marginBottom: '22px' }}>
            {balances?.networkLabel ?? wallet.network} · Native:{' '}
            {balanceHidden
              ? '••••'
              : `${balances?.nativeBalance ?? '1.5000'} ${balances?.nativeSymbol ?? 'ETH'}`}
            {balances?.error ? ` (${balances.error})` : ''}
          </p>

          <div
            style={{
              backgroundColor: 'var(--bg)',
              border: '1px solid var(--line)',
              borderRadius: '14px',
              padding: '16px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
              <p className="eyebrow">PROFILE-LINKED WALLET ADDRESS</p>
              {session && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    color: '#1a8f4d',
                  }}
                >
                  <UserCheck size={13} /> Linked to {session.displayName}
                </span>
              )}
            </div>
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
              {onCreateNewSimulatedWallet && (
                <button
                  type="button"
                  className="ws-ghost-btn"
                  onClick={onCreateNewSimulatedWallet}
                  style={{ borderColor: 'var(--ink)', fontWeight: 600 }}
                >
                  <Plus size={14} />
                  Create New Profile Wallet (Mock 2,500 USDT)
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="ws-card">
          <p className="eyebrow" style={{ marginBottom: '12px' }}>
            CUSTODY &amp; PROFILE BINDING
          </p>
          <h2 className="heading-md" style={{ marginBottom: '16px' }}>
            Profile-linked wallet status
          </h2>
          {session && (
            <>
              <div className="ws-setting-row">
                <span className="body-sm">Linked Owner</span>
                <span style={{ fontSize: '14px', fontWeight: 500 }}>{session.displayName}</span>
              </div>
              <div className="ws-setting-row">
                <span className="body-sm">Owner Email</span>
                <span style={{ fontSize: '14px', fontWeight: 500 }}>{session.email}</span>
              </div>
            </>
          )}
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
            <span className="body-sm">Risk-adaptive protection</span>
            <span style={{ fontSize: '14px', fontWeight: 500, color: '#1a8f4d' }}>
              Active (Passkey + Dispute Gate + Timer)
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
          <button
            key={rec.id}
            type="button"
            className="ws-record-item"
            style={{
              width: '100%',
              background: 'transparent',
              borderLeft: 'none',
              borderRight: 'none',
              borderTop: 'none',
              textAlign: 'left',
            }}
            onClick={() => onSelectRecord(rec.id)}
          >
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
          </button>
        ))}
      </div>
    </div>
  );
};
