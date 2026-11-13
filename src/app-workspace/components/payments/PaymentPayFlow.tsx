import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  QrCode,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import type { PaymentRecord, PaymentRequestData, WalletState } from '../../types';
import {
  preparePayment,
  verifyBlockchainReceipt,
} from '../../../services/paymentsService';
import {
  executeOnChainPayment,
  pollTransactionReceipt,
  quoteTransferCost,
  type TransferQuote,
} from '../../../services/wdkWalletService';
import { getNetworkConfig } from '../../../config/blockchain';

type PayStep =
  | 'scan'
  | 'received'
  | 'verify'
  | 'risk'
  | 'review'
  | 'approve'
  | 'processing'
  | 'success'
  | 'pending'
  | 'failure';

interface PaymentPayFlowProps {
  wallet: WalletState;
  initialRequest?: PaymentRequestData | null;
  onBack: () => void;
  onRecordAdded: (rec: PaymentRecord) => void;
  onDoneToDashboard: () => void;
}

const SAMPLE_REQUEST: PaymentRequestData = {
  id: 'req-thabo-20',
  amount: '20.00',
  token: 'USDT',
  network: 'Testnet (Sepolia)',
  recipientName: 'Thabo M.',
  recipientAddress: '0x4b8f92c10a7d44e19c3f8b2a91e2',
  description: 'Laptop purchase',
  terms: 'Handover confirmed upon on-chain Testnet settlement.',
  shareUrl: 'https://word.app/pay/req-thabo-20',
};

