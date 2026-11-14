import { supabase } from '../lib/supabase';
import { callEdgeFunction } from './apiClient';
import {
  buildApprovalTypedData,
  computeCanonicalTransactionHash,
  type CanonicalTransactionPayload,
  type MutualApprovalRole,
} from './mutualTrustCrypto';
import { signTypedDataMessage } from './wdkWalletService';
import type {
  AssuranceLevel,
  LivenessOutcome,
  VerificationOutcome,
} from './identityVerificationService';

export type ParticipantVerificationStatus =
  | 'not_started'
  | 'in_progress'
  | 'verified'
  | 'failed'
  | 'expired'
  | 'manual_review';

export type MutualSessionState =
  | 'invited'
  | 'verifying'
  | 'reports_exchanged'
  | 'awaiting_approvals'
  | 'authorized'
  | 'executing'
  | 'completed'
  | 'declined'
  | 'failed'
  | 'expired';

export interface SanitizedCounterpartyReport {
  subjectRole: MutualApprovalRole;
  displayName: string;
  walletAddress: string;
  walletVerified: boolean;
  verificationOutcome: VerificationOutcome;
  livenessOutcome: LivenessOutcome;
  verificationMethod: 'facial_liveness' | 'alternative_fallback';
  verificationProvider: string;
  isSandbox: boolean;
  assuranceLevel: AssuranceLevel;
  verifiedAt: string | null;
  expiresAt: string | null;
  validity: 'valid' | 'expired' | 'invalid' | 'pending';
  accountStatus: 'active' | 'revoked';
  securityWarnings: string[];
  attestationHash: string | null;
}

