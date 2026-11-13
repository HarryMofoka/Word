import React, { useState } from 'react';
import { LogOut, Shield } from 'lucide-react';
import type { AppRoute } from '../types';
import { Container } from '../components/layout/Container';
import { WordLogo } from '../components/ui/WordLogo';
import type { OnboardingStep, UserSession, WalletState } from './types';
import { OnboardingWelcome } from './components/OnboardingWelcome';
import { WalletSetup } from './components/WalletSetup';
import { WalletImport } from './components/WalletImport';
import { SecurityRecovery } from './components/SecurityRecovery';
import { WalletConfirmation } from './components/WalletConfirmation';
import { WorkspaceHome } from './components/WorkspaceHome';
import './Workspace.css';

interface WordAppProps {
  session: UserSession;
  initialWallet: WalletState | null;
  onWalletChange: (wallet: WalletState | null) => void;
  onLogout: () => void;
  onNavigateMarketing: (route: AppRoute) => void;
}

export const WordApp: React.FC<WordAppProps> = ({
  session,
  initialWallet,
  onWalletChange,
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

  const updateWallet = (next: WalletState) => {
    setWallet(next);
    onWalletChange(next);
  };

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

          <div className="ws-topbar-actions">
            {wallet && (
              <div className="ws-wallet-chip" title={wallet.address}>
                <span className="ws-dot-live" aria-hidden="true" />
                <span>{shortAddr}</span>
                <span className="ws-wallet-net" style={{ color: 'var(--mute)' }}>
                  · {wallet.network}
                </span>
              </div>
            )}

            {wallet && step === 'workspace' && (
              <button
                type="button"
                className="ws-ghost-btn"
                onClick={() => {
                  setPreviousStepBeforeSecurity('workspace');
                  setStep('recovery-info');
                }}
              >
                <Shield size={14} />
                <span className="ws-btn-label-hide">Security</span>
              </button>
            )}

            <button
              type="button"
              className="ws-ghost-btn"
              onClick={onLogout}
              aria-label="Log out"
            >
              <LogOut size={14} />
              <span>Log out</span>
            </button>
          </div>
        </div>
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
                  onContinue={() => setStep('workspace')}
                />
              )}
            </div>
          ) : (
            wallet && (
              <WorkspaceHome
                session={session}
                wallet={wallet}
                onOpenSecurity={() => {
                  setPreviousStepBeforeSecurity('workspace');
                  setStep('recovery-info');
                }}
              />
            )
          )}
        </Container>
      </main>
    </div>
  );
};
