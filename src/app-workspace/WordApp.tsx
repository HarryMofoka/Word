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
  signChallengeMessage,
  switchBrowserNetwork,
  type SupportedNetworkName,
  type WalletBalances,
} from '../services/wdkWalletService';
import {
  consumePendingOwnerFaceScan,
  enrollOwnerFaceScan,
  updateMyProfile,
} from '../services/authService';
import { listTransactions, verifyBlockchainReceipt } from '../services/paymentsService';
import {
  listMyMutualTrustSessions,
  subscribeToUserMutualSessions,
  type HydratedMutualSession,
} from '../services/mutualTrustService';
import {
  createDispute,
  listDisputes,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../services/accountabilityService';
import {
  createSimulatedProfileWallet,
  ensureSimulatedWalletBalance,
} from '../services/recipientDirectoryService';
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
  const [selectedMutualSessionId, setSelectedMutualSessionId] = useState<string | null>(null);
  const [mutualSessions, setMutualSessions] = useState<HydratedMutualSession[]>([]);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [balanceHidden, setBalanceHidden] = useState(false);
  const [records, setRecords] = useState<PaymentRecord[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [disputes, setDisputes] = useState<Record<string, DisputeCase>>({});
  const [syncingData, setSyncingData] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [balances, setBalances] = useState<WalletBalances | null>(null);
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [liveToasts, setLiveToasts] = useState<AppNotification[]>([]);

  const pushLiveNotification = useCallback(
    (notif: {
      title: string;
      detail: string;
      category: 'Payment' | 'Verification' | 'Security';
    }) => {
      const item: AppNotification = {
        id: `live-notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: notif.title,
        detail: notif.detail,
        time: 'Just now',
        category: notif.category,
        read: false,
      };
      setNotifications((prev) => [item, ...prev]);
      setLiveToasts((prev) => [item, ...prev].slice(0, 3));
      window.setTimeout(() => {
        setLiveToasts((prev) => prev.filter((t) => t.id !== item.id));
      }, 6500);
    },
    []
  );

  const refreshBalances = useCallback(
    async (targetWallet: WalletState | null) => {
      if (!targetWallet?.address) return;
      setBalancesLoading(true);
      const sim = ensureSimulatedWalletBalance(targetWallet.address, {
        displayName: session.displayName,
        email: session.email,
      });
      try {
        const next = await fetchWdkBalances(targetWallet.address, targetWallet.network);
        const onChainUsdt = Number(next.usdtBalance);
        setBalances({
          ...next,
          usdtBalance: onChainUsdt > 0 ? next.usdtBalance : sim.usdtBalance,
          nativeBalance: Number(next.nativeBalance) > 0 ? next.nativeBalance : sim.nativeBalance,
        });
      } catch {
        setBalances({
          usdtBalance: sim.usdtBalance,
          nativeBalance: sim.nativeBalance,
          nativeSymbol: 'ETH',
          networkLabel: targetWallet.network,
          rpcReachable: true,
        });
      } finally {
        setBalancesLoading(false);
      }
    },
    [session.displayName, session.email]
  );

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
      const [txRows, notifRows, disputeRows, mSessionRows] = await Promise.all([
        listTransactions(),
        listNotifications(),
        listDisputes(),
        listMyMutualTrustSessions().catch(() => []),
      ]);
      setMutualSessions(mSessionRows);

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
    if (!session.id) return;
    const pendingFaceScan = consumePendingOwnerFaceScan();
    if (pendingFaceScan) {
      void enrollOwnerFaceScan(pendingFaceScan);
    }
  }, [session.id]);

  useEffect(() => {
    refreshWorkspaceData();
  }, [refreshWorkspaceData]);

  useEffect(() => {
    if (!session.id) return;
    return subscribeToUserMutualSessions(session.id, () => {
      void refreshWorkspaceData();
    });
  }, [session.id, refreshWorkspaceData]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mutualParam = params.get('mutualSession');
    if (mutualParam && /^[0-9a-f-]{36}$/i.test(mutualParam.trim())) {
      setSelectedMutualSessionId(mutualParam.trim());
      setPaymentInitialMode('mutual-trust');
      setActiveTab('payments');
    }
  }, []);

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

  const persistWalletRegistration = async (
    candidate: WalletState,
    signingPhrase?: string
  ): Promise<WalletState> => {
    try {
      const { wallet: saved, challenge } = await registerWalletAndChallenge({
        address: candidate.address,
        network: candidate.network,
        method: candidate.method,
        recoveryBackedUp: candidate.recoveryBackedUp,
      });
      const phrase = signingPhrase ?? candidate.demoSeedWords?.join(' ');
      const sig = await signChallengeMessage({
        message: challenge.message,
        expectedAddress: candidate.address,
        network: candidate.network,
        walletMethod: candidate.method,
        signingPhrase: phrase,
      });
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

  const handleCreateNewSimulatedWallet = async () => {
    const sim = createSimulatedProfileWallet({
      displayName: session.displayName,
      email: session.email,
      network: wallet?.network ?? 'Testnet',
    });
    const candidate: WalletState = {
      address: sim.address,
      method: 'created',
      network: sim.network,
      recoveryBackedUp: true,
      isVerified: true,
    };
    const persisted = await persistWalletRegistration(
      candidate,
      sim.seedWords.join(' ')
    );
    updateWallet(persisted);
    await refreshBalances(persisted);
    pushLiveNotification({
      title: `Profile-Linked Wallet Ready (${sim.initialUsdtBalance} USDT)`,
      detail: `Wallet ${sim.address.slice(0, 8)}...${sim.address.slice(-4)} linked to ${session.displayName} (${session.email}) with ${sim.initialUsdtBalance} USDT and a clean track record.`,
      category: 'Security',
    });
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
          {liveToasts.length > 0 && (
            <div
              role="region"
              aria-label="Live notifications"
              style={{
                position: 'fixed',
                top: '76px',
                right: '20px',
                zIndex: 1200,
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                maxWidth: '380px',
                width: 'calc(100vw - 40px)',
              }}
            >
              {liveToasts.map((toast) => (
                <div
                  key={toast.id}
                  className="ws-card ws-duo-fade-swap"
                  style={{
                    padding: '14px 16px',
                    boxShadow: '0 16px 36px rgba(17, 17, 17, 0.22)',
                    border: '1.5px solid var(--ink)',
                    backgroundColor: '#ffffff',
                    background: '#ffffff',
                    opacity: 1,
                    backdropFilter: 'none',
                    WebkitBackdropFilter: 'none',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '4px',
                    }}
                  >
                    <span className="eyebrow" style={{ fontSize: '10.5px', color: '#1a8f4d' }}>
                      ● LIVE {toast.category.toUpperCase()} NOTIFICATION
                    </span>
                    <button
                      type="button"
                      className="ws-ghost-btn"
                      style={{ padding: '2px 8px', fontSize: '11px' }}
                      onClick={() =>
                        setLiveToasts((prev) => prev.filter((t) => t.id !== toast.id))
                      }
                    >
                      Dismiss
                    </button>
                  </div>
                  <strong style={{ fontSize: '13.5px', display: 'block', marginBottom: '2px' }}>
                    {toast.title}
                  </strong>
                  <p className="body-sm" style={{ fontSize: '12.5px', margin: 0 }}>
                    {toast.detail}
                  </p>
                </div>
              ))}
            </div>
          )}
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
                  session={session}
                  onBack={() => setStep('welcome')}
                  onCreateWallet={async (newWallet) => {
                    const persisted = await persistWalletRegistration(newWallet);
                    updateWallet(persisted);
                    await refreshBalances(persisted);
                    pushLiveNotification({
                      title: 'Wallet Created & Linked to Profile',
                      detail: `Wallet ${persisted.address.slice(0, 8)}...${persisted.address.slice(-4)} linked to ${session.displayName} with 2,500.00 USDT mock balance.`,
                      category: 'Security',
                    });
                    setPreviousStepBeforeSecurity('wallet-setup');
                    setStep('recovery-info');
                  }}
                  onConnectWallet={async (connectedWallet) => {
                    const persisted = await persistWalletRegistration(connectedWallet);
                    updateWallet(persisted);
                    await refreshBalances(persisted);
                    pushLiveNotification({
                      title: 'Profile-Linked Wallet Active (2,500.00 USDT)',
                      detail: `Wallet ${persisted.address.slice(0, 8)}...${persisted.address.slice(-4)} linked to ${session.displayName} (${session.email}) with 2,500.00 USDT mock balance.`,
                      category: 'Security',
                    });
                    setStep('wallet-confirm');
                  }}
                  onGoToImport={() => setStep('wallet-import')}
                />
              )}

              {step === 'wallet-import' && (
                <WalletImport
                  onBack={() => setStep('wallet-setup')}
                  onImportSuccess={async (importedWallet, signingPhrase) => {
                    const persisted = await persistWalletRegistration(importedWallet, signingPhrase);
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
                    // Strip mnemonic words from in-memory React state once backup is confirmed
                    updateWallet({ ...wallet, recoveryBackedUp: true, demoSeedWords: undefined });
                    setStep('wallet-confirm');
                  }}
                />
              )}

              {step === 'wallet-confirm' && wallet && (
                <WalletConfirmation
                  userId={session.id}
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
                    mutualSessions={mutualSessions}
                    onNavigateTab={(tab) => {
                      if (tab === 'payments') {
                        setSelectedMutualSessionId(null);
                        setPaymentInitialMode('hub');
                      }
                      if (tab === 'records') setSelectedRecordId(null);
                      setActiveTab(tab);
                    }}
                    onOpenPaymentMode={(mode) => {
                      setSelectedMutualSessionId(null);
                      setPaymentInitialMode(mode);
                      setActiveTab('payments');
                    }}
                    onOpenMutualSession={(mSessionId) => {
                      setSelectedMutualSessionId(mSessionId);
                      setPaymentInitialMode('mutual-trust');
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
                    onCreateNewSimulatedWallet={handleCreateNewSimulatedWallet}
                  />
                )}

                {activeTab === 'payments' && (
                  <PaymentsHub
                    key={`${paymentInitialMode}-${assistantHandoffRequest?.id ?? 'none'}-${selectedMutualSessionId ?? 'none'}`}
                    userId={session.id}
                    userEmail={session.email}
                    wallet={wallet}
                    initialMode={paymentInitialMode}
                    initialRequest={assistantHandoffRequest}
                    initialMutualSessionId={selectedMutualSessionId}
                    onRecordAdded={(rec) => setRecords((prev) => [rec, ...prev])}
                    onPushLiveNotification={pushLiveNotification}
                    onBalanceUpdated={() => {
                      void refreshBalances(wallet);
                    }}
                    onDoneToDashboard={() => {
                      setAssistantHandoffRequest(null);
                      setSelectedMutualSessionId(null);
                      void refreshBalances(wallet);
                      void refreshWorkspaceData();
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
                    session={session}
                    wallet={wallet}
                    balances={balances}
                    balancesLoading={balancesLoading}
                    onRefreshBalances={() => refreshBalances(wallet)}
                    onCreateNewSimulatedWallet={handleCreateNewSimulatedWallet}
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
