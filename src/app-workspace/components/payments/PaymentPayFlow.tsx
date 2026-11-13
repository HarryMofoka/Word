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
  fetchPaymentRequestByCode,
  listRiskAssessments,
  preparePayment,
  runRiskAssessment,
  verifyBlockchainReceipt,
  type RiskAssessmentRow,
} from '../../../services/paymentsService';
import {
  evaluatePaymentRisk,
  type RiskIntelligenceReport,
} from '../../../services/riskIntelligenceService';
import {
  WALLET_CONTROL_IDENTITY_DISCLAIMER,
  getRecipientVerificationStatus,
  type RecipientVerificationResult,
} from '../../../services/recipientVerificationService';
import { validatePaymentDetails } from '../../../services/paymentDetailValidationService';
import {
  executeOnChainPayment,
  pollTransactionReceipt,
  quoteTransferCost,
  type TransferQuote,
} from '../../../services/wdkWalletService';
import { getNetworkConfig } from '../../../config/blockchain';
import { validateTransactionForSigning } from '../../../services/walletSecurityService';

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
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [tamperError, setTamperError] = useState<string | null>(null);
  const [verificationState, setVerificationState] = useState<
    'verified' | 'mismatch' | 'unverified'
  >('unverified');
  const [verificationResult, setVerificationResult] =
    useState<RecipientVerificationResult | null>(null);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [approvedChecked, setApprovedChecked] = useState(false);
  const [quote, setQuote] = useState<TransferQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [signingPhrase, setSigningPhrase] = useState('');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [preparedTxId, setPreparedTxId] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [rechecking, setRechecking] = useState(false);
  const [showInspector, setShowInspector] = useState(false);
  const [expectedRecipient, setExpectedRecipient] = useState('');
  const [expectedAmount, setExpectedAmount] = useState('');
  const [expectedToken, setExpectedToken] = useState('');
  const [expectedNetwork, setExpectedNetwork] = useState('');
  const [riskReport, setRiskReport] = useState<RiskIntelligenceReport | null>(null);
  const [riskLoading, setRiskLoading] = useState(false);
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);
  const [riskAuditTrail, setRiskAuditTrail] = useState<RiskAssessmentRow[]>([]);
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

  const fetchRecipientProof = async (reqId: string) => {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reqId);
    if (!isUuid) {
      setVerificationState('unverified');
      setVerificationResult({
        status: 'unverified',
        intendedAddress: request.recipientAddress,
        recoveredAddress: null,
        verifiedAt: null,
        disclaimer: WALLET_CONTROL_IDENTITY_DISCLAIMER,
      });
      return;
    }
    setVerificationLoading(true);
    try {
      const res = await getRecipientVerificationStatus(reqId);
      setVerificationResult(res);
      setVerificationState(res.status);
    } catch {
      setVerificationState('unverified');
    } finally {
      setVerificationLoading(false);
    }
  };

  useEffect(() => {
    if (step === 'verify') {
      fetchRecipientProof(request.id);
    }
  }, [step, request.id]);

  const assessPaymentRisk = async () => {
    setRiskLoading(true);
    setRiskAcknowledged(false);
    const localReport = evaluatePaymentRisk({
      recipientAddress: request.recipientAddress,
      recipientName: request.recipientName,
      amount: request.amount,
      tokenSymbol: request.token,
      network: normalizedNetwork,
      walletNetwork: wallet.network,
      purpose: request.description,
      walletControlStatus: verificationState,
      isAlteredRequest: Boolean(tamperError),
      isExpiredRequest:
        request.status === 'expired' ||
        Boolean(request.expiresAt && new Date(request.expiresAt).getTime() <= Date.now()),
      isDuplicateAttempt: Boolean(request.alreadyPaid),
    });
    setRiskReport(localReport);

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      request.id
    );
    try {
      const saved = await runRiskAssessment({
        recipientAddress: request.recipientAddress,
        network: normalizedNetwork,
        tokenSymbol: request.token,
        amount: request.amount,
        paymentRequestId: isUuid ? request.id : undefined,
        purpose: request.description,
        walletNetwork: wallet.network,
      });
      setRiskReport((prev) =>
        prev
          ? {
            ...prev,
            riskScore: Math.max(prev.riskScore, saved.risk_score),
            assessedAt: saved.created_at,
          }
          : prev
      );
      const history = await listRiskAssessments(isUuid ? request.id : undefined);
      setRiskAuditTrail(history.length > 0 ? history : [saved]);
    } catch {
      // keep local risk report if offline or unauthenticated
    } finally {
      setRiskLoading(false);
    }
  };

  useEffect(() => {
    if (step === 'risk') {
      assessPaymentRisk();
    }
  }, [
    step,
    request.id,
    request.recipientAddress,
    request.amount,
    request.token,
    normalizedNetwork,
    wallet.network,
    verificationState,
    tamperError,
  ]);

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
        const signingPreview = validateTransactionForSigning({
          fromAddress: wallet.address,
          toAddress: request.recipientAddress,
          amount: request.amount,
          token: request.token,
          network: normalizedNetwork,
          approvalAcknowledged: approvedChecked,
        });

        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          request.id
        );
        const prepared = await preparePayment({
          amount: signingPreview.amount,
          tokenSymbol: signingPreview.token,
          network: signingPreview.network,
          recipientName: request.recipientName,
          recipientAddress: signingPreview.destinationAddress,
          purpose: request.description,
          senderAddress: signingPreview.fromAddress,
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

  const handleOpenScannedInput = async (e: React.FormEvent) => {
    e.preventDefault();
    setScanError(null);
    setTamperError(null);
    const raw = scanInput.trim();
    if (!raw) {
      setRequest(SAMPLE_REQUEST);
      setStep('received');
      return;
    }

    let parsedPayload: Partial<PaymentRequestData> | null = null;
    let shareCode: string | null = null;

    if (raw.startsWith('{')) {
      try {
        parsedPayload = JSON.parse(raw) as Partial<PaymentRequestData>;
        if (parsedPayload.shareCode) shareCode = parsedPayload.shareCode;
      } catch {
        setScanError('Invalid QR JSON payload.');
        return;
      }
    } else {
      const codeMatch = raw.match(/WRD-[A-Z0-9]+/i);
      if (codeMatch) {
        shareCode = codeMatch[0].toUpperCase();
      }
    }

    if (!shareCode) {
      setScanError('Enter a valid Word payment link or share code (e.g. WRD-...).');
      return;
    }

    setScanLoading(true);
    try {
      const row = await fetchPaymentRequestByCode(shareCode);
      const authoritative: PaymentRequestData = {
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
        alreadyPaid: row.alreadyPaid,
        existingTransactionStatus: row.existingTransactionStatus ?? null,
        authoritativeDestinationAddress: row.recipient_address,
      };

      if (parsedPayload) {
        const mismatch =
          (parsedPayload.amount && Number(parsedPayload.amount) !== Number(authoritative.amount)) ||
          (parsedPayload.recipientAddress &&
            parsedPayload.recipientAddress.toLowerCase() !==
            authoritative.recipientAddress.toLowerCase()) ||
          (parsedPayload.token && parsedPayload.token !== authoritative.token) ||
          (parsedPayload.network && parsedPayload.network !== authoritative.network);
        if (mismatch) {
          setTamperError(
            'This scanned request payload was altered and does not match the authoritative Word record.'
          );
        }
      }

      setRequest(authoritative);
      setStep('received');
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Payment request not found.');
    } finally {
      setScanLoading(false);
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
          Paste a Word payment link or share code (`WRD-...`) to fetch and verify the
          authoritative request, or load the sample preview below.
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
              setTamperError(null);
              setRequest(SAMPLE_REQUEST);
              setStep('received');
            }}
          >
            Simulate QR scan (Thabo · 20 USDT)
          </Button>
        </div>

        <form
          onSubmit={handleOpenScannedInput}
          style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
        >
          <div className="field-group">
            <label className="field-label" htmlFor="scan-link">
              Or paste payment request link or code
            </label>
            <input
              id="scan-link"
              type="text"
              className="field-input"
              placeholder="https://.../app?pay=WRD-XXXXXXXXXX or WRD-XXXXXXXXXX"
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
            />
          </div>
          {scanError && (
            <p role="alert" className="body-sm" style={{ color: '#b42318' }}>
              {scanError}
            </p>
          )}
          <div>
            <Button type="submit" compact disabled={scanLoading}>
              {scanLoading ? 'Verifying request...' : 'Open request'} <ArrowRight size={14} />
            </Button>
          </div>
        </form>
      </div>
    );
  }

  // 2. REVIEW RECEIVED PAYMENT REQUEST
  if (step === 'received') {
    const isExpired =
      request.status === 'expired' ||
      Boolean(request.expiresAt && new Date(request.expiresAt).getTime() <= Date.now());
    const isCancelled = request.status === 'cancelled';
    const isCompleted = request.status === 'completed';
    const invalidReason = tamperError
      ? tamperError
      : isExpired
        ? 'This payment request has expired and can no longer be paid.'
        : isCancelled
          ? 'This payment request was cancelled by the recipient.'
          : isCompleted
            ? 'This payment request has already been completed.'
            : null;

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

        {invalidReason && (
          <div
            className="ws-notice"
            style={{
              marginBottom: '18px',
              borderColor: '#fecdca',
              backgroundColor: '#fef3f2',
              color: '#b42318',
            }}
          >
            <strong>Invalid request:</strong> {invalidReason}
          </div>
        )}

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
          {request.expiresAt && (
            <div className="record-row">
              <span className="record-key">Expires</span>
              <span className="record-val">{new Date(request.expiresAt).toLocaleString()}</span>
            </div>
          )}
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
          <Button disabled={Boolean(invalidReason)} onClick={() => setStep('verify')}>
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
          Word checks whether the recipient has cryptographically signed a challenge proving control
          of the destination address for this payment request.
        </p>

        <div
          style={{
            padding: '18px 20px',
            borderRadius: '14px',
            border: '1px solid var(--line)',
            backgroundColor: 'var(--bg)',
            marginBottom: '18px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              marginBottom: '10px',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
                {verificationLoading
                  ? 'Checking cryptographic proof...'
                  : verificationState === 'verified'
                    ? 'Wallet control verified'
                    : verificationState === 'mismatch'
                      ? 'Destination address mismatch detected'
                      : 'Wallet control unverified'}
              </strong>
            </div>
            <button
              type="button"
              className="ws-ghost-btn"
              disabled={verificationLoading}
              onClick={() => fetchRecipientProof(request.id)}
            >
              <RefreshCw size={13} /> {verificationLoading ? 'Checking...' : 'Recheck'}
            </button>
          </div>
          <p className="body-sm" style={{ marginBottom: '8px' }}>
            {verificationState === 'verified'
              ? `Recovered signing address matches ${request.recipientAddress}.`
              : verificationState === 'mismatch'
                ? `Recovered signer (${verificationResult?.recoveredAddress ?? 'unknown'}) does not match intended recipient (${request.recipientAddress}).`
                : 'No cryptographic challenge signature has been recorded for this payment request yet.'}
          </p>
          {verificationResult?.verifiedAt && (
            <p className="body-sm" style={{ color: 'var(--sub)' }}>
              Verified at: {new Date(verificationResult.verifiedAt).toLocaleString()}
            </p>
          )}
        </div>

        <div className="ws-notice">
          <strong>Important:</strong> {WALLET_CONTROL_IDENTITY_DISCLAIMER}
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
    const level = riskReport?.riskLevel ?? 'low';
    const score = riskReport?.riskScore ?? 0;
    const warningFindings = (riskReport?.findings ?? []).filter((f) => f.pointsAwarded > 0);
    const requiresAcknowledgement = level !== 'low' || warningFindings.length > 0;
    const isDangerous =
      level === 'high' ||
      level === 'critical' ||
      warningFindings.some((f) => f.indicatorType === 'confirmed_mismatch');
    const recommendedNextSteps = Array.from(
      new Set(warningFindings.map((f) => f.recommendedAction).filter(Boolean))
    );

    return (
      <div className="ws-card" style={{ maxWidth: '640px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '8px',
            }}
          >
            <p className="eyebrow">PAYMENT RISK INTELLIGENCE</p>
            <button
              type="button"
              className="ws-ghost-btn"
              disabled={riskLoading}
              onClick={assessPaymentRisk}
            >
              <RefreshCw size={13} /> {riskLoading ? 'Assessing...' : 'Reassess'}
            </button>
          </div>

          <h1 className="heading-lg" style={{ marginBottom: '8px' }}>
            {level === 'critical'
              ? `Critical (${score}/100)`
              : level === 'high'
                ? `High (${score}/100)`
                : level === 'medium'
                  ? `Moderate (${score}/100)`
                  : `Low (${score}/100)`}
          </h1>
            <p className="body-md" style={{ fontWeight: 500, marginBottom: '6px' }}>
              {riskReport?.classificationMeaning ??
                (level === 'critical'
                  ? 'A serious issue requires stopping and investigating'
                  : level === 'high'
                    ? 'Significant warning signs detected'
                    : level === 'medium'
                      ? 'Some details require attention'
                      : 'No significant issues detected')}
            </p>
            <p className="body-md" style={{ marginBottom: '12px' }}>
              {riskReport?.summary ?? 'Evaluating recipient, request integrity, amount, and network...'}
            </p>

            {riskReport?.safetyDisclaimer && (
              <p className="body-sm" style={{ color: 'var(--sub)', marginBottom: '12px' }}>
                {riskReport.safetyDisclaimer}
              </p>
            )}

            {riskReport?.assessedAt && (
              <p className="body-sm" style={{ color: 'var(--sub)', marginBottom: '16px' }}>
                Assessed at: {new Date(riskReport.assessedAt).toLocaleString()}
              </p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
              {(riskReport?.findings ?? []).map((f, idx) => {
                const indicatorLabel =
                  f.indicatorType === 'confirmed_mismatch'
                    ? 'Confirmed mismatch'
                    : f.indicatorType === 'suspicious_indicator'
                      ? 'Suspicious indicator'
                      : 'Verified signal';
                return (
                  <div
                    key={`${f.code}-${idx}`}
                    className="ws-notice"
                    style={
                      f.severity === 'critical' || f.severity === 'high'
                        ? { borderColor: '#fecdca', backgroundColor: '#fef3f2', color: '#b42318' }
                        : undefined
                    }
                  >
                    <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                      {f.label} · {indicatorLabel} ({f.pointsAwarded}/{f.weight} pts · {f.category.replace('_', ' ')})
                    </div>
                    <div style={{ fontSize: '13px', marginBottom: '4px' }}>
                      <strong>Triggered by:</strong> {f.triggeredBy.replace(/_/g, ' ')}
                      {f.triggeredValue ? ` (${f.triggeredValue})` : ''}
                    </div>
                    <div style={{ fontSize: '13.5px', marginBottom: '4px' }}>
                      <strong>What Word found:</strong> {f.detail}
                    </div>
                    <div style={{ fontSize: '13px', marginBottom: '4px', opacity: 0.9 }}>
                      <strong>Potential consequence:</strong> {f.whyItMatters}
                    </div>
                    <div style={{ fontSize: '13px' }}>
                      <strong>Recommended action:</strong> {f.recommendedAction}
                    </div>
                  </div>
                );
              })}
            </div>

            {isDangerous && (
              <div
                className="ws-notice"
                style={{
                  marginBottom: '16px',
                  borderColor: '#f04438',
                  backgroundColor: '#fef3f2',
                  color: '#912018',
                }}
              >
                <strong>Strong warning before proceeding:</strong> Serious risk indicators or confirmed mismatches were detected. Blockchain transfers are irreversible—stop and resolve these issues before signing.
              </div>
            )}

            {recommendedNextSteps.length > 0 && (
              <div
                style={{
                  border: '1px solid var(--line)',
                  borderRadius: '12px',
                  padding: '14px 16px',
                  marginBottom: '16px',
                  backgroundColor: 'var(--bg)',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '6px' }}>
                  Recommended next steps
                </div>
                <ul style={{ margin: '0 0 0 18px', padding: 0, fontSize: '13.5px' }}>
                  {recommendedNextSteps.map((action, idx) => (
                    <li key={idx} style={{ marginBottom: '4px' }}>
                      {action}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {requiresAcknowledgement && (
              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  padding: '14px 16px',
                  borderRadius: '12px',
                  backgroundColor: 'var(--bg)',
                  border: '1px solid var(--line)',
                  fontSize: '13.5px',
                  cursor: 'pointer',
                  marginBottom: '16px',
                }}
              >
                <input
                  type="checkbox"
                  checked={riskAcknowledged}
                  onChange={(e) => setRiskAcknowledged(e.target.checked)}
                  style={{ marginTop: '3px', width: '16px', height: '16px' }}
                />
                <span>
                  I have reviewed the {riskReport?.classificationLabel ?? level} risk warnings ({score}/100) and understand that proceeding carries the risks explained above.
                </span>
              </label>
            )}

            {riskAuditTrail.length > 0 && (
              <div
                style={{
                  border: '1px solid var(--line)',
                  borderRadius: '12px',
                  padding: '12px 16px',
                  marginBottom: '18px',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '6px' }}>
                  Assessment Audit Trail ({riskAuditTrail.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12.5px', color: 'var(--sub)' }}>
                  {riskAuditTrail.slice(0, 5).map((item) => (
                    <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                      <span>{new Date(item.created_at).toLocaleString()}</span>
                      <span>
                        {item.risk_level.toUpperCase()} · {item.risk_score}/100
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="ws-actions-row">
              <button type="button" className="auth-back-link" onClick={() => setStep('verify')}>
                <ArrowLeft size={15} /> Back
              </button>
              <Button
                disabled={requiresAcknowledgement && !riskAcknowledged}
                style={
                  requiresAcknowledgement && !riskAcknowledged
                    ? { opacity: 0.5, cursor: 'not-allowed' }
                    : undefined
                }
                onClick={() => setStep('review')}
              >
                Review transaction <ArrowRight size={14} />
              </Button>
            </div>
          </div>
          );
  }

          // 5. TRANSACTION REVIEW SCREEN
          if (step === 'review') {
    const detailReport = validatePaymentDetails({
            requested: {
            recipientAddress: request.recipientAddress,
          recipientName: request.recipientName,
          amount: request.amount,
          token: request.token,
          network: normalizedNetwork,
          expiresAt: request.expiresAt,
          status: request.status,
          authoritativeDestinationAddress: request.authoritativeDestinationAddress,
      },
          intended: {
            expectedRecipientAddress: expectedRecipient,
          expectedAmount,
          expectedToken,
          expectedNetwork,
      },
          alreadyPaid: request.alreadyPaid,
          existingTxStatus: request.existingTransactionStatus,
    });

          return (
          <div className="ws-card" style={{ maxWidth: '640px' }}>
            <p className="eyebrow" style={{ marginBottom: '8px' }}>
              TRANSACTION REVIEW &amp; DETAIL VALIDATION
            </p>
            <h1 className="heading-lg" style={{ marginBottom: '10px' }}>
              Review every detail.
            </h1>
            <p className="body-md" style={{ marginBottom: '20px' }}>
              Confirm the recipient, amount, token, network, expiry, and estimated fee before authorising.
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

            <div
              style={{
                border: '1px solid var(--line)',
                borderRadius: '14px',
                padding: '16px 18px',
                backgroundColor: 'var(--bg)',
                marginBottom: '18px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '10px',
                  marginBottom: showInspector ? '12px' : 0,
                }}
              >
                <div>
                  <strong style={{ fontSize: '14px' }}>Independent Detail Inspector</strong>
                  <p className="body-sm" style={{ color: 'var(--sub)' }}>
                    Compare this request against your expected recipient, amount, token, and network.
                  </p>
                </div>
                <button
                  type="button"
                  className="ws-ghost-btn"
                  onClick={() => setShowInspector((v) => !v)}
                >
                  {showInspector ? 'Hide fields' : 'Compare details'}
                </button>
              </div>

              {showInspector && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                    gap: '10px',
                    marginTop: '10px',
                  }}
                >
                  <input
                    type="text"
                    className="field-input"
                    placeholder="Expected recipient 0x..."
                    value={expectedRecipient}
                    onChange={(e) => setExpectedRecipient(e.target.value)}
                  />
                  <input
                    type="text"
                    className="field-input"
                    placeholder="Expected amount (e.g. 20.00)"
                    value={expectedAmount}
                    onChange={(e) => setExpectedAmount(e.target.value)}
                  />
                  <input
                    type="text"
                    className="field-input"
                    placeholder="Expected token (e.g. USDT)"
                    value={expectedToken}
                    onChange={(e) => setExpectedToken(e.target.value)}
                  />
                  <input
                    type="text"
                    className="field-input"
                    placeholder="Expected network (e.g. Testnet)"
                    value={expectedNetwork}
                    onChange={(e) => setExpectedNetwork(e.target.value)}
                  />
                </div>
              )}
            </div>

            {detailReport.discrepancies.length > 0 && (
              <div
                className="ws-notice"
                style={{
                  marginBottom: '18px',
                  borderColor: '#fecdca',
                  backgroundColor: '#fef3f2',
                  color: '#b42318',
                }}
              >
                <strong>Discrepancies detected before approval:</strong>
                <ul style={{ margin: '8px 0 0 18px', padding: 0 }}>
                  {detailReport.discrepancies.map((d, idx) => (
                    <li key={`${d.field}-${idx}`} style={{ marginBottom: '4px' }}>
                      <strong>{d.title}:</strong> {d.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

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
                disabled={
                  !detailReport.valid ||
                  quoteLoading ||
                  Boolean(quoteError) ||
                  (quote ? !quote.hasSufficientBalance : false)
                }
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

            {riskReport && (riskReport.riskLevel === 'high' || riskReport.riskLevel === 'critical') && (
              <div
                className="ws-notice"
                style={{
                  marginBottom: '18px',
                  borderColor: '#f04438',
                  backgroundColor: '#fef3f2',
                  color: '#912018',
                }}
              >
                <strong>Strong warning ({riskReport.classificationLabel} · {riskReport.riskScore}/100):</strong>{' '}
                {riskReport.classificationMeaning}. Only sign this transaction if you have independently resolved the flagged risks.
              </div>
            )}

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

