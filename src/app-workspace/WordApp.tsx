import React, { useCallback, useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import type { AppRoute } from '../types';
import { Container } from '../components/layout/Container';
import { WordLogo } from '../components/ui/WordLogo';
import type {
  AppNotification,
  DisputeCase,
  OnboardingStep,
  PaymentFlowMode,
  PaymentRecord,
  UserSession,
  WalletState,
  WorkspaceTab,
} from './types';
import {
  registerWalletAndChallenge,
  updateWalletBackupFlag,
  verifyWalletChallenge,
} from '../services/walletService';
import {
  fetchWdkBalances,
  pollTransactionReceipt,
  switchBrowserNetwork,
  type SupportedNetworkName,
  type WalletBalances,
} from '../services/wdkWalletService';
import { updateMyProfile } from '../services/authService';
import { listTransactions, verifyBlockchainReceipt } from '../services/paymentsService';
import {
  createDispute,
  listDisputes,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../services/accountabilityService';
import { OnboardingWelcome } from './components/OnboardingWelcome';
import { WalletSetup } from './components/WalletSetup';
import { WalletImport } from './components/WalletImport';
import { SecurityRecovery } from './components/SecurityRecovery';
import { WalletConfirmation } from './components/WalletConfirmation';
import { DashboardView } from './components/DashboardView';
import { WalletOverviewView } from './components/WalletOverviewView';
import { NotificationsView } from './components/NotificationsView';
import { ProfileView } from './components/ProfileView';
import { SettingsView } from './components/SettingsView';
import { PaymentsHub } from './components/payments/PaymentsHub';
import { AccountabilityHub } from './components/accountability/AccountabilityHub';
import { AssistantRiskHub } from './components/advanced/AssistantRiskHub';
import './Workspace.css';

interface WordAppProps {
  session: UserSession;
  initialWallet: WalletState | null;
  onWalletChange: (wallet: WalletState | null) => void;
  onSessionChange: (session: UserSession) => void;
  onLogout: () => void;
  onNavigateMarketing: (route: AppRoute) => void;
}

const TABS: { id: WorkspaceTab; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'payments', label: 'Payments' },
  { id: 'records', label: 'Records' },
  { id: 'assistant', label: 'Assistant' },
  { id: 'wallet', label: 'Wallet' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'profile', label: 'Profile' },
  { id: 'settings', label: 'Settings' },
];

export const WordApp: React.FC<WordAppProps> = ({
  session,
  initialWallet,
  onWalletChange,
  onSessionChange,
  onLogout,
  onNavigateMarketing,
}) => {
  const [wallet, setWallet] = useState<WalletState | null>(initialWallet);
  const [step, setStep] = useState<OnboardingStep>(() => {
    if (initialWallet && initialWallet.recoveryBackedUp) return 'workspace';
    return 'welcome';
  });
  const [previousStepBeforeSecurity, setPreviousStepBeforeSecurity] =
    useState<OnboardingStep>('workspace');

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('dashboard');
  const [paymentInitialMode, setPaymentInitialMode] = useState<PaymentFlowMode>('hub');
  const [assistantHandoffRequest, setAssistantHandoffRequest] = useState<import('./types').PaymentRequestData | null>(null);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [balanceHidden, setBalanceHidden] = useState(false);
  const [records, setRecords] = useState<PaymentRecord[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [disputes, setDisputes] = useState<Record<string, DisputeCase>>({});
  const [syncingData, setSyncingData] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [balances, setBalances] = useState<WalletBalances | null>(null);
  const [balancesLoading, setBalancesLoading] = useState(false);

  const refreshBalances = useCallback(async (targetWallet: WalletState | null) => {
    if (!targetWallet?.address) return;
    setBalancesLoading(true);
    try {
      const next = await fetchWdkBalances(targetWallet.address, targetWallet.network);
      setBalances(next);
    } finally {
      setBalancesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (wallet?.address) {
      refreshBalances(wallet);
    }
  }, [wallet?.address, wallet?.network, refreshBalances]);

  const refreshWorkspaceData = useCallback(async () => {
    if (!session.id) return;
    setSyncingData(true);
    setSyncError(null);
    try {
      const [txRows, notifRows, disputeRows] = await Promise.all([
        listTransactions(),
        listNotifications(),
        listDisputes(),
      ]);

      let activeTxRows = txRows;

      // Recheck any pending/processing transactions that already have an on-chain tx_hash
      const pendingWithHash = txRows.filter(
        (tx) => (tx.status === 'pending' || tx.status === 'processing') && tx.tx_hash
      );
      if (pendingWithHash.length > 0) {
        const rechecked = await Promise.all(
          pendingWithHash.map(async (tx) => {
            try {
              const outcome = await pollTransactionReceipt(tx.tx_hash!, tx.network, 4000);
              if (outcome === 'confirmed' || outcome === 'failed') {
                const res = await verifyBlockchainReceipt({
                  transactionId: tx.id,
                  txHash: tx.tx_hash!,
                  outcome,
                });
                return res.transaction;
              }
            } catch {
              // keep existing status on transient RPC failure
            }
            return tx;
          })
        );
        const byId = new Map(rechecked.map((t) => [t.id, t]));
        activeTxRows = txRows.map((tx) => byId.get(tx.id) ?? tx);
      }

      setRecords(
        activeTxRows.map((tx) => ({
          id: tx.id,
          recipient: tx.recipient_name,
          address: tx.recipient_address,
          amount: `${tx.amount_numeric} ${tx.token_symbol}`,
          purpose: tx.purpose,
          network: tx.network,
          status:
            tx.status === 'confirmed'
              ? 'Confirmed'
              : tx.status === 'failed' || tx.status === 'cancelled'
                ? 'Failed'
                : 'Pending',
          verifiedControl: tx.verified_control,
          timestamp: new Date(tx.created_at).toLocaleString(),
          txHash: tx.tx_hash ?? undefined,
        }))
      );

      setNotifications(
        notifRows.map((n) => ({
          id: n.id,
          title: n.title,
          detail: n.detail,
          time: new Date(n.created_at).toLocaleString(),
          category:
            n.category === 'Payment' || n.category === 'Verification'
              ? n.category
              : 'Security',
          read: n.is_read,
        }))
      );

      const disputeMap: Record<string, DisputeCase> = {};
      for (const d of disputeRows) {
        disputeMap[d.transaction_id] = {
          id: d.id,
          recordId: d.transaction_id,
          reason: d.reason,
          summary: d.summary,
          status:
            d.status === 'evidence_submitted'
              ? 'Evidence Submitted'
              : d.status === 'under_review'
                ? 'Under Review'
                : 'Open',
          createdAt: new Date(d.created_at).toLocaleString(),
          evidence: (d.evidence ?? []).map((ev) => ({
            id: ev.id,
            label: ev.label,
            note: ev.note,
            addedAt: new Date(ev.created_at).toLocaleString(),
          })),
        };
      }
      setDisputes(disputeMap);
    } catch (err) {
      setSyncError(
        err instanceof Error ? err.message : 'Unable to sync workspace data from Supabase.'
      );
    } finally {
      setSyncingData(false);
    }
  }, [session.id]);

  useEffect(() => {
    refreshWorkspaceData();
  }, [refreshWorkspaceData]);

  const handleSaveDispute = async (dispute: DisputeCase) => {
    setDisputes((prev) => ({ ...prev, [dispute.recordId]: dispute }));
    try {
      await createDispute({
        transactionId: dispute.recordId,
        reason: dispute.reason,
        summary: dispute.summary,
      });
      await refreshWorkspaceData();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Failed to save dispute.');
    }
  };

  const persistWalletRegistration = async (candidate: WalletState): Promise<WalletState> => {
    try {
      const { wallet: saved, challenge } = await registerWalletAndChallenge({
        address: candidate.address,
        network: candidate.network,
        method: candidate.method,
        recoveryBackedUp: candidate.recoveryBackedUp,
      });
      const sig = `0xword_sig_${challenge.nonce.replace(/-/g, '')}`;
      await verifyWalletChallenge({ challengeId: challenge.id, signature: sig });
      return {
        ...candidate,
        id: saved.id,
        isVerified: true,
      };
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Wallet registration failed.');
      return candidate;
    }
  };

  const updateWallet = (next: WalletState) => {
    setWallet(next);
    onWalletChange(next);
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  const stepIndex =
    step === 'welcome'
      ? 1
      : step === 'wallet-setup' || step === 'wallet-import' || step === 'recovery-info'
        ? 2
        : 3;

  const shortAddr = wallet
    ? `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`
    : null;

  return (
    <div className="ws-shell">
      <header className="ws-topbar">
        <div className="container ws-topbar-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              type="button"
              className="ws-brand-wrap"
              onClick={() => onNavigateMarketing('home')}
              aria-label="Return to Word marketing site"
            >
              <WordLogo size={22} />
              <span>Word</span>
            </button>
            <span className="ws-badge">App</span>
          </div>

          {step === 'workspace' && (
            <nav className="ws-nav-tabs" aria-label="Application Navigation">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`ws-nav-tab ${activeTab === tab.id ? 'is-active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <span>{tab.label}</span>
                  {tab.id === 'notifications' && unreadCount > 0 && (
                    <span className="ws-unread-badge">{unreadCount}</span>
                  )}
                </button>
              ))}
            </nav>
          )}

          <div className="ws-topbar-actions">
            {wallet && (
              <button
                type="button"
                className="ws-wallet-chip"
                title={wallet.address}
                onClick={() => {
                  if (step === 'workspace') setActiveTab('wallet');
                }}
              >
                <span className="ws-dot-live" aria-hidden="true" />
                <span>{shortAddr}</span>
                <span className="ws-wallet-net" style={{ color: 'var(--mute)' }}>
                  · {wallet.network}
                </span>
              </button>
            )}

            <button
              type="button"
              className="ws-ghost-btn"
              onClick={onLogout}
              aria-label="Log out"
            >
              <LogOut size={14} />
              <span className="ws-btn-label-hide">Log out</span>
            </button>
          </div>
        </div>

        {step === 'workspace' && (
          <nav className="ws-mobile-tabs" aria-label="Mobile Application Navigation">
            <div className="ws-mobile-tabs-inner">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`ws-nav-tab ${activeTab === tab.id ? 'is-active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                  style={{ flexShrink: 0 }}
                >
                  <span>{tab.label}</span>
                  {tab.id === 'notifications' && unreadCount > 0 && (
                    <span className="ws-unread-badge">{unreadCount}</span>
                  )}
                </button>
              ))}
            </div>
          </nav>
        )}
      </header>

      <main className="ws-main">
        <Container>
          {syncError && (
            <div
              role="alert"
              style={{
                marginBottom: '16px',
                padding: '10px 14px',
                borderRadius: '10px',
                background: 'rgba(220, 38, 38, 0.12)',
                border: '1px solid rgba(220, 38, 38, 0.35)',
                color: '#fca5a5',
                fontSize: '13px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <span>{syncError}</span>
              <button
                type="button"
                className="ws-ghost-btn"
                onClick={() => setSyncError(null)}
              >
                Dismiss
              </button>
            </div>
          )}
          {syncingData && (
            <p className="body-sm" style={{ marginBottom: '10px', color: 'var(--mute)' }}>
              Syncing live records from Supabase...
            </p>
          )}
          {step !== 'workspace' ? (
            <div className="ws-flow-wrap">
              <div className="ws-stepper" aria-label={`Onboarding step ${stepIndex} of 3`}>
                {[1, 2, 3].map((n) => (
                  <span
                    key={n}
                    className={`ws-step-pill ${n <= stepIndex ? 'is-active' : ''}`}
                  />
                ))}
              </div>

              {step === 'welcome' && (
                <OnboardingWelcome
                  session={session}
                  onContinue={() => setStep('wallet-setup')}
                />
              )}

              {step === 'wallet-setup' && (
                <WalletSetup
                  onBack={() => setStep('welcome')}
                  onCreateWallet={async (newWallet) => {
                    const persisted = await persistWalletRegistration(newWallet);
                    updateWallet(persisted);
                    setPreviousStepBeforeSecurity('wallet-setup');
                    setStep('recovery-info');
                  }}
                  onConnectWallet={async (connectedWallet) => {
                    const persisted = await persistWalletRegistration(connectedWallet);
                    updateWallet(persisted);
                    setStep('wallet-confirm');
                  }}
                  onGoToImport={() => setStep('wallet-import')}
                />
              )}

              {step === 'wallet-import' && (
                <WalletImport
                  onBack={() => setStep('wallet-setup')}
                  onImportSuccess={async (importedWallet) => {
                    const persisted = await persistWalletRegistration(importedWallet);
                    updateWallet(persisted);
                    setStep('wallet-confirm');
                  }}
                />
              )}

              {step === 'recovery-info' && wallet && (
                <SecurityRecovery
                  wallet={wallet}
                  isOnboarding={previousStepBeforeSecurity !== 'workspace'}
                  onBack={() => setStep(previousStepBeforeSecurity)}
                  onConfirmBackup={async () => {
                    if (wallet.id) {
                      await updateWalletBackupFlag(wallet.id, true).catch(() => null);
                    }
                    updateWallet({ ...wallet, recoveryBackedUp: true });
                    setStep('wallet-confirm');
                  }}
                />
              )}

              {step === 'wallet-confirm' && wallet && (
                <WalletConfirmation
                  wallet={wallet}
                  onOpenSecurity={() => {
                    setPreviousStepBeforeSecurity('wallet-confirm');
                    setStep('recovery-info');
                  }}
                  onContinue={async () => {
                    await updateMyProfile({ onboardingCompleted: true }).catch(() => null);
                    await refreshWorkspaceData();
                    setActiveTab('dashboard');
                    setStep('workspace');
                  }}
                />
              )}
            </div>
          ) : (
            wallet && (
              <div key={activeTab} className="ws-view-enter">
                {activeTab === 'dashboard' && (
                  <DashboardView
                    session={session}
                    wallet={wallet}
                    balances={balances}
                    balancesLoading={balancesLoading}
                    balanceHidden={balanceHidden}
                    onToggleBalance={() => setBalanceHidden((p) => !p)}
                    records={records}
                    notifications={notifications}
                    onNavigateTab={(tab) => {
                      if (tab === 'payments') setPaymentInitialMode('hub');
                      if (tab === 'records') setSelectedRecordId(null);
                      setActiveTab(tab);
                    }}
                    onOpenPaymentMode={(mode) => {
                      setPaymentInitialMode(mode);
                      setActiveTab('payments');
                    }}
                    onSelectRecord={(recordId) => {
                      setSelectedRecordId(recordId);
                      setActiveTab('records');
                    }}
                    onOpenSecurity={() => {
                      setPreviousStepBeforeSecurity('workspace');
                      setStep('recovery-info');
                    }}
                  />
                )}

                {activeTab === 'payments' && (
                  <PaymentsHub
                    key={`${paymentInitialMode}-${assistantHandoffRequest?.id ?? 'none'}`}
                    wallet={wallet}
                    initialMode={paymentInitialMode}
                    initialRequest={assistantHandoffRequest}
                    onRecordAdded={(rec) => setRecords((prev) => [rec, ...prev])}
                    onDoneToDashboard={() => {
                      setAssistantHandoffRequest(null);
                      setActiveTab('dashboard');
                    }}
                  />
                )}

                {activeTab === 'records' && (
                  <AccountabilityHub
                    key={selectedRecordId || 'all'}
                    records={records}
                    disputes={disputes}
                    initialSelectedId={selectedRecordId}
                    onSaveDispute={handleSaveDispute}
                  />
                )}

                {activeTab === 'assistant' && (
                  <AssistantRiskHub
                    onHandoffPayment={(req) => {
                      setAssistantHandoffRequest(req);
                      setPaymentInitialMode('scan-pay');
                      setActiveTab('payments');
                    }}
                  />
                )}

                {activeTab === 'wallet' && (
                  <WalletOverviewView
                    wallet={wallet}
                    balances={balances}
                    balancesLoading={balancesLoading}
                    onRefreshBalances={() => refreshBalances(wallet)}
                    balanceHidden={balanceHidden}
                    onToggleBalance={() => setBalanceHidden((p) => !p)}
                    records={records}
                    onSelectRecord={(recordId) => {
                      setSelectedRecordId(recordId);
                      setActiveTab('records');
                    }}
                    onOpenSecurity={() => {
                      setPreviousStepBeforeSecurity('workspace');
                      setStep('recovery-info');
                    }}
                  />
                )}

                {activeTab === 'notifications' && (
                  <NotificationsView
                    notifications={notifications}
                    onMarkAllRead={async () => {
                      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
                      await markAllNotificationsRead().catch(() => null);
                    }}
                    onToggleRead={async (id) => {
                      setNotifications((prev) =>
                        prev.map((n) => (n.id === id ? { ...n, read: !n.read } : n))
                      );
                      await markNotificationRead(id).catch(() => null);
                    }}
                  />
                )}

                {activeTab === 'profile' && (
                  <ProfileView
                    session={session}
                    wallet={wallet}
                    onUpdateSession={onSessionChange}
                  />
                )}

                {activeTab === 'settings' && (
                  <SettingsView
                    wallet={wallet}
                    balanceHidden={balanceHidden}
                    onToggleBalance={() => setBalanceHidden((p) => !p)}
                    onSwitchNetwork={async (nextNetwork: SupportedNetworkName) => {
                      if (wallet.method === 'connected') {
                        await switchBrowserNetwork(nextNetwork);
                      }
                      const updated = { ...wallet, network: nextNetwork };
                      updateWallet(updated);
                      await updateMyProfile({ defaultNetwork: nextNetwork }).catch(() => null);
                      await refreshBalances(updated);
                    }}
                    onOpenSecurity={() => {
                      setPreviousStepBeforeSecurity('workspace');
                      setStep('recovery-info');
                    }}
                    onLogout={onLogout}
                  />
                )}
              </div>
            )
          )}
        </Container>
      </main>
    </div>
  );
};
