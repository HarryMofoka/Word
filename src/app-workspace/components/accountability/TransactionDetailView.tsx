import React from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Bell,
  CheckCircle2,
  FileText,
  Share2,
} from 'lucide-react';
import type { DisputeCase, PaymentRecord } from '../../types';

interface TransactionDetailViewProps {
  record: PaymentRecord;
  dispute?: DisputeCase;
  onBack: () => void;
  onOpenAgreement: () => void;
  onOpenSharedRecord: () => void;
  onOpenDispute: () => void;
}

export const TransactionDetailView: React.FC<TransactionDetailViewProps> = ({
  record,
  dispute,
  onBack,
  onOpenAgreement,
  onOpenSharedRecord,
  onOpenDispute,
}) => {
  const updates = [
    ...(dispute
      ? [
          {
            id: 'upd-dsp',
            title: `Dispute ${dispute.status.toLowerCase()}`,
            detail: dispute.reason,
            time: dispute.createdAt,
          },
        ]
      : []),
    {
      id: 'upd-tx',
      title: `Transaction ${record.status.toLowerCase()}`,
      detail: `${record.amount} on ${record.network}`,
      time: record.timestamp,
    },
    {
      id: 'upd-agr',
      title: 'Payment agreement accepted',
      detail: `Purpose: ${record.purpose}`,
      time: record.timestamp,
    },
  ];

  return (
    <div className="ws-grid">
      {/* Left: Transaction Details */}
      <div className="ws-card">
        <div style={{ marginBottom: '18px' }}>
          <button type="button" className="auth-back-link" onClick={onBack}>
            <ArrowLeft size={15} /> Back to transaction history
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
          <p className="eyebrow">TRANSACTION DETAILS</p>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              fontSize: '13px',
              fontWeight: 500,
              color: record.status === 'Confirmed' ? '#1a8f4d' : 'var(--sub)',
            }}
          >
            <CheckCircle2 size={14} />
            {record.status}
          </span>
        </div>

        <h1 className="heading-lg" style={{ marginBottom: '6px' }}>
          {record.amount}
        </h1>
        <p className="body-md" style={{ marginBottom: '22px' }}>
          To {record.recipient} · {record.purpose}
        </p>

        <div
          style={{
            border: '1px solid var(--line)',
            borderRadius: '14px',
            padding: '18px 20px',
            marginBottom: '22px',
          }}
        >
          <div className="record-row">
            <span className="record-key">Record ID</span>
            <span className="record-val">{record.id}</span>
          </div>
          <div className="record-row">
            <span className="record-key">Recipient</span>
            <span className="record-val">{record.recipient}</span>
          </div>
          <div className="record-row">
            <span className="record-key">Destination wallet</span>
            <span className="record-val">{record.address}</span>
          </div>
          <div className="record-row">
            <span className="record-key">Wallet control check</span>
            <span className="record-val">
              {record.verifiedControl ? 'Verified signature' : 'Unverified'}
            </span>
          </div>
          <div className="record-row">
            <span className="record-key">Network</span>
            <span className="record-val">{record.network}</span>
          </div>
          <div className="record-row">
            <span className="record-key">Timestamp</span>
            <span className="record-val">{record.timestamp}</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button type="button" className="ws-ghost-btn" onClick={onOpenAgreement}>
            <FileText size={14} /> Payment agreement
          </button>
          <button type="button" className="ws-ghost-btn" onClick={onOpenSharedRecord}>
            <Share2 size={14} /> Shared payment record
          </button>
          <button type="button" className="ws-ghost-btn" onClick={onOpenDispute}>
            <AlertCircle size={14} />{' '}
            {dispute ? `Dispute status (${dispute.status})` : 'Report dispute'}
          </button>
        </div>
      </div>

      {/* Right: Notifications & Updates for this Transaction */}
      <div className="ws-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <Bell size={15} />
          <p className="eyebrow">NOTIFICATIONS &amp; UPDATES</p>
        </div>

        {updates.map((u) => (
          <div key={u.id} className="ws-notif-row">
            <div>
              <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--ink)' }}>{u.title}</p>
              <p className="body-sm">{u.detail}</p>
            </div>
            <span className="body-sm" style={{ fontSize: '12px', color: 'var(--mute)', flexShrink: 0 }}>
              {u.time}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