export interface MutualVerificationSessionRecord {
  id: string;
  payment_request_id: string | null;
  payment_agreement_id: string | null;
  share_code: string | null;
  sender_id: string;
  recipient_id: string;
  sender_wallet_address: string;
  recipient_wallet_address: string;
  sender_identity_id: string | null;
  recipient_identity_id: string | null;
  sender_verification_status: ParticipantVerificationStatus;
  recipient_verification_status: ParticipantVerificationStatus;
  reports_exchanged_at: string | null;
  sender_report_viewed_at: string | null;
  recipient_report_viewed_at: string | null;
  amount_numeric: number;
  amount_atomic: string;
  token_symbol: string;
  token_decimals: number;
  token_address: string;
  network: string;
  chain_id: number;
  purpose: string;
  agreement_version: number;
  agreement_terms_hash: string;
  canonical_nonce: string;
  canonical_payload: CanonicalTransactionPayload;
  canonical_tx_hash: string;
  sender_approved_at: string | null;
  recipient_approved_at: string | null;
  declined_by: string | null;
  decline_reason: string | null;
  session_state: MutualSessionState;
  verification_expires_at: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface TransactionApprovalSummary {
  id: string;
  approval_role: MutualApprovalRole;
  approval_status: 'approved' | 'declined' | 'revoked' | 'expired';
  approving_wallet_address: string;
  recovered_address: string | null;
  approved_at: string | null;
  decline_reason: string | null;
  expires_at: string;
  canonical_tx_hash: string;
}

export interface MutualTrustReceiptRecord {
  id: string;
  receipt_code: string;
  session_id: string;
  transaction_id: string;
  canonical_tx_hash: string;
  sender_id: string;
  recipient_id: string;
  sender_wallet_address: string;
  recipient_wallet_address: string;
  amount_numeric: number;
  token_symbol: string;
  network: string;
  chain_id: number;
  agreement_id: string | null;
  agreement_version: number;
  agreement_terms_hash: string;
  sender_verification_summary: SanitizedCounterpartyReport;
  recipient_verification_summary: SanitizedCounterpartyReport;
  sender_approved_at: string;
  recipient_approved_at: string;
  blockchain_tx_hash: string | null;
  settlement_status: 'pending' | 'processing' | 'confirmed' | 'failed';
  receipt_signature: string;
  created_at: string;
  updated_at: string;
}

export interface HydratedMutualSession {
  created?: boolean;
  session: MutualVerificationSessionRecord;
  senderReport: SanitizedCounterpartyReport;
  recipientReport: SanitizedCounterpartyReport;
  agreement: {
    id: string;
    title: string;
    termsText: string;
    status: string;
    version: number;
  } | null;
  approvals: {
    sender: TransactionApprovalSummary | null;
    recipient: TransactionApprovalSummary | null;
  };
  receipt: MutualTrustReceiptRecord | null;
}

export async function listMyMutualTrustSessions(): Promise<HydratedMutualSession[]> {
  const res = await callEdgeFunction<{ sessions: HydratedMutualSession[] }>('mutual-trust', {
    method: 'GET',
  });
  return res.sessions ?? [];
}

export async function getMutualTrustSession(params: {
  sessionId?: string;
  paymentRequestId?: string;
  shareCode?: string;
}): Promise<HydratedMutualSession | null> {
  const query: Record<string, string> = {};
  if (params.sessionId) query.sessionId = params.sessionId;
  else if (params.paymentRequestId) query.paymentRequestId = params.paymentRequestId;
  else if (params.shareCode) query.shareCode = params.shareCode;

  const res = await callEdgeFunction<HydratedMutualSession | { session: null }>('mutual-trust', {
    method: 'GET',
    query,
  });
  if (!res || !res.session) return null;
  return res as HydratedMutualSession;
}

export async function createOrJoinMutualTrustSession(params: {
  sessionId?: string;
  paymentRequestId?: string;
  shareCode?: string;
  paymentAgreementId?: string;
  recipientAddress?: string;
  senderWalletAddress?: string;
  amount?: string;
  tokenSymbol?: string;
  network?: string;
  purpose?: string;
  forceNew?: boolean;
}): Promise<HydratedMutualSession> {
  return callEdgeFunction<HydratedMutualSession>('mutual-trust', {
    method: 'POST',
    body: {
      action: 'create_or_join',
      ...params,
    },
  });
}

export async function syncMutualSessionIdentity(
  sessionId: string
): Promise<HydratedMutualSession> {
  return callEdgeFunction<HydratedMutualSession>('mutual-trust', {
    method: 'POST',
    body: {
      action: 'sync_identity',
      sessionId,
    },
  });
}

export async function acknowledgeCounterpartyReport(
  sessionId: string
): Promise<HydratedMutualSession> {
  return callEdgeFunction<HydratedMutualSession>('mutual-trust', {
    method: 'POST',
    body: {
      action: 'acknowledge_report',
      sessionId,
    },
  });
}

export async function signAndSubmitMutualApproval(params: {
  session: MutualVerificationSessionRecord;
  role: MutualApprovalRole;
  signerAddress: string;
  walletMethod: 'created' | 'connected' | 'imported';
  signingPhrase?: string;
}): Promise<HydratedMutualSession> {
  const recomputedHash = computeCanonicalTransactionHash(params.session.canonical_payload);
  if (recomputedHash.toLowerCase() !== params.session.canonical_tx_hash.toLowerCase()) {
    throw new Error(
      'Canonical transaction payload mismatch detected. Reload the latest session details before signing.'
    );
  }

  const typedData = buildApprovalTypedData({
    payload: params.session.canonical_payload,
    canonicalHash: recomputedHash,
    role: params.role,
  });

  const signature = await signTypedDataMessage({
    domain: typedData.domain,
    types: typedData.types,
    message: typedData.message as unknown as Record<string, unknown>,
    expectedAddress: params.signerAddress,
    network: params.session.network,
    walletMethod: params.walletMethod,
    signingPhrase: params.signingPhrase,
  });

  return callEdgeFunction<HydratedMutualSession>('mutual-trust', {
    method: 'POST',
    body: {
      action: 'submit_approval',
      sessionId: params.session.id,
      canonicalTxHash: recomputedHash,
      signerAddress: params.signerAddress,
      signature,
      statementAccepted: true,
    },
  });
}

export async function declineMutualTrustSession(params: {
  sessionId: string;
  reason: string;
}): Promise<HydratedMutualSession> {
  return callEdgeFunction<HydratedMutualSession>('mutual-trust', {
    method: 'POST',
    body: {
      action: 'decline',
      sessionId: params.sessionId,
      reason: params.reason,
    },
  });
}

export async function invalidateAndUpdateMutualSessionParams(params: {
  sessionId: string;
  amount?: string;
  tokenSymbol?: string;
  network?: string;
  purpose?: string;
  recipientAddress?: string;
}): Promise<HydratedMutualSession> {
  return callEdgeFunction<HydratedMutualSession>('mutual-trust', {
    method: 'POST',
    body: {
      action: 'invalidate_on_change',
      ...params,
    },
  });
}

export async function fetchMutualTrustReceiptByTransactionId(
  transactionId: string
): Promise<MutualTrustReceiptRecord | null> {
  const { data } = await supabase
    .from('mutual_trust_receipts')
    .select('*')
    .eq('transaction_id', transactionId)
    .maybeSingle();

  return (data as unknown as MutualTrustReceiptRecord | null) ?? null;
}

/**
 * Subscribes to real-time updates for a specific Mutual Trust session (session row,
 * EIP-712 approvals, and Mutual Trust Receipt). Always re-hydrates from the authoritative
 * backend on change or channel reconnect so refresh/dropped-packet races self-heal.
 */
export function subscribeToMutualTrustSession(
  sessionId: string,
  callbacks: {
    onUpdated: (hydrated: HydratedMutualSession) => void;
    onConnectionState?: (status: 'connecting' | 'live' | 'reconnecting') => void;
  }
): () => void {
  let active = true;
  let refetchInFlight = false;
  let queuedRefetch = false;

  const refreshAuthoritative = async () => {
    if (!active) return;
    if (refetchInFlight) {
      queuedRefetch = true;
      return;
    }
    refetchInFlight = true;
    try {
      const latest = await getMutualTrustSession({ sessionId });
      if (active && latest) {
        callbacks.onUpdated(latest);
      }
    } catch {
      // Transient fetch failures recover on the next event or manual refresh.
    } finally {
      refetchInFlight = false;
      if (queuedRefetch && active) {
        queuedRefetch = false;
        void refreshAuthoritative();
      }
    }
  };

  callbacks.onConnectionState?.('connecting');

  const channel = supabase
    .channel(`mutual-trust-session-${sessionId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'mutual_verification_sessions',
        filter: `id=eq.${sessionId}`,
      },
      () => {
        void refreshAuthoritative();
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'transaction_approvals',
        filter: `session_id=eq.${sessionId}`,
      },
      () => {
        void refreshAuthoritative();
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'mutual_trust_receipts',
        filter: `session_id=eq.${sessionId}`,
      },
      () => {
        void refreshAuthoritative();
      }
    )
    .subscribe((status) => {
      if (!active) return;
      if (status === 'SUBSCRIBED') {
        callbacks.onConnectionState?.('live');
        void refreshAuthoritative();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        callbacks.onConnectionState?.('reconnecting');
      }
    });

  return () => {
    active = false;
    void supabase.removeChannel(channel);
  };
}

/**
 * Subscribes to any Mutual Trust session changes involving the authenticated user
 * (both as sender and as recipient) for Dashboard and Inbox updates.
 */
export function subscribeToUserMutualSessions(
  userId: string,
  onChanged: () => void
): () => void {
  if (!userId) return () => {};

  const channel = supabase
    .channel(`mutual-trust-inbox-${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'mutual_verification_sessions',
        filter: `sender_id=eq.${userId}`,
      },
      () => onChanged()
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'mutual_verification_sessions',
        filter: `recipient_id=eq.${userId}`,
      },
      () => onChanged()
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

