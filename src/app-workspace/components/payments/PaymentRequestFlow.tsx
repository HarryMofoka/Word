import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Copy } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import type { PaymentRequestData, WalletState } from '../../types';

interface PaymentRequestFlowProps {
  wallet: WalletState;
  onBack: () => void;
  onPreviewAsPayer: (req: PaymentRequestData) => void;
}

const TOKENS = ['USDT', 'USDC', 'ETH'];
const NETWORKS = ['Testnet (Sepolia)', 'Testnet (Polygon Amoy)', 'Testnet (Tron Nile)'];

function DeterministicQR({ seed }: { seed: string }) {
  const size = 21;
  const cells: boolean[] = [];
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }

  const isFinder = (r: number, c: number) => {
    const inTL = r < 7 && c < 7;
    const inTR = r < 7 && c >= size - 7;
    const inBL = r >= size - 7 && c < 7;
    return inTL || inTR || inBL;
  };

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (isFinder(r, c)) {
        const lr = r >= size - 7 ? r - (size - 7) : r;
        const lc = c >= size - 7 ? c - (size - 7) : c;
        const border = lr === 0 || lr === 6 || lc === 0 || lc === 6;
        const inner = lr >= 2 && lr <= 4 && lc >= 2 && lc <= 4;
        cells.push(border || inner);
      } else {
        const bit = ((h ^ (r * 31 + c * 17)) >>> ((r + c) % 16)) & 1;
        cells.push(bit === 1);
      }
    }
  }

  return (
    <svg
      width="168"
      height="168"
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="Generated payment request QR code"
      style={{
        display: 'block',
        background: '#ffffff',
        padding: '10px',
        borderRadius: '12px',
        border: '1px solid var(--line)',
      }}
    >
      {cells.map((on, idx) =>
        on ? (
          <rect
            key={idx}
            x={idx % size}
            y={Math.floor(idx / size)}
            width="1"
            height="1"
            fill="#111111"
          />
        ) : null
      )}
    </svg>
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

  const [generated, setGenerated] = useState<PaymentRequestData | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const id = `req-${Math.random().toString(36).slice(2, 8)}`;
    setGenerated({
      id,
      amount: amount.trim() || '20.00',
      token,
      network,
      recipientName: recipientName.trim() || 'Recipient',
      recipientAddress: recipientAddress.trim() || wallet.address,
      description: description.trim() || 'Peer-to-peer payment',
      terms: showTerms && terms.trim() ? terms.trim() : undefined,
      shareUrl: `https://word.app/pay/${id}`,
    });
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
          <DeterministicQR seed={`${generated.id}:${generated.amount}:${generated.recipientAddress}`} />

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
        </div>

        <div className="ws-actions-row">
          <button type="button" className="auth-back-link" onClick={onBack}>
            Back to Payments
          </button>
          <Button onClick={() => onPreviewAsPayer(generated)}>
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

        <div className="ws-actions-row">
          <button type="button" className="auth-back-link" onClick={onBack}>
            Cancel
          </button>
          <Button type="submit">
            Generate QR &amp; link <ArrowRight size={14} />
          </Button>
        </div>
      </form>
    </div>
  );
};

