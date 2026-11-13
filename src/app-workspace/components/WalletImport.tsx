import React, { useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import type { WalletState } from '../types';

interface WalletImportProps {
  onBack: () => void;
  onImportSuccess: (wallet: WalletState) => void;
}

export const WalletImport: React.FC<WalletImportProps> = ({ onBack, onImportSuccess }) => {
  const [phrase, setPhrase] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const words = phrase
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (words.length !== 12 && words.length !== 24) {
      setError('Enter a valid 12-word or 24-word recovery phrase separated by spaces.');
      return;
    }

    // Derive deterministic demonstration address from input length/chars
    let hash = 0;
    for (let i = 0; i < phrase.length; i++) {
      hash = (hash * 31 + phrase.charCodeAt(i)) >>> 0;
    }
    const suffix = hash.toString(16).padStart(8, '0');
    const demoAddr = `0x7a9c${suffix}4e12b83091f6a2d4c8e019b7a3f5`;

    onImportSuccess({
      address: demoAddr,
      method: 'imported',
      network: 'Testnet',
      recoveryBackedUp: true,
    });
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
          <Button type="submit">
            Import wallet <ArrowRight size={14} />
          </Button>
        </div>
      </form>
    </div>
  );
};

