import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight,
  Ban,
  Check,
  Copy,
  QrCode,
  RefreshCw,
  Send,
  ShieldCheck,
} from 'lucide-react';
import type { PaymentFlowMode, PaymentRecord, PaymentRequestData, WalletState } from '../../types';
import { PaymentRequestFlow } from './PaymentRequestFlow';
import { PaymentPayFlow } from './PaymentPayFlow';
import {
  cancelPayment,
  fetchPaymentRequestByCode,
  listPaymentRequests,
  type PaymentRequestRow,
} from '../../../services/paymentsService';
import {
  listMyMutualTrustSessions,
  type HydratedMutualSession,
} from '../../../services/mutualTrustService';
import { MutualTrustFlow } from '../mutual-trust/MutualTrustFlow';

function toRequestData(row: PaymentRequestRow): PaymentRequestData {
  return {
    id: row.id,
    shareCode: row.share_code,
    amount: String(row.amount_numeric),
    token: row.token_symbol,
    network: row.network,
    recipientName: row.recipient_name,
    recipientAddress: row.recipient_address,
    description: row.description,
    terms: row.terms ?? undefined,
    shareUrl: `${window.location.origin}/app?pay=${row.share_code}`,
    expiresAt: row.expires_at,
    status:
      row.status === 'completed' ||
      row.status === 'cancelled' ||
      row.status === 'expired'
        ? row.status
        : 'open',
  };
}

interface PaymentsHubProps {
  userId?: string;
  wallet: WalletState;
  initialMode?: PaymentFlowMode;
  initialRequest?: PaymentRequestData | null;
  initialMutualSessionId?: string | null;
  onRecordAdded: (rec: PaymentRecord) => void;
  onDoneToDashboard: () => void;
}

