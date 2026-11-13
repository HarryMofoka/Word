import React, { useState } from 'react';
import { ArrowRight, CheckCircle2, Shield } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import type { PaymentRecord, UserSession, WalletState } from '../types';

interface WorkspaceHomeProps {
  session: UserSession;
  wallet: WalletState;
  onOpenSecurity: () => void;
}

const INITIAL_RECORDS: PaymentRecord[] = [
  {
    id: 'rec-1',
    recipient: 'Thabo M.',
    address: '0x4b8f...91e2',
    amount: '20.00 USDT',
    purpose: 'Laptop purchase',
    network: 'Testnet',
    status: 'Confirmed',
    verifiedControl: true,
    timestamp: 'Today',
  },
];

export const WorkspaceHome: React.FC<WorkspaceHomeProps> = ({
  session,
  wallet,
  onOpenSecurity,
}) => {
  const [recipient, setRecipient] = useState('Thabo M.');
  const [address, setAddress] = useState('0x4b8f92c10a7d44e19c3f8b2a91e2');
  const [amount, setAmount] = useState('20.00');
  const [purpose, setPurpose] = useState('Laptop purchase');
  const [records, setRecords] = useState<PaymentRecord[]>(INITIAL_RECORDS);
  const [approvedNotice, setApprovedNotice] = useState<string | null>(null);

  const handleApproveDemo = (e: React.FormEvent) => {
    e.preventDefault();
    const newRec: PaymentRecord = {
      id: `rec-${Date.now()}`,
      recipient: recipient || 'Recipient',
      address:
        address.length > 12
          ? `${address.slice(0, 6)}...${address.slice(-4)}`
          : address,
      amount: `${amount || '0.00'} USDT`,
      purpose: purpose || 'Peer-to-peer payment',
      network: wallet.network,
      status: 'Pending',
      verifiedControl: true,
      timestamp: 'Just now',
    };
    setRecords((prev) => [newRec, ...prev]);
    setApprovedNotice(
      `Testnet demonstration record created for ${newRec.amount} to ${newRec.recipient}. Status is marked Pending until network confirmation.`
    );
  };

  return (
    <div className="ws-grid">
      {/* Left: Payment Review & Explicit Approval */}
      <div className="ws-card">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            marginBottom: '18px',
          }}
        >
          <div>
            <p className="eyebrow" style={{ marginBottom: '6px' }}>
              PAYMENT REVIEW
            </p>
            <h1 className="heading-md">
              {session.displayName ? `${session.displayName}'s Workspace` : 'Prepare a payment'}
            </h1>
          </div>
          <span className="ws-badge">{wallet.network}</span>
        </div>

        <form
          onSubmit={handleApproveDemo}
          style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
        >
          <div className="field-group">
            <label className="field-label" htmlFor="pay-recipient">
              Recipient
            </label>
            <input
              id="pay-recipient"
              type="text"
              className="field-input"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              required
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="pay-address">
              Destination wallet
            </label>
            <input
              id="pay-address"
              type="text"
              className="field-input"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              required
            />
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: '12px',
            }}
          >
            <div className="field-group">
              <label className="field-label" htmlFor="pay-amount">
                Amount (USDT)
              </label>
              <input
                id="pay-amount"
                type="text"
                className="field-input"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="pay-purpose">
                Purpose
              </label>
              <input
                id="pay-purpose"
                type="text"
                className="field-input"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="ws-notice">
            <strong>Pre-approval check:</strong> Cryptographic wallet control verified for this
            demonstration recipient. Wallet-control verification does not prove real-world identity.
          </div>

          <div className="ws-actions-row" style={{ marginTop: '8px' }}>
            <Button type="submit">
              Approve payment (Demo) <ArrowRight size={14} />
            </Button>
          </div>

          {approvedNotice && (
            <div className="auth-status-banner" role="status">
              {approvedNotice}
            </div>
          )}
        </form>
      </div>

      {/* Right: Records & Security Summary */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div className="ws-card">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '12px',
            }}
          >
            <p className="eyebrow">PAYMENT RECORDS</p>
            <span className="mono-label">{records.length} TOTAL</span>
          </div>

          <div>
            {records.map((rec) => (
              <div key={rec.id} className="ws-record-item">
                <div>
                  <p style={{ fontSize: '14.5px', fontWeight: 500, color: 'var(--ink)' }}>
                    {rec.recipient} · {rec.amount}
                  </p>
                  <p className="body-sm">
                    {rec.purpose} · {rec.address}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      fontSize: '12.5px',
                      fontWeight: 500,
                      color: rec.status === 'Confirmed' ? '#1a8f4d' : 'var(--sub)',
                    }}
                  >
                    <CheckCircle2 size={13} />
                    {rec.status}
                  </span>
                  <p className="body-sm" style={{ fontSize: '12px', color: 'var(--mute)' }}>
                    {rec.timestamp}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="ws-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <Shield size={16} />
            <p className="eyebrow">SECURITY &amp; RECOVERY</p>
          </div>
          <p className="body-sm" style={{ marginBottom: '16px' }}>
            Review your recovery phrase guidelines, self-custody boundaries, and connected wallet
            details anytime.
          </p>
          <button type="button" className="ws-ghost-btn" onClick={onOpenSecurity}>
            Open recovery &amp; security info
          </button>
        </div>
      </div>
    </div>
  );
};

