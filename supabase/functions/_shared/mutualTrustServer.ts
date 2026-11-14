import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { getAddress, keccak256, toUtf8Bytes } from 'npm:ethers@6.13.4';
import {
  computeAgreementTermsHash,
  computeCanonicalTransactionHash,
  hmacSha256Hex,
  type CanonicalTransactionPayload,
} from './mutualTrustCrypto.ts';
import {
  toSanitizedCounterpartyReport,
  type SanitizedCounterpartyReport,
} from './identityProvider.ts';
import { recordAuditLog } from './logger.ts';

export const OPEN_MUTUAL_SESSION_STATES = [
  'invited',
  'verifying',
  'reports_exchanged',
  'awaiting_approvals',
  'authorized',
] as const;

export function mapOutcomeToSessionVerificationStatus(
  outcome: string | null | undefined,
  expiresAt?: string | null,
  revokedAt?: string | null
): 'not_started' | 'in_progress' | 'verified' | 'failed' | 'expired' | 'manual_review' {
  if (revokedAt) return 'not_started';
  if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
    return 'expired';
  }
  switch (outcome) {
    case 'verified':
      return 'verified';
    case 'pending':
      return 'in_progress';
    case 'manual_review':
      return 'manual_review';
    case 'expired':
      return 'expired';
    case 'failed':
    case 'liveness_failed':
    case 'unavailable':
      return 'failed';
    default:
      return 'not_started';
  }
}

export function isIdentityRowValid(
  row: {
    verification_outcome: string;
    liveness_outcome: string;
    verification_method: string;
    expires_at: string | null;
    revoked_at: string | null;
  } | null
): boolean {
  if (!row || row.revoked_at) return false;
  if (row.verification_outcome !== 'verified') return false;
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) return false;
  return row.liveness_outcome === 'passed' || row.verification_method === 'alternative_fallback';
}

export function deriveMutualSessionState(row: {
  session_state: string;
  sender_verification_status: string;
  recipient_verification_status: string;
  sender_report_viewed_at: string | null;
  recipient_report_viewed_at: string | null;
  sender_approved_at: string | null;
  recipient_approved_at: string | null;
  expires_at: string;
}): string {
  if (row.session_state === 'executing' || row.session_state === 'completed' || row.session_state === 'declined') {
    return row.session_state;
  }
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    return 'expired';
  }
  if (row.sender_verification_status === 'verified' && row.recipient_verification_status === 'verified') {
    if (row.sender_approved_at && row.recipient_approved_at) {
      return 'authorized';
    }
    if (row.sender_report_viewed_at && row.recipient_report_viewed_at) {
      return 'awaiting_approvals';
    }
    return 'reports_exchanged';
  }
  if (row.sender_verification_status === 'not_started' && row.recipient_verification_status === 'not_started') {
    return 'invited';
  }
  return 'verifying';
}

