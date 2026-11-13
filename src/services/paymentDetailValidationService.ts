import { parseUnits } from 'ethers';

const TOKEN_DECIMALS: Record<string, number> = {
  USDT: 6,
  USDC: 6,
  ETH: 18,
  WETH: 18,
};

export type DiscrepancyField =
  | 'recipient'
  | 'amount'
  | 'token'
  | 'network'
  | 'expiry'
  | 'already_paid'
  | 'destination_changed'
  | 'status';

export interface PaymentDiscrepancy {
  field: DiscrepancyField;
  severity: 'error' | 'warning';
  title: string;
  requestedValue: string;
  actualValue: string;
  message: string;
}

export interface RequestedPaymentDetails {
  recipientAddress: string;
  recipientName?: string;
  amount: string;
  token: string;
  network: string;
  expiresAt?: string | null;
  status?: 'open' | 'completed' | 'cancelled' | 'expired';
  /** Authoritative destination recorded on the server/request creator side */
  authoritativeDestinationAddress?: string;
}

export interface IntendedPaymentDetails {
  expectedRecipientAddress?: string;
  expectedAmount?: string;
  expectedToken?: string;
  expectedNetwork?: string;
}

export interface PaymentDetailValidationReport {
  valid: boolean;
  discrepancies: PaymentDiscrepancy[];
  checks: {
    recipientMatches: boolean;
    amountMatches: boolean;
    tokenMatches: boolean;
    networkMatches: boolean;
    notExpired: boolean;
    notAlreadyPaid: boolean;
    destinationUnchanged: boolean;
  };
}

function normalizeNetworkName(network: string): string {
  const trimmed = network.trim();
  if (trimmed === 'Testnet (Sepolia)') return 'Testnet';
  return trimmed;
}

function toAtomicExact(rawAmount: string, tokenSymbol: string): bigint | null {
  const cleaned = rawAmount.trim();
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const decimals = TOKEN_DECIMALS[tokenSymbol.toUpperCase()] ?? 6;
  const [, frac = ''] = cleaned.split('.');
  if (frac.length > decimals) return null;
  try {
    const val = parseUnits(cleaned, decimals);
    return val > 0n ? val : null;
  } catch {
    return null;
  }
}

