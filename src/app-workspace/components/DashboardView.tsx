import React from 'react';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Eye,
  EyeOff,
  FileText,
  ShieldCheck,
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

      {/* Pending Mutual Trust Invitations & Bilateral Sessions */}
      {openMutualSessions.length > 0 && (
        <div className="ws-card">
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
