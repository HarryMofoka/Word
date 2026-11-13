import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Ban, Check, Copy } from 'lucide-react';
import QRCode from 'qrcode';
import { Button } from '../../../components/ui/Button';
import type { PaymentRequestData, WalletState } from '../../types';
import { cancelPayment, createPaymentRequest } from '../../../services/paymentsService';
import {
  NETWORK_CONFIGS,
  validateTokenCompatibility,
  validateWalletAddress,
} from '../../../config/blockchain';

interface PaymentRequestFlowProps {
  wallet: WalletState;
  onBack: () => void;
  onPreviewAsPayer: (req: PaymentRequestData) => void;
}

const TOKENS = ['USDT', 'USDC', 'ETH', 'WETH'];
const NETWORKS = Object.keys(NETWORK_CONFIGS);
const EXPIRY_OPTIONS = [
  { label: '15 minutes', value: '15' },
  { label: '1 hour', value: '60' },
  { label: '24 hours', value: '1440' },
  { label: '7 days', value: '10080' },
  { label: 'No expiry', value: 'none' },
];

function RealPaymentQR({ value }: { value: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, {
      width: 180,
      margin: 2,
      color: { dark: '#111111', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    })
      .then((url) => {
        if (active) setDataUrl(url);
      })
      .catch(() => {
        if (active) setDataUrl(null);
      });
    return () => {
      active = false;
    };
  }, [value]);

  if (!dataUrl) {
    return (
      <div
        style={{
          width: 168,
          height: 168,
          borderRadius: '12px',
          border: '1px solid var(--line)',
          background: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '12px',
          color: 'var(--sub)',
        }}
      >
        Generating QR...
      </div>
    );
  }

  return (
    <img
      src={dataUrl}
      width={168}
      height={168}
      alt="Scannable payment request QR code"
      style={{
        display: 'block',
        background: '#ffffff',
        borderRadius: '12px',
        border: '1px solid var(--line)',
      }}
    />
  );
}

