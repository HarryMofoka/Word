import React, { useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import type { WalletState } from '../types';
import { importWdkWallet } from '../../services/wdkWalletService';

interface WalletImportProps {
  onBack: () => void;
  onImportSuccess: (wallet: WalletState, signingPhrase?: string) => void;
}

export const WalletImport: React.FC<WalletImportProps> = ({ onBack, onImportSuccess }) => {
  const [phrase, setPhrase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setImporting(true);

    try {
      const normalizedPhrase = phrase;
      const derived = await importWdkWallet(normalizedPhrase, 'Testnet');
      // Clear phrase from component state immediately after deriving address
      setPhrase('');
      onImportSuccess(
        {
          address: derived.address,
          method: 'imported',
          network: derived.network,
          recoveryBackedUp: true,
        },
        normalizedPhrase
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Enter a valid 12-word or 24-word BIP-39 recovery phrase.'
      );
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="ws-card">
      <p className="eyebrow" style={{ marginBottom: '12px' }}>
        WALLET IMPORT
      </p>
      <h1 className="heading-lg" style={{ marginBottom: '12px' }}>
        Import an existing wallet.
      </h1>
      <p className="body-md" style={{ marginBottom: '20px' }}>
        Enter your 12-word or 24-word recovery phrase to restore access in this demonstration
        workspace.
      </p>

      <div className="ws-notice" style={{ marginBottom: '20px' }}>
        <strong>Testnet safety reminder:</strong> Do not enter a recovery phrase that holds real
        mainnet funds into a demonstration environment.
      </div>

      <form onSubmit={handleSubmit}>
        <div className="field-group">
          <label className="field-label" htmlFor="import-phrase">
            Recovery phrase (12 or 24 words)
          </label>
          <textarea
            id="import-phrase"
            className="field-textarea"
            placeholder="word1 word2 word3 ..."
            value={phrase}
            onChange={(e) => {
              setPhrase(e.target.value);
              setError(null);
            }}
            required
          />
        </div>

        {error && (
          <p className="body-sm" style={{ color: '#b42318', marginTop: '10px' }} role="alert">
            {error}
          </p>
        )}

        <div className="ws-actions-row">
          <button type="button" className="auth-back-link" onClick={onBack}>
            <ArrowLeft size={15} /> Back to wallet options
          </button>
          <Button type="submit" disabled={importing}>
            {importing ? 'Deriving wallet...' : 'Import wallet'} <ArrowRight size={14} />
          </Button>
        </div>
      </form>
    </div>
  );
};

