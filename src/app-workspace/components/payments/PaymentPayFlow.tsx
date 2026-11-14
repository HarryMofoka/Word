import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  Fingerprint,
  KeyRound,
  QrCode,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Timer,
  UserCheck,
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
import {
  createOrJoinMutualTrustSession,
  type HydratedMutualSession,
  type MutualTrustReceiptRecord,
} from '../../../services/mutualTrustService';
import { MutualTrustFlow } from '../mutual-trust/MutualTrustFlow';
import { MutualTrustReceiptView } from '../mutual-trust/MutualTrustReceiptView';
import {
  RECIPIENT_DIRECTORY,
  deductSimulatedUsdtBalance,
  ensureSimulatedWalletBalance,
  getAdaptiveFrictionPolicy,
  lookupRecipientByAddressOrQuery,
  searchRecipients,
  verifySenderPasskey,
  type PasskeyVerificationReceipt,
  type RecipientDirectoryEntry,
} from '../../../services/recipientDirectoryService';

type PayStep =
  | 'scan'
  | 'recipient_friction'
  | 'received'
  | 'verify'
  | 'risk'
  | 'review'
  | 'mutual_trust'
  | 'approve'
  | 'processing'
  | 'success'
  | 'pending'
  | 'failure';

interface PaymentPayFlowProps {
  userId?: string;
  userEmail?: string;
  wallet: WalletState;
  initialRequest?: PaymentRequestData | null;
  initialMutualSession?: HydratedMutualSession | null;
  onBack: () => void;
  onRecordAdded: (rec: PaymentRecord) => void;
  onPushLiveNotification?: (notif: {
    title: string;
    detail: string;
    category: 'Payment' | 'Verification' | 'Security';
  }) => void;
  onBalanceUpdated?: () => void;
  onDoneToDashboard: () => void;
}

const SAMPLE_REQUEST: PaymentRequestData = {
  id: 'req-thabo-20',
  amount: '20.00',
  token: 'USDT',
  network: 'Testnet (Sepolia)',
  recipientName: 'Thabo Mokoena',
  recipientAddress: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
  description: 'Laptop purchase',
  terms: 'Handover confirmed upon on-chain Testnet settlement.',
  shareUrl: 'https://word.app/pay/req-thabo-20',
};