export const PaymentRequestFlow: React.FC<PaymentRequestFlowProps> = ({
  wallet,
  onBack,
  onPreviewAsPayer,
}) => {
  const [amount, setAmount] = useState('20.00');
  const [token, setToken] = useState('USDT');
  const [network, setNetwork] = useState(NETWORKS[0]);
  const [recipientName, setRecipientName] = useState('Thabo M.');
  const [recipientAddress, setRecipientAddress] = useState(wallet.address);
  const [description, setDescription] = useState('Laptop purchase');
  const [terms, setTerms] = useState('In-person handover after confirmation on Testnet.');
  const [showTerms, setShowTerms] = useState(true);
  const [expiryChoice, setExpiryChoice] = useState('1440');

  const [generated, setGenerated] = useState<PaymentRequestData | null>(null);
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const targetAddr = recipientAddress.trim() || wallet.address;
    const addrCheck = validateWalletAddress(targetAddr, 'Recipient address');
    if (!addrCheck.valid) {
      setErrorMsg(addrCheck.reason ?? 'Invalid recipient address.');
      return;
    }

    const tokenCheck = validateTokenCompatibility(token, network);
    if (!tokenCheck.compatible) {
      setErrorMsg(tokenCheck.reason ?? 'Token is not compatible with selected network.');
      return;
    }

    setCreating(true);
    try {
      const saved = await createPaymentRequest({
        amount: amount.trim() || '20.00',
        tokenSymbol: token,
        network,
        recipientName: recipientName.trim() || 'Recipient',
        recipientAddress: recipientAddress.trim() || wallet.address,
        description: description.trim() || 'Peer-to-peer payment',
        terms: showTerms && terms.trim() ? terms.trim() : undefined,
        expiresInMinutes: expiryChoice === 'none' ? null : Number(expiryChoice),
      });

      setGenerated({
        id: saved.id,
        shareCode: saved.share_code,
        amount: String(saved.amount_numeric),
        token: saved.token_symbol,
        network: saved.network,
        recipientName: saved.recipient_name,
        recipientAddress: saved.recipient_address,
        description: saved.description,
        terms: saved.terms ?? undefined,
        shareUrl: `${window.location.origin}/app?pay=${saved.share_code}`,
        expiresAt: saved.expires_at,
        status:
          saved.status === 'completed' ||
          saved.status === 'cancelled' ||
          saved.status === 'expired'
            ? saved.status
            : 'open',
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create payment request.');
    } finally {
      setCreating(false);
    }
  };

  const handleCopyLink = async () => {
    if (!generated) return;
    try {
      await navigator.clipboard.writeText(generated.shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  if (generated) {
    return (
      <div className="ws-card" style={{ maxWidth: '720px' }}>
        <div style={{ marginBottom: '20px' }}>
          <button
            type="button"
            className="auth-back-link"
            onClick={() => setGenerated(null)}
          >
            <ArrowLeft size={15} /> Edit payment request
          </button>
        </div>

        <p className="eyebrow" style={{ marginBottom: '8px' }}>
          PAYMENT REQUEST DETAILS
        </p>
        <h2 className="heading-lg" style={{ marginBottom: '10px' }}>
          {generated.amount} {generated.token}
        </h2>
        <p className="body-md" style={{ marginBottom: '24px' }}>
          Share this QR code or link so the payer can verify your wallet control and review the
          exact terms before approving.
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: '24px',
            alignItems: 'center',
            padding: '20px',
            backgroundColor: 'var(--bg)',
            border: '1px solid var(--line)',
            borderRadius: '14px',
            marginBottom: '20px',
          }}
        >
          <RealPaymentQR value={generated.shareUrl} />

          <div style={{ minWidth: 0 }}>
            <p className="eyebrow" style={{ marginBottom: '6px' }}>
              SHAREABLE PAYMENT LINK
            </p>
            <p
              style={{
                fontSize: '14px',
                fontWeight: 500,
                color: 'var(--ink)',
                wordBreak: 'break-all',
                marginBottom: '12px',
              }}
            >
              {generated.shareUrl}
            </p>
            <button type="button" className="ws-ghost-btn" onClick={handleCopyLink}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied link' : 'Copy payment link'}
            </button>
          </div>
        </div>

        <div
          style={{
            border: '1px solid var(--line)',
            borderRadius: '14px',
            padding: '18px 20px',
            marginBottom: '24px',
          }}
        >
          <div className="record-row">
            <span className="record-key">Recipient</span>
            <span className="record-val">{generated.recipientName}</span>
          </div>
          <div className="record-row">
            <span className="record-key">Wallet address</span>
            <span className="record-val" style={{ wordBreak: 'break-all', textAlign: 'right' }}>
              {generated.recipientAddress.slice(0, 10)}...{generated.recipientAddress.slice(-6)}
            </span>
          </div>
          <div className="record-row">
            <span className="record-key">Amount &amp; token</span>
            <span className="record-val">
              {generated.amount} {generated.token}
            </span>
          </div>
          <div className="record-row">
            <span className="record-key">Network</span>
            <span className="record-val">{generated.network}</span>
          </div>
          <div className="record-row">
            <span className="record-key">Description</span>
            <span className="record-val">{generated.description}</span>
          </div>
          {generated.terms && (
            <div className="record-row">
              <span className="record-key">Optional terms</span>
              <span className="record-val" style={{ textAlign: 'right', maxWidth: '60%' }}>
                {generated.terms}
              </span>
            </div>
          )}
          <div className="record-row">
            <span className="record-key">Request ID / Status</span>
            <span className="record-val">
              {generated.shareCode ?? generated.id.slice(0, 8)} ·{' '}
              <strong style={{ textTransform: 'capitalize' }}>{generated.status ?? 'open'}</strong>
            </span>
          </div>
          <div className="record-row">
            <span className="record-key">Expires</span>
            <span className="record-val">
              {generated.expiresAt
                ? new Date(generated.expiresAt).toLocaleString()
                : 'No expiry'}
            </span>
          </div>
        </div>

        <div className="ws-actions-row">
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="auth-back-link" onClick={onBack}>
              Back to Payments
            </button>
            {generated.status === 'open' && (
              <button
                type="button"
                className="ws-ghost-btn"
                disabled={cancelling}
                style={{ color: '#b42318', borderColor: '#fecdca' }}
                onClick={async () => {
                  setCancelling(true);
                  try {
                    await cancelPayment({
                      paymentRequestId: generated.id,
                      reason: 'Cancelled by creator',
                    });
                    setGenerated((prev) => (prev ? { ...prev, status: 'cancelled' } : prev));
                  } catch (err) {
                    setErrorMsg(
                      err instanceof Error ? err.message : 'Failed to cancel request.'
                    );
                  } finally {
                    setCancelling(false);
                  }
                }}
              >
                <Ban size={14} /> {cancelling ? 'Cancelling...' : 'Cancel request'}
              </button>
            )}
          </div>
          <Button
            disabled={generated.status !== 'open'}
            onClick={() => onPreviewAsPayer(generated)}
          >
            Preview payer review flow <ArrowRight size={14} />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="ws-card" style={{ maxWidth: '680px' }}>
      <div style={{ marginBottom: '18px' }}>
        <button type="button" className="auth-back-link" onClick={onBack}>
          <ArrowLeft size={15} /> Back to Payments
        </button>
      </div>

      <p className="eyebrow" style={{ marginBottom: '8px' }}>
        CREATE PAYMENT REQUEST
      </p>
      <h1 className="heading-lg" style={{ marginBottom: '10px' }}>
        Request a payment.
      </h1>
      <p className="body-md" style={{ marginBottom: '24px' }}>
        Specify the amount, token, network, recipient details, and optional terms so the payer sees
        everything clearly before signing.
      </p>

      <form
        onSubmit={handleCreate}
        style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: '12px',
          }}
        >
          <div className="field-group">
            <label className="field-label" htmlFor="req-amount">
              Payment amount
            </label>
            <input
              id="req-amount"
              type="text"
              className="field-input"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="20.00"
              required
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="req-token">
              Select token
            </label>
            <select
              id="req-token"
              className="field-input"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            >
              {TOKENS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: '12px',
          }}
        >
          <div className="field-group">
            <label className="field-label" htmlFor="req-network">
              Select network
            </label>
            <select
              id="req-network"
              className="field-input"
              value={network}
              onChange={(e) => setNetwork(e.target.value)}
            >
              {NETWORKS.map((net) => (
                <option key={net} value={net}>
                  {net}
                </option>
              ))}
            </select>
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="req-expiry">
              Request expiry
            </label>
            <select
              id="req-expiry"
              className="field-input"
              value={expiryChoice}
              onChange={(e) => setExpiryChoice(e.target.value)}
            >
              {EXPIRY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: '12px',
          }}
        >
          <div className="field-group">
            <label className="field-label" htmlFor="req-recipient-name">
              Recipient name
            </label>
            <input
              id="req-recipient-name"
              type="text"
              className="field-input"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              required
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="req-recipient-addr">
              Recipient wallet address
            </label>
            <input
              id="req-recipient-addr"
              type="text"
              className="field-input"
              value={recipientAddress}
              onChange={(e) => setRecipientAddress(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="field-group">
          <label className="field-label" htmlFor="req-description">
            Payment description
          </label>
          <input
            id="req-description"
            type="text"
            className="field-input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Laptop purchase"
            required
          />
        </div>

        <div>
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '13.5px',
              fontWeight: 500,
              cursor: 'pointer',
              marginBottom: showTerms ? '10px' : 0,
            }}
          >
            <input
              type="checkbox"
              checked={showTerms}
              onChange={(e) => setShowTerms(e.target.checked)}
            />
            <span>Include optional payment terms</span>
          </label>

          {showTerms && (
            <textarea
              id="req-terms"
              className="field-textarea"
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              placeholder="Optional delivery, milestone, or refund terms..."
            />
          )}
        </div>

        {errorMsg && (
          <p role="alert" style={{ color: '#fca5a5', fontSize: '13px' }}>
            {errorMsg}
          </p>
        )}

        <div className="ws-actions-row">
          <button type="button" className="auth-back-link" onClick={onBack}>
            Cancel
          </button>
          <Button type="submit" disabled={creating}>
            {creating ? 'Creating...' : 'Generate QR & link'} <ArrowRight size={14} />
          </Button>
        </div>
      </form>
    </div>
  );
};

