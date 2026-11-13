import React, { useState } from 'react';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import type { DisputeCase, PaymentRecord } from '../../types';
import { TransactionDetailView } from './TransactionDetailView';
import { PaymentAgreementView } from './PaymentAgreementView';
import { SharedRecordView } from './SharedRecordView';
import { DisputeFlowView } from './DisputeFlowView';

interface AccountabilityHubProps {
  records: PaymentRecord[];
  disputes: Record<string, DisputeCase>;
  initialSelectedId?: string | null;
  onSaveDispute: (dispute: DisputeCase) => void;
}

type AccountabilityScreen = 'history' | 'detail' | 'agreement' | 'shared' | 'dispute';

export const AccountabilityHub: React.FC<AccountabilityHubProps> = ({
  records,
  disputes,
  initialSelectedId,
  onSaveDispute,
}) => {
  const [screen, setScreen] = useState<AccountabilityScreen>(
    initialSelectedId ? 'detail' : 'history'
  );
  const [selectedId, setSelectedId] = useState<string>(
    initialSelectedId || records[0]?.id || ''
  );
  const [filter, setFilter] = useState<'all' | 'Confirmed' | 'Pending' | 'disputed'>('all');

  const selectedRecord = records.find((r) => r.id === selectedId) || records[0];
  const selectedDispute = selectedRecord ? disputes[selectedRecord.id] : undefined;

  if (screen === 'agreement' && selectedRecord) {
    return (
      <PaymentAgreementView
        record={selectedRecord}
        onBack={() => setScreen('detail')}
      />
    );
  }

  if (screen === 'shared' && selectedRecord) {
    return (
      <SharedRecordView
        record={selectedRecord}
        dispute={selectedDispute}
        onBack={() => setScreen('detail')}
      />
    );
  }

  if (screen === 'dispute' && selectedRecord) {
    return (
      <DisputeFlowView
        record={selectedRecord}
        existingDispute={selectedDispute}
        onBack={() => setScreen('detail')}
        onSaveDispute={onSaveDispute}
      />
    );
  }

  if (screen === 'detail' && selectedRecord) {
    return (
      <TransactionDetailView
        record={selectedRecord}
        dispute={selectedDispute}
        onBack={() => setScreen('history')}
        onOpenAgreement={() => setScreen('agreement')}
        onOpenSharedRecord={() => setScreen('shared')}
        onOpenDispute={() => setScreen('dispute')}
      />
    );
  }

  const filtered = records.filter((r) => {
    if (filter === 'all') return true;
    if (filter === 'disputed') return Boolean(disputes[r.id]);
    return r.status === filter;
  });

  return (
    <div className="ws-card" style={{ maxWidth: '820px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
          marginBottom: '18px',
        }}
      >
        <div>
          <p className="eyebrow" style={{ marginBottom: '6px' }}>
            ACCOUNTABILITY &amp; RECORDS
          </p>
          <h1 className="heading-md">Transaction history</h1>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {(['all', 'Confirmed', 'Pending', 'disputed'] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={`ws-nav-tab ${filter === f ? 'is-active' : ''}`}
              style={{ border: '1px solid var(--line)', textTransform: 'capitalize' }}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="body-md" style={{ paddingBlock: '24px' }}>
          No transactions match this filter.
        </p>
      ) : (
        <div>
          {filtered.map((rec) => {
            const hasDispute = Boolean(disputes[rec.id]);
            return (
              <button
                key={rec.id}
                type="button"
                className="ws-record-item"
                style={{
                  width: '100%',
                  background: 'transparent',
                  borderLeft: 'none',
                  borderRight: 'none',
                  borderTop: 'none',
                  textAlign: 'left',
                  paddingInline: '4px',
                }}
                onClick={() => {
                  setSelectedId(rec.id);
                  setScreen('detail');
                }}
              >
                <div>
                  <p style={{ fontSize: '15px', fontWeight: 500, color: 'var(--ink)' }}>
                    {rec.recipient} · {rec.amount}
                  </p>
                  <p className="body-sm">
                    {rec.purpose} · {rec.address} · {rec.network}
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ textAlign: 'right' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        fontSize: '12.5px',
                        fontWeight: 500,
                        color: hasDispute
                          ? '#b54708'
                          : rec.status === 'Confirmed'
                            ? '#1a8f4d'
                            : 'var(--sub)',
                      }}
                    >
                      <CheckCircle2 size={13} />
                      {hasDispute ? `Dispute: ${disputes[rec.id].status}` : rec.status}
                    </span>
                    <p className="body-sm" style={{ fontSize: '12px', color: 'var(--mute)' }}>
                      {rec.timestamp}
                    </p>
                  </div>
                  <ArrowRight size={15} style={{ color: 'var(--mute)' }} />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

