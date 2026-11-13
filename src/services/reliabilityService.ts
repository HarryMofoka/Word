export type ReliabilityErrorCode =
  | 'RPC_OUTAGE'
  | 'DATABASE_OUTAGE'
  | 'NETWORK_INTERRUPTED'
  | 'INVALID_QR_CODE'
  | 'REQUEST_EXPIRED'
  | 'DUPLICATE_REQUEST'
  | 'AI_INFERENCE_FAILED';

export class ReliabilityError extends Error {
  readonly code: ReliabilityErrorCode;
  readonly retryable: boolean;

  constructor(code: ReliabilityErrorCode, message: string, retryable = false) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  shouldRetry?: (err: unknown, attempt: number) => boolean;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function isTransientNetworkOrServerError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const status = (err as { status?: number }).status;
  if (typeof status === 'number') {
    return status === 408 || status === 429 || status === 502 || status === 503 || status === 504;
  }
  const name = (err as { name?: string }).name ?? '';
  const msg = ((err as { message?: string }).message ?? '').toLowerCase();
  return (
    name === 'AbortError' ||
    name === 'TypeError' ||
    msg.includes('network') ||
    msg.includes('timeout') ||
    msg.includes('failed to fetch') ||
    msg.includes('econnreset') ||
    msg.includes('temporarily unavailable')
  );
}

/**
 * Retries an operation with exponential backoff only when explicitly safe to retry.
 */
export async function retryWithBackoff<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? 100);
  const shouldRetry = options.shouldRetry ?? isTransientNetworkOrServerError;
  const sleep = options.sleep ?? defaultSleep;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation(attempt);
    } catch (err) {
      lastError = err;
      if (attempt >= maxAttempts || !shouldRetry(err, attempt)) {
        throw err;
      }
      await sleep(baseDelayMs * Math.pow(2, attempt - 1));
    }
  }
  throw lastError;
}

/**
 * Fails over across primary and fallback RPC endpoints during RPC outages.
 */
export async function executeWithRpcFailover<T>(
  rpcUrls: string[],
  runner: (rpcUrl: string) => Promise<T>,
  options: { sleep?: (ms: number) => Promise<void> } = {}
): Promise<{ result: T; usedRpcUrl: string; failedEndpoints: string[] }> {
  const uniqueUrls = Array.from(new Set(rpcUrls.map((u) => u.trim()).filter(Boolean)));
  if (uniqueUrls.length === 0) {
    throw new ReliabilityError('RPC_OUTAGE', 'No RPC endpoints configured.', true);
  }

  const failedEndpoints: string[] = [];
  for (const rpcUrl of uniqueUrls) {
    try {
      const result = await retryWithBackoff(() => runner(rpcUrl), {
        maxAttempts: 2,
        baseDelayMs: 50,
        sleep: options.sleep,
      });
      return { result, usedRpcUrl: rpcUrl, failedEndpoints };
    } catch {
      failedEndpoints.push(rpcUrl);
    }
  }

  throw new ReliabilityError(
    'RPC_OUTAGE',
    `All ${uniqueUrls.length} RPC endpoints are currently unreachable. Please try again shortly.`,
    true
  );
}

/**
 * Classifies database or backend outages vs permanent client/validation errors.
 */
export function classifyBackendFailure(err: unknown): {
  kind: 'database_outage' | 'network_interrupted' | 'duplicate_request' | 'permanent';
  retryable: boolean;
  userMessage: string;
} {
  const code = ((err as { code?: string })?.code ?? '').toUpperCase();
  const status = (err as { status?: number })?.status;
  const msg = ((err as { message?: string })?.message ?? '').toLowerCase();

  if (code === 'DUPLICATE_SUBMISSION' || status === 409) {
    return {
      kind: 'duplicate_request',
      retryable: false,
      userMessage: 'This payment request was already submitted. Duplicate payment was prevented.',
    };
  }

  if (
    status === 503 ||
    status === 504 ||
    code.startsWith('PGRST') ||
    msg.includes('database') ||
    msg.includes('postgres') ||
    msg.includes('connection pool')
  ) {
    return {
      kind: 'database_outage',
      retryable: true,
      userMessage: 'Database is temporarily unavailable. No funds were moved; you can safely retry.',
    };
  }

  if (isTransientNetworkOrServerError(err)) {
    return {
      kind: 'network_interrupted',
      retryable: true,
      userMessage: 'Network connection was interrupted. Check your connection and retry safely.',
    };
  }

  return {
    kind: 'permanent',
    retryable: false,
    userMessage: (err as { message?: string })?.message || 'Request could not be completed.',
  };
}