export const PaymentPayFlow: React.FC<PaymentPayFlowProps> = ({
  wallet,
  initialRequest,
  onBack,
  onRecordAdded,
  onDoneToDashboard,
}) => {
  const [step, setStep] = useState<PayStep>(initialRequest ? 'received' : 'scan');
  const [request, setRequest] = useState<PaymentRequestData>(initialRequest || SAMPLE_REQUEST);
  const [scanInput, setScanInput] = useState('');
  const [verificationState, setVerificationState] = useState<
    'verified' | 'mismatch' | 'unverified'
  >('verified');
  const [approvedChecked, setApprovedChecked] = useState(false);
  const [quote, setQuote] = useState<TransferQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [signingPhrase, setSigningPhrase] = useState('');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [preparedTxId, setPreparedTxId] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [rechecking, setRechecking] = useState(false);
  const submittingRef = useRef(false);

  const normalizedNetwork =
    request.network === 'Testnet (Sepolia)' ? 'Testnet' : request.network;
  const explorerBaseUrl = getNetworkConfig(normalizedNetwork).explorerUrl;

  const toPaymentRecord = (
    tx: {
      id: string;
      recipient_name: string;
      recipient_address: string;
      amount_numeric: number | string;
      token_symbol: string;
      purpose: string;
      network: string;
      verified_control: boolean;
      created_at: string;
      tx_hash?: string | null;
    },
    status: PaymentRecord['status']
  ): PaymentRecord => ({
    id: tx.id,
    recipient: tx.recipient_name,
    address: `${tx.recipient_address.slice(0, 6)}...${tx.recipient_address.slice(-4)}`,
    amount: `${tx.amount_numeric} ${tx.token_symbol}`,
    purpose: tx.purpose,
    network: tx.network,
    status,
    verifiedControl: tx.verified_control,
    timestamp: new Date(tx.created_at).toLocaleString(),
    txHash: tx.tx_hash ?? undefined,
  });

  // Fetch live sender balance and gas fee estimate when entering review step
  useEffect(() => {
    if (step !== 'review') return;
    let active = true;
    setQuoteLoading(true);
    setQuoteError(null);

    quoteTransferCost({
      senderAddress: wallet.address,
      recipientAddress: request.recipientAddress,
      amount: request.amount,
      tokenSymbol: request.token,
      network: normalizedNetwork,
    })
      .then((res) => {
        if (!active) return;
        setQuote(res);
      })
      .catch((err) => {
        if (!active) return;
        setQuoteError(err instanceof Error ? err.message : 'Failed to fetch live fee quote.');
      })
      .finally(() => {
        if (active) setQuoteLoading(false);
      });

    return () => {
      active = false;
    };
  }, [step, wallet.address, request.recipientAddress, request.amount, request.token, normalizedNetwork]);

  // Prepare, sign, broadcast, store txHash, and poll receipt on-chain
  useEffect(() => {
    if (step !== 'processing' || submittingRef.current) return;
    submittingRef.current = true;
    let active = true;

    const executeRealPayment = async () => {
      setTxError(null);
      setTxHash(null);

      try {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          request.id
        );
        const prepared = await preparePayment({
          amount: request.amount,
          tokenSymbol: request.token,
          network: normalizedNetwork,
          recipientName: request.recipientName,
          recipientAddress: request.recipientAddress,
          purpose: request.description,
          senderAddress: wallet.address,
          paymentRequestId: isUuid ? request.id : undefined,
        });
        if (!active) return;
        setPreparedTxId(prepared.id);

        const phraseToUse = signingPhrase;
        setSigningPhrase('');

        const { txHash: hash } = await executeOnChainPayment({
          senderAddress: wallet.address,
          recipientAddress: request.recipientAddress,
          amount: request.amount,
          tokenSymbol: request.token,
          network: normalizedNetwork,
          walletMethod: wallet.method,
          signingPhrase: phraseToUse,
        });
        if (!active) return;
        setTxHash(hash);

        await verifyBlockchainReceipt({
          transactionId: prepared.id,
          txHash: hash,
          awaitingConfirmation: true,
        });

        const outcome = await pollTransactionReceipt(hash, normalizedNetwork, 20000);
        if (!active) return;

        if (outcome === 'pending') {
          onRecordAdded(toPaymentRecord(prepared, 'Pending'));
          setStep('pending');
          return;
        }

        const { transaction } = await verifyBlockchainReceipt({
          transactionId: prepared.id,
          txHash: hash,
          outcome,
        });
        if (!active) return;

        if (outcome === 'confirmed') {
          onRecordAdded(toPaymentRecord(transaction, 'Confirmed'));
          setStep('success');
        } else {
          onRecordAdded(toPaymentRecord(transaction, 'Failed'));
          setTxError('Transaction reverted on-chain.');
          setStep('failure');
        }
      } catch (err) {
        if (!active) return;
        setSigningPhrase('');
        setTxError(
          err instanceof Error ? err.message : 'Transaction could not be completed.'
        );
        setStep('failure');
      } finally {
        submittingRef.current = false;
      }
    };

    executeRealPayment();
    return () => {
      active = false;
    };
  }, [step]);

  const handleRecheckPending = async () => {
    if (!txHash || !preparedTxId || rechecking) return;
    setRechecking(true);
    try {
      const outcome = await pollTransactionReceipt(txHash, normalizedNetwork, 12000);
      if (outcome === 'pending') return;
      const { transaction } = await verifyBlockchainReceipt({
        transactionId: preparedTxId,
        txHash,
        outcome,
      });
      if (outcome === 'confirmed') {
        onRecordAdded(toPaymentRecord(transaction, 'Confirmed'));
        setStep('success');
      } else {
        onRecordAdded(toPaymentRecord(transaction, 'Failed'));
        setTxError('Transaction reverted on-chain.');
        setStep('failure');
      }
    } catch (err) {
      setTxError(err instanceof Error ? err.message : 'Unable to recheck transaction status.');
    } finally {
      setRechecking(false);
    }
  };

  // 1. SCAN QR CODE
  if (step === 'scan') {
    return (
      <div className="ws-card" style={{ maxWidth: '640px' }}>
        <div style={{ marginBottom: '18px' }}>
          <button type="button" className="auth-back-link" onClick={onBack}>
            <ArrowLeft size={15} /> Back to Payments
          </button>
        </div>

        <p className="eyebrow" style={{ marginBottom: '8px' }}>
          SCAN QR CODE
        </p>
        <h1 className="heading-lg" style={{ marginBottom: '10px' }}>
          Scan or paste a payment request.
        </h1>
        <p className="body-md" style={{ marginBottom: '22px' }}>
          Point your camera at a Word payment QR code, or load a sample request below to preview the
          full verification and approval flow.
        </p>

        <div
          style={{
            height: '210px',
            borderRadius: '14px',
            border: '1px dashed #b8b8b2',
            backgroundColor: 'var(--bg)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            marginBottom: '20px',
            color: 'var(--sub)',
          }}
        >
          <QrCode size={42} strokeWidth={1.4} />
          <span className="body-sm">Camera scanner frame (UI preview)</span>
          <Button
            compact
            onClick={() => {
              setRequest(SAMPLE_REQUEST);
              setStep('received');
            }}
          >
            Simulate QR scan (Thabo · 20 USDT)
          </Button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setRequest({
              ...SAMPLE_REQUEST,
              shareUrl: scanInput.trim() || SAMPLE_REQUEST.shareUrl,
            });
            setStep('received');
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
        >
          <div className="field-group">
            <label className="field-label" htmlFor="scan-link">
              Or paste payment request link
            </label>
            <input
              id="scan-link"
              type="text"
              className="field-input"
              placeholder="https://word.app/pay/req-thabo-20"
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
            />
          </div>
          <div>
            <Button type="submit" compact>
              Open request <ArrowRight size={14} />
            </Button>
          </div>
        </form>
      </div>
    );
  }

  // 2. REVIEW RECEIVED PAYMENT REQUEST
  if (step === 'received') {
    return (
      <div className="ws-card" style={{ maxWidth: '640px' }}>
        <p className="eyebrow" style={{ marginBottom: '8px' }}>
          RECEIVED PAYMENT REQUEST
        </p>
        <h1 className="heading-lg" style={{ marginBottom: '10px' }}>
          {request.amount} {request.token}
        </h1>
        <p className="body-md" style={{ marginBottom: '22px' }}>
          Review the requested payment details before running recipient and risk checks.
        </p>

        <div
          style={{
            border: '1px solid var(--line)',
            borderRadius: '14px',
            padding: '18px 20px',
            marginBottom: '22px',
          }}
        >
          <div className="record-row">
            <span className="record-key">From / Recipient</span>
            <span className="record-val">{request.recipientName}</span>
          </div>
          <div className="record-row">
            <span className="record-key">Destination wallet</span>
            <span className="record-val">{request.recipientAddress}</span>
          </div>
          <div className="record-row">
            <span className="record-key">Network</span>
            <span className="record-val">{request.network}</span>
          </div>
          <div className="record-row">
            <span className="record-key">Description</span>
            <span className="record-val">{request.description}</span>
          </div>
          {request.terms && (
            <div className="record-row">
              <span className="record-key">Payment terms</span>
              <span className="record-val" style={{ maxWidth: '60%', textAlign: 'right' }}>
                {request.terms}
              </span>
            </div>
          )}
        </div>

        <div className="ws-actions-row">
          <button type="button" className="auth-back-link" onClick={() => setStep('scan')}>
            <ArrowLeft size={15} /> Back
          </button>
          <Button onClick={() => setStep('verify')}>
            Verify recipient <ArrowRight size={14} />
          </Button>
        </div>
      </div>
    );
  }

  // 3. RECIPIENT VERIFICATION SCREEN
  if (step === 'verify') {
    return (
      <div className="ws-card" style={{ maxWidth: '640px' }}>
        <p className="eyebrow" style={{ marginBottom: '8px' }}>
          RECIPIENT VERIFICATION
        </p>
        <h1 className="heading-lg" style={{ marginBottom: '10px' }}>
          Check wallet control.
        </h1>
        <p className="body-md" style={{ marginBottom: '18px' }}>
          Word checks whether the recipient has cryptographically signed control of the destination
          address.
        </p>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '18px' }}>
          {(['verified', 'mismatch', 'unverified'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`ws-nav-tab ${verificationState === mode ? 'is-active' : ''}`}
              style={{ border: '1px solid var(--line)', textTransform: 'capitalize' }}
              onClick={() => setVerificationState(mode)}
            >
              {mode}
            </button>
          ))}
        </div>

        <div
          style={{
            padding: '18px 20px',
            borderRadius: '14px',
            border: '1px solid var(--line)',
            backgroundColor: 'var(--bg)',
            marginBottom: '18px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <ShieldCheck
              size={18}
              style={{
                color:
                  verificationState === 'verified'
                    ? '#1a8f4d'
                    : verificationState === 'mismatch'
                      ? '#b42318'
                      : '#b54708',
              }}
            />
            <strong style={{ fontSize: '15px' }}>
              {verificationState === 'verified'
                ? 'Wallet control verified'
                : verificationState === 'mismatch'
                  ? 'Destination address mismatch detected'
                  : 'Wallet control unverified'}
            </strong>
          </div>
          <p className="body-sm">
            {verificationState === 'verified'
              ? `Signature matches ${request.recipientAddress}.`
              : verificationState === 'mismatch'
                ? 'The address in this request does not match the previously signed wallet.'
                : 'No cryptographic signature was provided for this address.'}
          </p>
        </div>

        <div className="ws-notice">
          <strong>Important:</strong> Wallet-control verification confirms control of a wallet
          address—it is not proof of real-world identity.
        </div>

        <div className="ws-actions-row">
          <button type="button" className="auth-back-link" onClick={() => setStep('received')}>
            <ArrowLeft size={15} /> Back
          </button>
          <Button onClick={() => setStep('risk')}>
            Continue to risk check <ArrowRight size={14} />
          </Button>
        </div>
      </div>
    );
  }

  // 4. PAYMENT RISK ASSESSMENT SCREEN
  if (step === 'risk') {
    const isHighRisk = verificationState === 'mismatch';
    const isMediumRisk = verificationState === 'unverified';

    return (
      <div className="ws-card" style={{ maxWidth: '640px' }}>
        <p className="eyebrow" style={{ marginBottom: '8px' }}>
          PAYMENT RISK ASSESSMENT
        </p>
        <h1 className="heading-lg" style={{ marginBottom: '10px' }}>
          {isHighRisk
            ? 'Elevated risk detected.'
            : isMediumRisk
              ? 'Proceed with caution.'
              : 'Low risk indicators.'}
        </h1>
        <p className="body-md" style={{ marginBottom: '20px' }}>
          Explainable pre-approval indicators based on the current request details.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
          <div className="ws-notice">
            <strong>Destination check:</strong>{' '}
            {isHighRisk
              ? 'Address mismatch warning — verify directly with the recipient.'
              : isMediumRisk
                ? 'Unverified address — confirm out-of-band before sending.'
                : 'Recipient wallet control signature matches the request.'}
          </div>
          <div className="ws-notice">
            <strong>Amount &amp; network clarity:</strong> {request.amount} {request.token} on{' '}
            {request.network} is clearly specified.
          </div>
          <div className="ws-notice">
            <strong>Purpose recorded:</strong> &ldquo;{request.description}&rdquo;
          </div>
        </div>

        <div className="ws-actions-row">
          <button type="button" className="auth-back-link" onClick={() => setStep('verify')}>
            <ArrowLeft size={15} /> Back
          </button>
          <Button onClick={() => setStep('review')}>
            Review transaction <ArrowRight size={14} />
          </Button>
        </div>
      </div>
    );
  }

  // 5. TRANSACTION REVIEW SCREEN
  if (step === 'review') {
    return (
      <div className="ws-card" style={{ maxWidth: '640px' }}>
        <p className="eyebrow" style={{ marginBottom: '8px' }}>
          TRANSACTION REVIEW
        </p>
        <h1 className="heading-lg" style={{ marginBottom: '10px' }}>
          Review every detail.
        </h1>
        <p className="body-md" style={{ marginBottom: '20px' }}>
          Confirm the recipient, amount, network, and estimated fee before authorising.
        </p>

        <div
          style={{
            border: '1px solid var(--line)',
            borderRadius: '14px',
            padding: '18px 20px',
            marginBottom: '22px',
          }}
        >
          <div className="record-row">
            <span className="record-key">Recipient</span>
            <span className="record-val">{request.recipientName}</span>
          </div>
          <div className="record-row">
            <span className="record-key">Address</span>
            <span className="record-val">{request.recipientAddress}</span>
          </div>
          <div className="record-row">
            <span className="record-key">Amount</span>
            <span className="record-val">
              {request.amount} {request.token}
            </span>
          </div>
          <div className="record-row">
            <span className="record-key">Network</span>
            <span className="record-val">{normalizedNetwork}</span>
          </div>
          <div className="record-row">
            <span className="record-key">Your {request.token} balance</span>
            <span className="record-val">
              {quoteLoading
                ? 'Checking...'
                : quote
                  ? `${quote.senderTokenBalance} ${request.token} (${quote.senderNativeBalance} ${quote.nativeSymbol} gas)`
                  : '—'}
            </span>
          </div>
          <div className="record-row">
            <span className="record-key">Estimated gas fee</span>
            <span className="record-val">
              {quoteLoading ? 'Estimating...' : quote?.estimatedFeeNative ?? '—'}
            </span>
          </div>
          <div className="record-row">
            <span className="record-key">Total payment cost</span>
            <span className="record-val">
              {quoteLoading ? 'Calculating...' : quote?.totalCostDisplay ?? `${request.amount} ${request.token}`}
            </span>
          </div>
          <div className="record-row">
            <span className="record-key">Purpose</span>
            <span className="record-val">{request.description}</span>
          </div>
        </div>

        {(quoteError || (quote && !quote.hasSufficientBalance)) && (
          <div
            className="ws-notice"
            style={{
              marginBottom: '18px',
              borderColor: '#fecdca',
              backgroundColor: '#fef3f2',
              color: '#b42318',
            }}
          >
            <strong>Cannot proceed:</strong> {quoteError || quote?.insufficientReason}
          </div>
        )}

        <div className="ws-actions-row">
          <button type="button" className="auth-back-link" onClick={() => setStep('risk')}>
            <ArrowLeft size={15} /> Back
          </button>
          <Button
            disabled={quoteLoading || Boolean(quoteError) || (quote ? !quote.hasSufficientBalance : false)}
            onClick={() => {
              setApprovedChecked(false);
              setStep('approve');
            }}
          >
            Proceed to approval <ArrowRight size={14} />
          </Button>
        </div>
      </div>
    );
  }

  // 6. TRANSACTION APPROVAL SCREEN
  if (step === 'approve') {
    return (
      <div className="ws-card" style={{ maxWidth: '640px' }}>
        <p className="eyebrow" style={{ marginBottom: '8px' }}>
          TRANSACTION APPROVAL
        </p>
        <h1 className="heading-lg" style={{ marginBottom: '10px' }}>
          Authorise {request.amount} {request.token}
        </h1>
        <p className="body-md" style={{ marginBottom: '20px' }}>
          Word never submits payments without your explicit approval. Once confirmed on-chain,
          blockchain transfers cannot be reversed.
        </p>

        <label
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            padding: '16px',
            borderRadius: '12px',
            backgroundColor: 'var(--bg)',
            border: '1px solid var(--line)',
            fontSize: '14px',
            cursor: 'pointer',
            marginBottom: '18px',
          }}
        >
          <input
            type="checkbox"
            checked={approvedChecked}
            onChange={(e) => setApprovedChecked(e.target.checked)}
            style={{ marginTop: '3px', width: '16px', height: '16px' }}
          />
          <span>
            I have verified the recipient ({request.recipientName}), amount ({request.amount}{' '}
            {request.token}), gas fee ({quote?.estimatedFeeNative ?? 'estimated'}), and network ({normalizedNetwork}).
          </span>
        </label>

        {wallet.method !== 'connected' ? (
          <div style={{ marginBottom: '22px' }}>
            <label className="ws-label" htmlFor="signing-phrase-input">
              Enter your 12 or 24-word recovery phrase to sign locally
            </label>
            <input
              id="signing-phrase-input"
              type="password"
              className="ws-input"
              placeholder="Words separated by spaces (used in-memory only, never stored or sent)"
              value={signingPhrase}
              onChange={(e) => setSigningPhrase(e.target.value)}
              autoComplete="off"
            />
          </div>
        ) : (
          <div className="ws-notice" style={{ marginBottom: '22px' }}>
            Your connected browser wallet will prompt you to sign this {normalizedNetwork} transaction.
          </div>
        )}

        <div className="ws-actions-row">
          <button type="button" className="auth-back-link" onClick={() => setStep('review')}>
            <ArrowLeft size={15} /> Back to review
          </button>
          <Button
            disabled={
              !approvedChecked ||
              submittingRef.current ||
              (wallet.method !== 'connected' && signingPhrase.trim().split(/\s+/).length < 12)
            }
            style={
              !approvedChecked ||
              (wallet.method !== 'connected' && signingPhrase.trim().split(/\s+/).length < 12)
                ? { opacity: 0.5, cursor: 'not-allowed' }
                : undefined
            }
            onClick={() => setStep('processing')}
          >
            Approve &amp; sign transaction <ArrowRight size={14} />
          </Button>
        </div>
      </div>
    );
  }

  // 7. TRANSACTION PROCESSING SCREEN
  if (step === 'processing') {
    return (
      <div className="ws-card ws-view-enter" style={{ maxWidth: '640px', textAlign: 'center' }}>
        <div className="ws-processing-dot" aria-hidden="true" />
        <p className="eyebrow" style={{ marginBottom: '12px' }}>
          TRANSACTION PROCESSING
        </p>
        <h1 className="heading-lg" style={{ marginBottom: '12px' }}>
          {txHash ? 'Waiting for on-chain confirmation...' : 'Signing & broadcasting payment...'}
        </h1>
        <p className="body-md" style={{ marginBottom: '18px' }}>
          {txHash
            ? `Transaction ${txHash.slice(0, 10)}...${txHash.slice(-6)} has been submitted to ${normalizedNetwork}.`
            : `Preparing and signing ${request.amount} ${request.token} on ${normalizedNetwork}.`}
        </p>
      </div>
    );
  }

  // 8. PAYMENT SUCCESS SCREEN
  if (step === 'success') {
    return (
      <div className="ws-card" style={{ maxWidth: '640px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <CheckCircle2 size={22} style={{ color: '#1a8f4d' }} />
          <span className="eyebrow" style={{ color: '#1a8f4d' }}>
            PAYMENT CONFIRMED
          </span>
        </div>
        <h1 className="heading-lg" style={{ marginBottom: '10px' }}>
          {request.amount} {request.token} confirmed.
        </h1>
        <p className="body-md" style={{ marginBottom: '22px' }}>
          Your on-chain settlement to {request.recipientName} ({request.description}) has been
          verified and saved to your workspace history.
        </p>

        {txHash && (
          <div className="ws-notice" style={{ marginBottom: '22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span>
              <strong>Tx Hash:</strong> {txHash.slice(0, 10)}...{txHash.slice(-8)} · {normalizedNetwork}
            </span>
            <a
              href={`${explorerBaseUrl}/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}
            >
              View on Explorer <ExternalLink size={13} />
            </a>
          </div>
        )}

        <div className="ws-actions-row">
          <Button onClick={onDoneToDashboard}>
            Return to Dashboard <ArrowRight size={14} />
          </Button>
        </div>
      </div>
    );
  }

  // 9. PENDING TRANSACTION SCREEN
  if (step === 'pending') {
    return (
      <div className="ws-card" style={{ maxWidth: '640px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <Clock size={22} style={{ color: '#b54708' }} />
          <span className="eyebrow" style={{ color: '#b54708' }}>
            TRANSACTION PENDING
          </span>
        </div>
        <h1 className="heading-lg" style={{ marginBottom: '10px' }}>
          Awaiting network confirmation.
        </h1>
        <p className="body-md" style={{ marginBottom: '18px' }}>
          Your transaction has been broadcast to {normalizedNetwork}, but has not yet been mined.
          Word clearly distinguishes pending submissions from settled payments.
        </p>

        {txHash && (
          <div className="ws-notice" style={{ marginBottom: '22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span>
              <strong>Tx Hash:</strong> {txHash.slice(0, 10)}...{txHash.slice(-8)}
            </span>
            <a
              href={`${explorerBaseUrl}/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}
            >
              View on Explorer <ExternalLink size={13} />
            </a>
          </div>
        )}

        <div className="ws-actions-row">
          <button
            type="button"
            className="ws-ghost-btn"
            disabled={rechecking}
            onClick={handleRecheckPending}
          >
            <RefreshCw size={14} /> {rechecking ? 'Checking...' : 'Recheck confirmation'}
          </button>
          <Button onClick={onDoneToDashboard}>
            Return to Dashboard <ArrowRight size={14} />
          </Button>
        </div>
      </div>
    );
  }

  // 10. PAYMENT FAILURE SCREEN
  return (
    <div className="ws-card" style={{ maxWidth: '640px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
        {verificationState === 'mismatch' ? (
          <AlertTriangle size={22} style={{ color: '#b42318' }} />
        ) : (
          <XCircle size={22} style={{ color: '#b42318' }} />
        )}
        <span className="eyebrow" style={{ color: '#b42318' }}>
          PAYMENT FAILED
        </span>
      </div>
      <h1 className="heading-lg" style={{ marginBottom: '10px' }}>
        Transaction could not be completed.
      </h1>
      <p className="body-md" style={{ marginBottom: '22px' }}>
        {txError ||
          'No funds were transferred. Review your network selection, gas balance, and recipient details before retrying.'}
      </p>

      <div className="ws-actions-row">
        <button type="button" className="ws-ghost-btn" onClick={onDoneToDashboard}>
          Return to Dashboard
        </button>
        <Button onClick={() => setStep('review')}>
          Review &amp; retry <ArrowRight size={14} />
        </Button>
      </div>
    </div>
  );
};

