import React, { useMemo, useState } from 'react';
import { ArrowLeft, Check, Copy, Download } from 'lucide-react';
import type { DisputeCase, PaymentRecord } from '../../types';
import {
  buildRecordShareLink,
  exportTransactionRecordAsCsv,
  exportTransactionRecordAsJson,
  generateTransactionRecord,
} from '../../../services/transactionRecordService';

interface SharedRecordViewProps {
  record: PaymentRecord;
  dispute?: DisputeCase;
  onBack: () => void;
}

function parseAmount(amountDisplay: string): { amount: string; token: string } {
  const parts = amountDisplay.trim().split(/\s+/);
  return {
    amount: parts[0] || '0',
    token: parts[1] || 'USDT',
  };
}

export const SharedRecordView: React.FC<SharedRecordViewProps> = ({
  record,
  dispute,
  onBack,
}) => {
  const [copied, setCopied] = useState(false);

  const doc = useMemo(() => {
    const { amount, token } = parseAmount(record.amount);
    const confirmationStatus =
      record.status === 'Confirmed'
        ? 'confirmed'
        : record.status === 'Failed'
          ? 'failed'
          : 'pending';
    return generateTransactionRecord({
      recordId: record.id,
      senderAddress: record.senderAddress || '0x0000000000000000000000000000000000000001',
      recipientName: record.recipient,
      recipientAddress: record.address,
      amount,
      tokenSymbol: token,
      network: record.network,
      txHash: record.txHash ?? null,
      confirmationStatus,
      purpose: record.purpose,
      agreementReference: {
        agreementId: `agr-${record.id}`,
        version: 1,
        status: 'accepted',
        acceptedAt: record.timestamp,
      },
      verificationResult: {
        status: record.verifiedControl ? 'verified' : 'unverified',
        verifiedAt: record.verifiedControl ? record.timestamp : null,
        identityNote: 'Cryptographic wallet control does not establish real-world identity.',
      },
      riskAssessment: {
        riskScore: record.verifiedControl ? 0 : 14,
        riskLevel: record.verifiedControl ? 'low' : 'medium',
        classificationLabel: record.verifiedControl ? 'Low' : 'Moderate',
        summary: record.verifiedControl
          ? 'Low: No significant issues detected.'
          : 'Moderate: Some details require attention.',
        assessedAt: record.timestamp,
      },
      disputeStatus: dispute ? dispute.status : null,
      nowIso: record.timestamp,
    });
  }, [record, dispute]);

  const shareLink = buildRecordShareLink(doc, window.location.origin);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const triggerDownload = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="ws-card" style={{ maxWidth: '720px' }}>
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
        <span className="ws-badge">Available to both parties</span>
      </div>

      <h1 className="heading-lg" style={{ marginBottom: '10px' }}>
        Payment Record
      </h1>
      <p className="body-md" style={{ marginBottom: '22px' }}>
        A verifiable summary combining sender/recipient addresses, blockchain status, agreement
        reference, verification, risk assessment, and event history.
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
          <span className="record-key">Sender address</span>
          <span className="record-val">{doc.senderAddress}</span>
        </div>
        <div className="record-row">
          <span className="record-key">Recipient</span>
          <span className="record-val">
            {doc.recipientName} ({doc.recipientAddress})
          </span>
        </div>
        <div className="record-row">
          <span className="record-key">Amount &amp; token</span>
          <span className="record-val">
            {doc.amount} {doc.tokenSymbol}
          </span>
        </div>
        <div className="record-row">
          <span className="record-key">Network</span>
          <span className="record-val">{doc.network}</span>
        </div>
        <div className="record-row">
          <span className="record-key">Transaction hash</span>
          <span className="record-val">{doc.txHash ?? 'Pending submission'}</span>
        </div>
        <div className="record-row">
          <span className="record-key">Confirmation status</span>
          <span className="record-val">{doc.confirmationStatus}</span>
        </div>
        <div className="record-row">
          <span className="record-key">Purpose</span>
          <span className="record-val">{doc.purpose}</span>
        </div>
        <div className="record-row">
          <span className="record-key">Agreement ref</span>
          <span className="record-val">
            {doc.agreementReference
              ? `${doc.agreementReference.agreementId} (v${doc.agreementReference.version} · ${doc.agreementReference.status})`
              : 'None'}
          </span>
        </div>
        <div className="record-row">
          <span className="record-key">Verification</span>
          <span className="record-val">{doc.verificationResult.status}</span>
        </div>
        <div className="record-row">
          <span className="record-key">Risk assessment</span>
          <span className="record-val">
            {doc.riskAssessment.classificationLabel} ({doc.riskAssessment.riskScore}/100)
          </span>
        </div>
        <div className="record-row">
          <span className="record-key">Dispute status</span>
          <span className="record-val">{doc.disputeStatus ?? 'None'}</span>
        </div>
      </div>

      <div
        style={{
          border: '1px solid var(--line)',
          borderRadius: '14px',
          padding: '16px 20px',
          marginBottom: '18px',
        }}
      >
        <strong style={{ fontSize: '14px', display: 'block', marginBottom: '10px' }}>
          Event History ({doc.eventHistory.length})
        </strong>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
          {doc.eventHistory.map((evt) => (
            <div
              key={evt.id}
              style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}
            >
              <div>
                <strong>{evt.title}:</strong> {evt.detail}
              </div>
              <span style={{ color: 'var(--sub)', whiteSpace: 'nowrap' }}>
                {new Date(evt.timestamp).toLocaleString()}
              </span>
            </div>
          ))}
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
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="ws-ghost-btn"
            onClick={() =>
              triggerDownload(
                exportTransactionRecordAsJson(doc),
                `word-record-${doc.recordId}.json`,
                'application/json'
              )
            }
          >
            <Download size={14} /> Export JSON
          </button>
          <button
            type="button"
            className="ws-ghost-btn"
            onClick={() =>
              triggerDownload(
                exportTransactionRecordAsCsv(doc),
                `word-record-${doc.recordId}.csv`,
                'text/csv'
              )
            }
          >
            <Download size={14} /> Export CSV
          </button>
          <button type="button" className="ws-ghost-btn" onClick={handleCopy}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied link' : 'Copy record link'}
          </button>
        </div>
      </div>
    </div>
  );
};
