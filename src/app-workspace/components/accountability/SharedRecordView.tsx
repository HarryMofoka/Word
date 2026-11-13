import React, { useState } from 'react';
import { ArrowLeft, Check, Copy } from 'lucide-react';
import type { DisputeCase, PaymentRecord } from '../../types';

interface SharedRecordViewProps {
  record: PaymentRecord;
  dispute?: DisputeCase;
  onBack: () => void;
}

export const SharedRecordView: React.FC<SharedRecordViewProps> = ({
  record,
  dispute,
  onBack,
}) => {
  const [copied, setCopied] = useState(false);
  const shareLink = `https://word.app/record/${record.id}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

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
          marginBottom: '12px',
        }}
      >
        <p className="eyebrow">SHARED PAYMENT RECORD</p>
        <span className="ws-badge">Available</span>
      </div>

      <h1 className="heading-lg" style={{ marginBottom: '10px' }}>
        Payment Record
      </h1>
      <p className="body-md" style={{ marginBottom: '22px' }}>
        A structured summary combining the payment agreement, transaction state, and any
        recorded dispute activity.
      </p>

      <div
        style={{
          border: '1px solid var(--line)',
          borderRadius: '14px',
          padding: '20px',
          backgroundColor: 'var(--bg)',
          marginBottom: '20px',
        }}
      >
        <div className="record-row">
          <span className="record-key">Recipient</span>
          <span className="record-val">{record.recipient}</span>
        </div>
        <div className="record-row">
          <span className="record-key">Amount</span>
          <span className="record-val">{record.amount}</span>
        </div>
        <div className="record-row">
          <span className="record-key">Purpose</span>
          <span className="record-val">{record.purpose}</span>
        </div>
        <div className="record-row">
          <span className="record-key">Network</span>
          <span className="record-val">{record.network}</span>
        </div>
        <div className="record-row">
          <span className="record-key">Agreement</span>
          <span className="record-val">Accepted</span>
        </div>
        <div className="record-row">
          <span className="record-key">Transaction</span>
          <span className="record-val">{record.status}</span>
        </div>
        <div className="record-row">
          <span className="record-key">Dispute status</span>
          <span className="record-val">{dispute ? dispute.status : 'None'}</span>
        </div>
        <div className="record-row">
          <span className="record-key">Record status</span>
          <span className="record-val">Available</span>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
          padding: '14px 16px',
          border: '1px solid var(--line)',
          borderRadius: '12px',
        }}
      >
        <span style={{ fontSize: '13.5px', color: 'var(--sub)', wordBreak: 'break-all' }}>
          {shareLink}
        </span>
        <button type="button" className="ws-ghost-btn" onClick={handleCopy}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? 'Copied link' : 'Copy record link'}
        </button>
      </div>
    </div>
  );
};

