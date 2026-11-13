import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, KeyRound, Plus, Wallet } from 'lucide-react';
import type { WalletState } from '../types';

interface WalletSetupProps {
  onBack: () => void;
  onCreateWallet: (wallet: WalletState) => void;
  onConnectWallet: (wallet: WalletState) => void;
  onGoToImport: () => void;
}

const DEMO_WORDS = [
  'marble',
  'harbor',
  'lantern',
  'timber',
  'velvet',
  'canyon',
  'signal',
  'meadow',
  'cobalt',
  'anchor',
  'summit',
  'beacon',
];

function generateDemoAddress(): string {
  const hex = '0123456789abcdef';
  let addr = '0x';
  for (let i = 0; i < 40; i++) {
    addr += hex[Math.floor(Math.random() * hex.length)];
  }
  return addr;
}

export const WalletSetup: React.FC<WalletSetupProps> = ({
  onBack,
  onCreateWallet,
  onConnectWallet,
  onGoToImport,
}) => {
  const [connectStatus, setConnectStatus] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const handleCreate = () => {
    onCreateWallet({
      address: generateDemoAddress(),
      method: 'created',
      network: 'Testnet',
      recoveryBackedUp: false,
      demoSeedWords: DEMO_WORDS,
    });
  };

  const handleConnectExisting = async () => {
    setIsConnecting(true);
    setConnectStatus(null);
    const eth = (window as unknown as { ethereum?: { request: (args: { method: string }) => Promise<string[]> } }).ethereum;

    if (eth && typeof eth.request === 'function') {
      try {
        const accounts = await eth.request({ method: 'eth_requestAccounts' });
        if (accounts && accounts[0]) {
          onConnectWallet({
            address: accounts[0],
            method: 'connected',
            network: 'Testnet',
            recoveryBackedUp: true,
          });
          setIsConnecting(false);
          return;
        }
      } catch {
        setConnectStatus(
          'Browser wallet connection was cancelled. You can try again or use a demonstration testnet wallet below.'
        );
        setIsConnecting(false);
        return;
      }
    }

    // No browser extension detected: offer immediate testnet demo connection
    onConnectWallet({
      address: generateDemoAddress(),
      method: 'connected',
      network: 'Testnet',
      recoveryBackedUp: true,
    });
    setIsConnecting(false);
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
        <button type="button" className="ws-option-btn" onClick={handleCreate}>
          <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
            <span className="ws-option-icon" aria-hidden="true">
              <Plus size={18} />
            </span>
            <div>
              <h2 className="heading-sm" style={{ fontSize: '15.5px', marginBottom: '4px' }}>
                Create a new wallet
              </h2>
              <p className="body-sm">
                Generate a fresh testnet demonstration wallet and review its recovery phrase.
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

