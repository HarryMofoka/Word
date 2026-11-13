import React, { useState } from 'react';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Eye,
  EyeOff,
  QrCode,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import type {
  AppNotification,
  PaymentRecord,
  QuickActionMode,
  UserSession,
  WalletState,
  WorkspaceTab,
} from '../types';

interface DashboardViewProps {
  session: UserSession;
  wallet: WalletState;
  balanceHidden: boolean;
  onToggleBalance: () => void;
  records: PaymentRecord[];
  notifications: AppNotification[];
  onCreateDemoRecord: (record: PaymentRecord) => void;
  onNavigateTab: (tab: WorkspaceTab) => void;
  onOpenSecurity: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  session,
  wallet,
  balanceHidden,
  onToggleBalance,
  records,
  notifications,
  onCreateDemoRecord,
  onNavigateTab,
  onOpenSecurity,
}) => {
  const [quickMode, setQuickMode] = useState<QuickActionMode>(null);
  const [recipient, setRecipient] = useState('Thabo M.');
  const [address, setAddress] = useState('0x4b8f92c10a7d44e19c3f8b2a91e2');
  const [amount, setAmount] = useState('20.00');
  const [purpose, setPurpose] = useState('Laptop purchase');
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const shortAddr = `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`;
  const unreadNotifs = notifications.filter((n) => !n.read);

  const handleQuickSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (quickMode === 'send') {
      const rec: PaymentRecord = {
        id: `rec-${Date.now()}`,
        recipient: recipient || 'Recipient',
        address: address.length > 12 ? `${address.slice(0, 6)}...${address.slice(-4)}` : address,
        amount: `${amount || '0.00'} USDT`,
        purpose: purpose || 'Peer-to-peer payment',
        network: wallet.network,
        status: 'Pending',
        verifiedControl: true,
        timestamp: 'Just now',
      };
      onCreateDemoRecord(rec);
      setActionNotice(
        `UI preview: Payment request for ${rec.amount} to ${rec.recipient} added as Pending.`
      );
    } else if (quickMode === 'request') {
      setActionNotice(
        `UI preview: Structured payment request for ${amount || '20.00'} USDT (${purpose}) prepared.`
      );
    } else if (quickMode === 'verify') {
      setActionNotice(
        `UI preview: Signature check interface ready for ${address.slice(0, 10)}... (Testnet UI only).`
      );
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Row: Available Balance + Wallet Overview */}
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
            <p className="eyebrow">AVAILABLE BALANCE</p>
            <button
              type="button"
              className="ws-ghost-btn"
              onClick={onToggleBalance}
              aria-label={balanceHidden ? 'Show balance' : 'Hide balance'}
            >
              {balanceHidden ? <Eye size={14} /> : <EyeOff size={14} />}
              <span>{balanceHidden ? 'Show' : 'Hide'}</span>
            </button>
          </div>

          <p className="ws-balance-amount">
            {balanceHidden ? '•••••• USDT' : '240.00 USDT'}
          </p>
          <p className="body-sm" style={{ marginTop: '8px' }}>
            {wallet.network} demonstration balance · Welcome back, {session.displayName}
          </p>

          {/* Quick Actions */}
          <div className="ws-quick-actions" aria-label="Quick actions">
            <button
              type="button"
              className="ws-quick-btn"
              onClick={() => {
                setQuickMode(quickMode === 'send' ? null : 'send');
                setActionNotice(null);
              }}
            >
              <ArrowUpRight size={17} />
              <span>Send</span>
            </button>

            <button
              type="button"
              className="ws-quick-btn"
              onClick={() => {
                setQuickMode(quickMode === 'request' ? null : 'request');
                setActionNotice(null);
              }}
            >
              <ArrowDownLeft size={17} />
              <span>Request</span>
            </button>

            <button
              type="button"
              className="ws-quick-btn"
              onClick={() => {
                setQuickMode(quickMode === 'verify' ? null : 'verify');
                setActionNotice(null);
              }}
            >
              <ShieldCheck size={17} />
              <span>Verify</span>
            </button>

            <button
              type="button"
              className="ws-quick-btn"
              onClick={() => onNavigateTab('wallet')}
            >
              <QrCode size={17} />
              <span>Wallet</span>
            </button>
          </div>
        </div>

        {/* Wallet Overview Summary */}
        <div className="ws-card">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '14px',
            }}
          >
            <p className="eyebrow">WALLET OVERVIEW</p>
            <span className="ws-badge">{wallet.network}</span>
          </div>

          <p className="heading-sm" style={{ marginBottom: '6px' }}>
            Self-custody wallet
          </p>
          <p className="body-sm" style={{ marginBottom: '18px' }}>
            {shortAddr} ·{' '}
            {wallet.method === 'created'
              ? 'Created in Word'
              : wallet.method === 'imported'
                ? 'Imported phrase'
                : 'Connected wallet'}
          </p>

          <div
            style={{
              padding: '14px 16px',
              borderRadius: '12px',
              backgroundColor: 'var(--bg)',
              border: '1px solid var(--line)',
              marginBottom: '18px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '13.5px',
                marginBottom: '6px',
              }}
            >
              <span style={{ color: 'var(--mute)' }}>Custody</span>
              <span style={{ color: 'var(--ink)', fontWeight: 500 }}>User-controlled</span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '13.5px',
              }}
            >
              <span style={{ color: 'var(--mute)' }}>Recovery status</span>
              <span style={{ color: 'var(--ink)', fontWeight: 500 }}>
                {wallet.recoveryBackedUp ? 'Reviewed' : 'Review recommended'}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="ws-ghost-btn"
              onClick={() => onNavigateTab('wallet')}
            >
              View wallet details
            </button>
            <button type="button" className="ws-ghost-btn" onClick={onOpenSecurity}>
              Recovery info
            </button>
          </div>
        </div>
      </div>

      {/* Expandable Quick Action Panel (UI Preview) */}
      {quickMode && (
        <div className="ws-card">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '16px',
            }}
          >
            <div>
              <p className="eyebrow" style={{ marginBottom: '4px' }}>
                QUICK ACTION · UI PREVIEW
              </p>
              <h2 className="heading-md">
                {quickMode === 'send'
                  ? 'Send a payment'
                  : quickMode === 'request'
                    ? 'Create a payment request'
                    : 'Verify recipient wallet control'}
              </h2>
            </div>
            <button
              type="button"
              className="ws-ghost-btn"
              onClick={() => setQuickMode(null)}
            >
              Close
            </button>
          </div>

          <form
            onSubmit={handleQuickSubmit}
            style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '560px' }}
          >
            {quickMode !== 'verify' && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: '12px',
                }}
              >
                <div className="field-group">
                  <label className="field-label" htmlFor="qa-recipient">
                    {quickMode === 'send' ? 'Recipient' : 'Payer'}
                  </label>
                  <input
                    id="qa-recipient"
                    type="text"
                    className="field-input"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    required
                  />
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor="qa-amount">
                    Amount (USDT)
                  </label>
                  <input
                    id="qa-amount"
                    type="text"
                    className="field-input"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                  />
                </div>
              </div>
            )}

            <div className="field-group">
              <label className="field-label" htmlFor="qa-address">
                Wallet address
              </label>
              <input
                id="qa-address"
                type="text"
                className="field-input"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                required
              />
            </div>

            {quickMode !== 'verify' && (
              <div className="field-group">
                <label className="field-label" htmlFor="qa-purpose">
                  Payment purpose
                </label>
                <input
                  id="qa-purpose"
                  type="text"
                  className="field-input"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  required
                />
              </div>
            )}

            <div>
              <Button type="submit" compact>
                {quickMode === 'send'
                  ? 'Review & approve (UI)'
                  : quickMode === 'request'
                    ? 'Generate request (UI)'
                    : 'Run check (UI)'}{' '}
                <ArrowRight size={14} />
              </Button>
            </div>

            {actionNotice && (
              <div className="auth-status-banner" role="status">
                {actionNotice}
              </div>
            )}
          </form>
        </div>
      )}

      {/* Bottom Row: Recent Transactions + Notifications Preview */}
      <div className="ws-grid">
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
            <button
              type="button"
              className="text-link"
              style={{ background: 'transparent', border: 'none', fontSize: '13px' }}
              onClick={() => onNavigateTab('wallet')}
            >
              See all
            </button>
          </div>

          {records.map((rec) => (
            <div key={rec.id} className="ws-record-item">
              <div>
                <p style={{ fontSize: '14.5px', fontWeight: 500, color: 'var(--ink)' }}>
                  {rec.recipient} · {rec.amount}
                </p>
                <p className="body-sm">
                  {rec.purpose} · {rec.address}
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

        <div className="ws-card">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '12px',
            }}
          >
            <p className="eyebrow">NOTIFICATIONS</p>
            <button
              type="button"
              className="text-link"
              style={{ background: 'transparent', border: 'none', fontSize: '13px' }}
              onClick={() => onNavigateTab('notifications')}
            >
              View all ({unreadNotifs.length} unread)
            </button>
          </div>

          {notifications.slice(0, 3).map((n) => (
            <div key={n.id} className="ws-notif-row">
              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                {!n.read && <span className="ws-unread-dot" aria-label="Unread" />}
                <div>
                  <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--ink)' }}>
                    {n.title}
                  </p>
                  <p className="body-sm">{n.detail}</p>
                </div>
              </div>
              <span className="body-sm" style={{ fontSize: '12px', color: 'var(--mute)', flexShrink: 0 }}>
                {n.time}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
