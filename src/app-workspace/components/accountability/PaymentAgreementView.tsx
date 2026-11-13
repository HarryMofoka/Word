import React, { useState } from 'react';
import { ArrowLeft, CheckCircle2, Clock, Lock } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import type { PaymentRecord } from '../../types';
import {
  acceptAgreementByParty,
  createAgreementRecord,
  getAgreementStatusSummary,
  reviseAgreementRecord,
  type AgreementPartyRole,
  type PaymentAgreement,
} from '../../../services/agreementService';

interface PaymentAgreementViewProps {
  record: PaymentRecord;
  onBack: () => void;
}

function parseAmountParts(amountDisplay: string): { amount: string; token: string } {
  const parts = amountDisplay.trim().split(/\s+/);
  return {
    amount: parts[0] || '20',
    token: parts[1] || 'USDT',
  };
}

export const PaymentAgreementView: React.FC<PaymentAgreementViewProps> = ({
  record,
  onBack,
}) => {
  const { amount, token } = parseAmountParts(record.amount);
  const [agreement, setAgreement] = useState<PaymentAgreement>(() => {
    const initial = createAgreementRecord({
      paymentRequestId: record.id,
      title: record.purpose,
      purpose: record.purpose,
      agreedAmount: amount,
      tokenSymbol: token,
      network: record.network,
      recipientName: record.recipient,
      recipientAddress: record.address,
      termsText: 'In-person handover or confirmed delivery matching agreed description.',
      creatorId: 'local-creator',
      creatorAcceptsOnCreate: record.status === 'Confirmed',
      nowIso: record.timestamp,
    });
    return record.status === 'Confirmed'
      ? acceptAgreementByParty(initial, 'counterparty', { nowIso: record.timestamp })
      : initial;
  });

  const [editing, setEditing] = useState(false);
  const [draftTerms, setDraftTerms] = useState(agreement.termsText);
  const [draftAmount, setDraftAmount] = useState(agreement.agreedAmount);
  const [changeNote, setChangeNote] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showVersions, setShowVersions] = useState(false);

  const summary = getAgreementStatusSummary(agreement);

  const handleAccept = (role: AgreementPartyRole) => {
    setErrorMsg(null);
    setAgreement((prev) => acceptAgreementByParty(prev, role));
  };

  const handleSaveRevision = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      const updated = reviseAgreementRecord(
        agreement,
        {
          agreedAmount: draftAmount,
          termsText: draftTerms,
        },
        {
          editedBy: 'creator',
          changeNote: changeNote.trim() || 'Updated agreement terms',
        }
      );
      setAgreement(updated);
      setEditing(false);
      setChangeNote('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to revise agreement.');
    }
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
          gap: '12px',
          marginBottom: '10px',
        }}
      >
        <p className="eyebrow">PAYMENT AGREEMENT · V{agreement.currentVersion}</p>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            fontSize: '12.5px',
            fontWeight: 500,
            color: summary.isLocked ? '#1a8f4d' : '#b54708',
          }}
        >
          {summary.isLocked ? <Lock size={14} /> : <Clock size={14} />} {summary.label}
        </span>
      </div>

      <h1 className="heading-lg" style={{ marginBottom: '10px' }}>
        {agreement.purpose}
      </h1>
      <p className="body-md" style={{ marginBottom: '22px' }}>
        Linked to payment request <code>{agreement.paymentRequestId}</code>. Both parties can review
        and accept these terms; once accepted by both, terms are locked against silent modification.
      </p>

      <div
        style={{
          border: '1px solid var(--line)',
          borderRadius: '14px',
          padding: '18px 20px',
          marginBottom: '18px',
        }}
      >
        <div className="record-row">
          <span className="record-key">Recipient</span>
          <span className="record-val">{agreement.recipientName}</span>
        </div>
        <div className="record-row">
          <span className="record-key">Wallet address</span>
          <span className="record-val">{agreement.recipientAddress}</span>
        </div>
        <div className="record-row">
          <span className="record-key">Agreed amount</span>
          <span className="record-val">
            {agreement.agreedAmount} {agreement.tokenSymbol}
          </span>
        </div>
        <div className="record-row">
          <span className="record-key">Network</span>
          <span className="record-val">{agreement.network}</span>
        </div>
        <div className="record-row">
          <span className="record-key">Terms</span>
          <span className="record-val" style={{ maxWidth: '62%', textAlign: 'right' }}>
            {agreement.termsText}
          </span>
        </div>
        <div className="record-row">
          <span className="record-key">Creator accepted</span>
          <span className="record-val">
            {agreement.creatorAcceptedAt
              ? new Date(agreement.creatorAcceptedAt).toLocaleString()
              : 'Pending'}
          </span>
        </div>
        <div className="record-row">
          <span className="record-key">Counterparty accepted</span>
          <span className="record-val">
            {agreement.counterpartyAcceptedAt
              ? new Date(agreement.counterpartyAcceptedAt).toLocaleString()
              : 'Pending'}
          </span>
        </div>
        {agreement.lockedAt && (
          <div className="record-row">
            <span className="record-key">Locked at</span>
            <span className="record-val">{new Date(agreement.lockedAt).toLocaleString()}</span>
          </div>
        )}
      </div>

      {errorMsg && (
        <div
          className="ws-notice"
          style={{
            marginBottom: '16px',
            borderColor: '#fecdca',
            backgroundColor: '#fef3f2',
            color: '#b42318',
          }}
        >
          {errorMsg}
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '18px' }}>
        {!agreement.creatorAcceptedAt && (
          <Button compact onClick={() => handleAccept('creator')}>
            <CheckCircle2 size={14} /> Accept as payer
          </Button>
        )}
        {!agreement.counterpartyAcceptedAt && (
          <Button compact onClick={() => handleAccept('counterparty')}>
            <CheckCircle2 size={14} /> Accept as recipient
          </Button>
        )}
        <button
          type="button"
          className="ws-ghost-btn"
          disabled={summary.isLocked}
          onClick={() => setEditing((v) => !v)}
          style={summary.isLocked ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
        >
          {summary.isLocked ? 'Locked after acceptance' : editing ? 'Cancel edit' : 'Propose revision'}
        </button>
        <button
          type="button"
          className="ws-ghost-btn"
          onClick={() => setShowVersions((v) => !v)}
        >
          {showVersions ? 'Hide version history' : `Version history (${agreement.versions.length})`}
        </button>
      </div>

      {editing && !summary.isLocked && (
        <form
          onSubmit={handleSaveRevision}
          style={{
            border: '1px solid var(--line)',
            borderRadius: '14px',
            padding: '16px',
            marginBottom: '18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <strong style={{ fontSize: '14px' }}>Propose Agreement Revision (creates v{agreement.currentVersion + 1})</strong>
          <input
            type="text"
            className="field-input"
            value={draftAmount}
            onChange={(e) => setDraftAmount(e.target.value)}
            placeholder="Agreed amount"
          />
          <textarea
            className="field-input"
            rows={3}
            value={draftTerms}
            onChange={(e) => setDraftTerms(e.target.value)}
            placeholder="Updated agreement terms"
          />
          <input
            type="text"
            className="field-input"
            value={changeNote}
            onChange={(e) => setChangeNote(e.target.value)}
            placeholder="Reason for revision (e.g. Updated delivery window)"
          />
          <div>
            <Button type="submit" compact>
              Save revision v{agreement.currentVersion + 1}
            </Button>
          </div>
        </form>
      )}

      {showVersions && (
        <div
          style={{
            border: '1px solid var(--line)',
            borderRadius: '14px',
            padding: '16px',
            marginBottom: '18px',
          }}
        >
          <strong style={{ fontSize: '14px', display: 'block', marginBottom: '10px' }}>
            Agreement Version History
          </strong>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {[...agreement.versions].reverse().map((v) => (
              <div
                key={v.versionNumber}
                style={{
                  paddingBottom: '10px',
                  borderBottom: '1px solid var(--line)',
                  fontSize: '13px',
                }}
              >
                <div style={{ fontWeight: 600 }}>
                  v{v.versionNumber} · {v.agreedAmount} {v.tokenSymbol} · Edited by {v.editedBy}
                </div>
                <div style={{ color: 'var(--sub)', marginTop: '2px' }}>
                  {v.changeNote} · {new Date(v.createdAt).toLocaleString()}
                </div>
                <div style={{ marginTop: '4px' }}>{v.termsText}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="ws-notice">
        <strong>Note:</strong> Recording an agreement creates a clearer, tamper-evident reference
        for both parties, but does not guarantee physical delivery of goods.
      </div>
    </div>
  );
};
