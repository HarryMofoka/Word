import React, { useEffect } from 'react';
import { X, ArrowRight } from 'lucide-react';
import type { AuthModalMode } from '../../types';
import { WordLogo } from './WordLogo';
import { Button } from './Button';

interface AuthModalProps {
  mode: AuthModalMode;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ mode, onClose }) => {
  useEffect(() => {
    if (!mode) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mode, onClose]);

  if (!mode) return null;

  const isSignIn = mode === 'signin';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        backgroundColor: 'rgba(17, 17, 17, 0.36)',
        backdropFilter: 'blur(6px)',
        display: 'grid',
        placeItems: 'center',
        padding: '20px',
      }}
    >
      <div
        style={{
          width: 'min(440px, 100%)',
          backgroundColor: 'var(--bg)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius-card)',
          padding: '28px',
          boxShadow: '0 24px 60px rgba(17, 17, 17, 0.14)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--ink)' }}>
            <WordLogo size={20} />
            <span style={{ fontWeight: 500, fontSize: '15px', letterSpacing: '-0.02em' }}>
              Word
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '999px',
              border: '1px solid var(--line)',
              background: 'transparent',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--sub)',
            }}
          >
            <X size={16} />
          </button>
        </div>

        <p className="eyebrow" style={{ marginBottom: '8px' }}>
          {isSignIn ? 'SIGN IN' : 'GET STARTED'}
        </p>
        <h3 id="auth-modal-title" className="heading-md" style={{ marginBottom: '12px' }}>
          {isSignIn ? 'Access your Word workspace' : 'Start with trust-first payments'}
        </h3>
        <p className="body-md" style={{ marginBottom: '20px' }}>
          {isSignIn
            ? 'This repository hosts the Word landing website. No live authentication backend or wallet session is connected in this static preview.'
            : 'Word is a trust-first peer-to-peer payment demonstration. Review how verification, payment requests, and transaction records work below.'}
        </p>

        <div
          style={{
            backgroundColor: 'var(--soft)',
            border: '1px solid var(--line)',
            borderRadius: '12px',
            padding: '14px 16px',
            marginBottom: '22px',
          }}
        >
          <p className="body-sm" style={{ color: 'var(--ink)' }}>
            <strong>Testnet Demonstration:</strong> Always verify recipient details, network, and
            fees before signing any blockchain transaction.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <Button
            href="#how-it-works"
            onClick={onClose}
            compact
          >
            Explore how it works <ArrowRight size={14} />
          </Button>
          <button
            type="button"
            onClick={onClose}
            className="text-link"
            style={{ background: 'transparent', border: 'none' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

