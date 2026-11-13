import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, KeyRound, Plus, Wallet } from 'lucide-react';
import type { WalletState } from '../types';
import {
  connectBrowserWallet,
  createWdkWallet,
} from '../../services/wdkWalletService';

interface WalletSetupProps {
  onBack: () => void;
  onCreateWallet: (wallet: WalletState) => void;
  onConnectWallet: (wallet: WalletState) => void;
  onGoToImport: () => void;
}

export const WalletSetup: React.FC<WalletSetupProps> = ({
  onBack,
  onCreateWallet,
  onConnectWallet,
  onGoToImport,
}) => {
  const [connectStatus, setConnectStatus] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    setIsCreating(true);
    setConnectStatus(null);
    try {
      const created = await createWdkWallet('Testnet');
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
      <p className="body-md">
        Choose how you want to interact with Word. Private keys stay under your control.
      </p>

      <div className="ws-option-list">
        <button
          type="button"
          className="ws-option-btn"
          onClick={handleCreate}
          disabled={isCreating || isConnecting}
        >
          <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
            <span className="ws-option-icon" aria-hidden="true">
              <Plus size={18} />
            </span>
            <div>
              <h2 className="heading-sm" style={{ fontSize: '15.5px', marginBottom: '4px' }}>
                {isCreating ? 'Creating WDK wallet...' : 'Create a new wallet'}
              </h2>
              <p className="body-sm">
                Generate a fresh self-custodial testnet wallet locally via Tether WDK and back up
                its recovery phrase.
              </p>
            </div>
          </div>
          <ArrowRight size={16} style={{ marginTop: '4px', color: 'var(--sub)' }} />
        </button>

        <button
          type="button"
          className="ws-option-btn"
          onClick={handleConnectExisting}
          disabled={isConnecting}
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
          Self-custody · Testnet
        </span>
      </div>
    </div>
  );
};

