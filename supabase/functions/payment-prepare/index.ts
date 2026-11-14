import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { handleCors } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/auth.ts';
import { AppError, errorResponse, jsonResponse } from '../_shared/errors.ts';
import {
  TOKEN_DECIMALS,
  parseExactAmount,
  parseJsonBody,
  requireAddress,
  requireNetwork,
  requireString,
  requireToken,
  requireUuid,
} from '../_shared/validation.ts';
import { keccak256, toUtf8Bytes } from 'npm:ethers@6.13.4';
import { recordAuditLog } from '../_shared/logger.ts';
import { enforceRateLimit } from '../_shared/rateLimit.ts';
import {
  computeAgreementTermsHash,
  computeCanonicalTransactionHash,
  verifyApprovalTypedDataSignature,
  type CanonicalTransactionPayload,
} from '../_shared/mutualTrustCrypto.ts';
import {
  invalidateMutualSessionsForAgreement,
  isIdentityRowValid,
} from '../_shared/mutualTrustServer.ts';

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { user, adminClient } = await requireAuth(req);
    await enforceRateLimit(adminClient, user.id, 'payment_prepare', 20, 60);

    if (req.method !== 'POST') {
      throw new AppError(405, 'METHOD_NOT_ALLOWED', 'Use POST for payment-prepare.');
    }

    const body = await parseJsonBody<Record<string, unknown>>(req);
    const tokenSymbol = requireToken(body.tokenSymbol ?? 'USDT');
    const decimals = TOKEN_DECIMALS[tokenSymbol] ?? 6;
    const { normalizedDecimal, atomic } = parseExactAmount(body.amount, decimals);
    const network = requireNetwork(body.network);
    const recipientName = requireString(body.recipientName, 'recipientName', 1, 120);
    const recipientAddress = requireAddress(body.recipientAddress, 'recipientAddress');
    const purpose = requireString(body.purpose, 'purpose', 1, 500);
    const senderAddress = body.senderAddress
      ? requireAddress(body.senderAddress, 'senderAddress')
      : null;
    const paymentRequestId = body.paymentRequestId
      ? requireUuid(body.paymentRequestId, 'paymentRequestId')
      : null;
    const paymentAgreementId = body.paymentAgreementId
      ? requireUuid(body.paymentAgreementId, 'paymentAgreementId')
      : null;

    if (!body.mutualSessionId) {
      throw new AppError(
        403,
        'MUTUAL_TRUST_REQUIRED',
        'Mutual Trust Verification and dual-party EIP-712 approvals are required before executing any payment.'
      );
    }
    const mutualSessionId = requireUuid(body.mutualSessionId, 'mutualSessionId');

    const { data: mutualSession } = await adminClient
      .from('mutual_verification_sessions')
      .select('*')
      .eq('id', mutualSessionId)
      .maybeSingle();

    if (!mutualSession) {
      throw new AppError(404, 'MUTUAL_SESSION_NOT_FOUND', 'Mutual Trust Verification session not found.');
    }
    if (mutualSession.sender_id !== user.id) {
      throw new AppError(403, 'FORBIDDEN', 'Only the verified sender can execute this Mutual Trust payment.');
    }
    if (new Date(String(mutualSession.expires_at)).getTime() <= Date.now()) {
      await adminClient
        .from('mutual_verification_sessions')
        .update({ session_state: 'expired' })
        .eq('id', mutualSessionId);
      throw new AppError(409, 'SESSION_EXPIRED', 'Mutual Trust session has expired.');
    }
    if (mutualSession.session_state !== 'authorized') {
      throw new AppError(
        403,
        'MUTUAL_APPROVAL_INCOMPLETE',
        `Transaction cannot execute while Mutual Trust session is "${mutualSession.session_state}". Both parties must verify and approve first.`
      );
    }

    if (
      String(mutualSession.amount_atomic) !== atomic ||
      mutualSession.token_symbol !== tokenSymbol ||
      mutualSession.network !== network ||
      mutualSession.recipient_wallet_address.toLowerCase() !== recipientAddress.toLowerCase() ||
      (senderAddress && mutualSession.sender_wallet_address.toLowerCase() !== senderAddress.toLowerCase()) ||
      (mutualSession.payment_request_id ?? null) !== (paymentRequestId ?? null)
    ) {
      throw new AppError(
        409,
        'CANONICAL_TX_MISMATCH',
        'Payment details do not match the bilaterally approved Mutual Trust transaction.'
      );
    }

    if (mutualSession.payment_agreement_id) {
      const { data: agreement } = await adminClient
        .from('payment_agreements')
        .select('current_version, terms_text')
        .eq('id', String(mutualSession.payment_agreement_id))
        .maybeSingle();
      if (agreement) {
        const liveVer = Number(agreement.current_version ?? 1);
        const liveHash = computeAgreementTermsHash({
          agreementId: String(mutualSession.payment_agreement_id),
          agreementVersion: liveVer,
          termsText: agreement.terms_text,
        });
        if (
          liveHash.toLowerCase() !== String(mutualSession.agreement_terms_hash).toLowerCase() ||
          liveVer !== Number(mutualSession.agreement_version)
        ) {
          await invalidateMutualSessionsForAgreement(
            adminClient,
            String(mutualSession.payment_agreement_id),
            liveVer,
            agreement.terms_text,
            user.id
          );
          throw new AppError(
            409,
            'AGREEMENT_CHANGED_APPROVALS_RESET',
            'Payment agreement terms changed after signing. Bilateral review must restart.'
          );
        }
      }
    }

    const [senderIdentity, recipientIdentity] = await Promise.all([
      mutualSession.sender_identity_id
        ? adminClient
            .from('identity_verification_results')
            .select('*')
            .eq('id', String(mutualSession.sender_identity_id))
            .maybeSingle()
            .then((r) => r.data)
        : Promise.resolve(null),
      mutualSession.recipient_identity_id
        ? adminClient
            .from('identity_verification_results')
            .select('*')
            .eq('id', String(mutualSession.recipient_identity_id))
            .maybeSingle()
            .then((r) => r.data)
        : Promise.resolve(null),
    ]);

    if (!isIdentityRowValid(senderIdentity) || !isIdentityRowValid(recipientIdentity)) {
      throw new AppError(
        403,
        'MUTUAL_IDENTITY_INVALID',
        'Both sender and recipient identity verifications must remain valid before payment execution.'
      );
    }

    const canonicalPayload = mutualSession.canonical_payload as CanonicalTransactionPayload;
    const recomputedCanonicalHash = computeCanonicalTransactionHash(canonicalPayload);
    if (recomputedCanonicalHash.toLowerCase() !== String(mutualSession.canonical_tx_hash).toLowerCase()) {
      throw new AppError(409, 'CANONICAL_HASH_MISMATCH', 'Canonical transaction integrity check failed.');
    }
    if (
      typeof body.canonicalTxHash === 'string' &&
      body.canonicalTxHash.toLowerCase() !== recomputedCanonicalHash.toLowerCase()
    ) {
      throw new AppError(409, 'CANONICAL_HASH_MISMATCH', 'Submitted canonicalTxHash does not match approved session.');
    }

    const { data: activeApprovals } = await adminClient
      .from('transaction_approvals')
      .select('*')
      .eq('session_id', mutualSessionId)
      .eq('canonical_tx_hash', recomputedCanonicalHash)
      .eq('approval_status', 'approved');

    const senderApproval = (activeApprovals ?? []).find(
      (a) => a.approval_role === 'sender' && a.approving_user_id === mutualSession.sender_id
    );
    const recipientApproval = (activeApprovals ?? []).find(
      (a) => a.approval_role === 'recipient' && a.approving_user_id === mutualSession.recipient_id
    );

    if (!senderApproval?.signature || !recipientApproval?.signature) {
      throw new AppError(
        403,
        'DUAL_APPROVAL_REQUIRED',
        'Both sender and recipient must sign EIP-712 approval for this exact transaction before execution.'
      );
    }

    const senderSigCheck = verifyApprovalTypedDataSignature({
      payload: canonicalPayload,
      canonicalHash: recomputedCanonicalHash,
      role: 'sender',
      expectedWalletAddress: String(mutualSession.sender_wallet_address),
      signature: String(senderApproval.signature),
    });
    const recipientSigCheck = verifyApprovalTypedDataSignature({
      payload: canonicalPayload,
      canonicalHash: recomputedCanonicalHash,
      role: 'recipient',
      expectedWalletAddress: String(mutualSession.recipient_wallet_address),
      signature: String(recipientApproval.signature),
    });

    if (!senderSigCheck.valid || !recipientSigCheck.valid) {
      throw new AppError(
        403,
        'INVALID_DUAL_APPROVAL_SIGNATURE',
        !senderSigCheck.valid ? senderSigCheck.reason : (!recipientSigCheck.valid ? recipientSigCheck.reason : 'Invalid signature')
      );
    }

    const { data: existingSessionTx } = await adminClient
      .from('transactions')
      .select('id, status')
      .eq('mutual_session_id', mutualSessionId)
      .in('status', ['pending', 'processing', 'confirmed'])
      .limit(1)
      .maybeSingle();

    if (existingSessionTx) {
      throw new AppError(
        409,
        'DUPLICATE_SUBMISSION',
        `A payment for this Mutual Trust session is already ${existingSessionTx.status}.`
      );
    }

    let recipientId: string | null = mutualSession.recipient_id;
    if (paymentRequestId) {
      const { data: reqRow } = await adminClient
        .from('payment_requests')
        .select(
          'id, creator_id, status, expires_at, amount_atomic, token_symbol, network, recipient_address'
        )
        .eq('id', paymentRequestId)
        .maybeSingle();

      if (!reqRow) {
        throw new AppError(404, 'REQUEST_NOT_FOUND', 'Linked payment request not found.');
      }
      if (
        reqRow.status === 'open' &&
        reqRow.expires_at &&
        new Date(reqRow.expires_at).getTime() <= Date.now()
      ) {
        await adminClient
          .from('payment_requests')
          .update({ status: 'expired' })
          .eq('id', paymentRequestId)
          .eq('status', 'open');
        throw new AppError(400, 'REQUEST_EXPIRED', 'This payment request has expired.');
      }
      if (reqRow.status === 'cancelled' || reqRow.status === 'expired' || reqRow.status === 'completed') {
        throw new AppError(400, 'REQUEST_UNAVAILABLE', `Payment request is ${reqRow.status}.`);
      }
      if (
        String(reqRow.amount_atomic) !== atomic ||
        reqRow.token_symbol !== tokenSymbol ||
        reqRow.network !== network ||
        reqRow.recipient_address.toLowerCase() !== recipientAddress.toLowerCase()
      ) {
        throw new AppError(
          400,
          'REQUEST_TAMPERED',
          'Payment details do not match the authoritative payment request.'
        );
      }
      recipientId = reqRow.creator_id;

      const { data: existingReqTx } = await adminClient
        .from('transactions')
        .select('id, status')
        .eq('sender_id', user.id)
        .eq('payment_request_id', paymentRequestId)
        .in('status', ['pending', 'processing', 'confirmed'])
        .limit(1)
        .maybeSingle();

      if (existingReqTx) {
        throw new AppError(
          409,
          'DUPLICATE_SUBMISSION',
          `A payment for this request is already ${existingReqTx.status}.`
        );
      }
    }

    const recentWindowIso = new Date(Date.now() - 60 * 1000).toISOString();
    const { data: recentDup } = await adminClient
      .from('transactions')
      .select('id, status')
      .eq('sender_id', user.id)
      .eq('recipient_address', recipientAddress)
      .eq('amount_atomic', atomic)
      .eq('token_symbol', tokenSymbol)
      .eq('network', network)
      .in('status', ['pending', 'processing'])
      .gte('created_at', recentWindowIso)
      .limit(1)
      .maybeSingle();

    if (recentDup) {
      throw new AppError(
        409,
        'DUPLICATE_SUBMISSION',
        'A matching payment is already pending or processing. Please wait for confirmation.'
      );
    }

    const resolvedSenderAddress = senderAddress ?? String(mutualSession.sender_wallet_address);
    const resolvedAgreementId = paymentAgreementId ?? mutualSession.payment_agreement_id ?? null;
    const nowIso = new Date().toISOString();

    const { data: transaction, error } = await adminClient
      .from('transactions')
      .insert({
        payment_request_id: paymentRequestId,
        payment_agreement_id: resolvedAgreementId,
        mutual_session_id: mutualSessionId,
        canonical_tx_hash: recomputedCanonicalHash,
        mutual_authorized_at: nowIso,
        sender_id: user.id,
        recipient_id: recipientId,
        sender_address: resolvedSenderAddress,
        recipient_name: recipientName,
        recipient_address: recipientAddress,
        amount_numeric: normalizedDecimal,
        amount_atomic: atomic,
        token_symbol: tokenSymbol,
        token_decimals: decimals,
        network,
        purpose,
        status: 'pending',
        verified_control: Boolean(resolvedSenderAddress),
      })
      .select('*')
      .single();

    if (error) {
      throw new AppError(400, 'PAYMENT_PREPARE_FAILED', error.message);
    }

    await Promise.all([
      adminClient
        .from('mutual_verification_sessions')
        .update({ session_state: 'executing' })
        .eq('id', mutualSessionId),
      adminClient
        .from('transaction_approvals')
        .update({ transaction_id: transaction.id })
        .in('id', [senderApproval.id, recipientApproval.id]),
    ]);

    await adminClient.from('notifications').insert({
      user_id: user.id,
      category: 'Payment',
      title: 'Payment prepared for approval',
      detail: `${normalizedDecimal} ${tokenSymbol} to ${recipientName} (${network}) is pending receipt verification.`,
      metadata: { transactionId: transaction.id },
    });

    await recordAuditLog(adminClient, {
      actorUserId: user.id,
      action: 'transaction.prepared',
      resourceType: 'transactions',
      resourceId: transaction.id,
      metadata: { amount: normalizedDecimal, tokenSymbol, network, recipientAddress },
    });

    return jsonResponse({ transaction }, 201, req);
  } catch (err) {
    return errorResponse(err, req);
  }
});

