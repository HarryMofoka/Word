import React, { useState } from 'react';
import { LogOut } from 'lucide-react';
import type { AppRoute } from '../types';
import { Container } from '../components/layout/Container';
import { WordLogo } from '../components/ui/WordLogo';
import type {
  AppNotification,
  OnboardingStep,
  PaymentRecord,
  UserSession,
  WalletState,
  WorkspaceTab,
} from './types';
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
import './Workspace.css';

interface WordAppProps {
  session: UserSession;
  initialWallet: WalletState | null;
  onWalletChange: (wallet: WalletState | null) => void;
  onSessionChange: (session: UserSession) => void;
  onLogout: () => void;
  onNavigateMarketing: (route: AppRoute) => void;
}

const INITIAL_RECORDS: PaymentRecord[] = [
  {
    id: 'rec-1',
    recipient: 'Thabo M.',
    address: '0x4b8f...91e2',
    amount: '20.00 USDT',
    purpose: 'Laptop purchase',
    network: 'Testnet',
    status: 'Confirmed',
    verifiedControl: true,
    timestamp: 'Today, 09:42',
  },
  {
    id: 'rec-2',
    recipient: 'Lerato K.',
    address: '0x9a12...3c40',
    amount: '45.00 USDT',
    purpose: 'Design retainer',
    network: 'Testnet',
    status: 'Confirmed',
    verifiedControl: true,
    timestamp: 'Yesterday',
  },
];

const INITIAL_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'n-1',
    title: 'Transaction confirmed on Testnet',
    detail: '20.00 USDT to Thabo M. for Laptop purchase is confirmed.',
    time: '12m ago',
    category: 'Payment',
    read: false,
  },
  {
    id: 'n-2',
    title: 'Recipient wallet control checked',
    detail: 'Cryptographic signature verification succeeded for 0x4b8f...91e2.',
    time: '14m ago',
    category: 'Verification',
    read: false,
  },
  {
    id: 'n-3',
    title: 'Self-custody reminder',
    detail: 'Always confirm recipient address, network, and fee before signing.',
    time: 'Yesterday',
    category: 'Security',
    read: true,
  },
];

const TABS: { id: WorkspaceTab; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'payments', label: 'Payments' },
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
  const [balanceHidden, setBalanceHidden] = useState(false);
  const [records, setRecords] = useState<PaymentRecord[]>(INITIAL_RECORDS);
  const [notifications, setNotifications] = useState<AppNotification[]>(INITIAL_NOTIFICATIONS);

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
                  onCreateWallet={(newWallet) => {
                    updateWallet(newWallet);
                    setPreviousStepBeforeSecurity('wallet-setup');
                    setStep('recovery-info');
                  }}
                  onConnectWallet={(connectedWallet) => {
                    updateWallet(connectedWallet);
                    setStep('wallet-confirm');
                  }}
                  onGoToImport={() => setStep('wallet-import')}
                />
              )}

              {step === 'wallet-import' && (
                <WalletImport
                  onBack={() => setStep('wallet-setup')}
                  onImportSuccess={(importedWallet) => {
                    updateWallet(importedWallet);
                    setStep('wallet-confirm');
                  }}
                />
              )}

              {step === 'recovery-info' && wallet && (
                <SecurityRecovery
                  wallet={wallet}
                  isOnboarding={previousStepBeforeSecurity !== 'workspace'}
                  onBack={() => setStep(previousStepBeforeSecurity)}
                  onConfirmBackup={() => {
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
                  onContinue={() => {
                    setActiveTab('dashboard');
                    setStep('workspace');
                  }}
                />
              )}
            </div>
          ) : (
            wallet && (
              <>
                {activeTab === 'dashboard' && (
                  <DashboardView
                    session={session}
                    wallet={wallet}
                    balanceHidden={balanceHidden}
                    onToggleBalance={() => setBalanceHidden((p) => !p)}
                    records={records}
                    notifications={notifications}
                    onCreateDemoRecord={(rec) => setRecords((prev) => [rec, ...prev])}
                    onNavigateTab={setActiveTab}
                    onOpenSecurity={() => {
                      setPreviousStepBeforeSecurity('workspace');
                      setStep('recovery-info');
                    }}
                  />
                )}

                {activeTab === 'payments' && (
                  <PaymentsHub
                    wallet={wallet}
                    onRecordAdded={(rec) => setRecords((prev) => [rec, ...prev])}
                    onDoneToDashboard={() => setActiveTab('dashboard')}
                  />
                )}

                {activeTab === 'wallet' && (
                  <WalletOverviewView
                    wallet={wallet}
                    balanceHidden={balanceHidden}
                    onToggleBalance={() => setBalanceHidden((p) => !p)}
                    records={records}
                    onOpenSecurity={() => {
                      setPreviousStepBeforeSecurity('workspace');
                      setStep('recovery-info');
                    }}
                  />
                )}

                {activeTab === 'notifications' && (
                  <NotificationsView
                    notifications={notifications}
                    onMarkAllRead={() =>
                      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
                    }
                    onToggleRead={(id) =>
                      setNotifications((prev) =>
                        prev.map((n) => (n.id === id ? { ...n, read: !n.read } : n))
                      )
                    }
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
                    onOpenSecurity={() => {
                      setPreviousStepBeforeSecurity('workspace');
                      setStep('recovery-info');
                    }}
                    onLogout={onLogout}
                  />
                )}
              </>
            )
          )}
        </Container>
      </main>
    </div>
  );
};
