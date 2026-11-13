import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, FileText, Plus } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import type { DisputeCase, EvidenceItem, PaymentRecord } from '../../types';

interface DisputeFlowViewProps {
  record: PaymentRecord;
  existingDispute?: DisputeCase;
  initialSubView?: 'report' | 'evidence' | 'status';
  onBack: () => void;
  onSaveDispute: (dispute: DisputeCase) => void;
}

const REASONS = [
  'Item or service not delivered',
  'Item did not match agreed description',
  'Destination or payment request mismatch',
  'Other agreement concern',
];

export const DisputeFlowView: React.FC<DisputeFlowViewProps> = ({
  record,
  existingDispute,
  initialSubView,
  onBack,
  onSaveDispute,
}) => {
  const [subView, setSubView] = useState<'report' | 'evidence' | 'status'>(
    initialSubView || (existingDispute ? 'status' : 'report')
  );

  const [reason, setReason] = useState(existingDispute?.reason || REASONS[0]);
  const [summary, setSummary] = useState(
    existingDispute?.summary || ''
  );

  const [evidenceLabel, setEvidenceLabel] = useState('');
  const [evidenceNote, setEvidenceNote] = useState('');

  const handleSubmitReport = (e: React.FormEvent) => {
    e.preventDefault();
    const created: DisputeCase = existingDispute || {
      id: `dsp-${Date.now()}`,
      recordId: record.id,
      reason,
      summary: summary.trim() || 'Dispute report opened for review.',
      status: 'Open',
      createdAt: 'Just now',
      evidence: [],
    };
    onSaveDispute({
      ...created,
      reason,
      summary: summary.trim() || created.summary,
    });
    setSubView('evidence');
  };

  const handleAddEvidence = (e: React.FormEvent) => {
    e.preventDefault();
    if (!existingDispute) return;
    const item: EvidenceItem = {
      id: `ev-${Date.now()}`,
      label: evidenceLabel.trim() || 'Supporting attachment (UI)',
      note: evidenceNote.trim() || 'Reference uploaded to shared record.',
      addedAt: 'Just now',
    };
    onSaveDispute({
      ...existingDispute,
      status: 'Evidence Submitted',
      evidence: [item, ...existingDispute.evidence],
    });
    setEvidenceLabel('');
    setEvidenceNote('');
    setSubView('status');
  };

  return (
    <div className="ws-card" style={{ maxWidth: '680px' }}>
      <div style={{ marginBottom: '18px' }}>
        <button type="button" className="auth-back-link" onClick={onBack}>
          <ArrowLeft size={15} /> Back to transaction details
        </button>
      </div>

      {/* Sub-navigation between Report, Evidence, and Status */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '22px' }}>
        <button
          type="button"
          className={`ws-nav-tab ${subView === 'report' ? 'is-active' : ''}`}
          style={{ border: '1px solid var(--line)' }}
          onClick={() => setSubView('report')}
        >
          1. Dispute reporting
        </button>
        <button
          type="button"
          className={`ws-nav-tab ${subView === 'evidence' ? 'is-active' : ''}`}
          style={{ border: '1px solid var(--line)' }}
          disabled={!existingDispute}
          onClick={() => setSubView('evidence')}
        >
          2. Evidence submission
        </button>
        <button
          type="button"
          className={`ws-nav-tab ${subView === 'status' ? 'is-active' : ''}`}
          style={{ border: '1px solid var(--line)' }}
          disabled={!existingDispute}
          onClick={() => setSubView('status')}
        >
          3. Dispute status
        </button>
      </div>

      {/* 1. DISPUTE REPORTING */}
      {subView === 'report' && (
        <div>
          <p className="eyebrow" style={{ marginBottom: '8px' }}>
            DISPUTE REPORTING
          </p>
          <h1 className="heading-lg" style={{ marginBottom: '10px' }}>
            Report an issue with this payment.
          </h1>
          <p className="body-md" style={{ marginBottom: '18px' }}>
            For {record.amount} to {record.recipient} ({record.purpose}).
          </p>

          <div className="ws-notice" style={{ marginBottom: '20px' }}>
            <strong>Important:</strong> Dispute reporting organises information and supporting
            evidence. It does not automatically reverse blockchain payments or guarantee recovery of
            funds.
          </div>

          <form
            onSubmit={handleSubmitReport}
            style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
          >
            <div className="field-group">
              <label className="field-label" htmlFor="dispute-reason">
                Issue category
              </label>
              <select
                id="dispute-reason"
                className="field-input"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              >
                {REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="dispute-summary">
                Describe what happened
              </label>
              <textarea
                id="dispute-summary"
                className="field-textarea"
                placeholder="Explain how the outcome differed from the agreed payment terms..."
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                required
              />
            </div>

            <div className="ws-actions-row">
              <button type="button" className="auth-back-link" onClick={onBack}>
                Cancel
              </button>
              <Button type="submit">
                Submit report &amp; add evidence <ArrowRight size={14} />
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* 2. EVIDENCE SUBMISSION */}
      {subView === 'evidence' && existingDispute && (
        <div>
          <p className="eyebrow" style={{ marginBottom: '8px' }}>
            EVIDENCE SUBMISSION
          </p>
          <h1 className="heading-lg" style={{ marginBottom: '10px' }}>
            Attach supporting evidence.
          </h1>
          <p className="body-md" style={{ marginBottom: '20px' }}>
            Add receipts, conversation references, or notes to the shared dispute record.
          </p>

          <form
            onSubmit={handleAddEvidence}
            style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
          >
            <div className="field-group">
              <label className="field-label" htmlFor="ev-label">
                Evidence title / file reference
              </label>
              <input
                id="ev-label"
                type="text"
                className="field-input"
                placeholder="e.g. Chat agreement screenshot or delivery receipt"
                value={evidenceLabel}
                onChange={(e) => setEvidenceLabel(e.target.value)}
                required
              />
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="ev-note">
                Supporting note
              </label>
              <textarea
                id="ev-note"
                className="field-textarea"
                placeholder="Add context explaining what this evidence shows..."
                value={evidenceNote}
                onChange={(e) => setEvidenceNote(e.target.value)}
                required
              />
            </div>

            <div className="ws-actions-row">
              <button
                type="button"
                className="ws-ghost-btn"
                onClick={() => setSubView('status')}
              >
                Skip to status
              </button>
              <Button type="submit">
                <Plus size={14} /> Add evidence to record
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* 3. DISPUTE STATUS */}
      {subView === 'status' && existingDispute && (
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              marginBottom: '10px',
            }}
          >
            <p className="eyebrow">DISPUTE STATUS</p>
            <span className="ws-badge">{existingDispute.status}</span>
          </div>

          <h1 className="heading-lg" style={{ marginBottom: '10px' }}>
            {existingDispute.reason}
          </h1>
          <p className="body-md" style={{ marginBottom: '22px' }}>
            {existingDispute.summary}
          </p>

          <div
            style={{
              border: '1px solid var(--line)',
              borderRadius: '14px',
              padding: '18px 20px',
              marginBottom: '22px',
              backgroundColor: 'var(--bg)',
            }}
          >
            <p className="eyebrow" style={{ marginBottom: '12px' }}>
              TIMELINE
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px' }}>
                <CheckCircle2 size={16} style={{ color: '#1a8f4d' }} />
                <span>
                  <strong>Report opened</strong> · {existingDispute.createdAt}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px' }}>
                <CheckCircle2
                  size={16}
                  style={{
                    color: existingDispute.evidence.length > 0 ? '#1a8f4d' : 'var(--mute)',
                  }}
                />
                <span>
                  <strong>Evidence attached</strong> ({existingDispute.evidence.length} item
                  {existingDispute.evidence.length === 1 ? '' : 's'})
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px' }}>
                <FileText size={16} style={{ color: 'var(--sub)' }} />
                <span>
                  <strong>Shared record updated</strong> · Available for both parties
                </span>
              </div>
            </div>
          </div>

          {existingDispute.evidence.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <p className="eyebrow" style={{ marginBottom: '10px' }}>
                SUBMITTED EVIDENCE
              </p>
              {existingDispute.evidence.map((ev) => (
                <div key={ev.id} className="ws-record-item">
                  <div>
                    <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--ink)' }}>
                      {ev.label}
                    </p>
                    <p className="body-sm">{ev.note}</p>
                  </div>
                  <span className="body-sm" style={{ fontSize: '12px', color: 'var(--mute)' }}>
                    {ev.addedAt}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="ws-actions-row">
            <button type="button" className="auth-back-link" onClick={onBack}>
              Back to transaction details
            </button>
            <button
              type="button"
              className="ws-ghost-btn"
              onClick={() => setSubView('evidence')}
            >
              <Plus size={14} /> Add more evidence
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

