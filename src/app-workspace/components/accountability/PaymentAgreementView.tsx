import React from 'react';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import type { PaymentRecord } from '../../types';

interface PaymentAgreementViewProps {
  record: PaymentRecord;
  onBack: () => void;
}

export const PaymentAgreementView: React.FC<PaymentAgreementViewProps> = ({
  record,
  onBack,
}) => {
  return (
    <div className="ws-card" style={{ maxWidth: '680px' }}>
      <div style={{ marginBottom: '18px' }}>
        <button type="button" className="auth-back-link" onClick={onBack}>
          <ArrowLeft size={15} /> Back to transaction details
        </button>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          marginBottom: '10px',
        }}
      >
        <p className="eyebrow">PAYMENT AGREEMENT</p>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            fontSize: '12.5px',
            fontWeight: 500,
            color: '#1a8f4d',
          }}
        >
          <CheckCircle2 size={14} /> Accepted
        </span>
      </div>

      <h1 className="heading-lg" style={{ marginBottom: '10px' }}>
        {record.purpose}
      </h1>
      <p className="body-md" style={{ marginBottom: '22px' }}>
        Recorded terms agreed between payer and recipient prior to transaction approval.
      </p>

      <div
        style={{
          border: '1px solid var(--line)',
          borderRadius: '14px',
          padding: '18px 20px',
          marginBottom: '20px',
        }}
      >
        <div className="record-row">
          <span className="record-key">Recipient</span>
          <span className="record-val">{record.recipient}</span>
        </div>
        <div className="record-row">
          <span className="record-key">Wallet address</span>
          <span className="record-val">{record.address}</span>
        </div>
        <div className="record-row">
          <span className="record-key">Agreed amount</span>
          <span className="record-val">{record.amount}</span>
        </div>
        <div className="record-row">
          <span className="record-key">Network</span>
          <span className="record-val">{record.network}</span>
        </div>
        <div className="record-row">
          <span className="record-key">Terms</span>
          <span className="record-val" style={{ maxWidth: '62%', textAlign: 'right' }}>
            In-person handover or confirmed delivery matching agreed description.
          </span>
        </div>
        <div className="record-row">
          <span className="record-key">Agreement timestamp</span>
          <span className="record-val">{record.timestamp}</span>
        </div>
      </div>

      <div className="ws-notice">
        <strong>Note:</strong> Recording an agreement creates a clearer reference for both parties,
        but does not guarantee physical delivery of goods.
      </div>
    </div>
  );
};

