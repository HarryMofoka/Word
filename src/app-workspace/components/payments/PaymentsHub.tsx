import React, { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Ban, Check, Copy, QrCode, RefreshCw, Send } from 'lucide-react';
import type { PaymentFlowMode, PaymentRecord, PaymentRequestData, WalletState } from '../../types';
import { PaymentRequestFlow } from './PaymentRequestFlow';
import { PaymentPayFlow } from './PaymentPayFlow';
import {
  cancelPayment,
  fetchPaymentRequestByCode,
  listPaymentRequests,
  type PaymentRequestRow,
} from '../../../services/paymentsService';

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
  wallet: WalletState;
  initialMode?: PaymentFlowMode;
  initialRequest?: PaymentRequestData | null;
  onRecordAdded: (rec: PaymentRecord) => void;
  onDoneToDashboard: () => void;
}

export const PaymentsHub: React.FC<PaymentsHubProps> = ({
  wallet,
  initialMode = 'hub',
  initialRequest = null,
  onRecordAdded,
  onDoneToDashboard,
}) => {
  const [mode, setMode] = useState<PaymentFlowMode>(initialMode);
  const [previewReq, setPreviewReq] = useState<PaymentRequestData | null>(initialRequest);
  const [requests, setRequests] = useState<PaymentRequestRow[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [hubError, setHubError] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    setLoadingRequests(true);
    setHubError(null);
    try {
      const rows = await listPaymentRequests();
      setRequests(rows);
    } catch (err) {
      setHubError(err instanceof Error ? err.message : 'Unable to load payment requests.');
    } finally {
      setLoadingRequests(false);
    }
  }, []);

  useEffect(() => {
    if (mode === 'hub') {
      loadRequests();
    }
  }, [mode, loadRequests]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
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
  }, []);

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

