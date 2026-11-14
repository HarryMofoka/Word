import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { getAddress, keccak256, toUtf8Bytes } from 'npm:ethers@6.13.4';
import { handleCors } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/auth.ts';
import { AppError, errorResponse, jsonResponse } from '../_shared/errors.ts';
import { recordAuditLog } from '../_shared/logger.ts';
import { enforceRateLimit } from '../_shared/rateLimit.ts';
import {
  TOKEN_DECIMALS,
  assertNoDangerousHtml,
  optionalString,
  parseExactAmount,
  parseJsonBody,
  requireAddress,
  requireNetwork,
  requireString,
  requireToken,
  requireUuid,
} from '../_shared/validation.ts';
import {
  buildApprovalTypedData,
  buildCanonicalTransactionPayload,
  computeAgreementTermsHash,
  computeCanonicalTransactionHash,
  getApprovalStatement,
  resolveAuthoritativeNetworkAndToken,
  verifyApprovalTypedDataSignature,
  type CanonicalTransactionPayload,
  type MutualApprovalRole,
} from '../_shared/mutualTrustCrypto.ts';
import {
  OPEN_MUTUAL_SESSION_STATES,
  deriveMutualSessionState,
  fetchLatestValidOrRecentIdentity,
  hydrateMutualSession,
  insertNotification,
  invalidateMutualSessionsForAgreement,
  isIdentityRowValid,
  mapOutcomeToSessionVerificationStatus,
} from '../_shared/mutualTrustServer.ts';

async function resolveUserWalletAddress(
  adminClient: ReturnType<typeof import('../_shared/auth.ts').getAdminClient>,
  userId: string,
  requestedAddress?: string
): Promise<string> {
  const { data: userWallets } = await adminClient
    .from('wallets')
    .select('address, is_primary, is_verified')
    .eq('user_id', userId)
    .order('is_primary', { ascending: false })
    .order('is_verified', { ascending: false });

  const list = userWallets ?? [];
  if (list.length === 0) {
    throw new AppError(
      400,
      'WALLET_REQUIRED',
      'You must create, import, or connect a wallet on your Word account before initiating Mutual Trust Verification.'
    );
  }

  if (requestedAddress) {
    const match = list.find(
      (w: { address: string; is_verified?: boolean; is_primary?: boolean }) =>
        w.address.toLowerCase() === requestedAddress.toLowerCase()
    );
    if (!match) {
      throw new AppError(
        403,
        'WALLET_NOT_OWNED',
        'Specified wallet address is not linked to your authenticated Word account.'
      );
    }
    return getAddress(match.address);
  }

  const verifiedPrimary =
    list.find(
      (w: { address: string; is_verified?: boolean; is_primary?: boolean }) =>
        w.is_verified && w.is_primary
    ) ??
    list.find(
      (w: { address: string; is_verified?: boolean; is_primary?: boolean }) => w.is_verified
    ) ??
    list[0];
  return getAddress(verifiedPrimary.address);
}