export function validatePaymentDetails(params: {
  requested: RequestedPaymentDetails;
  intended?: IntendedPaymentDetails;
  alreadyPaid?: boolean;
  existingTxStatus?: string | null;
  nowMs?: number;
}): PaymentDetailValidationReport {
  const { requested, intended = {}, alreadyPaid = false, existingTxStatus = null } = params;
  const nowMs = params.nowMs ?? Date.now();
  const discrepancies: PaymentDiscrepancy[] = [];

  const reqToken = requested.token.trim().toUpperCase();
  const reqNet = normalizeNetworkName(requested.network);
  const reqAddr = requested.recipientAddress.trim();

  // 1. Detect changed destination details compared to authoritative record
  let destinationUnchanged = true;
  if (
    requested.authoritativeDestinationAddress &&
    requested.authoritativeDestinationAddress.trim().toLowerCase() !== reqAddr.toLowerCase()
  ) {
    destinationUnchanged = false;
    discrepancies.push({
      field: 'destination_changed',
      severity: 'error',
      title: 'Destination address changed',
      requestedValue: requested.authoritativeDestinationAddress.trim(),
      actualValue: reqAddr,
      message:
        'The destination wallet address differs from the authoritative payment request record.',
    });
  }

  // 2. Compare requested and actual/intended recipient
  let recipientMatches = true;
  if (intended.expectedRecipientAddress && intended.expectedRecipientAddress.trim()) {
    const expAddr = intended.expectedRecipientAddress.trim();
    if (expAddr.toLowerCase() !== reqAddr.toLowerCase()) {
      recipientMatches = false;
      discrepancies.push({
        field: 'recipient',
        severity: 'error',
        title: 'Recipient address mismatch',
        requestedValue: reqAddr,
        actualValue: expAddr,
        message: `Requested recipient (${reqAddr}) does not match your intended recipient (${expAddr}).`,
      });
    }
  }

  // 3. Compare token
  let tokenMatches = true;
  if (intended.expectedToken && intended.expectedToken.trim()) {
    const expToken = intended.expectedToken.trim().toUpperCase();
    if (expToken !== reqToken) {
      tokenMatches = false;
      discrepancies.push({
        field: 'token',
        severity: 'error',
        title: 'Token mismatch',
        requestedValue: reqToken,
        actualValue: expToken,
        message: `Requested token (${reqToken}) does not match your intended token (${expToken}).`,
      });
    }
  }

  // 4. Compare network
  let networkMatches = true;
  if (intended.expectedNetwork && intended.expectedNetwork.trim()) {
    const expNet = normalizeNetworkName(intended.expectedNetwork);
    if (expNet.toLowerCase() !== reqNet.toLowerCase()) {
      networkMatches = false;
      discrepancies.push({
        field: 'network',
        severity: 'error',
        title: 'Network mismatch',
        requestedValue: reqNet,
        actualValue: expNet,
        message: `Requested network (${reqNet}) does not match your intended network (${expNet}).`,
      });
    }
  }

  // 5. Compare requested and actual/intended amount using exact BigInt atomic math
  let amountMatches = true;
  if (intended.expectedAmount && intended.expectedAmount.trim()) {
    const reqAtomic = toAtomicExact(requested.amount, reqToken);
    const expAtomic = toAtomicExact(intended.expectedAmount, reqToken);
    if (reqAtomic === null || expAtomic === null || reqAtomic !== expAtomic) {
      amountMatches = false;
      discrepancies.push({
        field: 'amount',
        severity: 'error',
        title: 'Amount mismatch',
        requestedValue: `${requested.amount} ${reqToken}`,
        actualValue: `${intended.expectedAmount.trim()} ${reqToken}`,
        message: `Requested amount (${requested.amount} ${reqToken}) does not match your intended amount (${intended.expectedAmount.trim()} ${reqToken}).`,
      });
    }
  }

  // 6. Validate payment request expiry
  let notExpired = true;
  if (requested.status === 'expired') {
    notExpired = false;
    discrepancies.push({
      field: 'expiry',
      severity: 'error',
      title: 'Payment request expired',
      requestedValue: requested.expiresAt ?? 'Expired',
      actualValue: new Date(nowMs).toISOString(),
      message: 'This payment request is marked expired and can no longer be paid.',
    });
  } else if (requested.expiresAt) {
    const expMs = new Date(requested.expiresAt).getTime();
    if (!Number.isFinite(expMs) || expMs <= nowMs) {
      notExpired = false;
      discrepancies.push({
        field: 'expiry',
        severity: 'error',
        title: 'Payment request expired',
        requestedValue: requested.expiresAt,
        actualValue: new Date(nowMs).toISOString(),
        message: 'This payment request has passed its expiry time.',
      });
    }
  }

  // 7. Check whether the request has already been paid (or is completed/cancelled)
  let notAlreadyPaid = true;
  if (alreadyPaid || requested.status === 'completed') {
    notAlreadyPaid = false;
    discrepancies.push({
      field: 'already_paid',
      severity: 'error',
      title: 'Request already paid',
      requestedValue: 'open',
      actualValue: existingTxStatus ?? requested.status ?? 'paid',
      message:
        existingTxStatus && existingTxStatus !== 'confirmed'
          ? `A payment for this request is already ${existingTxStatus}.`
          : 'This payment request has already been paid.',
    });
  } else if (requested.status === 'cancelled') {
    notAlreadyPaid = false;
    discrepancies.push({
      field: 'status',
      severity: 'error',
      title: 'Payment request cancelled',
      requestedValue: 'open',
      actualValue: 'cancelled',
      message: 'This payment request was cancelled by the creator.',
    });
  }

  return {
    valid: discrepancies.filter((d) => d.severity === 'error').length === 0,
    discrepancies,
    checks: {
      recipientMatches,
      amountMatches,
      tokenMatches,
      networkMatches,
      notExpired,
      notAlreadyPaid,
      destinationUnchanged,
    },
  };
}