export async function insertNotification(
  adminClient: SupabaseClient,
  params: {
    userId: string;
    category: 'Payment' | 'Verification' | 'Security' | 'Dispute';
    title: string;
    detail: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const { error } = await adminClient.from('notifications').insert({
    user_id: params.userId,
    category: params.category,
    title: params.title.slice(0, 160),
    detail: params.detail.slice(0, 1000),
    metadata: params.metadata ?? {},
  });
  if (error) {
    console.error('Notification insert failed:', error.message);
  }
}

export async function fetchLatestValidOrRecentIdentity(
  adminClient: SupabaseClient,
  userId: string
) {
  const { data } = await adminClient
    .from('identity_verification_results')
    .select('*')
    .eq('user_id', userId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(5);

  const rows = data ?? [];
  if (rows.length === 0) return null;
  const activeVerified = rows.find((r) => isIdentityRowValid(r));
  return activeVerified ?? rows[0];
}

export async function syncUserIdentityToOpenSessions(
  adminClient: SupabaseClient,
  userId: string,
  identityRow: {
    id: string;
    verification_outcome: string;
    expires_at: string | null;
    revoked_at: string | null;
  } | null
): Promise<void> {
  const { data: sessions } = await adminClient
    .from('mutual_verification_sessions')
    .select('*')
    .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
    .in('session_state', [...OPEN_MUTUAL_SESSION_STATES]);

  if (!sessions || sessions.length === 0) return;

  const mappedStatus = identityRow
    ? mapOutcomeToSessionVerificationStatus(
        identityRow.verification_outcome,
        identityRow.expires_at,
        identityRow.revoked_at
      )
    : 'not_started';

  const nowIso = new Date().toISOString();

  for (const session of sessions) {
    const isSender = session.sender_id === userId;
    const nextSenderIdentityId = isSender
      ? (identityRow && !identityRow.revoked_at ? identityRow.id : null)
      : session.sender_identity_id;
    const nextRecipientIdentityId = !isSender
      ? (identityRow && !identityRow.revoked_at ? identityRow.id : null)
      : session.recipient_identity_id;
    const nextSenderStatus = isSender ? mappedStatus : session.sender_verification_status;
    const nextRecipientStatus = !isSender ? mappedStatus : session.recipient_verification_status;

    const identityChangedOrRevoked =
      (isSender && (session.sender_identity_id !== nextSenderIdentityId || mappedStatus !== 'verified')) ||
      (!isSender && (session.recipient_identity_id !== nextRecipientIdentityId || mappedStatus !== 'verified'));

    const updates: Record<string, unknown> = {
      sender_identity_id: nextSenderIdentityId,
      recipient_identity_id: nextRecipientIdentityId,
      sender_verification_status: nextSenderStatus,
      recipient_verification_status: nextRecipientStatus,
    };

    if (identityChangedOrRevoked && (session.sender_approved_at || session.recipient_approved_at)) {
      await adminClient
        .from('transaction_approvals')
        .update({ approval_status: 'revoked', revoked_at: nowIso })
        .eq('session_id', session.id)
        .eq('approval_status', 'approved');
      updates.sender_approved_at = null;
      updates.recipient_approved_at = null;
      updates.sender_report_viewed_at = null;
      updates.recipient_report_viewed_at = null;
    }

    const bothVerifiedNow =
      nextSenderStatus === 'verified' && nextRecipientStatus === 'verified';
    const justExchanged = bothVerifiedNow && !session.reports_exchanged_at;
    if (bothVerifiedNow && !session.reports_exchanged_at) {
      updates.reports_exchanged_at = nowIso;
    } else if (!bothVerifiedNow) {
      updates.reports_exchanged_at = null;
      updates.sender_report_viewed_at = null;
      updates.recipient_report_viewed_at = null;
    }

    const merged = { ...session, ...updates };
    updates.session_state = deriveMutualSessionState(merged);

    await adminClient
      .from('mutual_verification_sessions')
      .update(updates)
      .eq('id', session.id);

    if (justExchanged) {
      await Promise.all([
        insertNotification(adminClient, {
          userId: session.sender_id,
          category: 'Verification',
          title: 'Mutual trust reports ready',
          detail: 'Both participants completed identity verification. Review the recipient report and sign to authorize.',
          metadata: { mutualSessionId: session.id },
        }),
        insertNotification(adminClient, {
          userId: session.recipient_id,
          category: 'Verification',
          title: 'Mutual trust reports ready',
          detail: 'Both participants completed identity verification. Review the sender report and sign to authorize.',
          metadata: { mutualSessionId: session.id },
        }),
      ]);
    }
  }
}

export async function invalidateMutualSessionsForAgreement(
  adminClient: SupabaseClient,
  agreementId: string,
  versionNumber: number,
  termsText: string,
  actorUserId: string
): Promise<void> {
  const { data: sessions } = await adminClient
    .from('mutual_verification_sessions')
    .select('*')
    .eq('payment_agreement_id', agreementId)
    .in('session_state', [...OPEN_MUTUAL_SESSION_STATES]);

  if (!sessions || sessions.length === 0) return;

  const nowIso = new Date().toISOString();
  const nextTermsHash = computeAgreementTermsHash({
    agreementId,
    agreementVersion: versionNumber,
    termsText,
  });

  for (const session of sessions) {
    const oldPayload = session.canonical_payload as CanonicalTransactionPayload;
    const freshNonce = keccak256(toUtf8Bytes(`${session.id}:rev:${versionNumber}:${crypto.randomUUID()}`));
    const nextPayload: CanonicalTransactionPayload = {
      ...oldPayload,
      agreementVersion: versionNumber,
      agreementTermsHash: nextTermsHash,
      nonce: freshNonce,
    };
    const nextHash = computeCanonicalTransactionHash(nextPayload);

    await adminClient
      .from('transaction_approvals')
      .update({ approval_status: 'revoked', revoked_at: nowIso })
      .eq('session_id', session.id)
      .eq('approval_status', 'approved');

    const nextState = deriveMutualSessionState({
      ...session,
      sender_approved_at: null,
      recipient_approved_at: null,
      sender_report_viewed_at: null,
      recipient_report_viewed_at: null,
    });

    await adminClient
      .from('mutual_verification_sessions')
      .update({
        agreement_version: versionNumber,
        agreement_terms_hash: nextTermsHash,
        canonical_nonce: freshNonce,
        canonical_payload: nextPayload,
        canonical_tx_hash: nextHash,
        sender_approved_at: null,
        recipient_approved_at: null,
        sender_report_viewed_at: null,
        recipient_report_viewed_at: null,
        session_state: nextState,
      })
      .eq('id', session.id);

    await recordAuditLog(adminClient, {
      actorUserId,
      action: 'mutual_trust_approvals_invalidated',
      resourceType: 'mutual_verification_session',
      resourceId: session.id,
      metadata: {
        reason: 'agreement_revised',
        agreementId,
        newAgreementVersion: versionNumber,
        newCanonicalTxHash: nextHash,
      },
    });

    await Promise.all([
      insertNotification(adminClient, {
        userId: session.sender_id,
        category: 'Security',
        title: 'Transaction approvals reset after agreement update',
        detail: `Agreement updated to v${versionNumber}. Previous signatures were invalidated and must be reviewed again.`,
        metadata: { mutualSessionId: session.id, agreementId },
      }),
      insertNotification(adminClient, {
        userId: session.recipient_id,
        category: 'Security',
        title: 'Transaction approvals reset after agreement update',
        detail: `Agreement updated to v${versionNumber}. Previous signatures were invalidated and must be reviewed again.`,
        metadata: { mutualSessionId: session.id, agreementId },
      }),
    ]);
  }
}

export async function signReceiptHmac(params: {
  receiptCode: string;
  sessionId: string;
  transactionId: string;
  canonicalTxHash: string;
  blockchainTxHash: string;
  settlementStatus: string;
}): Promise<string> {
  const secret =
    Deno.env.get('MUTUAL_TRUST_ATTESTATION_SECRET') ||
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
    'word-local-test-receipt-secret';
  const payload = JSON.stringify(params);
  return hmacSha256Hex(secret, payload);
}

export interface HydratedMutualSession {
  session: Record<string, unknown>;
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
    sender: Record<string, unknown> | null;
    recipient: Record<string, unknown> | null;
  };
  receipt: Record<string, unknown> | null;
}

export async function hydrateMutualSession(
  adminClient: SupabaseClient,
  rawSession: Record<string, unknown>
): Promise<HydratedMutualSession> {
  const senderId = String(rawSession.sender_id);
  const recipientId = String(rawSession.recipient_id);
  const senderWallet = getAddress(String(rawSession.sender_wallet_address));
  const recipientWallet = getAddress(String(rawSession.recipient_wallet_address));

  const [
    { data: profiles },
    { data: wallets },
    { data: senderIdentity },
    { data: recipientIdentity },
    { data: approvals },
    { data: agreement },
    { data: receipt },
  ] = await Promise.all([
    adminClient.from('profiles').select('id, display_name').in('id', [senderId, recipientId]),
    adminClient.from('wallets').select('user_id, address, is_verified').in('user_id', [senderId, recipientId]),
    rawSession.sender_identity_id
      ? adminClient
          .from('identity_verification_results')
          .select(
            'provider, is_sandbox, verification_method, verification_outcome, liveness_outcome, assurance_level, verified_at, expires_at, revoked_at, security_warnings, attestation_hash'
          )
          .eq('id', String(rawSession.sender_identity_id))
          .maybeSingle()
      : Promise.resolve({ data: null }),
    rawSession.recipient_identity_id
      ? adminClient
          .from('identity_verification_results')
          .select(
            'provider, is_sandbox, verification_method, verification_outcome, liveness_outcome, assurance_level, verified_at, expires_at, revoked_at, security_warnings, attestation_hash'
          )
          .eq('id', String(rawSession.recipient_identity_id))
          .maybeSingle()
      : Promise.resolve({ data: null }),
    adminClient
      .from('transaction_approvals')
      .select('id, approval_role, approval_status, approving_wallet_address, recovered_address, approved_at, decline_reason, expires_at, canonical_tx_hash')
      .eq('session_id', String(rawSession.id))
      .eq('canonical_tx_hash', String(rawSession.canonical_tx_hash)),
    rawSession.payment_agreement_id
      ? adminClient
          .from('payment_agreements')
          .select('id, title, terms_text, status')
          .eq('id', String(rawSession.payment_agreement_id))
          .maybeSingle()
      : Promise.resolve({ data: null }),
    adminClient
      .from('mutual_trust_receipts')
      .select('*')
      .eq('session_id', String(rawSession.id))
      .maybeSingle(),
  ]);

  const senderProfile = (profiles ?? []).find((p) => p.id === senderId);
  const recipientProfile = (profiles ?? []).find((p) => p.id === recipientId);
  const senderWalletRow = (wallets ?? []).find(
    (w) => w.user_id === senderId && w.address.toLowerCase() === senderWallet.toLowerCase()
  );
  const recipientWalletRow = (wallets ?? []).find(
    (w) => w.user_id === recipientId && w.address.toLowerCase() === recipientWallet.toLowerCase()
  );

  const senderReport = toSanitizedCounterpartyReport({
    subjectRole: 'sender',
    displayName: senderProfile?.display_name || 'Word Sender',
    walletAddress: senderWallet,
    walletVerified: Boolean(senderWalletRow?.is_verified),
    identityRow: senderIdentity ?? null,
  });

  const recipientReport = toSanitizedCounterpartyReport({
    subjectRole: 'recipient',
    displayName: recipientProfile?.display_name || 'Word Recipient',
    walletAddress: recipientWallet,
    walletVerified: Boolean(recipientWalletRow?.is_verified),
    identityRow: recipientIdentity ?? null,
  });

  const activeSenderApproval =
    (approvals ?? []).find(
      (a) => a.approval_role === 'sender' && a.approval_status === 'approved'
    ) ?? null;
  const activeRecipientApproval =
    (approvals ?? []).find(
      (a) => a.approval_role === 'recipient' && a.approval_status === 'approved'
    ) ?? null;

  return {
    session: rawSession,
    senderReport,
    recipientReport,
    agreement: agreement
      ? {
          id: agreement.id,
          title: agreement.title,
          termsText: agreement.terms_text,
          status: agreement.status,
          version: Number(rawSession.agreement_version ?? 1),
        }
      : null,
    approvals: {
      sender: activeSenderApproval,
      recipient: activeRecipientApproval,
    },
    receipt: receipt ?? null,
  };
}
