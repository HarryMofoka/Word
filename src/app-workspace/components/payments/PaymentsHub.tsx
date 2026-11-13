import React, { useState } from 'react';
import { ArrowRight, QrCode, Send } from 'lucide-react';
import type { PaymentFlowMode, PaymentRecord, PaymentRequestData, WalletState } from '../../types';
import { PaymentRequestFlow } from './PaymentRequestFlow';
import { PaymentPayFlow } from './PaymentPayFlow';

interface PaymentsHubProps {
  wallet: WalletState;
  initialMode?: PaymentFlowMode;
  onRecordAdded: (rec: PaymentRecord) => void;
  onDoneToDashboard: () => void;
}

export const PaymentsHub: React.FC<PaymentsHubProps> = ({
  wallet,
  initialMode = 'hub',
  onRecordAdded,
  onDoneToDashboard,
}) => {
  const [mode, setMode] = useState<PaymentFlowMode>(initialMode);
  const [previewReq, setPreviewReq] = useState<PaymentRequestData | null>(null);

  if (mode === 'create-request') {
    return (
      <PaymentRequestFlow
        wallet={wallet}
        onBack={() => setMode('hub')}
        onPreviewAsPayer={(req) => {
          setPreviewReq(req);
          setMode('scan-pay');
        }}
      />
    );
  }

  if (mode === 'scan-pay') {
    return (
      <PaymentPayFlow
        wallet={wallet}
        initialRequest={previewReq}
        onBack={() => {
          setPreviewReq(null);
          setMode('hub');
        }}
        onRecordAdded={onRecordAdded}
        onDoneToDashboard={onDoneToDashboard}
      />
    );
  }

  return (
    <div className="ws-card" style={{ maxWidth: '680px' }}>
      <p className="eyebrow" style={{ marginBottom: '10px' }}>
        PAYMENTS
      </p>
      <h1 className="heading-lg" style={{ marginBottom: '10px' }}>
        Send or request with clarity.
      </h1>
      <p className="body-md" style={{ marginBottom: '24px' }}>
        Create a structured payment request with a QR code and shareable link, or scan and verify
        an incoming request before approving.
      </p>

      <div className="ws-option-list">
        <button
          type="button"
          className="ws-option-btn"
          onClick={() => setMode('create-request')}
        >
          <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
            <span className="ws-option-icon" aria-hidden="true">
              <Send size={18} />
            </span>
            <div>
              <h2 className="heading-sm" style={{ fontSize: '15.5px', marginBottom: '4px' }}>
                Create payment request
              </h2>
              <p className="body-sm">
                Enter amount, token, network, recipient details, description, and optional terms to
                generate a QR code and shareable link.
              </p>
            </div>
          </div>
          <ArrowRight size={16} style={{ marginTop: '4px', color: 'var(--sub)' }} />
        </button>

        <button
          type="button"
          className="ws-option-btn"
          onClick={() => {
            setPreviewReq(null);
            setMode('scan-pay');
          }}
        >
          <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
            <span className="ws-option-icon" aria-hidden="true">
              <QrCode size={18} />
            </span>
            <div>
              <h2 className="heading-sm" style={{ fontSize: '15.5px', marginBottom: '4px' }}>
                Scan QR code &amp; pay
              </h2>
              <p className="body-sm">
                Scan or paste a payment request, verify recipient wallet control, review risk
                indicators, and explicitly approve.
              </p>
            </div>
          </div>
          <ArrowRight size={16} style={{ marginTop: '4px', color: 'var(--sub)' }} />
        </button>
      </div>
    </div>
  );
};

