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
import { recordAuditLog } from '../_shared/logger.ts';
import { enforceRateLimit } from '../_shared/rateLimit.ts';

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

    let recipientId: string | null = null;
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

    const { data: transaction, error } = await adminClient
      .from('transactions')
      .insert({
        payment_request_id: paymentRequestId,
        payment_agreement_id: paymentAgreementId,
        sender_id: user.id,
        recipient_id: recipientId,
        sender_address: senderAddress,
        recipient_name: recipientName,
        recipient_address: recipientAddress,
        amount_numeric: normalizedDecimal,
        amount_atomic: atomic,
        token_symbol: tokenSymbol,
        token_decimals: decimals,
        network,
        purpose,
        status: 'pending',
        verified_control: Boolean(senderAddress),
      })
      .select('*')
      .single();

    if (error) {
      throw new AppError(400, 'PAYMENT_PREPARE_FAILED', error.message);
    }

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