/**
 * Deterministic idempotency key generator so retries never create duplicate payments.
 */
export function createIdempotencyKey(params: {
  senderAddress: string;
  recipientAddress: string;
  amount: string;
  token: string;
  network: string;
  paymentRequestId?: string;
}): string {
  const parts = [
    params.senderAddress.trim().toLowerCase(),
    params.recipientAddress.trim().toLowerCase(),
    params.amount.trim(),
    params.token.trim().toUpperCase(),
    params.network.trim(),
    params.paymentRequestId?.trim() ?? 'direct',
  ];
  return `idem:${parts.join('|')}`;
}

export interface ParsedPaymentQr {
  shareCode?: string;
  recipientAddress?: string;
  amount?: string;
  token?: string;
  network?: string;
}

/**
 * Safely parses and validates payment QR payloads, rejecting malformed or malicious QR codes.
 */
export function parsePaymentQrPayload(rawPayload: string): ParsedPaymentQr {
  const raw = rawPayload.trim();
  if (!raw || raw.length > 2048) {
    throw new ReliabilityError('INVALID_QR_CODE', 'QR code payload is empty or exceeds maximum length.');
  }

  if (/^(javascript|data|vbscript):/i.test(raw)) {
    throw new ReliabilityError('INVALID_QR_CODE', 'QR code uses an unsafe URI scheme.');
  }

  // Share code format: e.g. PAY-8F2K9C
  if (/^[A-Z0-9-]{4,32}$/.test(raw)) {
    return { shareCode: raw };
  }

  // JSON QR payload
  if (raw.startsWith('{')) {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      throw new ReliabilityError('INVALID_QR_CODE', 'QR code contains malformed JSON.');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new ReliabilityError('INVALID_QR_CODE', 'QR code JSON must be an object.');
    }
    const addr = typeof parsed.recipientAddress === 'string' ? parsed.recipientAddress.trim() : '';
    const amount = parsed.amount !== undefined ? String(parsed.amount).trim() : undefined;
    if (addr && !/^0x[a-fA-F0-9]{40}$/.test(addr)) {
      throw new ReliabilityError('INVALID_QR_CODE', 'QR code recipient address is invalid.');
    }
    if (amount !== undefined && (!/^\d+(\.\d+)?$/.test(amount) || Number(amount) <= 0)) {
      throw new ReliabilityError('INVALID_QR_CODE', 'QR code amount must be a positive number.');
    }
    if (!addr && typeof parsed.shareCode !== 'string') {
      throw new ReliabilityError('INVALID_QR_CODE', 'QR code is missing recipient or shareCode.');
    }
    return {
      shareCode: typeof parsed.shareCode === 'string' ? parsed.shareCode.trim() : undefined,
      recipientAddress: addr || undefined,
      amount,
      token: typeof parsed.token === 'string' ? parsed.token.trim().toUpperCase() : undefined,
      network: typeof parsed.network === 'string' ? parsed.network.trim() : undefined,
    };
  }

  // word://pay?... or https://.../pay?...
  try {
    const url = new URL(raw);
    if (!['word:', 'https:', 'ethereum:'].includes(url.protocol)) {
      throw new ReliabilityError('INVALID_QR_CODE', `Unsupported QR protocol: ${url.protocol}`);
    }
    const shareCode = url.searchParams.get('code') ?? url.searchParams.get('shareCode') ?? undefined;
    const recipientAddress =
      url.searchParams.get('to') ?? url.searchParams.get('recipient') ?? undefined;
    const amount = url.searchParams.get('amount') ?? undefined;
    if (recipientAddress && !/^0x[a-fA-F0-9]{40}$/.test(recipientAddress)) {
      throw new ReliabilityError('INVALID_QR_CODE', 'QR link contains an invalid wallet address.');
    }
    if (amount !== undefined && (!/^\d+(\.\d+)?$/.test(amount) || Number(amount) <= 0)) {
      throw new ReliabilityError('INVALID_QR_CODE', 'QR link contains an invalid payment amount.');
    }
    if (!shareCode && !recipientAddress) {
      throw new ReliabilityError('INVALID_QR_CODE', 'QR link does not specify a payment target.');
    }
    return {
      shareCode,
      recipientAddress,
      amount,
      token: url.searchParams.get('token')?.toUpperCase(),
      network: url.searchParams.get('network') ?? undefined,
    };
  } catch (err) {
    if (err instanceof ReliabilityError) throw err;
    throw new ReliabilityError('INVALID_QR_CODE', 'Unrecognized or corrupted payment QR code.');
  }
}