async function refreshSessionExpiryAndIdentities(
  adminClient: ReturnType<typeof import('../_shared/auth.ts').getAdminClient>,
  sessionRow: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const state = String(sessionRow.session_state);
  const openSet = new Set<string>(OPEN_MUTUAL_SESSION_STATES);
  if (!openSet.has(state)) {
    return sessionRow;
  }

  const nowIso = new Date().toISOString();
  if (new Date(String(sessionRow.expires_at)).getTime() <= Date.now()) {
    const { data: expired } = await adminClient
      .from('mutual_verification_sessions')
      .update({ session_state: 'expired' })
      .eq('id', String(sessionRow.id))
      .select('*')
      .single();
    return expired ?? { ...sessionRow, session_state: 'expired' };
  }

  const [senderIdentity, recipientIdentity] = await Promise.all([
    fetchLatestValidOrRecentIdentity(adminClient, String(sessionRow.sender_id)),
    fetchLatestValidOrRecentIdentity(adminClient, String(sessionRow.recipient_id)),
  ]);

  const nextSenderStatus = senderIdentity
    ? mapOutcomeToSessionVerificationStatus(
      senderIdentity.verification_outcome,
      senderIdentity.expires_at,
      senderIdentity.revoked_at
    )
    : 'not_started';
  const nextRecipientStatus = recipientIdentity
    ? mapOutcomeToSessionVerificationStatus(
      recipientIdentity.verification_outcome,
      recipientIdentity.expires_at,
      recipientIdentity.revoked_at
    )
    : 'not_started';

  const senderIdentityId = senderIdentity && !senderIdentity.revoked_at ? senderIdentity.id : null;
  const recipientIdentityId = recipientIdentity && !recipientIdentity.revoked_at ? recipientIdentity.id : null;

  const changed =
    nextSenderStatus !== sessionRow.sender_verification_status ||
    nextRecipientStatus !== sessionRow.recipient_verification_status ||
    senderIdentityId !== sessionRow.sender_identity_id ||
    recipientIdentityId !== sessionRow.recipient_identity_id;

  if (!changed) {
    return sessionRow;
  }

  const updates: Record<string, unknown> = {
    sender_identity_id: senderIdentityId,
    recipient_identity_id: recipientIdentityId,
    sender_verification_status: nextSenderStatus,
    recipient_verification_status: nextRecipientStatus,
  };

  const identityBecameInvalidOrChanged =
    senderIdentityId !== sessionRow.sender_identity_id ||
    recipientIdentityId !== sessionRow.recipient_identity_id ||
    nextSenderStatus !== 'verified' ||
    nextRecipientStatus !== 'verified';

  if (identityBecameInvalidOrChanged && (sessionRow.sender_approved_at || sessionRow.recipient_approved_at)) {
    await adminClient
      .from('transaction_approvals')
      .update({ approval_status: 'revoked', revoked_at: nowIso })
      .eq('session_id', String(sessionRow.id))
      .eq('approval_status', 'approved');
    updates.sender_approved_at = null;
    updates.recipient_approved_at = null;
    updates.sender_report_viewed_at = null;
    updates.recipient_report_viewed_at = null;
  }

  const bothVerified = nextSenderStatus === 'verified' && nextRecipientStatus === 'verified';
  if (bothVerified && !sessionRow.reports_exchanged_at) {
    updates.reports_exchanged_at = nowIso;
  } else if (!bothVerified) {
    updates.reports_exchanged_at = null;
    updates.sender_report_viewed_at = null;
    updates.recipient_report_viewed_at = null;
  }

  const merged = { ...sessionRow, ...updates };
  updates.session_state = deriveMutualSessionState({
    session_state: String(merged.session_state),
    sender_verification_status: String(merged.sender_verification_status),
    recipient_verification_status: String(merged.recipient_verification_status),
    sender_report_viewed_at: merged.sender_report_viewed_at ? String(merged.sender_report_viewed_at) : null,
    recipient_report_viewed_at: merged.recipient_report_viewed_at
      ? String(merged.recipient_report_viewed_at)
      : null,
    sender_approved_at: merged.sender_approved_at ? String(merged.sender_approved_at) : null,
    recipient_approved_at: merged.recipient_approved_at ? String(merged.recipient_approved_at) : null,
    expires_at: String(merged.expires_at),
  });

  const { data: updated } = await adminClient
    .from('mutual_verification_sessions')
    .update(updates)
    .eq('id', String(sessionRow.id))
    .select('*')
    .single();

  return updated ?? { ...sessionRow, ...updates };
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { user, adminClient } = await requireAuth(req);
    await enforceRateLimit(adminClient, user.id, 'mutual_trust', 45, 60);

    if (req.method === 'GET') {
      const url = new URL(req.url);
      const sessionIdParam = url.searchParams.get('sessionId');
      const paymentRequestIdParam = url.searchParams.get('paymentRequestId');
      const shareCodeParam = url.searchParams.get('shareCode');

      if (sessionIdParam) {
        const sessionId = requireUuid(sessionIdParam, 'sessionId');
        const { data: row } = await adminClient
          .from('mutual_verification_sessions')
          .select('*')
          .eq('id', sessionId)
          .maybeSingle();

        if (!row) {
          throw new AppError(404, 'SESSION_NOT_FOUND', 'Mutual verification session not found.');
        }
        if (row.sender_id !== user.id && row.recipient_id !== user.id) {
          throw new AppError(403, 'FORBIDDEN', 'Only session participants can view this Mutual Trust session.');
        }

        const refreshed = await refreshSessionExpiryAndIdentities(adminClient, row);
        const hydrated = await hydrateMutualSession(adminClient, refreshed);
        return jsonResponse(hydrated, 200, req);
      }

      if (paymentRequestIdParam || shareCodeParam) {
        let query = adminClient
          .from('mutual_verification_sessions')
          .select('*')
          .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
          .order('created_at', { ascending: false })
          .limit(1);

        if (paymentRequestIdParam) {
          query = query.eq('payment_request_id', requireUuid(paymentRequestIdParam, 'paymentRequestId'));
        } else if (shareCodeParam) {
          query = query.eq('share_code', requireString(shareCodeParam, 'shareCode', 2, 128));
        }

        const { data: rows } = await query;
        const row = rows?.[0];
        if (!row) {
          return jsonResponse({ session: null }, 200, req);
        }
        const refreshed = await refreshSessionExpiryAndIdentities(adminClient, row);
        const hydrated = await hydrateMutualSession(adminClient, refreshed);
        return jsonResponse(hydrated, 200, req);
      }

      const { data: list, error } = await adminClient
        .from('mutual_verification_sessions')
        .select('*')
        .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
        .order('created_at', { ascending: false })
        .limit(40);

      if (error) {
        throw new AppError(500, 'SESSIONS_FETCH_FAILED', error.message);
      }

      const refreshedList = await Promise.all(
        (list ?? []).map((row: Record<string, unknown>) =>
          refreshSessionExpiryAndIdentities(adminClient, row)
        )
      );
      const hydratedList = await Promise.all(
        refreshedList.map((row: Record<string, unknown>) =>
          hydrateMutualSession(adminClient, row)
        )
      );

      return jsonResponse({ sessions: hydratedList }, 200, req);
    }

    if (req.method === 'POST') {
      const body = await parseJsonBody<Record<string, unknown>>(req);
      const action = requireString(body.action, 'action', 3, 40);
      const nowIso = new Date().toISOString();

      if (action === 'create_or_join') {
        if (body.sessionId) {
          const existingId = requireUuid(body.sessionId, 'sessionId');
          const { data: row } = await adminClient
            .from('mutual_verification_sessions')
            .select('*')
            .eq('id', existingId)
            .maybeSingle();
          if (!row) throw new AppError(404, 'SESSION_NOT_FOUND', 'Mutual verification session not found.');
          if (row.sender_id !== user.id && row.recipient_id !== user.id) {
            throw new AppError(403, 'FORBIDDEN', 'You are not a participant in this session.');
          }
          const refreshed = await refreshSessionExpiryAndIdentities(adminClient, row);
          const hydrated = await hydrateMutualSession(adminClient, refreshed);
          return jsonResponse({ created: false, ...hydrated }, 200, req);
        }

        const paymentRequestIdInput = body.paymentRequestId
          ? requireUuid(body.paymentRequestId, 'paymentRequestId')
          : null;
        const shareCodeInput = optionalString(body.shareCode, 'shareCode', 128);
        let paymentAgreementId = body.paymentAgreementId
          ? requireUuid(body.paymentAgreementId, 'paymentAgreementId')
          : null;

        let paymentRequestId: string | null = null;
        let shareCode: string | null = shareCodeInput ?? null;
        let recipientId: string;
        let recipientWalletAddress: string;
        let senderId: string = user.id;
        let senderWalletAddress: string;
        let amountNumeric: string;
        let amountAtomic: string;
        let tokenSymbol: string;
        let tokenDecimals: number;
        let network: string;
        let purpose: string;
        let termsTextForHash = '';

        if (paymentRequestIdInput || shareCodeInput) {
          let prQuery = adminClient.from('payment_requests').select('*');
          if (paymentRequestIdInput) {
            prQuery = prQuery.eq('id', paymentRequestIdInput);
          } else {
            prQuery = prQuery.eq('share_code', shareCodeInput!);
          }
          const { data: reqRow } = await prQuery.maybeSingle();
          if (!reqRow) {
            throw new AppError(404, 'REQUEST_NOT_FOUND', 'Linked payment request not found.');
          }
          if (reqRow.status !== 'open') {
            throw new AppError(
              409,
              'REQUEST_UNAVAILABLE',
              `Cannot start Mutual Trust Verification: request is ${reqRow.status}.`
            );
          }
          if (reqRow.expires_at && new Date(reqRow.expires_at).getTime() <= Date.now()) {
            throw new AppError(409, 'REQUEST_EXPIRED', 'Linked payment request has expired.');
          }

          paymentRequestId = reqRow.id;
          shareCode = reqRow.share_code;
          recipientId = reqRow.creator_id;
          recipientWalletAddress = getAddress(reqRow.recipient_address);

          if (recipientId === user.id) {
            // Check if an existing sender already started a session for this request
            const { data: recipientViewRow } = await adminClient
              .from('mutual_verification_sessions')
              .select('*')
              .eq('payment_request_id', reqRow.id)
              .eq('recipient_id', user.id)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            if (recipientViewRow) {
              const refreshed = await refreshSessionExpiryAndIdentities(adminClient, recipientViewRow);
              const hydrated = await hydrateMutualSession(adminClient, refreshed);
              return jsonResponse({ created: false, ...hydrated }, 200, req);
            }
            throw new AppError(
              400,
              'AWAITING_SENDER_JOIN',
              'Wait for the payer to open your payment link, or invite a payer directly by wallet address.'
            );
          }

          senderId = user.id;
          senderWalletAddress = await resolveUserWalletAddress(
            adminClient,
            senderId,
            body.senderWalletAddress ? requireAddress(body.senderWalletAddress, 'senderWalletAddress') : undefined
          );

          tokenSymbol = reqRow.token_symbol;
          tokenDecimals = Number(reqRow.token_decimals ?? TOKEN_DECIMALS[tokenSymbol] ?? 6);
          amountNumeric = String(reqRow.amount_numeric);
          amountAtomic = String(reqRow.amount_atomic);
          network = reqRow.network;
          purpose = reqRow.description;
          termsTextForHash = reqRow.terms ?? reqRow.description;
        } else {
          tokenSymbol = requireToken(body.tokenSymbol ?? 'USDT');
          tokenDecimals = TOKEN_DECIMALS[tokenSymbol] ?? 6;
          const parsedAmt = parseExactAmount(body.amount, tokenDecimals);
          amountNumeric = parsedAmt.normalizedDecimal;
          amountAtomic = parsedAmt.atomic;
          network = requireNetwork(body.network);
          purpose = assertNoDangerousHtml(
            requireString(body.purpose ?? 'Word Mutual Trust Payment', 'purpose', 1, 500),
            'purpose'
          );
          recipientWalletAddress = requireAddress(body.recipientAddress, 'recipientAddress');
          senderWalletAddress = await resolveUserWalletAddress(
            adminClient,
            user.id,
            body.senderWalletAddress ? requireAddress(body.senderWalletAddress, 'senderWalletAddress') : undefined
          );

          const { data: recipientWallets } = await adminClient
            .from('wallets')
            .select('user_id, address, is_verified, is_primary')
            .ilike('address', recipientWalletAddress)
            .order('is_verified', { ascending: false })
            .order('is_primary', { ascending: false })
            .limit(3);

          const matchedRecipientWallet = (recipientWallets ?? [])[0];
          if (!matchedRecipientWallet) {
            throw new AppError(
              404,
              'RECIPIENT_NOT_REGISTERED',
              'Recipient wallet is not linked to an authenticated Word account. Both participants must have a Word account for bilateral verification.'
            );
          }
          recipientId = matchedRecipientWallet.user_id;
          termsTextForHash = purpose;
        }

        if (senderId === recipientId) {
          throw new AppError(
            400,
            'SELF_TRANSFER_UNSUPPORTED',
            'Sender and recipient must be two distinct Word accounts for Mutual Trust Verification.'
          );
        }

        if (body.forceNew !== true) {
          let dupQuery = adminClient
            .from('mutual_verification_sessions')
            .select('*')
            .eq('sender_id', senderId)
            .eq('recipient_id', recipientId)
            .in('session_state', [...OPEN_MUTUAL_SESSION_STATES])
            .order('created_at', { ascending: false })
            .limit(1);

          if (paymentRequestId) {
            dupQuery = dupQuery.eq('payment_request_id', paymentRequestId);
          } else {
            dupQuery = dupQuery
              .ilike('recipient_wallet_address', recipientWalletAddress)
              .eq('amount_atomic', amountAtomic)
              .eq('token_symbol', tokenSymbol)
              .eq('network', network);
          }

          const { data: existingSession } = await dupQuery.maybeSingle();
          if (existingSession) {
            const refreshed = await refreshSessionExpiryAndIdentities(adminClient, existingSession);
            const hydrated = await hydrateMutualSession(adminClient, refreshed);
            return jsonResponse({ created: false, ...hydrated }, 200, req);
          }
        }

        let agreementVersion = 0;
        if (!paymentAgreementId && paymentRequestId) {
          const { data: linkedAgreement } = await adminClient
            .from('payment_agreements')
            .select('id, current_version, terms_text, creator_id, counterparty_id')
            .eq('payment_request_id', paymentRequestId)
            .maybeSingle();
          if (linkedAgreement) {
            paymentAgreementId = linkedAgreement.id;
            agreementVersion = Number(linkedAgreement.current_version ?? 1);
            termsTextForHash = linkedAgreement.terms_text;
          }
        } else if (paymentAgreementId) {
          const { data: agreementRow } = await adminClient
            .from('payment_agreements')
            .select('id, current_version, terms_text, creator_id, counterparty_id')
            .eq('id', paymentAgreementId)
            .maybeSingle();
          if (!agreementRow) {
            throw new AppError(404, 'AGREEMENT_NOT_FOUND', 'Linked payment agreement not found.');
          }
          agreementVersion = Number(agreementRow.current_version ?? 1);
          termsTextForHash = agreementRow.terms_text;
        }

        const { chainId, tokenAddress } = resolveAuthoritativeNetworkAndToken(network, tokenSymbol);
        const sessionId = crypto.randomUUID();
        const canonicalNonce = keccak256(toUtf8Bytes(`${sessionId}:${crypto.randomUUID()}`));
        const expiresAtMs = Date.now() + 30 * 60_000;
        const expiresAtIso = new Date(expiresAtMs).toISOString();
        const expiresAtUnix = Math.floor(expiresAtMs / 1000);
        const agreementTermsHash = computeAgreementTermsHash({
          agreementId: paymentAgreementId,
          agreementVersion,
          termsText: termsTextForHash || purpose,
        });

        const canonicalPayload: CanonicalTransactionPayload = buildCanonicalTransactionPayload({
          sessionId,
          paymentRequestId: paymentRequestId ?? '',
          agreementId: paymentAgreementId ?? '',
          agreementVersion,
          agreementTermsHash,
          senderUserId: senderId,
          senderWallet: senderWalletAddress,
          recipientUserId: recipientId,
          recipientWallet: recipientWalletAddress,
          amountAtomic,
          tokenAddress,
          tokenSymbol,
          chainId,
          nonce: canonicalNonce,
          expiresAtUnix,
        });
        const canonicalTxHash = computeCanonicalTransactionHash(canonicalPayload);

        const [senderIdentity, recipientIdentity] = await Promise.all([
          fetchLatestValidOrRecentIdentity(adminClient, senderId),
          fetchLatestValidOrRecentIdentity(adminClient, recipientId),
        ]);

        const senderVerificationStatus = senderIdentity
          ? mapOutcomeToSessionVerificationStatus(
            senderIdentity.verification_outcome,
            senderIdentity.expires_at,
            senderIdentity.revoked_at
          )
          : 'not_started';
        const recipientVerificationStatus = recipientIdentity
          ? mapOutcomeToSessionVerificationStatus(
            recipientIdentity.verification_outcome,
            recipientIdentity.expires_at,
            recipientIdentity.revoked_at
          )
          : 'not_started';

        const bothVerified =
          senderVerificationStatus === 'verified' && recipientVerificationStatus === 'verified';

        const initialState = deriveMutualSessionState({
          session_state: 'invited',
          sender_verification_status: senderVerificationStatus,
          recipient_verification_status: recipientVerificationStatus,
          sender_report_viewed_at: null,
          recipient_report_viewed_at: null,
          sender_approved_at: null,
          recipient_approved_at: null,
          expires_at: expiresAtIso,
        });

        const { data: inserted, error: insertErr } = await adminClient
          .from('mutual_verification_sessions')
          .insert({
            id: sessionId,
            payment_request_id: paymentRequestId,
            payment_agreement_id: paymentAgreementId,
            share_code: shareCode,
            sender_id: senderId,
            recipient_id: recipientId,
            sender_wallet_address: senderWalletAddress,
            recipient_wallet_address: recipientWalletAddress,
            sender_identity_id: senderIdentity && !senderIdentity.revoked_at ? senderIdentity.id : null,
            recipient_identity_id: recipientIdentity && !recipientIdentity.revoked_at ? recipientIdentity.id : null,
            sender_verification_status: senderVerificationStatus,
            recipient_verification_status: recipientVerificationStatus,
            reports_exchanged_at: bothVerified ? nowIso : null,
            amount_numeric: amountNumeric,
            amount_atomic: amountAtomic,
            token_symbol: tokenSymbol,
            token_decimals: tokenDecimals,
            token_address: tokenAddress,
            network,
            chain_id: chainId,
            purpose,
            agreement_version: agreementVersion,
            agreement_terms_hash: agreementTermsHash,
            canonical_nonce: canonicalNonce,
            canonical_payload: canonicalPayload,
            canonical_tx_hash: canonicalTxHash,
            session_state: initialState,
            verification_expires_at: expiresAtIso,
            expires_at: expiresAtIso,
          })
          .select('*')
          .single();

        if (insertErr || !inserted) {
          throw new AppError(
            500,
            'MUTUAL_SESSION_CREATE_FAILED',
            insertErr?.message ?? 'Could not create Mutual Trust session.'
          );
        }

        await insertNotification(adminClient, {
          userId: recipientId,
          category: 'Verification',
          title: 'Mutual Trust invitation received',
          detail: `A sender initiated ${amountNumeric} ${tokenSymbol} on ${network}. Complete facial verification and review the transaction.`,
          metadata: { mutualSessionId: sessionId, paymentRequestId },
        });

        await recordAuditLog(adminClient, {
          actorUserId: user.id,
          action: 'mutual_trust_session_created',
          resourceType: 'mutual_verification_session',
          resourceId: sessionId,
          metadata: {
            senderId,
            recipientId,
            canonicalTxHash,
            network,
            tokenSymbol,
            amountNumeric,
          },
        });

        const hydrated = await hydrateMutualSession(adminClient, inserted);
        return jsonResponse({ created: true, ...hydrated }, 201, req);
      }

      if (action === 'sync_identity') {
        const sessionId = requireUuid(body.sessionId, 'sessionId');
        const { data: row } = await adminClient
          .from('mutual_verification_sessions')
          .select('*')
          .eq('id', sessionId)
          .maybeSingle();

        if (!row) throw new AppError(404, 'SESSION_NOT_FOUND', 'Mutual verification session not found.');
        if (row.sender_id !== user.id && row.recipient_id !== user.id) {
          throw new AppError(403, 'FORBIDDEN', 'Only session participants can sync identity status.');
        }

        const refreshed = await refreshSessionExpiryAndIdentities(adminClient, row);
        const hydrated = await hydrateMutualSession(adminClient, refreshed);
        return jsonResponse(hydrated, 200, req);
      }

      if (action === 'acknowledge_report') {
        const sessionId = requireUuid(body.sessionId, 'sessionId');
        const { data: row } = await adminClient
          .from('mutual_verification_sessions')
          .select('*')
          .eq('id', sessionId)
          .maybeSingle();

        if (!row) throw new AppError(404, 'SESSION_NOT_FOUND', 'Mutual verification session not found.');
        if (row.sender_id !== user.id && row.recipient_id !== user.id) {
          throw new AppError(403, 'FORBIDDEN', 'Only session participants can review verification reports.');
        }

        const refreshed = await refreshSessionExpiryAndIdentities(adminClient, row);
        if (refreshed.session_state === 'expired' || refreshed.session_state === 'declined') {
          throw new AppError(409, 'SESSION_CLOSED', `Session is ${refreshed.session_state}.`);
        }
        if (
          refreshed.sender_verification_status !== 'verified' ||
          refreshed.recipient_verification_status !== 'verified'
        ) {
          throw new AppError(
            409,
            'MUTUAL_VERIFICATION_INCOMPLETE',
            'Both sender and recipient must complete verification before reviewing counterparty reports.'
          );
        }

        const isSender = refreshed.sender_id === user.id;
        const updates: Record<string, unknown> = isSender
          ? { sender_report_viewed_at: refreshed.sender_report_viewed_at ?? nowIso }
          : { recipient_report_viewed_at: refreshed.recipient_report_viewed_at ?? nowIso };

        const merged = { ...refreshed, ...updates };
        updates.session_state = deriveMutualSessionState({
          session_state: String(merged.session_state),
          sender_verification_status: String(merged.sender_verification_status),
          recipient_verification_status: String(merged.recipient_verification_status),
          sender_report_viewed_at: merged.sender_report_viewed_at ? String(merged.sender_report_viewed_at) : null,
          recipient_report_viewed_at: merged.recipient_report_viewed_at
            ? String(merged.recipient_report_viewed_at)
            : null,
          sender_approved_at: merged.sender_approved_at ? String(merged.sender_approved_at) : null,
          recipient_approved_at: merged.recipient_approved_at ? String(merged.recipient_approved_at) : null,
          expires_at: String(merged.expires_at),
        });

        const { data: updated } = await adminClient
          .from('mutual_verification_sessions')
          .update(updates)
          .eq('id', sessionId)
          .select('*')
          .single();

        const hydrated = await hydrateMutualSession(adminClient, updated ?? merged);
        return jsonResponse(hydrated, 200, req);
      }

      if (action === 'submit_approval') {
        const sessionId = requireUuid(body.sessionId, 'sessionId');
        const canonicalTxHashInput = requireString(body.canonicalTxHash, 'canonicalTxHash', 66, 66);
        const signature = requireString(body.signature, 'signature', 64, 300);
        const signerAddress = requireAddress(body.signerAddress, 'signerAddress');
        if (body.statementAccepted !== true) {
          throw new AppError(
            400,
            'APPROVAL_STATEMENT_REQUIRED',
            'Explicit confirmation statement acceptance is required.'
          );
        }

        const { data: rawRow } = await adminClient
          .from('mutual_verification_sessions')
          .select('*')
          .eq('id', sessionId)
          .maybeSingle();

        if (!rawRow) throw new AppError(404, 'SESSION_NOT_FOUND', 'Mutual verification session not found.');
        if (rawRow.sender_id !== user.id && rawRow.recipient_id !== user.id) {
          throw new AppError(403, 'FORBIDDEN', 'Only transaction participants can sign approvals.');
        }

        const session = await refreshSessionExpiryAndIdentities(adminClient, rawRow);
        if (['expired', 'declined', 'completed', 'executing', 'failed'].includes(String(session.session_state))) {
          throw new AppError(
            409,
            'SESSION_NOT_APPROVABLE',
            `Cannot approve transaction in state "${session.session_state}".`
          );
        }

        if (session.payment_agreement_id) {
          const { data: agreement } = await adminClient
            .from('payment_agreements')
            .select('current_version, terms_text')
            .eq('id', String(session.payment_agreement_id))
            .maybeSingle();

          if (agreement) {
            const liveVersion = Number(agreement.current_version ?? 1);
            const liveTermsHash = computeAgreementTermsHash({
              agreementId: String(session.payment_agreement_id),
              agreementVersion: liveVersion,
              termsText: agreement.terms_text,
            });
            if (
              liveTermsHash.toLowerCase() !== String(session.agreement_terms_hash).toLowerCase() ||
              liveVersion !== Number(session.agreement_version)
            ) {
              await invalidateMutualSessionsForAgreement(
                adminClient,
                String(session.payment_agreement_id),
                liveVersion,
                agreement.terms_text,
                user.id
              );
              throw new AppError(
                409,
                'TRANSACTION_MODIFIED_APPROVAL_RESET',
                'Agreement terms changed. Previous approvals were invalidated and transaction review has restarted.'
              );
            }
          }
        }

        const [senderIdentity, recipientIdentity] = await Promise.all([
          session.sender_identity_id
            ? adminClient
              .from('identity_verification_results')
              .select('*')
              .eq('id', String(session.sender_identity_id))
              .maybeSingle()
              .then((r: { data: Record<string, unknown> | null }) => r.data)
            : Promise.resolve(null),
          session.recipient_identity_id
            ? adminClient
              .from('identity_verification_results')
              .select('*')
              .eq('id', String(session.recipient_identity_id))
              .maybeSingle()
              .then((r: { data: Record<string, unknown> | null }) => r.data)
            : Promise.resolve(null),
        ]);

        if (!isIdentityRowValid(senderIdentity) || !isIdentityRowValid(recipientIdentity)) {
          throw new AppError(
            409,
            'MUTUAL_IDENTITY_NOT_VALID',
            'Both sender and recipient must hold currently valid, unexpired identity verifications before signing approval.'
          );
        }

        const canonicalPayload = session.canonical_payload as CanonicalTransactionPayload;
        const recomputedHash = computeCanonicalTransactionHash(canonicalPayload);
        if (
          recomputedHash.toLowerCase() !== String(session.canonical_tx_hash).toLowerCase() ||
          canonicalTxHashInput.toLowerCase() !== recomputedHash.toLowerCase()
        ) {
          throw new AppError(
            409,
            'CANONICAL_HASH_MISMATCH',
            'Transaction details changed or canonical hash mismatch detected. Refresh and review the latest payload.'
          );
        }

        const role: MutualApprovalRole = session.sender_id === user.id ? 'sender' : 'recipient';
        const expectedWallet =
          role === 'sender'
            ? String(session.sender_wallet_address)
            : String(session.recipient_wallet_address);

        if (signerAddress.toLowerCase() !== expectedWallet.toLowerCase()) {
          throw new AppError(
            403,
            'SIGNER_WALLET_MISMATCH',
            `You must sign with your bound ${role} wallet (${expectedWallet}).`
          );
        }

        const sigVerification = verifyApprovalTypedDataSignature({
          payload: canonicalPayload,
          canonicalHash: recomputedHash,
          role,
          expectedWalletAddress: expectedWallet,
          signature,
        });

        if (!sigVerification.valid) {
          throw new AppError(403, 'INVALID_APPROVAL_SIGNATURE', sigVerification.reason);
        }

        const { data: existingApproval } = await adminClient
          .from('transaction_approvals')
          .select('id')
          .eq('session_id', sessionId)
          .eq('approving_user_id', user.id)
          .eq('canonical_tx_hash', recomputedHash)
          .eq('approval_status', 'approved')
          .maybeSingle();

        if (!existingApproval) {
          const typedData = buildApprovalTypedData({
            payload: canonicalPayload,
            canonicalHash: recomputedHash,
            role,
          });

          const { error: apprErr } = await adminClient.from('transaction_approvals').insert({
            session_id: sessionId,
            canonical_tx_hash: recomputedHash,
            approving_user_id: user.id,
            approving_wallet_address: expectedWallet,
            approval_role: role,
            approval_status: 'approved',
            statement_text: getApprovalStatement(role),
            signature,
            signature_type: 'eip712_wallet',
            eip712_domain: typedData.domain,
            eip712_message: typedData.message,
            recovered_address: sigVerification.recoveredAddress,
            approved_at: nowIso,
            expires_at: String(session.expires_at),
          });

          if (apprErr && apprErr.code !== '23505') {
            throw new AppError(500, 'APPROVAL_SAVE_FAILED', apprErr.message);
          }
        }

        const updates: Record<string, unknown> =
          role === 'sender'
            ? {
              sender_report_viewed_at: session.sender_report_viewed_at ?? nowIso,
              sender_approved_at: nowIso,
            }
            : {
              recipient_report_viewed_at: session.recipient_report_viewed_at ?? nowIso,
              recipient_approved_at: nowIso,
            };

        const merged = { ...session, ...updates };
        const nextState = deriveMutualSessionState({
          session_state: String(merged.session_state),
          sender_verification_status: String(merged.sender_verification_status),
          recipient_verification_status: String(merged.recipient_verification_status),
          sender_report_viewed_at: merged.sender_report_viewed_at ? String(merged.sender_report_viewed_at) : null,
          recipient_report_viewed_at: merged.recipient_report_viewed_at
            ? String(merged.recipient_report_viewed_at)
            : null,
          sender_approved_at: merged.sender_approved_at ? String(merged.sender_approved_at) : null,
          recipient_approved_at: merged.recipient_approved_at ? String(merged.recipient_approved_at) : null,
          expires_at: String(merged.expires_at),
        });
        updates.session_state = nextState;

        const { data: updatedSession } = await adminClient
          .from('mutual_verification_sessions')
          .update(updates)
          .eq('id', sessionId)
          .select('*')
          .single();

        const counterpartyId = role === 'sender' ? String(session.recipient_id) : String(session.sender_id);
        await insertNotification(adminClient, {
          userId: counterpartyId,
          category: 'Verification',
          title:
            nextState === 'authorized'
              ? 'Dual authorization complete — ready to pay'
              : `${role === 'sender' ? 'Sender' : 'Recipient'} signed transaction approval`,
          detail:
            nextState === 'authorized'
              ? `Both parties signed EIP-712 consent for ${session.amount_numeric} ${session.token_symbol}. Sender may now execute settlement.`
              : `Counterparty signed EIP-712 approval. Review & sign to authorize execution.`,
          metadata: { mutualSessionId: sessionId, canonicalTxHash: recomputedHash },
        });

        await recordAuditLog(adminClient, {
          actorUserId: user.id,
          action: 'mutual_trust_approval_signed',
          resourceType: 'mutual_verification_session',
          resourceId: sessionId,
          metadata: {
            role,
            recoveredAddress: sigVerification.recoveredAddress,
            canonicalTxHash: recomputedHash,
            nextState,
          },
        });

        const hydrated = await hydrateMutualSession(adminClient, updatedSession ?? merged);
        return jsonResponse(hydrated, 200, req);
      }

      if (action === 'decline') {
        const sessionId = requireUuid(body.sessionId, 'sessionId');
        const reason = assertNoDangerousHtml(
          optionalString(body.reason, 'reason', 300) ?? 'Declined by participant during Mutual Trust review.',
          'reason'
        );

        const { data: row } = await adminClient
          .from('mutual_verification_sessions')
          .select('*')
          .eq('id', sessionId)
          .maybeSingle();

        if (!row) throw new AppError(404, 'SESSION_NOT_FOUND', 'Mutual verification session not found.');
        if (row.sender_id !== user.id && row.recipient_id !== user.id) {
          throw new AppError(403, 'FORBIDDEN', 'Only transaction participants can decline this session.');
        }
        if (row.session_state === 'completed' || row.session_state === 'executing') {
          throw new AppError(
            409,
            'CANNOT_DECLINE_IN_PROGRESS',
            'Cannot decline after payment execution has started.'
          );
        }

        const role: MutualApprovalRole = row.sender_id === user.id ? 'sender' : 'recipient';
        const walletAddress =
          role === 'sender' ? String(row.sender_wallet_address) : String(row.recipient_wallet_address);

        await adminClient
          .from('transaction_approvals')
          .update({ approval_status: 'revoked', revoked_at: nowIso })
          .eq('session_id', sessionId)
          .eq('approval_status', 'approved');

        await adminClient.from('transaction_approvals').insert({
          session_id: sessionId,
          canonical_tx_hash: String(row.canonical_tx_hash),
          approving_user_id: user.id,
          approving_wallet_address: walletAddress,
          approval_role: role,
          approval_status: 'declined',
          statement_text: `Declined: ${reason}`,
          signature: null,
          signature_type: 'decline_record',
          decline_reason: reason,
          expires_at: String(row.expires_at),
        });

        const { data: declinedRow } = await adminClient
          .from('mutual_verification_sessions')
          .update({
            session_state: 'declined',
            declined_by: user.id,
            decline_reason: reason,
          })
          .eq('id', sessionId)
          .select('*')
          .single();

        const counterpartyId = role === 'sender' ? String(row.recipient_id) : String(row.sender_id);
        await insertNotification(adminClient, {
          userId: counterpartyId,
          category: 'Security',
          title: 'Mutual Trust transaction declined',
          detail: `${role === 'sender' ? 'Sender' : 'Recipient'} declined transaction (${reason}).`,
          metadata: { mutualSessionId: sessionId },
        });

        await recordAuditLog(adminClient, {
          actorUserId: user.id,
          action: 'mutual_trust_session_declined',
          resourceType: 'mutual_verification_session',
          resourceId: sessionId,
          metadata: { role, reason },
        });

        const hydrated = await hydrateMutualSession(adminClient, declinedRow ?? row);
        return jsonResponse(hydrated, 200, req);
      }

      if (action === 'invalidate_on_change') {
        const sessionId = requireUuid(body.sessionId, 'sessionId');
        const { data: row } = await adminClient
          .from('mutual_verification_sessions')
          .select('*')
          .eq('id', sessionId)
          .maybeSingle();

        if (!row) throw new AppError(404, 'SESSION_NOT_FOUND', 'Mutual verification session not found.');
        if (row.sender_id !== user.id) {
          throw new AppError(403, 'FORBIDDEN', 'Only the transaction sender may modify transaction parameters.');
        }
        if (row.session_state === 'completed' || row.session_state === 'executing') {
          throw new AppError(409, 'TX_LOCKED', 'Cannot modify transaction details after execution starts.');
        }

        const nextToken = body.tokenSymbol ? requireToken(body.tokenSymbol) : String(row.token_symbol);
        const decimals = TOKEN_DECIMALS[nextToken] ?? 6;
        const parsedAmt = body.amount
          ? parseExactAmount(body.amount, decimals)
          : { normalizedDecimal: String(row.amount_numeric), atomic: String(row.amount_atomic) };
        const nextNetwork = body.network ? requireNetwork(body.network) : String(row.network);
        const nextPurpose = body.purpose
          ? assertNoDangerousHtml(requireString(body.purpose, 'purpose', 1, 500), 'purpose')
          : String(row.purpose);
        const nextRecipientWallet = body.recipientAddress
          ? requireAddress(body.recipientAddress, 'recipientAddress')
          : String(row.recipient_wallet_address);

        const { chainId, tokenAddress } = resolveAuthoritativeNetworkAndToken(nextNetwork, nextToken);
        const oldPayload = row.canonical_payload as CanonicalTransactionPayload;
        const freshNonce = keccak256(toUtf8Bytes(`${sessionId}:mod:${crypto.randomUUID()}`));

        const nextPayload = buildCanonicalTransactionPayload({
          ...oldPayload,
          recipientWallet: nextRecipientWallet,
          amountAtomic: parsedAmt.atomic,
          tokenAddress,
          tokenSymbol: nextToken,
          chainId,
          nonce: freshNonce,
        });
        const nextHash = computeCanonicalTransactionHash(nextPayload);

        await adminClient
          .from('transaction_approvals')
          .update({ approval_status: 'revoked', revoked_at: nowIso })
          .eq('session_id', sessionId)
          .eq('approval_status', 'approved');

        const nextState = deriveMutualSessionState({
          session_state: 'verifying',
          sender_verification_status: String(row.sender_verification_status),
          recipient_verification_status: String(row.recipient_verification_status),
          sender_report_viewed_at: null,
          recipient_report_viewed_at: null,
          sender_approved_at: null,
          recipient_approved_at: null,
          expires_at: String(row.expires_at),
        });

        const { data: updatedRow } = await adminClient
          .from('mutual_verification_sessions')
          .update({
            recipient_wallet_address: nextRecipientWallet,
            amount_numeric: parsedAmt.normalizedDecimal,
            amount_atomic: parsedAmt.atomic,
            token_symbol: nextToken,
            token_decimals: decimals,
            token_address: tokenAddress,
            network: nextNetwork,
            chain_id: chainId,
            purpose: nextPurpose,
            canonical_nonce: freshNonce,
            canonical_payload: nextPayload,
            canonical_tx_hash: nextHash,
            sender_approved_at: null,
            recipient_approved_at: null,
            sender_report_viewed_at: null,
            recipient_report_viewed_at: null,
            session_state: nextState,
          })
          .eq('id', sessionId)
          .select('*')
          .single();

        await insertNotification(adminClient, {
          userId: String(row.recipient_id),
          category: 'Security',
          title: 'Transaction parameters changed — approvals reset',
          detail: `Sender updated transaction terms (${parsedAmt.normalizedDecimal} ${nextToken} on ${nextNetwork}). All prior signatures were invalidated.`,
          metadata: { mutualSessionId: sessionId, canonicalTxHash: nextHash },
        });

        await recordAuditLog(adminClient, {
          actorUserId: user.id,
          action: 'mutual_trust_approvals_invalidated',
          resourceType: 'mutual_verification_session',
          resourceId: sessionId,
          metadata: { reason: 'transaction_modified', nextHash },
        });

        const hydrated = await hydrateMutualSession(adminClient, updatedRow ?? row);
        return jsonResponse(hydrated, 200, req);
      }

      throw new AppError(400, 'INVALID_ACTION', `Unsupported action: ${action}`);
    }

    throw new AppError(405, 'METHOD_NOT_ALLOWED', 'Unsupported HTTP method.');
  } catch (err) {
    return errorResponse(err, req);
  }
});
