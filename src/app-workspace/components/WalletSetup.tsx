import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, KeyRound, Plus, Sparkles, Wallet } from 'lucide-react';
import type { UserSession, WalletState } from '../types';
import {
  connectBrowserWallet,
  createWdkWallet,
} from '../../services/wdkWalletService';
import { createSimulatedProfileWallet } from '../../services/recipientDirectoryService';

interface WalletSetupProps {
  session?: UserSession;
  onBack: () => void;
  onCreateWallet: (wallet: WalletState) => void;
  onConnectWallet: (wallet: WalletState) => void;
  onGoToImport: () => void;
}

export const WalletSetup: React.FC<WalletSetupProps> = ({
  session,
  onBack,
  onCreateWallet,
  onConnectWallet,
  onGoToImport,
}) => {
  const [connectStatus, setConnectStatus] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isSimulatingInstant, setIsSimulatingInstant] = useState(false);

  const handleCreateSimulatedProfileWallet = async () => {
    setIsSimulatingInstant(true);
    setConnectStatus(null);
    try {
      const sim = createSimulatedProfileWallet({
        displayName: session?.displayName || 'Word Account Owner',
        email: session?.email || 'owner@word.fi',
        network: 'Testnet',
      });
      onConnectWallet({
        address: sim.address,
        method: 'created',
        network: sim.network,
        recoveryBackedUp: true,
        isVerified: true,
        demoSeedWords: sim.seedWords,
      });
    } catch (err) {
      setConnectStatus(
        err instanceof Error
          ? err.message
          : 'Unable to create profile-linked simulated wallet.'
      );
    } finally {
      setIsSimulatingInstant(false);
    }
  };

  const handleCreate = async () => {
    setIsCreating(true);
    setConnectStatus(null);
    try {
      const created = await createWdkWallet('Testnet');
      createSimulatedProfileWallet({
        displayName: session?.displayName || 'Word Account Owner',
        email: session?.email || 'owner@word.fi',
        network: created.network,
      });
      onCreateWallet({
        address: created.address,
        method: 'created',
        network: created.network,
        recoveryBackedUp: false,
        demoSeedWords: created.seedWords,
      });
    } catch (err) {
      setConnectStatus(
        err instanceof Error
          ? err.message
          : 'Unable to initialize Tether WDK wallet locally.'
      );
    } finally {
      setIsCreating(false);
    }
  };

  const handleConnectExisting = async () => {
    setIsConnecting(true);
    setConnectStatus(null);

    try {
      const connected = await connectBrowserWallet('Testnet');
      onConnectWallet({
        address: connected.address,
        method: 'connected',
        network: connected.network,
        recoveryBackedUp: true,
      });
    } catch (err) {
      setConnectStatus(
        err instanceof Error
          ? err.message
          : 'Browser wallet connection failed. Please try again.'
      );
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className="ws-card">
      <p className="eyebrow" style={{ marginBottom: '12px' }}>
        STEP 2 OF 3 · WALLET SETUP
      </p>
      <h1 className="heading-lg" style={{ marginBottom: '12px' }}>
        Create or connect a wallet.
      </h1>
      <p className="body-md" style={{ marginBottom: '16px' }}>
        Create a new wallet address linked directly to your profile{' '}
        {session?.displayName ? `(${session.displayName})` : ''} with simulated stablecoin funds ready
        to test live transfers.
      </p>

      <div className="ws-option-list">
        <button
          type="button"
          className="ws-option-btn"
          onClick={handleCreateSimulatedProfileWallet}
          disabled={isSimulatingInstant || isCreating || isConnecting}
          style={{
            borderColor: 'var(--ink)',
            backgroundColor: 'rgba(17, 17, 17, 0.03)',
          }}
        >
          <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
            <span
              className="ws-option-icon"
              aria-hidden="true"
              style={{ backgroundColor: 'var(--ink)', color: '#fff' }}
            >
              <Sparkles size={18} />
            </span>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                <h2 className="heading-sm" style={{ fontSize: '15.5px', margin: 0 }}>
                  {isSimulatingInstant
                    ? 'Creating profile-linked wallet...'
                    : 'Create a new profile-linked wallet (Instant Mock Data)'}
                </h2>
                <span className="ws-badge" style={{ fontSize: '11px' }}>
                  2,500.00 USDT Seeded
                </span>
              </div>
              <p className="body-sm">
                Generates a new wallet address linked to{' '}
                <strong>{session?.displayName || 'your profile'}</strong> ({session?.email || 'active session'}),
                pre-funded with <strong>2,500.00 USDT</strong> + <strong>1.5000 ETH</strong> gas and live notifications.
              </p>
              <div
                style={{
                  display: 'flex',
                  gap: '12px',
                  flexWrap: 'wrap',
                  marginTop: '8px',
                  fontSize: '12px',
                  color: '#1a8f4d',
                  fontWeight: 500,
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <CheckCircle2 size={13} /> Linked to profile
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <CheckCircle2 size={13} /> 2,500.00 USDT mock balance
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <CheckCircle2 size={13} /> Real-time notifications
                </span>
              </div>
            </div>
          </div>
          <ArrowRight size={16} style={{ marginTop: '4px', color: 'var(--ink)' }} />
        </button>

        <button
          type="button"
          className="ws-option-btn"
          onClick={handleCreate}
          disabled={isCreating || isConnecting || isSimulatingInstant}
        >
          <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
            <span className="ws-option-icon" aria-hidden="true">
              <Plus size={18} />
            </span>
            <div>
              <h2 className="heading-sm" style={{ fontSize: '15.5px', marginBottom: '4px' }}>
                {isCreating ? 'Creating WDK wallet...' : 'Create a new wallet (Manual Recovery Backup)'}
              </h2>
              <p className="body-sm">
                Generate a fresh self-custodial testnet wallet locally via Tether WDK and step through
                its 12-word recovery phrase backup.
              </p>
            </div>
          </div>
          <ArrowRight size={16} style={{ marginTop: '4px', color: 'var(--sub)' }} />
        </button>

        <button
          type="button"
          className="ws-option-btn"
          onClick={handleConnectExisting}
          disabled={isConnecting || isSimulatingInstant}
        >
          <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
            <span className="ws-option-icon" aria-hidden="true">
              <Wallet size={18} />
            </span>
            <div>
              <h2 className="heading-sm" style={{ fontSize: '15.5px', marginBottom: '4px' }}>
                {isConnecting ? 'Connecting wallet...' : 'Connect an existing wallet'}
              </h2>
              <p className="body-sm">
                Connect via your browser wallet provider, or continue with a simulated testnet
                address if none is installed.
              </p>
            </div>
          </div>
          <ArrowRight size={16} style={{ marginTop: '4px', color: 'var(--sub)' }} />
        </button>

        <button type="button" className="ws-option-btn" onClick={onGoToImport}>
          <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
            <span className="ws-option-icon" aria-hidden="true">
              <KeyRound size={18} />
            </span>
            <div>
              <h2 className="heading-sm" style={{ fontSize: '15.5px', marginBottom: '4px' }}>
                Import with recovery phrase
              </h2>
              <p className="body-sm">
                Restore an existing 12-word or 24-word testnet recovery phrase.
              </p>
            </div>
          </div>
          <ArrowRight size={16} style={{ marginTop: '4px', color: 'var(--sub)' }} />
        </button>
      </div>

      {connectStatus && (
        <div className="ws-notice" role="status" style={{ marginBottom: '18px' }}>
          {connectStatus}
        </div>
      )}

      <div className="ws-actions-row" style={{ marginTop: '8px' }}>
        <button type="button" className="auth-back-link" onClick={onBack}>
          <ArrowLeft size={15} /> Back
        </button>
        <span className="body-sm" style={{ color: 'var(--mute)' }}>
          Self-custody · Profile-Linked Simulation
        </span>
      </div>
    </div>
  );
};