export const PaymentsHub: React.FC<PaymentsHubProps> = ({
  userId,
  wallet,
  initialMode = 'hub',
  initialRequest = null,
  initialMutualSessionId = null,
  onRecordAdded,
  onDoneToDashboard,
}) => {
  const [mode, setMode] = useState<PaymentFlowMode>(initialMode);
  const [previewReq, setPreviewReq] = useState<PaymentRequestData | null>(initialRequest);
  const [activeMutualSessionId, setActiveMutualSessionId] = useState<string | null>(
    initialMutualSessionId
  );
  const [handedOffMutualSession, setHandedOffMutualSession] =
    useState<HydratedMutualSession | null>(null);
  const [mutualSessions, setMutualSessions] = useState<HydratedMutualSession[]>([]);
  const [requests, setRequests] = useState<PaymentRequestRow[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [hubError, setHubError] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    setLoadingRequests(true);
    setHubError(null);
    try {
      const [rows, mSessions] = await Promise.all([
        listPaymentRequests(),
        userId ? listMyMutualTrustSessions().catch(() => []) : Promise.resolve([]),
      ]);
      setRequests(rows);
      setMutualSessions(mSessions);
    } catch (err) {
      setHubError(err instanceof Error ? err.message : 'Unable to load payment requests.');
    } finally {
      setLoadingRequests(false);
    }
  }, [userId]);

  useEffect(() => {
    if (mode === 'hub') {
      loadRequests();
    }
  }, [mode, loadRequests]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mutualParam = params.get('mutualSession');
    if (mutualParam && /^[0-9a-f-]{36}$/i.test(mutualParam.trim()) && userId) {
      setActiveMutualSessionId(mutualParam.trim());
      setMode('mutual-trust');
      return;
    }
    const payCode = params.get('pay');
    if (payCode && /^WRD-[A-Z0-9]+$/i.test(payCode.trim())) {
      fetchPaymentRequestByCode(payCode.trim())
        .then((row) => {
          setPreviewReq(toRequestData(row));
          setMode('scan-pay');
        })
        .catch(() => {
          // leave on hub if invalid code
        });
    }
  }, [userId]);

  if (mode === 'mutual-trust' && userId) {
    return (
      <MutualTrustFlow
        userId={userId}
        wallet={wallet}
        sessionId={activeMutualSessionId}
        onBack={() => {
          setActiveMutualSessionId(null);
          setMode('hub');
        }}
        onReadyToExecute={(hydrated) => {
          setHandedOffMutualSession(hydrated);
          setPreviewReq({
            id: hydrated.session.payment_request_id ?? hydrated.session.id,
            shareCode: hydrated.session.share_code ?? undefined,
            amount: String(hydrated.session.amount_numeric),
            token: hydrated.session.token_symbol,
            network: hydrated.session.network,
            recipientName: hydrated.recipientReport.displayName,
            recipientAddress: hydrated.session.recipient_wallet_address,
            description: hydrated.session.purpose,
            terms: hydrated.agreement?.termsText,
            shareUrl: `${window.location.origin}/app?mutualSession=${hydrated.session.id}`,
            status: 'open',
          });
          setMode('scan-pay');
        }}
      />
    );
  }

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
        userId={userId}
        wallet={wallet}
        initialRequest={previewReq}
        initialMutualSession={handedOffMutualSession}
        onBack={() => {
          setPreviewReq(null);
          setHandedOffMutualSession(null);
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
            setHandedOffMutualSession(null);
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
                Scan or paste a payment request, complete Mutual Trust verification, review risk
                indicators, and co-sign before approving.
              </p>
            </div>
          </div>
          <ArrowRight size={16} style={{ marginTop: '4px', color: 'var(--sub)' }} />
        </button>

        {userId && (
          <button
            type="button"
            className="ws-option-btn"
            onClick={() => {
              setActiveMutualSessionId(null);
              setMode('mutual-trust');
            }}
          >
            <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
              <span className="ws-option-icon" aria-hidden="true">
                <ShieldCheck size={18} />
              </span>
              <div>
                <h2 className="heading-sm" style={{ fontSize: '15.5px', marginBottom: '4px' }}>
                  Mutual Trust bilateral verification
                </h2>
                <p className="body-sm">
                  Invite a Word counterparty for independent facial liveness checks, sanitized trust
                  report exchange, and dual-party EIP-712 transaction approval.
                </p>
              </div>
            </div>
            <ArrowRight size={16} style={{ marginTop: '4px', color: 'var(--sub)' }} />
          </button>
        )}
      </div>

      {userId && mutualSessions.length > 0 && (
        <div style={{ marginTop: '28px', paddingTop: '22px', borderTop: '1px solid var(--line)' }}>
          <p className="eyebrow" style={{ marginBottom: '12px' }}>
            MUTUAL TRUST SESSIONS &amp; INVITATIONS ({mutualSessions.length})
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {mutualSessions.map((item) => {
              const isSender = item.session.sender_id === userId;
              const counterpartyName = isSender
                ? item.recipientReport.displayName
                : item.senderReport.displayName;
              return (
                <div
                  key={item.session.id}
                  style={{
                    border: '1px solid var(--line)',
                    borderRadius: '12px',
                    padding: '14px 16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '14.5px', marginBottom: '2px' }}>
                      {isSender ? 'Outgoing to ' : 'Invitation from '}
                      {counterpartyName} · {item.session.amount_numeric} {item.session.token_symbol}
                    </div>
                    <div className="body-sm" style={{ color: 'var(--sub)' }}>
                      {item.session.network} · State:{' '}
                      <strong style={{ textTransform: 'capitalize' }}>
                        {item.session.session_state.replace('_', ' ')}
                      </strong>{' '}
                      · Your identity: {isSender ? item.session.sender_verification_status : item.session.recipient_verification_status}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="ws-ghost-btn"
                    onClick={() => {
                      setActiveMutualSessionId(item.session.id);
                      setMode('mutual-trust');
                    }}
                  >
                    Open Session <ArrowRight size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ marginTop: '28px', paddingTop: '22px', borderTop: '1px solid var(--line)' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '14px',
          }}
        >
          <p className="eyebrow">YOUR PAYMENT REQUESTS</p>
          <button
            type="button"
            className="ws-ghost-btn"
            disabled={loadingRequests}
            onClick={loadRequests}
          >
            <RefreshCw size={13} /> {loadingRequests ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {hubError && (
          <p className="body-sm" style={{ color: '#b42318', marginBottom: '12px' }}>
            {hubError}
          </p>
        )}

        {requests.length === 0 ? (
          <p className="body-sm" style={{ color: 'var(--sub)' }}>
            No payment requests created yet.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {requests.map((row) => {
              const reqData = toRequestData(row);
              const isOpen = reqData.status === 'open';
              return (
                <div
                  key={row.id}
                  style={{
                    border: '1px solid var(--line)',
                    borderRadius: '12px',
                    padding: '14px 16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '14.5px', marginBottom: '2px' }}>
                      {row.amount_numeric} {row.token_symbol} · {row.description}
                    </div>
                    <div className="body-sm" style={{ color: 'var(--sub)' }}>
                      {row.share_code} · {row.network} ·{' '}
                      <strong style={{ textTransform: 'capitalize' }}>{row.status}</strong>
                      {row.expires_at
                        ? ` · Expires ${new Date(row.expires_at).toLocaleString()}`
                        : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="ws-ghost-btn"
                      onClick={async () => {
                        await navigator.clipboard.writeText(reqData.shareUrl).catch(() => undefined);
                        setCopiedId(row.id);
                        setTimeout(() => setCopiedId(null), 1600);
                      }}
                    >
                      {copiedId === row.id ? <Check size={13} /> : <Copy size={13} />}
                      {copiedId === row.id ? 'Copied' : 'Copy link'}
                    </button>
                    {isOpen && (
                      <>
                        <button
                          type="button"
                          className="ws-ghost-btn"
                          onClick={() => {
                            setPreviewReq(reqData);
                            setMode('scan-pay');
                          }}
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          className="ws-ghost-btn"
                          disabled={cancellingId === row.id}
                          style={{ color: '#b42318', borderColor: '#fecdca' }}
                          onClick={async () => {
                            setCancellingId(row.id);
                            try {
                              await cancelPayment({
                                paymentRequestId: row.id,
                                reason: 'Cancelled from Requests list',
                              });
                              await loadRequests();
                            } finally {
                              setCancellingId(null);
                            }
                          }}
                        >
                          <Ban size={13} /> {cancellingId === row.id ? 'Cancelling...' : 'Cancel'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

