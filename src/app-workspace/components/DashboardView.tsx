import React, { useEffect, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Eye,
  EyeOff,
  FileText,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import type {
  AppNotification,
  PaymentFlowMode,
  PaymentRecord,
  UserSession,
  WalletState,
  WorkspaceTab,
} from '../types';
import type { WalletBalances } from '../../services/wdkWalletService';
import type { HydratedMutualSession } from '../../services/mutualTrustService';

const DUO_TRUST_STAGES = [
  {
    id: 'face-scan',
    step: '01 · OWNER LIVENESS',
    title: 'Independent Facial Liveness',
    desc: 'Sender & Recipient complete POPIA-compliant facial liveness checks on their own devices.',
    leftLabel: 'Sender · Liveness ✓',
    rightLabel: 'Recipient · Liveness ✓',
    bridgeBadge: 'Biometric Attested',
  },
  {
    id: 'report-exchange',
    step: '02 · BILATERAL EXCHANGE',
    title: 'Mutual Report Exchange',
    desc: 'Structured verification reports exchange automatically — zero raw biometric media ever shared.',
    leftLabel: 'Views Recipient Report',
    rightLabel: 'Views Sender Report',
    bridgeBadge: 'Reports Exchanged',
  },
  {
    id: 'eip712-cosign',
    step: '03 · DUAL AUTHORISATION',
    title: 'EIP-712 Co-Signed Approval',
    desc: 'Both wallets cryptographically sign the identical canonical transaction hash before execution.',
    leftLabel: 'Sender EIP-712 Sig ✓',
    rightLabel: 'Recipient EIP-712 Sig ✓',
    bridgeBadge: 'Dual-Party Locked',
  },
  {
    id: 'settlement',
    step: '04 · ON-CHAIN RECEIPT',
    title: 'Verified Settlement & Receipt',
    desc: 'Backend execution gate unlocks on-chain transfer and mints a permanent Mutual Trust Receipt.',
    leftLabel: 'Sent · Receipt Issued',
    rightLabel: 'Received · Verified',
    bridgeBadge: 'Settled On-Chain',
  },
];

interface DashboardViewProps {
  session: UserSession;
  wallet: WalletState;
  balances: WalletBalances | null;
  balancesLoading: boolean;
  balanceHidden: boolean;
  onToggleBalance: () => void;
  records: PaymentRecord[];
  notifications: AppNotification[];
  mutualSessions?: HydratedMutualSession[];
  onNavigateTab: (tab: WorkspaceTab) => void;
  onOpenPaymentMode: (mode: PaymentFlowMode) => void;
  onOpenMutualSession?: (sessionId: string) => void;
  onSelectRecord: (recordId: string) => void;
  onOpenSecurity: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  session,
  wallet,
  balances,
  balancesLoading,
  balanceHidden,
  onToggleBalance,
  records,
  notifications,
  mutualSessions = [],
  onNavigateTab,
  onOpenPaymentMode,
  onOpenMutualSession,
  onSelectRecord,
  onOpenSecurity,
}) => {
  const [duoStageIdx, setDuoStageIdx] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setDuoStageIdx((prev) => (prev + 1) % DUO_TRUST_STAGES.length);
    }, 3600);
    return () => window.clearInterval(timer);
  }, []);

  const activeDuoStage = DUO_TRUST_STAGES[duoStageIdx];
  const shortAddr = `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`;
  const unreadNotifs = notifications.filter((n) => !n.read);
  const openMutualSessions = mutualSessions.filter((m) =>
    ['invited', 'verifying', 'reports_exchanged', 'awaiting_approvals', 'authorized', 'executing'].includes(
      m.session.session_state
    )
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Row: Available Balance + Wallet Overview */}
      <div className="ws-grid">
        <div className="ws-card ws-balance-card ws-duo-card ws-duo-stagger-1">
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

          <div key={String(balanceHidden)} className="ws-duo-fade-swap">
            <p className="ws-balance-amount">
              {balanceHidden
                ? '•••••• USDT'
                : balancesLoading && !balances
                  ? 'Loading USDT...'
                  : `${balances?.usdtBalance ?? '0.00'} USDT`}
            </p>
            <p className="body-sm" style={{ marginTop: '8px' }}>
              {balances?.networkLabel ?? wallet.network} ·{' '}
              {balanceHidden
                ? '••••'
                : `${balances?.nativeBalance ?? '0.00'} ${balances?.nativeSymbol ?? 'ETH'}`}{' '}
              · Welcome back, {session.displayName}
            </p>
          </div>

          {/* Quick Actions connected to real flows */}
          <div className="ws-quick-actions" aria-label="Quick actions">
            <button
              type="button"
              className="ws-quick-btn"
              onClick={() => onOpenPaymentMode('scan-pay')}
            >
              <ArrowUpRight size={17} />
              <span>Send / Pay</span>
            </button>

            <button
              type="button"
              className="ws-quick-btn"
              onClick={() => onOpenPaymentMode('create-request')}
            >
              <ArrowDownLeft size={17} />
              <span>Request</span>
            </button>

            <button
              type="button"
              className="ws-quick-btn"
              onClick={() => onNavigateTab('assistant')}
            >
              <ShieldCheck size={17} />
              <span>Assistant</span>
            </button>

            <button
              type="button"
              className="ws-quick-btn"
              onClick={() => onNavigateTab('records')}
            >
              <FileText size={17} />
              <span>Records</span>
            </button>
          </div>
        </div>

        {/* Wallet Overview Summary */}
        <div className="ws-card ws-duo-card ws-duo-stagger-2">
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

      {/* iPhone Duo Fade-In / Fade-Out Bilateral Trust Showcase */}
      <div className="ws-duo-showcase ws-duo-card ws-duo-stagger-3">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '22px',
            alignItems: 'center',
          }}
        >
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '8px',
              }}
            >
              <Smartphone size={14} style={{ color: 'var(--ink)' }} />
              <p className="eyebrow" style={{ margin: 0 }}>
                IPHONE DUO · BILATERAL MUTUAL TRUST
              </p>
            </div>

            <div key={activeDuoStage.id} className="ws-duo-fade-swap">
              <p
                style={{
                  fontSize: '11.5px',
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  color: '#15803d',
                  marginBottom: '4px',
                }}
              >
                {activeDuoStage.step}
              </p>
              <h2 className="heading-sm" style={{ marginBottom: '6px' }}>
                {activeDuoStage.title}
              </h2>
              <p className="body-sm" style={{ marginBottom: '14px', maxWidth: '480px' }}>
                {activeDuoStage.desc}
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {DUO_TRUST_STAGES.map((stage, idx) => (
                <button
                  key={stage.id}
                  type="button"
                  onClick={() => setDuoStageIdx(idx)}
                  style={{
                    height: '6px',
                    width: idx === duoStageIdx ? '28px' : '12px',
                    borderRadius: '999px',
                    border: 'none',
                    backgroundColor: idx === duoStageIdx ? 'var(--ink)' : 'var(--line)',
                    transition: 'width 0.3s ease, background-color 0.3s ease',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                  aria-label={`Show stage ${stage.title}`}
                />
              ))}
              <button
                type="button"
                className="ws-ghost-btn"
                style={{ marginLeft: '8px' }}
                onClick={() => onOpenPaymentMode('mutual-trust')}
              >
                Launch Mutual Trust <ArrowRight size={13} />
              </button>
            </div>
          </div>

          {/* Synchronized iPhone Duo Fade-In / Fade-Out Pair */}
          <div className="ws-duo-phones-stage" aria-hidden="true">
            <div className="ws-duo-phone ws-duo-phone--left">
              <div>
                <div className="ws-duo-phone-island" />
                <p style={{ fontSize: '9px', color: '#9ca3af', letterSpacing: '0.06em' }}>
                  DEVICE A · SENDER
                </p>
              </div>
              <div
                key={`left-${activeDuoStage.id}`}
                className="ws-duo-fade-swap"
                style={{
                  padding: '8px',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.14)',
                }}
              >
                <ShieldCheck size={14} style={{ color: '#4ade80', marginBottom: '4px' }} />
                <p style={{ fontSize: '10px', fontWeight: 600, lineHeight: 1.3 }}>
                  {activeDuoStage.leftLabel}
                </p>
              </div>
              <p style={{ fontSize: '9px', color: '#a1a1aa' }}>{shortAddr}</p>
            </div>

            <div className="ws-duo-bridge">
              <ArrowLeftRight size={16} style={{ color: '#16a34a' }} />
              <span
                key={`bridge-${activeDuoStage.id}`}
                className="ws-duo-fade-swap"
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  padding: '3px 8px',
                  borderRadius: '999px',
                  backgroundColor: 'rgba(22, 163, 74, 0.12)',
                  color: '#15803d',
                  whiteSpace: 'nowrap',
                }}
              >
                {activeDuoStage.bridgeBadge}
              </span>
            </div>

            <div className="ws-duo-phone ws-duo-phone--right">
              <div>
                <div className="ws-duo-phone-island" />
                <p style={{ fontSize: '9px', color: '#9ca3af', letterSpacing: '0.06em' }}>
                  DEVICE B · RECIPIENT
                </p>
              </div>
              <div
                key={`right-${activeDuoStage.id}`}
                className="ws-duo-fade-swap"
                style={{
                  padding: '8px',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.14)',
                }}
              >
                <CheckCircle2 size={14} style={{ color: '#4ade80', marginBottom: '4px' }} />
                <p style={{ fontSize: '10px', fontWeight: 600, lineHeight: 1.3 }}>
                  {activeDuoStage.rightLabel}
                </p>
              </div>
              <p style={{ fontSize: '9px', color: '#a1a1aa' }}>Verified Counterparty</p>
            </div>
          </div>
        </div>
      </div>

      {/* Pending Mutual Trust Invitations & Bilateral Sessions */}
      {openMutualSessions.length > 0 && (
        <div className="ws-card ws-duo-card ws-duo-stagger-3">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '12px',
              gap: '10px',
              flexWrap: 'wrap',
            }}
          >
            <p className="eyebrow">MUTUAL TRUST VERIFICATION ({openMutualSessions.length} ACTIVE)</p>
            <button
              type="button"
              className="ws-ghost-btn"
              onClick={() => onOpenPaymentMode('mutual-trust')}
            >
              Open Mutual Trust Hub
            </button>
          </div>
          {openMutualSessions.slice(0, 3).map((item) => {
            const isSender = item.session.sender_id === session.id;
            const counterparty = isSender ? item.recipientReport.displayName : item.senderReport.displayName;
            return (
              <div key={item.session.id} className="ws-record-item">
                <div>
                  <p style={{ fontSize: '14.5px', fontWeight: 500, color: 'var(--ink)' }}>
                    {isSender ? 'To ' : 'From '}
                    {counterparty} · {item.session.amount_numeric} {item.session.token_symbol}
                  </p>
                  <p className="body-sm">
                    State: {item.session.session_state.replace('_', ' ')} · {item.session.network}
                  </p>
                </div>
                <button
                  type="button"
                  className="ws-ghost-btn"
                  onClick={() =>
                    onOpenMutualSession
                      ? onOpenMutualSession(item.session.id)
                      : onOpenPaymentMode('mutual-trust')
                  }
                >
                  Continue <ArrowRight size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Bottom Row: Recent Transactions + Notifications Preview */}
      <div className="ws-grid">
        <div className="ws-card ws-duo-card ws-duo-stagger-4">
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
              onClick={() => onNavigateTab('records')}
            >
              View all <ArrowRight size={13} />
            </button>
          </div>

          {records.length === 0 && (
            <p className="body-sm" style={{ padding: '12px 0', color: 'var(--mute)' }}>
              No transactions yet. Create a payment request or send a payment to get started.
            </p>
          )}
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
            </button>
          ))}
        </div>

        <div className="ws-card ws-duo-card ws-duo-stagger-5">
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

          {notifications.length === 0 && (
            <p className="body-sm" style={{ padding: '12px 0', color: 'var(--mute)' }}>
              No notifications yet. Activity alerts will appear here.
            </p>
          )}
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
              <span
                className="body-sm"
                style={{ fontSize: '12px', color: 'var(--mute)', flexShrink: 0 }}
              >
                {n.time}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