/**
 * Checks whether a payment request is still open and unexpired.
 */
export function evaluatePaymentRequestAvailability(
  req: { status: string; expires_at?: string | null },
  nowMs = Date.now()
): { available: boolean; reason: 'OPEN' | 'EXPIRED' | 'CANCELLED' | 'ALREADY_PAID' } {
  if (req.status === 'completed') {
    return { available: false, reason: 'ALREADY_PAID' };
  }
  if (req.status === 'cancelled') {
    return { available: false, reason: 'CANCELLED' };
  }
  if (req.status === 'expired') {
    return { available: false, reason: 'EXPIRED' };
  }
  if (req.expires_at) {
    const exp = new Date(req.expires_at).getTime();
    if (Number.isFinite(exp) && exp <= nowMs) {
      return { available: false, reason: 'EXPIRED' };
    }
  }
  return { available: true, reason: 'OPEN' };
}

/**
 * Wraps AI inference with deterministic fallback so failed AI never blocks payments.
 */
export async function resolveAiInferenceWithFallback<T>(
  runAi: () => Promise<T>,
  deterministicFallback: (errorMessage: string) => T
): Promise<{ output: T; usedFallback: boolean; fallbackReason: string | null }> {
  try {
    const output = await runAi();
    return { output, usedFallback: false, fallbackReason: null };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'AI inference failed';
    return {
      output: deterministicFallback(reason),
      usedFallback: true,
      fallbackReason: reason,
    };
  }
}

export interface ReconcilableTransaction {
  id: string;
  status: string;
  tx_hash: string | null;
  network: string;
  created_at: string;
}

export interface ReconciliationSummary {
  reconciledConfirmed: string[];
  reconciledFailed: string[];
  stillPending: string[];
  incompleteWithoutHash: string[];
}

/**
 * Reconciles incomplete/pending transactions against on-chain receipt status.
 */
export async function reconcilePendingTransactions(
  transactions: ReconcilableTransaction[],
  checkOnChainStatus: (txHash: string, network: string) => Promise<'confirmed' | 'failed' | 'pending'>,
  nowMs = Date.now(),
  staleThresholdMs = 5 * 60 * 1000
): Promise<ReconciliationSummary> {
  const summary: ReconciliationSummary = {
    reconciledConfirmed: [],
    reconciledFailed: [],
    stillPending: [],
    incompleteWithoutHash: [],
  };

  for (const tx of transactions) {
    if (!['pending', 'processing'].includes(tx.status)) continue;

    if (!tx.tx_hash) {
      const ageMs = nowMs - new Date(tx.created_at).getTime();
      if (ageMs >= staleThresholdMs) {
        summary.incompleteWithoutHash.push(tx.id);
      } else {
        summary.stillPending.push(tx.id);
      }
      continue;
    }

    try {
      const outcome = await checkOnChainStatus(tx.tx_hash, tx.network);
      if (outcome === 'confirmed') summary.reconciledConfirmed.push(tx.id);
      else if (outcome === 'failed') summary.reconciledFailed.push(tx.id);
      else summary.stillPending.push(tx.id);
    } catch {
      summary.stillPending.push(tx.id);
    }
  }

  return summary;
}

