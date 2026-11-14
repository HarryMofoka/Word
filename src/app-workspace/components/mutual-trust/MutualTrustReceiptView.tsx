import React, { useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  FileCheck2,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import type { MutualTrustReceiptRecord } from '../../../services/mutualTrustService';
import { getNetworkConfig } from '../../../config/blockchain';

interface MutualTrustReceiptViewProps {
  receipt: MutualTrustReceiptRecord;
  agreementTitle?: string | null;
}

export const MutualTrustReceiptView: React.FC<MutualTrustReceiptViewProps> = ({
  receipt,
  agreementTitle,
}) => {
  const [copied, setCopied] = useState(false);
  const netCfg = getNetworkConfig(receipt.network);
  const explorerUrl =
    receipt.blockchain_tx_hash && netCfg
      ? `${netCfg.explorerUrl}/tx/${receipt.blockchain_tx_hash}`
      : null;

  const handleCopySummary = async () => {
    const lines = [
      `Word Mutual Trust Receipt: ${receipt.receipt_code}`,
      `Amount: ${receipt.amount_numeric} ${receipt.token_symbol} (${receipt.network} / Chain ${receipt.chain_id})`,
      `Sender: ${receipt.sender_verification_summary.displayName} (${receipt.sender_wallet_address}) [${receipt.sender_verification_summary.verificationOutcome} / ${receipt.sender_verification_summary.assuranceLevel}]`,
      `Recipient: ${receipt.recipient_verification_summary.displayName} (${receipt.recipient_wallet_address}) [${receipt.recipient_verification_summary.verificationOutcome} / ${receipt.recipient_verification_summary.assuranceLevel}]`,
      `Canonical Hash: ${receipt.canonical_tx_hash}`,
      `Sender Approved: ${receipt.sender_approved_at}`,
      `Recipient Approved: ${receipt.recipient_approved_at}`,
      `Blockchain Tx: ${receipt.blockchain_tx_hash ?? 'Pending'}`,
      `Settlement: ${receipt.settlement_status}`,
      `Server Receipt Signature (HMAC): ${receipt.receipt_signature}`,
    ];
    await navigator.clipboard?.writeText(lines.join('\n'));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const handleDownloadJson = () => {
    // Only sanitized non-biometric receipt fields are exported.
    const exportPayload = {
      receiptCode: receipt.receipt_code,
      sessionId: receipt.session_id,
      transactionId: receipt.transaction_id,
      canonicalTxHash: receipt.canonical_tx_hash,
      amount: receipt.amount_numeric,
      tokenSymbol: receipt.token_symbol,
      network: receipt.network,
      chainId: receipt.chain_id,
      agreementId: receipt.agreement_id,
      agreementVersion: receipt.agreement_version,
      agreementTermsHash: receipt.agreement_terms_hash,
      identityVerificationProofs: {
        sender: receipt.sender_verification_summary,
        recipient: receipt.recipient_verification_summary,
      },
      mutualConsentProofs: {
        senderApprovedAt: receipt.sender_approved_at,
        recipientApprovedAt: receipt.recipient_approved_at,
      },
      blockchainSettlement: {
        txHash: receipt.blockchain_tx_hash,
        status: receipt.settlement_status,
      },
      receiptSignature: receipt.receipt_signature,
      createdAt: receipt.created_at,
    };

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${receipt.receipt_code}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="ws-card" style={{ padding: 26 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 18,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <FileCheck2 size={18} />
            <span style={{ fontSize: 16, fontWeight: 600 }}>Mutual Trust Receipt</span>
            <span className="ws-badge">{receipt.receipt_code}</span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--sub)' }}>
            Auditable proof combining bilateral identity verification, EIP-712 mutual consent, and
            on-chain settlement. Zero biometric templates stored.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="ws-ghost-btn" onClick={() => void handleCopySummary()}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied' : 'Copy Summary'}
          </button>
          <button type="button" className="ws-ghost-btn" onClick={handleDownloadJson}>
            <Download size={14} /> Export JSON
          </button>
        </div>
      </div>

      {/* 1. Identity Verification Proof */}
      <div className="ws-notice" style={{ marginBottom: 14, backgroundColor: 'var(--bg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <UserCheck size={15} />
          <strong>1. Independent Identity Verification Proof</strong>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
            gap: 12,
          }}
        >
          {[receipt.sender_verification_summary, receipt.recipient_verification_summary].map(
            (rep) => (
              <div
                key={`${rep.subjectRole}-${rep.walletAddress}`}
                style={{
                  backgroundColor: 'var(--white)',
                  border: '1px solid var(--line)',
                  borderRadius: 12,
                  padding: 12,
                  fontSize: 12.5,
                  lineHeight: 1.55,
                }}
              >
                <div style={{ fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>
                  {rep.subjectRole === 'sender' ? 'Sender' : 'Recipient'}: {rep.displayName}
                </div>
                <div>
                  Wallet: <code>{rep.walletAddress}</code>
                </div>
                <div>
                  Identity: <strong>{rep.verificationOutcome}</strong> ({rep.livenessOutcome})
                </div>
                <div>
                  Provider: {rep.verificationProvider}
                  {rep.isSandbox ? ' (Sandbox)' : ''} • {rep.assuranceLevel}
                </div>
                <div>
                  Verified:{' '}
                  {rep.verifiedAt ? new Date(rep.verifiedAt).toLocaleString() : 'Not recorded'}
                </div>
              </div>
            )
          )}
        </div>
      </div>

      {/* 2. Dual-Party EIP-712 Authorization */}
      <div className="ws-notice" style={{ marginBottom: 14, backgroundColor: 'var(--bg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <ShieldCheck size={15} />
          <strong>2. Bilateral EIP-712 Transaction Consent</strong>
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.6 }}>
          <div>
            Amount &amp; Asset:{' '}
            <strong>
              {receipt.amount_numeric} {receipt.token_symbol}
            </strong>{' '}
            on {receipt.network} (Chain ID {receipt.chain_id})
          </div>
          {receipt.agreement_id && (
            <div>
              Payment Agreement: {agreementTitle ?? receipt.agreement_id} (v
              {receipt.agreement_version})
            </div>
          )}
          <div>
            Canonical Hash: <code style={{ wordBreak: 'break-all' }}>{receipt.canonical_tx_hash}</code>
          </div>
          <div>
            Sender Signed: {new Date(receipt.sender_approved_at).toLocaleString()}
          </div>
          <div>
            Recipient Signed: {new Date(receipt.recipient_approved_at).toLocaleString()}
          </div>
          <div>
            Server Attestation HMAC:{' '}
            <code style={{ wordBreak: 'break-all' }}>{receipt.receipt_signature}</code>
          </div>
        </div>
      </div>

      {/* 3. Blockchain Settlement */}
      <div className="ws-notice" style={{ backgroundColor: 'var(--bg)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13 }}>
            <strong>3. Blockchain Settlement Status:</strong>{' '}
            <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>
              {receipt.settlement_status}
            </span>
            {receipt.blockchain_tx_hash && (
              <div style={{ marginTop: 4 }}>
                Tx Hash:{' '}
                <code style={{ wordBreak: 'break-all' }}>{receipt.blockchain_tx_hash}</code>
              </div>
            )}
          </div>
          {explorerUrl && (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ws-ghost-btn"
            >
              View on Explorer <ExternalLink size={14} />
            </a>
          )}
        </div>
      </div>
    </div>
  );
};