export const PaymentPayFlow: React.FC<PaymentPayFlowProps> = ({
  userId,
  userEmail,
  wallet,
  initialRequest,
  initialMutualSession = null,
  onBack,
  onRecordAdded,
  onPushLiveNotification,
  onBalanceUpdated,
  onDoneToDashboard,
}) => {
  const [step, setStep] = useState<PayStep>(
    initialMutualSession?.session.session_state === 'authorized'
      ? 'approve'
      : initialRequest
        ? 'received'
        : 'scan'
  );
  const [request, setRequest] = useState<PaymentRequestData>(initialRequest || SAMPLE_REQUEST);
  const [mutualSession, setMutualSession] = useState<HydratedMutualSession | null>(
    initialMutualSession
  );
  const [mutualReceipt, setMutualReceipt] = useState<MutualTrustReceiptRecord | null>(null);
  const [mutualStarting, setMutualStarting] = useState(false);
  const [mutualInitError, setMutualInitError] = useState<string | null>(null);
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

  // --- RECIPIENT DIRECTORY SEARCH & ADAPTIVE FRICTION STATE ---
  const [recipientQuery, setRecipientQuery] = useState('');
  const [riskFilter, setRiskFilter] = useState<'all' | 'low' | 'moderate' | 'high'>('all');
  const [selectedRecipient, setSelectedRecipient] = useState<RecipientDirectoryEntry>(
    () =>
      (initialRequest
        ? lookupRecipientByAddressOrQuery(initialRequest.recipientAddress)
        : null) ?? RECIPIENT_DIRECTORY[0]
  );
  const [sendAmount, setSendAmount] = useState(initialRequest?.amount || '125.00');
  const [sendPurpose, setSendPurpose] = useState(
    initialRequest?.description || 'Stablecoin settlement'
  );
  const [showQrScannerSection, setShowQrScannerSection] = useState(false);

  // Friction step states
  const [identityConfirmed, setIdentityConfirmed] = useState(false);
  const [reviewedDisputeIds, setReviewedDisputeIds] = useState<Record<string, boolean>>({});
  const [disputesWalkedThrough, setDisputesWalkedThrough] = useState(false);
  const [areYouSureConfirmed, setAreYouSureConfirmed] = useState(false);
  const [passkeyInput, setPasskeyInput] = useState('WORD-2026');
  const [passkeyVerifying, setPasskeyVerifying] = useState(false);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [passkeyReceipt, setPasskeyReceipt] = useState<PasskeyVerificationReceipt | null>(null);
  const [waitRemainingSeconds, setWaitRemainingSeconds] = useState<number>(0);
  const [waitStarted, setWaitStarted] = useState(false);
  const [simulatedSettlementSummary, setSimulatedSettlementSummary] = useState<{
    newUsdtBalance: string;
    frictionStepsCompleted: string[];
  } | null>(null);
  const [isSimulatedDirectSend, setIsSimulatedDirectSend] = useState(false);

  const normalizedNetwork =
    request.network === 'Testnet (Sepolia)' ? 'Testnet' : request.network;
  const explorerBaseUrl = getNetworkConfig(normalizedNetwork).explorerUrl;

  const filteredDirectory = searchRecipients(recipientQuery, riskFilter);
  const frictionPolicy = getAdaptiveFrictionPolicy(selectedRecipient);

  const resetFrictionStates = (nextRecipient: RecipientDirectoryEntry) => {
    const policy = getAdaptiveFrictionPolicy(nextRecipient);
    setIdentityConfirmed(false);
    setReviewedDisputeIds({});
    setDisputesWalkedThrough(!policy.requiresDisputeWalkthrough);
    setAreYouSureConfirmed(!policy.requiresAreYouSurePrompt);
    setPasskeyReceipt(null);
    setPasskeyError(null);
    setWaitRemainingSeconds(policy.extraWaitSeconds);
    setWaitStarted(false);
  };

  // Auto-resolve custom wallet address when typed in search/address bar
  const handleRecipientQueryChange = (val: string) => {
    setRecipientQuery(val);
    const trimmed = val.trim();
    if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
      const resolved = lookupRecipientByAddressOrQuery(trimmed);
      if (resolved) {
        setSelectedRecipient(resolved);
        resetFrictionStates(resolved);
      }
    }
  };

  // Manage the mandatory extra wait countdown timer once prerequisites are met
  useEffect(() => {
    if (step !== 'recipient_friction') return;
    if (!waitStarted || waitRemainingSeconds <= 0) return;

    const timer = window.setInterval(() => {
      setWaitRemainingSeconds((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [step, waitStarted, waitRemainingSeconds]);

  // Automatically start the extra wait timer as soon as preceding steps are completed
  useEffect(() => {
    if (step !== 'recipient_friction') return;
    const preWaitDone =
      identityConfirmed &&
      (!frictionPolicy.requiresDisputeWalkthrough || disputesWalkedThrough) &&
      (!frictionPolicy.requiresAreYouSurePrompt || areYouSureConfirmed) &&
      (!frictionPolicy.requiresPasskeyVerification || Boolean(passkeyReceipt));

    if (preWaitDone && frictionPolicy.extraWaitSeconds > 0 && !waitStarted) {
      setWaitStarted(true);
      onPushLiveNotification?.({
        title: `Mandatory ${frictionPolicy.extraWaitSeconds}s Cooling-Off Timer Started`,
        detail: `Extra wait time active before sending ${sendAmount} USDT to ${selectedRecipient.fullName} (${selectedRecipient.riskTier.toUpperCase()} risk).`,
        category: 'Security',
      });
    }
  }, [
    step,
    identityConfirmed,
    disputesWalkedThrough,
    areYouSureConfirmed,
    passkeyReceipt,
    frictionPolicy,
    waitStarted,
    sendAmount,
    selectedRecipient,
    onPushLiveNotification,
  ]);

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

  const handleExecuteSimulatedStablecoinSend = async () => {
    const cleanAmount = Number(sendAmount) > 0 ? Number(sendAmount).toFixed(2) : '125.00';
    const nextReq: PaymentRequestData = {
      id: `sim-tx-${Date.now()}`,
      amount: cleanAmount,
      token: 'USDT',
      network: wallet.network,
      recipientName: selectedRecipient.fullName,
      recipientAddress: selectedRecipient.walletAddress,
      description: sendPurpose.trim() || 'Stablecoin settlement',
      shareUrl: `${window.location.origin}/app`,
      status: 'open',
    };
    setRequest(nextReq);
    setIsSimulatedDirectSend(true);
    setStep('processing');

    onPushLiveNotification?.({
      title: 'Stablecoin Transfer Initiated',
      detail: `Broadcasting ${cleanAmount} USDT to ${selectedRecipient.firstName} ${selectedRecipient.lastName} (${selectedRecipient.walletAddress.slice(0, 8)}...) on ${wallet.network}.`,
      category: 'Payment',
    });

    await new Promise((r) => setTimeout(r, 950));
    const generatedHash = `0x${Array.from({ length: 64 }, (_, i) =>
      ((Date.now() + i * 17) % 16).toString(16)
    ).join('')}`;
    setTxHash(generatedHash);

    await new Promise((r) => setTimeout(r, 900));

    const updatedBalances = deductSimulatedUsdtBalance(wallet.address, Number(cleanAmount));
    onBalanceUpdated?.();

    const completedRecord: PaymentRecord = {
      id: nextReq.id,
      senderAddress: wallet.address,
      recipient: `${selectedRecipient.firstName} ${selectedRecipient.lastName}`,
      address: `${selectedRecipient.walletAddress.slice(0, 6)}...${selectedRecipient.walletAddress.slice(-4)}`,
      amount: `${cleanAmount} USDT`,
      purpose: nextReq.description,
      network: wallet.network,
      status: 'Confirmed',
      verifiedControl: true,
      timestamp: new Date().toLocaleString(),
      txHash: generatedHash,
    };

    onRecordAdded(completedRecord);
    setSimulatedSettlementSummary({
      newUsdtBalance: updatedBalances.usdtBalance,
      frictionStepsCompleted: frictionPolicy.stepLabels,
    });

    onPushLiveNotification?.({
      title: `Stablecoin Sent: ${cleanAmount} USDT Confirmed`,
      detail: `Settled ${cleanAmount} USDT to ${selectedRecipient.firstName} ${selectedRecipient.lastName}. Remaining balance: ${updatedBalances.usdtBalance} USDT.`,
      category: 'Payment',
    });

    setStep('success');
  };

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

  const applyServerOutcome = (
    transaction: Parameters<typeof toPaymentRecord>[0] & { status?: string }
  ) => {
    if (transaction.status === 'confirmed') {
      onRecordAdded(toPaymentRecord(transaction, 'Confirmed'));
      setStep('success');
    } else if (transaction.status === 'processing' || transaction.status === 'pending') {
      onRecordAdded(toPaymentRecord(transaction, 'Pending'));
      setStep('pending');
    } else {
      onRecordAdded(toPaymentRecord(transaction, 'Failed'));
      setTxError('Transaction reverted on-chain.');
      setStep('failure');
    }
  };

  // Prepare, sign, broadcast, store txHash, and poll receipt on-chain (for standard WDK on-chain mode)
  useEffect(() => {
    if (step !== 'processing' || isSimulatedDirectSend || submittingRef.current) return;
    submittingRef.current = true;
    let active = true;

    const executeRealPayment = async () => {
      setTxError(null);
      setTxHash(null);
      let broadcastHash: string | null = null;

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
          mutualSessionId: mutualSession?.session.id,
          canonicalTxHash: mutualSession?.session.canonical_tx_hash,
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
        broadcastHash = hash;
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

        const { transaction, mutualTrustReceipt } = await verifyBlockchainReceipt({
          transactionId: prepared.id,
          txHash: hash,
          outcome,
        });
        if (!active) return;

        if (mutualTrustReceipt) {
          setMutualReceipt(mutualTrustReceipt);
        }

        applyServerOutcome(transaction);
      } catch (err) {
        if (!active) return;
        setSigningPhrase('');
        const message =
          err instanceof Error ? err.message : 'Transaction could not be completed.';
        if (broadcastHash) {
          setTxError(`Status sync interrupted after broadcast: ${message}`);
          setStep('pending');
        } else {
          setTxError(message);
          setStep('failure');
        }
      } finally {
        submittingRef.current = false;
      }
    };

    executeRealPayment();
    return () => {
      active = false;
    };
  }, [step, isSimulatedDirectSend]);

  const handleRecheckPending = async () => {
    if (!txHash || !preparedTxId || rechecking) return;
    setRechecking(true);
    try {
      const outcome = await pollTransactionReceipt(txHash, normalizedNetwork, 12000);
      if (outcome === 'pending') return;
      const { transaction, mutualTrustReceipt } = await verifyBlockchainReceipt({
        transactionId: preparedTxId,
        txHash,
        outcome,
      });
      if (mutualTrustReceipt) {
        setMutualReceipt(mutualTrustReceipt);
      }
      applyServerOutcome(transaction);
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

  // 1. RECIPIENT SEARCH, WALLET ADDRESS LOOKUP & RECEIVER PREVIEW
  if (step === 'scan') {
    const senderSimBalance = ensureSimulatedWalletBalance(wallet.address);

    return (
      <div className="ws-card" style={{ maxWidth: '720px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '10px' }}>
          <button type="button" className="auth-back-link" onClick={onBack}>
            <ArrowLeft size={15} /> Back to Payments
          </button>
          <span className="ws-badge">
            Available: {senderSimBalance.usdtBalance} USDT · {wallet.network}
          </span>
        </div>

        <p className="eyebrow" style={{ marginBottom: '8px' }}>
          SEND STABLECOIN · RECIPIENT SEARCH &amp; TRACK RECORD VERIFICATION
        </p>
        <h1 className="heading-lg" style={{ marginBottom: '10px' }}>
          Enter wallet address or search recipient.
        </h1>
        <p className="body-md" style={{ marginBottom: '20px' }}>
          Before sending stablecoin, enter the destination wallet address or search the recipient directory.
          Word displays the receiver&apos;s <strong>Name</strong>, <strong>Surname</strong>,{' '}
          <strong>Profile Image</strong>, and <strong>Track Record</strong> — and automatically adds
          passkey, dispute walkthrough, and cooling-off wait steps if the receiver has a bad score or disputes.
        </p>

        {/* Search & Wallet Address Input */}
        <div className="field-group" style={{ marginBottom: '14px' }}>
          <label className="field-label" htmlFor="recipient-search-input">
            Search recipient (Name, Surname) or paste Wallet Address (0x...)
          </label>
          <div style={{ position: 'relative' }}>
            <Search
              size={16}
              style={{
                position: 'absolute',
                left: '14px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--mute)',
              }}
            />
            <input
              id="recipient-search-input"
              type="text"
              className="field-input"
              style={{ paddingLeft: '38px' }}
              placeholder="Search e.g. Thabo, Lerato, Sipho, Vusi, Kabelo, or paste 0x..."
              value={recipientQuery}
              onChange={(e) => handleRecipientQueryChange(e.target.value)}
            />
          </div>
        </div>

        {/* Filter Pills by Risk Profile */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            flexWrap: 'wrap',
            marginBottom: '16px',
          }}
        >
          {(
            [
              { id: 'all', label: 'All Recipients' },
              { id: 'low', label: 'Clean Record (1 Step)' },
              { id: 'moderate', label: 'Moderate Caution (4 Steps)' },
              { id: 'high', label: 'Bad Track Record / High Disputes (5 Steps)' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              className="ws-ghost-btn"
              onClick={() => setRiskFilter(tab.id)}
              style={
                riskFilter === tab.id
                  ? {
                      backgroundColor: 'var(--ink)',
                      color: '#fff',
                      borderColor: 'var(--ink)',
                    }
                  : undefined
              }
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Recipient Directory Results */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            marginBottom: '20px',
            maxHeight: '280px',
            overflowY: 'auto',
            paddingRight: '4px',
          }}
        >
          {filteredDirectory.map((entry) => {
            const isSelected = entry.walletAddress.toLowerCase() === selectedRecipient.walletAddress.toLowerCase();
            const isHighRisk = entry.riskTier === 'high' || entry.riskTier === 'critical';
            const isModerate = entry.riskTier === 'moderate';
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => {
                  setSelectedRecipient(entry);
                  resetFrictionStates(entry);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '14px',
                  padding: '12px 14px',
                  borderRadius: '14px',
                  border: isSelected ? '2px solid var(--ink)' : '1px solid var(--line)',
                  backgroundColor: isSelected ? 'rgba(17, 17, 17, 0.04)' : 'var(--bg)',
                  textAlign: 'left',
                  cursor: 'pointer',
                  width: '100%',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                  <img
                    src={entry.avatarUrl}
                    alt={`${entry.firstName} ${entry.lastName}`}
                    style={{
                      width: '46px',
                      height: '46px',
                      borderRadius: '50%',
                      objectFit: 'cover',
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: '14.5px', color: 'var(--ink)' }}>
                        {entry.firstName} {entry.lastName}
                      </strong>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: '999px',
                          backgroundColor: isHighRisk
                            ? '#fef3f2'
                            : isModerate
                              ? '#fffaeb'
                              : '#ecfdf3',
                          color: isHighRisk ? '#b42318' : isModerate ? '#b54708' : '#027a48',
                          border: `1px solid ${
                            isHighRisk ? '#fecdca' : isModerate ? '#fedf89' : '#abefc6'
                          }`,
                        }}
                      >
                        Score {entry.trustScore}/100 · {entry.disputesRaisedCount} Dispute
                        {entry.disputesRaisedCount === 1 ? '' : 's'}
                      </span>
                    </div>
                    <p
                      className="body-sm"
                      style={{
                        fontSize: '12.5px',
                        color: 'var(--sub)',
                        marginTop: '2px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {entry.walletAddress.slice(0, 10)}...{entry.walletAddress.slice(-6)} ·{' '}
                      {entry.roleOrTag}
                    </p>
                  </div>
                </div>
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: isSelected ? 'var(--ink)' : 'var(--mute)',
                    flexShrink: 0,
                  }}
                >
                  {isSelected ? 'Selected' : 'Select'}
                </span>
              </button>
            );
          })}
        </div>

        {/* Receiver Identity Preview Card (Name, Surname, Image, Track Record) */}
        <div
          style={{
            border:
              selectedRecipient.riskTier === 'high' || selectedRecipient.riskTier === 'critical'
                ? '1.5px solid #f04438'
                : selectedRecipient.riskTier === 'moderate'
                  ? '1.5px solid #f79009'
                  : '1.5px solid var(--ink)',
            borderRadius: '16px',
            padding: '18px 20px',
            backgroundColor: 'var(--bg)',
            marginBottom: '20px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
            <p className="eyebrow" style={{ margin: 0 }}>
              RECEIVER PROFILE &amp; TRACK RECORD PREVIEW
            </p>
            <span
              style={{
                fontSize: '11.5px',
                fontWeight: 700,
                padding: '3px 10px',
                borderRadius: '999px',
                backgroundColor:
                  frictionPolicy.frictionLevel === 'maximum'
                    ? '#fef3f2'
                    : frictionPolicy.frictionLevel === 'elevated'
                      ? '#fffaeb'
                      : '#ecfdf3',
                color:
                  frictionPolicy.frictionLevel === 'maximum'
                    ? '#b42318'
                    : frictionPolicy.frictionLevel === 'elevated'
                      ? '#b54708'
                      : '#027a48',
              }}
            >
              {frictionPolicy.requiredStepsCount} Verification Step
              {frictionPolicy.requiredStepsCount > 1 ? 's' : ''} Required ({frictionPolicy.frictionLevel.toUpperCase()} FRICTION)
            </span>
          </div>

          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '14px' }}>
            <img
              src={selectedRecipient.avatarUrl}
              alt={`${selectedRecipient.firstName} ${selectedRecipient.lastName}`}
              style={{
                width: '68px',
                height: '68px',
                borderRadius: '50%',
                objectFit: 'cover',
                border: '2px solid var(--line)',
              }}
            />
            <div style={{ flex: 1, minWidth: '200px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', marginBottom: '8px' }}>
                <div>
                  <span className="body-sm" style={{ fontSize: '11.5px', color: 'var(--mute)', display: 'block' }}>
                    Receiver Name
                  </span>
                  <strong style={{ fontSize: '16px', color: 'var(--ink)' }}>
                    {selectedRecipient.firstName}
                  </strong>
                </div>
                <div>
                  <span className="body-sm" style={{ fontSize: '11.5px', color: 'var(--mute)', display: 'block' }}>
                    Receiver Surname
                  </span>
                  <strong style={{ fontSize: '16px', color: 'var(--ink)' }}>
                    {selectedRecipient.lastName}
                  </strong>
                </div>
                <div>
                  <span className="body-sm" style={{ fontSize: '11.5px', color: 'var(--mute)', display: 'block' }}>
                    Track Record Score
                  </span>
                  <strong
                    style={{
                      fontSize: '16px',
                      color:
                        selectedRecipient.trustScore < 45
                          ? '#b42318'
                          : selectedRecipient.trustScore < 75
                            ? '#b54708'
                            : '#1a8f4d',
                    }}
                  >
                    {selectedRecipient.trustScore}/100 ({selectedRecipient.disputesRaisedCount} disputes)
                  </strong>
                </div>
              </div>
              <p className="body-sm" style={{ wordBreak: 'break-all', fontSize: '12.5px' }}>
                <strong>Wallet Address:</strong> {selectedRecipient.walletAddress}
              </p>
            </div>
          </div>

          <p className="body-sm" style={{ marginBottom: '14px' }}>
            {selectedRecipient.trackRecordSummary}
          </p>

          {/* Amount & Purpose Inputs */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '12px',
              paddingTop: '12px',
              borderTop: '1px solid var(--line)',
            }}
          >
            <div className="field-group">
              <label className="field-label" htmlFor="send-usdt-amount">
                Amount to send (USDT)
              </label>
              <input
                id="send-usdt-amount"
                type="number"
                step="0.01"
                min="1"
                className="field-input"
                value={sendAmount}
                onChange={(e) => setSendAmount(e.target.value)}
              />
            </div>
            <div className="field-group">
              <label className="field-label" htmlFor="send-usdt-purpose">
                Payment reference / purpose
              </label>
              <input
                id="send-usdt-purpose"
                type="text"
                className="field-input"
                value={sendPurpose}
                onChange={(e) => setSendPurpose(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="ws-actions-row" style={{ marginBottom: '18px' }}>
          <Button
            onClick={() => {
              resetFrictionStates(selectedRecipient);
              onPushLiveNotification?.({
                title: `Inspecting Receiver: ${selectedRecipient.firstName} ${selectedRecipient.lastName}`,
                detail: `${frictionPolicy.requiredStepsCount} verification step(s) loaded for ${selectedRecipient.fullName} (Score ${selectedRecipient.trustScore}/100 · ${selectedRecipient.disputesRaisedCount} disputes).`,
                category: 'Verification',
              });
              setStep('recipient_friction');
            }}
          >
            Confirm Receiver ({selectedRecipient.firstName} {selectedRecipient.lastName}) &amp; Continue{' '}
            <ArrowRight size={14} />
          </Button>
        </div>

        {/* Collapsible QR / Share Code Scanner for WRD-... payment links */}
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: '14px' }}>
          <button
            type="button"
            className="ws-ghost-btn"
            onClick={() => setShowQrScannerSection((v) => !v)}
          >
            <QrCode size={14} />{' '}
            {showQrScannerSection
              ? 'Hide QR code & WRD-... link scanner'
              : 'Or scan QR code / paste WRD-... payment request link'}
          </button>

          {showQrScannerSection && (
            <div style={{ marginTop: '16px' }}>
              <div
                style={{
                  height: '150px',
                  borderRadius: '14px',
                  border: '1px dashed #b8b8b2',
                  backgroundColor: 'var(--bg)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  marginBottom: '16px',
                  color: 'var(--sub)',
                }}
              >
                <QrCode size={34} strokeWidth={1.4} />
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
                    Paste payment request link or code
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
          )}
        </div>
      </div>
    );
  }

  // 1.5 ADAPTIVE RISK-BASED FRICTION PIPELINE (BEFORE SENDING STABLECOIN)
  if (step === 'recipient_friction') {
    const isHighRisk =
      selectedRecipient.riskTier === 'high' || selectedRecipient.riskTier === 'critical';
    const isModerateRisk = selectedRecipient.riskTier === 'moderate';

    const handleVerifyPasskeyClick = async (useBiometric: boolean) => {
      setPasskeyVerifying(true);
      setPasskeyError(null);
      try {
        const receipt = await verifySenderPasskey({
          passkeyPin: passkeyInput,
          useBiometricWebAuthn: useBiometric,
          userEmail,
        });
        setPasskeyReceipt(receipt);
        onPushLiveNotification?.({
          title: 'Sender Passkey Verified',
          detail: `Identity confirmed via ${
            receipt.method === 'webauthn-biometric'
              ? 'Biometric WebAuthn Passkey'
              : 'Word Security Passkey'
          } (${receipt.credentialId}).`,
          category: 'Security',
        });
      } catch (err) {
        setPasskeyError(err instanceof Error ? err.message : 'Passkey verification failed.');
      } finally {
        setPasskeyVerifying(false);
      }
    };

    const allDisputesChecked =
      selectedRecipient.disputes.length === 0 ||
      selectedRecipient.disputes.every((d) => reviewedDisputeIds[d.id]);

    const canSendNow =
      identityConfirmed &&
      (!frictionPolicy.requiresDisputeWalkthrough || disputesWalkedThrough) &&
      (!frictionPolicy.requiresAreYouSurePrompt || areYouSureConfirmed) &&
      (!frictionPolicy.requiresPasskeyVerification || Boolean(passkeyReceipt)) &&
      waitRemainingSeconds <= 0;

    return (
      <div className="ws-card" style={{ maxWidth: '720px' }}>
        <div style={{ marginBottom: '16px' }}>
          <button type="button" className="auth-back-link" onClick={() => setStep('scan')}>
            <ArrowLeft size={15} /> Back to Recipient Search
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '8px' }}>
          <p className="eyebrow" style={{ margin: 0 }}>
            PRE-SEND VERIFICATION · {frictionPolicy.frictionLevel.toUpperCase()} FRICTION PROFILE
          </p>
          <span className="ws-badge">
            {frictionPolicy.requiredStepsCount} Verification Step
            {frictionPolicy.requiredStepsCount > 1 ? 's' : ''}
          </span>
        </div>

        <h1 className="heading-lg" style={{ marginBottom: '8px' }}>
          {isHighRisk
            ? `High-Risk Receiver Friction (${selectedRecipient.firstName} ${selectedRecipient.lastName})`
            : isModerateRisk
              ? `Elevated Caution Verification (${selectedRecipient.firstName} ${selectedRecipient.lastName})`
              : `Confirm Receiver (${selectedRecipient.firstName} ${selectedRecipient.lastName})`}
        </h1>

        <div
          className="ws-notice"
          style={{
            marginBottom: '20px',
            borderColor: isHighRisk ? '#f04438' : isModerateRisk ? '#f79009' : '#abefc6',
            backgroundColor: isHighRisk ? '#fef3f2' : isModerateRisk ? '#fffaeb' : '#ecfdf3',
            color: isHighRisk ? '#912018' : isModerateRisk ? '#93370d' : '#027a48',
          }}
        >
          <strong>Risk-Adaptive Policy:</strong> {frictionPolicy.reasonBanner}
        </div>

        {/* STEP 1: CONFIRM RECEIVER NAME, SURNAME & IMAGE */}
        <div
          style={{
            border: '1px solid var(--line)',
            borderRadius: '14px',
            padding: '18px 20px',
            marginBottom: '18px',
            backgroundColor: 'var(--bg)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
            <strong style={{ fontSize: '14.5px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <UserCheck size={17} /> Step 1 · Confirm Receiver Info (Name, Surname &amp; Image)
            </strong>
            {identityConfirmed && (
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#1a8f4d' }}>
                ✓ Receiver Confirmed
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '14px' }}>
            <img
              src={selectedRecipient.avatarUrl}
              alt={`${selectedRecipient.firstName} ${selectedRecipient.lastName}`}
              style={{
                width: '72px',
                height: '72px',
                borderRadius: '50%',
                objectFit: 'cover',
                border: '2px solid var(--ink)',
              }}
            />
            <div style={{ flex: 1, minWidth: '200px' }}>
              <div className="record-row" style={{ padding: '4px 0' }}>
                <span className="record-key">Name</span>
                <span className="record-val">{selectedRecipient.firstName}</span>
              </div>
              <div className="record-row" style={{ padding: '4px 0' }}>
                <span className="record-key">Surname</span>
                <span className="record-val">{selectedRecipient.lastName}</span>
              </div>
              <div className="record-row" style={{ padding: '4px 0' }}>
                <span className="record-key">Wallet Address</span>
                <span className="record-val" style={{ wordBreak: 'break-all' }}>
                  {selectedRecipient.walletAddress}
                </span>
              </div>
              <div className="record-row" style={{ padding: '4px 0' }}>
                <span className="record-key">Amount to Send</span>
                <span className="record-val">{sendAmount} USDT</span>
              </div>
            </div>
          </div>

          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              padding: '12px 14px',
              borderRadius: '10px',
              border: '1px solid var(--line)',
              backgroundColor: 'var(--surface)',
              cursor: 'pointer',
              fontSize: '13.5px',
            }}
          >
            <input
              type="checkbox"
              checked={identityConfirmed}
              onChange={(e) => {
                const checked = e.target.checked;
                setIdentityConfirmed(checked);
                if (checked) {
                  onPushLiveNotification?.({
                    title: 'Receiver Identity Confirmed',
                    detail: `Sender confirmed Name (${selectedRecipient.firstName}), Surname (${selectedRecipient.lastName}), and Image for ${selectedRecipient.walletAddress.slice(0, 10)}...`,
                    category: 'Verification',
                  });
                }
              }}
              style={{ marginTop: '3px', width: '16px', height: '16px' }}
            />
            <span>
              I have verified the receiver&apos;s <strong>Name ({selectedRecipient.firstName})</strong>,{' '}
              <strong>Surname ({selectedRecipient.lastName})</strong>, <strong>Profile Image</strong>,
              and destination wallet address.
            </span>
          </label>
        </div>

        {/* STEP 2: WALKTHROUGH OF RECEIVER RECORDS & DISPUTES RAISED */}
        {frictionPolicy.requiresDisputeWalkthrough && (
          <div
            style={{
              border: '1px solid #fecdca',
              borderRadius: '14px',
              padding: '18px 20px',
              marginBottom: '18px',
              backgroundColor: '#fffbfa',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
              <strong style={{ fontSize: '14.5px', color: '#b42318', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <ShieldAlert size={17} /> Step 2 · Receiver Track Record &amp; Disputes Raised (
                {selectedRecipient.disputesRaisedCount})
              </strong>
              {disputesWalkedThrough && (
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#1a8f4d' }}>
                  ✓ Records &amp; Disputes Reviewed
                </span>
              )}
            </div>

            <p className="body-sm" style={{ marginBottom: '12px', color: '#7a271a' }}>
              Before sending stablecoin to {selectedRecipient.firstName} {selectedRecipient.lastName},
              review their transaction history and inspect every dispute raised against this wallet:
            </p>

            {/* Receiver Past Transactions Summary */}
            <div style={{ marginBottom: '14px' }}>
              <p className="eyebrow" style={{ marginBottom: '6px' }}>
                RECENT RECEIVER TRACK RECORD ({selectedRecipient.completedTransactions} COMPLETED ·{' '}
                {selectedRecipient.disputesRaisedCount} DISPUTED)
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {selectedRecipient.pastRecords.map((rec) => (
                  <div
                    key={rec.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '12.5px',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      backgroundColor: '#fff',
                      border: '1px solid var(--line)',
                      gap: '8px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span>
                      <strong>{rec.amount}</strong> · {rec.purpose} ({rec.date})
                    </span>
                    <span
                      style={{
                        fontWeight: 600,
                        color: rec.outcome === 'Disputed' ? '#b42318' : '#027a48',
                      }}
                    >
                      {rec.outcome}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Disputes Raised List */}
            <p className="eyebrow" style={{ marginBottom: '8px', color: '#b42318' }}>
              DISPUTES RAISED AGAINST {selectedRecipient.firstName.toUpperCase()}{' '}
              {selectedRecipient.lastName.toUpperCase()} ({selectedRecipient.disputes.length})
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
              {selectedRecipient.disputes.map((disp) => {
                const isReviewed = Boolean(reviewedDisputeIds[disp.id]);
                return (
                  <div
                    key={disp.id}
                    style={{
                      padding: '12px 14px',
                      borderRadius: '10px',
                      backgroundColor: '#fff',
                      border: isReviewed ? '1.5px solid #1a8f4d' : '1px solid #fecdca',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                      <strong style={{ fontSize: '13.5px', color: '#912018' }}>
                        {disp.caseRef} · {disp.reason} ({disp.amount})
                      </strong>
                      <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#b42318' }}>
                        {disp.status} · Filed {disp.filedAt}
                      </span>
                    </div>
                    <p className="body-sm" style={{ fontSize: '12.5px', marginBottom: '8px' }}>
                      {disp.summary}
                    </p>
                    <button
                      type="button"
                      className="ws-ghost-btn"
                      onClick={() => {
                        const next = { ...reviewedDisputeIds, [disp.id]: true };
                        setReviewedDisputeIds(next);
                        if (selectedRecipient.disputes.every((d) => next[d.id])) {
                          setDisputesWalkedThrough(true);
                          onPushLiveNotification?.({
                            title: 'Receiver Dispute Records Walked Through',
                            detail: `All ${selectedRecipient.disputes.length} dispute record(s) for ${selectedRecipient.fullName} have been inspected.`,
                            category: 'Security',
                          });
                        }
                      }}
                      style={{ fontSize: '12px', padding: '5px 10px' }}
                    >
                      {isReviewed ? '✓ Dispute Record Inspected' : 'Mark Dispute Inspected'}
                    </button>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              className="ws-ghost-btn"
              onClick={() => {
                const allMap: Record<string, boolean> = {};
                for (const d of selectedRecipient.disputes) {
                  allMap[d.id] = true;
                }
                setReviewedDisputeIds(allMap);
                setDisputesWalkedThrough(true);
                onPushLiveNotification?.({
                  title: 'Receiver Dispute Records Acknowledged',
                  detail: `Sender reviewed all ${selectedRecipient.disputesRaisedCount} disputes raised against ${selectedRecipient.fullName}.`,
                  category: 'Security',
                });
              }}
              style={{
                width: '100%',
                justifyContent: 'center',
                borderColor: disputesWalkedThrough && allDisputesChecked ? '#1a8f4d' : '#b42318',
                color: disputesWalkedThrough && allDisputesChecked ? '#1a8f4d' : '#b42318',
                fontWeight: 600,
              }}
            >
              {disputesWalkedThrough
                ? `✓ All ${selectedRecipient.disputes.length} Dispute Record(s) Reviewed`
                : `Acknowledge All ${selectedRecipient.disputes.length} Dispute Record(s) & Past History`}
            </button>
          </div>
        )}

        {/* STEP 3: "ARE YOU SURE?" EXPLICIT CONFIRMATION */}
        {frictionPolicy.requiresAreYouSurePrompt && (
          <div
            style={{
              border: '1px solid #fedf89',
              borderRadius: '14px',
              padding: '18px 20px',
              marginBottom: '18px',
              backgroundColor: '#fffaeb',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
              <strong style={{ fontSize: '14.5px', color: '#93370d', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={17} /> Step 3 · Are You Sure You Want to Send?
              </strong>
              {areYouSureConfirmed && (
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#1a8f4d' }}>
                  ✓ Confirmed Intention
                </span>
              )}
            </div>
            <p className="body-sm" style={{ color: '#7a2e0e', marginBottom: '12px' }}>
              <strong>{selectedRecipient.firstName} {selectedRecipient.lastName}</strong> has a trust
              score of <strong>{selectedRecipient.trustScore}/100</strong> and{' '}
              <strong>{selectedRecipient.disputesRaisedCount} dispute(s)</strong> on record. Stablecoin
              transfers cannot be reversed once settled. Are you sure you still want to send{' '}
              <strong>{sendAmount} USDT</strong>?
            </p>
            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                padding: '12px 14px',
                borderRadius: '10px',
                backgroundColor: '#fff',
                border: '1px solid #fedf89',
                cursor: 'pointer',
                fontSize: '13.5px',
                color: '#7a2e0e',
              }}
            >
              <input
                type="checkbox"
                checked={areYouSureConfirmed}
                onChange={(e) => setAreYouSureConfirmed(e.target.checked)}
                style={{ marginTop: '3px', width: '16px', height: '16px' }}
              />
              <span>
                <strong>Yes, I am sure.</strong> I have reviewed {selectedRecipient.firstName}{' '}
                {selectedRecipient.lastName}&apos;s track record and deliberately choose to proceed at
                my own risk.
              </span>
            </label>
          </div>
        )}

        {/* STEP 4: PASSKEY VERIFICATION (FOR BAD SCORE / HIGH DISPUTES) */}
        {frictionPolicy.requiresPasskeyVerification && (
          <div
            style={{
              border: '1px solid var(--line)',
              borderRadius: '14px',
              padding: '18px 20px',
              marginBottom: '18px',
              backgroundColor: 'var(--bg)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
              <strong style={{ fontSize: '14.5px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <KeyRound size={17} /> Step 4 · Passkey Verification (Verify That It Is You)
              </strong>
              {passkeyReceipt && (
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#1a8f4d' }}>
                  ✓ Passkey Verified ({passkeyReceipt.credentialId})
                </span>
              )}
            </div>
            <p className="body-sm" style={{ marginBottom: '12px' }}>
              Because this receiver has a bad track record ({selectedRecipient.disputesRaisedCount}{' '}
              disputes), Word requires a <strong>Passkey check</strong> to verify that you are the
              legitimate wallet owner authorizing this transfer.
            </p>

            {!passkeyReceipt ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div className="field-group" style={{ flex: 1, minWidth: '200px' }}>
                    <label className="field-label" htmlFor="sender-passkey-input">
                      Word Security Passkey
                    </label>
                    <input
                      id="sender-passkey-input"
                      type="password"
                      className="field-input"
                      placeholder="Enter passkey (e.g. WORD-2026)"
                      value={passkeyInput}
                      onChange={(e) => setPasskeyInput(e.target.value)}
                    />
                  </div>
                  <Button
                    compact
                    disabled={passkeyVerifying}
                    onClick={() => handleVerifyPasskeyClick(false)}
                  >
                    <KeyRound size={14} />{' '}
                    {passkeyVerifying ? 'Verifying...' : 'Verify Security Passkey'}
                  </Button>
                  <button
                    type="button"
                    className="ws-ghost-btn"
                    disabled={passkeyVerifying}
                    onClick={() => handleVerifyPasskeyClick(true)}
                  >
                    <Fingerprint size={14} /> Biometric WebAuthn Passkey
                  </button>
                </div>
                {passkeyError && (
                  <p role="alert" className="body-sm" style={{ color: '#b42318' }}>
                    {passkeyError}
                  </p>
                )}
              </div>
            ) : (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: '10px',
                  backgroundColor: '#ecfdf3',
                  border: '1px solid #abefc6',
                  color: '#027a48',
                  fontSize: '13px',
                }}
              >
                <strong>Passkey authenticated:</strong> Owner verified via{' '}
                {passkeyReceipt.method === 'webauthn-biometric'
                  ? 'WebAuthn Biometric Passkey'
                  : 'Word Security Passkey'}{' '}
                at {new Date(passkeyReceipt.verifiedAt).toLocaleTimeString()}.
              </div>
            )}
          </div>
        )}

        {/* STEP 5: MANDATORY EXTRA COOLING-OFF WAIT TIMER */}
        {frictionPolicy.extraWaitSeconds > 0 && (
          <div
            style={{
              border: '1px solid var(--line)',
              borderRadius: '14px',
              padding: '18px 20px',
              marginBottom: '22px',
              backgroundColor: 'var(--bg)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
              <strong style={{ fontSize: '14.5px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <Timer size={17} /> Step {frictionPolicy.requiresPasskeyVerification ? '5' : '4'} ·
                Mandatory Cooling-Off Delay ({frictionPolicy.extraWaitSeconds}s Extra Wait)
              </strong>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  color: waitRemainingSeconds === 0 ? '#1a8f4d' : '#b54708',
                }}
              >
                {waitRemainingSeconds === 0
                  ? '✓ Wait Complete — Unlocked'
                  : `Waiting ${waitRemainingSeconds}s...`}
              </span>
            </div>
            <p className="body-sm" style={{ marginBottom: '10px' }}>
              {waitRemainingSeconds > 0
                ? waitStarted
                  ? `Please wait ${waitRemainingSeconds} more second(s) before the Send Stablecoin button unlocks. You can cancel at any time if you change your mind.`
                  : 'Complete the verification steps above to start the mandatory cooling-off countdown.'
                : 'The mandatory cooling-off wait has elapsed. You may now send the stablecoin transfer if you still wish to proceed.'}
            </p>
            <div
              style={{
                width: '100%',
                height: '8px',
                borderRadius: '999px',
                backgroundColor: 'var(--line)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${
                    ((frictionPolicy.extraWaitSeconds - waitRemainingSeconds) /
                      Math.max(1, frictionPolicy.extraWaitSeconds)) *
                    100
                  }%`,
                  backgroundColor: waitRemainingSeconds === 0 ? '#1a8f4d' : '#d97706',
                  transition: 'width 0.4s ease',
                }}
              />
            </div>
          </div>
        )}

        <div className="ws-actions-row">
          <button type="button" className="ws-ghost-btn" onClick={() => setStep('scan')}>
            Cancel &amp; Do Not Send
          </button>
          <Button
            disabled={!canSendNow}
            style={!canSendNow ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
            onClick={handleExecuteSimulatedStablecoinSend}
          >
            <Send size={14} />{' '}
            {waitRemainingSeconds > 0 && waitStarted
              ? `Wait ${waitRemainingSeconds}s to Send ${sendAmount} USDT`
              : `Send ${sendAmount} USDT to ${selectedRecipient.firstName} ${selectedRecipient.lastName}`}
          </Button>
        </div>
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
          <Button
            disabled={Boolean(invalidReason)}
            onClick={() => {
              const matched = lookupRecipientByAddressOrQuery(request.recipientAddress);
              if (matched) {
                setSelectedRecipient(matched);
                setSendAmount(request.amount);
                setSendPurpose(request.description);
                resetFrictionStates(matched);
              }
              setStep('verify');
            }}
          >
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
                  {f.label} · {indicatorLabel} ({f.pointsAwarded}/{f.weight} pts ·{' '}
                  {f.category.replace('_', ' ')})
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
            <strong>Strong warning before proceeding:</strong> Serious risk indicators or confirmed
            mismatches were detected. Blockchain transfers are irreversible—stop and resolve these
            issues before signing.
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
              I have reviewed the {riskReport?.classificationLabel ?? level} risk warnings ({score}
              /100) and understand that proceeding carries the risks explained above.
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
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                fontSize: '12.5px',
                color: 'var(--sub)',
              }}
            >
              {riskAuditTrail.slice(0, 5).map((item) => (
                <div
                  key={item.id}
                  style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}
                >
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
          Confirm the recipient, amount, token, network, expiry, and estimated fee before
          authorising.
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
              {quoteLoading
                ? 'Calculating...'
                : quote?.totalCostDisplay ?? `${request.amount} ${request.token}`}
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

        {(quoteError || (quote && !quote.hasSufficientBalance) || mutualInitError) && (
          <div
            className="ws-notice"
            style={{
              marginBottom: '18px',
              borderColor: '#fecdca',
              backgroundColor: '#fef3f2',
              color: '#b42318',
            }}
          >
            <strong>Cannot proceed:</strong>{' '}
            {mutualInitError || quoteError || quote?.insufficientReason}
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
              mutualStarting ||
              Boolean(quoteError) ||
              (quote ? !quote.hasSufficientBalance : false)
            }
            onClick={async () => {
              setApprovedChecked(false);
              setMutualInitError(null);
              if (!userId || mutualSession?.session.session_state === 'authorized') {
                setStep('approve');
                return;
              }
              setMutualStarting(true);
              try {
                const isUuid =
                  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                    request.id
                  );
                const created = await createOrJoinMutualTrustSession({
                  paymentRequestId: isUuid ? request.id : undefined,
                  shareCode: !isUuid && request.shareCode ? request.shareCode : undefined,
                  recipientAddress: request.recipientAddress,
                  senderWalletAddress: wallet.address,
                  amount: request.amount,
                  tokenSymbol: request.token,
                  network: normalizedNetwork,
                  purpose: request.description,
                });
                setMutualSession(created);
                setStep(
                  created.session.session_state === 'authorized' ? 'approve' : 'mutual_trust'
                );
              } catch (err) {
                setMutualInitError(
                  err instanceof Error
                    ? err.message
                    : 'Unable to start Mutual Trust Verification session.'
                );
              } finally {
                setMutualStarting(false);
              }
            }}
          >
            {mutualStarting
              ? 'Starting Mutual Trust Verification...'
              : 'Proceed to Mutual Trust & Approval'}{' '}
            <ArrowRight size={14} />
          </Button>
        </div>
      </div>
    );
  }

  // 5.5 MUTUAL TRUST VERIFICATION & BILATERAL SIGNATURES
  if (step === 'mutual_trust' && userId) {
    return (
      <MutualTrustFlow
        userId={userId}
        wallet={wallet}
        initialSession={mutualSession}
        sessionId={mutualSession?.session.id ?? null}
        onBack={() => setStep('review')}
        onReadyToExecute={(authorizedSession) => {
          setMutualSession(authorizedSession);
          setApprovedChecked(false);
          setStep('approve');
        }}
      />
    );
  }

  // 6. TRANSACTION APPROVAL SCREEN
  if (step === 'approve') {
    const mutualAuthorized =
      !userId || mutualSession?.session.session_state === 'authorized';
    return (
      <div className="ws-card" style={{ maxWidth: '640px' }}>
        <p className="eyebrow" style={{ marginBottom: '8px' }}>
          TRANSACTION APPROVAL
        </p>
        <h1 className="heading-lg" style={{ marginBottom: '10px' }}>
          Authorise {request.amount} {request.token}
        </h1>
        <p className="body-md" style={{ marginBottom: '20px' }}>
          Word never submits payments without bilateral Mutual Trust verification and your explicit
          approval. Once confirmed on-chain, blockchain transfers cannot be reversed.
        </p>

        {userId && (
          <div
            className="ws-notice"
            style={{
              marginBottom: '18px',
              borderColor: mutualAuthorized ? 'var(--ink)' : '#d97706',
              backgroundColor: mutualAuthorized
                ? 'rgba(17, 17, 17, 0.04)'
                : 'rgba(217, 119, 6, 0.08)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 10,
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <div>
                <strong>
                  {mutualAuthorized
                    ? 'Mutual Trust Authorized (Both Parties Signed EIP-712)'
                    : 'Mutual Trust Verification Required'}
                </strong>
                {mutualSession && (
                  <div style={{ fontSize: 12, marginTop: 4 }}>
                    Canonical Hash:{' '}
                    <code>{mutualSession.session.canonical_tx_hash.slice(0, 18)}...</code>
                  </div>
                )}
              </div>
              {!mutualAuthorized && (
                <button
                  type="button"
                  className="ws-ghost-btn"
                  onClick={() => setStep('mutual_trust')}
                >
                  Open Mutual Trust Flow
                </button>
              )}
            </div>
          </div>
        )}

        {riskReport &&
          (riskReport.riskLevel === 'high' || riskReport.riskLevel === 'critical') && (
            <div
              className="ws-notice"
              style={{
                marginBottom: '18px',
                borderColor: '#f04438',
                backgroundColor: '#fef3f2',
                color: '#912018',
              }}
            >
              <strong>
                Strong warning ({riskReport.classificationLabel} · {riskReport.riskScore}/100):
              </strong>{' '}
              {riskReport.classificationMeaning}. Only sign this transaction if you have
              independently resolved the flagged risks.
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
            {request.token}), gas fee ({quote?.estimatedFeeNative ?? 'estimated'}), and network (
            {normalizedNetwork}).
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
            Your connected browser wallet will prompt you to sign this {normalizedNetwork}{' '}
            transaction.
          </div>
        )}

        <div className="ws-actions-row">
          <button type="button" className="auth-back-link" onClick={() => setStep('review')}>
            <ArrowLeft size={15} /> Back to review
          </button>
          <Button
            disabled={
              !approvedChecked ||
              !mutualAuthorized ||
              submittingRef.current ||
              (wallet.method !== 'connected' && signingPhrase.trim().split(/\s+/).length < 12)
            }
            style={
              !approvedChecked ||
              !mutualAuthorized ||
              (wallet.method !== 'connected' && signingPhrase.trim().split(/\s+/).length < 12)
                ? { opacity: 0.5, cursor: 'not-allowed' }
                : undefined
            }
            onClick={() => {
              setIsSimulatedDirectSend(false);
              setStep('processing');
            }}
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
            : `Preparing and signing ${request.amount} ${request.token} to ${request.recipientName} on ${normalizedNetwork}.`}
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
        <p className="body-md" style={{ marginBottom: '18px' }}>
          Your stablecoin settlement to <strong>{request.recipientName}</strong> (
          {request.description}) has been verified and saved to your workspace history with live
          notifications.
        </p>

        {/* Receiver Summary on Success */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            padding: '14px 16px',
            borderRadius: '14px',
            border: '1px solid var(--line)',
            backgroundColor: 'var(--bg)',
            marginBottom: '18px',
          }}
        >
          <img
            src={selectedRecipient.avatarUrl}
            alt={selectedRecipient.fullName}
            style={{ width: '52px', height: '52px', borderRadius: '50%', objectFit: 'cover' }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong style={{ fontSize: '15px', display: 'block' }}>
              Receiver: {selectedRecipient.firstName} {selectedRecipient.lastName}
            </strong>
            <span className="body-sm" style={{ fontSize: '12.5px', wordBreak: 'break-all' }}>
              {request.recipientAddress}
            </span>
          </div>
          {simulatedSettlementSummary && (
            <div style={{ textAlign: 'right' }}>
              <span className="body-sm" style={{ fontSize: '11.5px', color: 'var(--mute)', display: 'block' }}>
                New Wallet Balance
              </span>
              <strong style={{ fontSize: '14.5px', color: '#1a8f4d' }}>
                {simulatedSettlementSummary.newUsdtBalance} USDT
              </strong>
            </div>
          )}
        </div>

        {simulatedSettlementSummary && (
          <div
            style={{
              padding: '14px 16px',
              borderRadius: '12px',
              border: '1px solid var(--line)',
              marginBottom: '18px',
            }}
          >
            <p className="eyebrow" style={{ marginBottom: '8px' }}>
              VERIFICATION STEPS COMPLETED ({simulatedSettlementSummary.frictionStepsCompleted.length})
            </p>
            <ul style={{ margin: '0 0 0 18px', padding: 0, fontSize: '13px' }}>
              {simulatedSettlementSummary.frictionStepsCompleted.map((label, i) => (
                <li key={i} style={{ marginBottom: '4px', color: '#1a8f4d' }}>
                  {label}
                </li>
              ))}
            </ul>
          </div>
        )}

        {txHash && (
          <div
            className="ws-notice"
            style={{
              marginBottom: '22px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px',
              flexWrap: 'wrap',
            }}
          >
            <span>
              <strong>Tx Hash:</strong> {txHash.slice(0, 10)}...{txHash.slice(-8)} ·{' '}
              {normalizedNetwork}
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

        {mutualReceipt && (
          <div style={{ marginBottom: '22px' }}>
            <MutualTrustReceiptView receipt={mutualReceipt} />
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
          <div
            className="ws-notice"
            style={{
              marginBottom: '22px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px',
              flexWrap: 'wrap',
            }}
          >
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
