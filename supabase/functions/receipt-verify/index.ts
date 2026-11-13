import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { handleCors } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/auth.ts';
import { AppError, errorResponse, jsonResponse } from '../_shared/errors.ts';
import { parseJsonBody, requireString, requireUuid } from '../_shared/validation.ts';
import { recordAuditLog } from '../_shared/logger.ts';
import { enforceRateLimit } from '../_shared/rateLimit.ts';

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { user, adminClient } = await requireAuth(req);
    await enforceRateLimit(adminClient, user.id, 'receipt_verify', 30, 60);

    if (req.method !== 'POST') {
      throw new AppError(405, 'METHOD_NOT_ALLOWED', 'Use POST for receipt-verify.');
    }

    const body = await parseJsonBody<Record<string, unknown>>(req);
    const transactionId = requireUuid(body.transactionId, 'transactionId');
    const txHash = requireString(body.txHash, 'txHash', 12, 128);

    if (!/^0x[a-fA-F0-9]{10,64}$/.test(txHash)) {
      throw new AppError(400, 'INVALID_TX_HASH', 'txHash must be a valid hex transaction hash.');
    }

    const { data: tx } = await adminClient
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .maybeSingle();

    if (!tx) throw new AppError(404, 'TX_NOT_FOUND', 'Transaction not found.');
    if (tx.sender_id !== user.id && tx.recipient_id !== user.id) {
      throw new AppError(403, 'FORBIDDEN', 'Only transaction participants can verify receipts.');
    }
    if (tx.status === 'cancelled') {
      throw new AppError(409, 'TX_CANCELLED', 'Cancelled transactions cannot be verified.');
    }

    const nowIso = new Date().toISOString();
    const requestedState =
      body.awaitingConfirmation === true
        ? 'processing'
        : body.simulateFailure === true || body.outcome === 'failed'
          ? 'failed'
          : 'confirmed';

    const { data: updatedTx, error: updErr } = await adminClient
      .from('transactions')
      .update({
        tx_hash: txHash,
        status: requestedState,
        verified_control: true,
        receipt_verified_at: requestedState === 'confirmed' ? nowIso : null,
      })
      .eq('id', transactionId)
      .select('*')
      .single();

    if (updErr) throw new AppError(500, 'VERIFY_UPDATE_FAILED', updErr.message);

    if (requestedState === 'processing') {
      await recordAuditLog(adminClient, {
        actorUserId: user.id,
        action: 'transaction.broadcasted',
        resourceType: 'transactions',
        resourceId: transactionId,
        metadata: { txHash, network: tx.network },
      });
      return jsonResponse({ transaction: updatedTx, verified: false });
    }

    if (requestedState === 'confirmed' && tx.payment_request_id) {
      await adminClient
        .from('payment_requests')
        .update({ status: 'completed' })
        .eq('id', tx.payment_request_id)
        .eq('status', 'open');
    }

    await adminClient.from('verification_records').insert({
      user_id: user.id,
      transaction_id: transactionId,
      verification_type: 'blockchain_receipt',
      subject_address: tx.recipient_address,
      network: tx.network,
      status: requestedState === 'confirmed' ? 'verified' : 'failed',
      proof_metadata: { tx_hash: txHash, verified_by: 'word_receipt_verifier' },
      verified_at: requestedState === 'confirmed' ? nowIso : null,
    });

    await adminClient.from('notifications').insert({
      user_id: user.id,
      category: 'Payment',
      title:
        requestedState === 'confirmed'
          ? `Transaction confirmed on ${tx.network}`
          : `Transaction failed on ${tx.network}`,
      detail: `${tx.amount_numeric} ${tx.token_symbol} to ${tx.recipient_name} (${txHash.slice(0, 12)}...).`,
      metadata: { transactionId, txHash, status: requestedState },
    });

    await recordAuditLog(adminClient, {
      actorUserId: user.id,
      action: `transaction.receipt_${requestedState}`,
      resourceType: 'transactions',
      resourceId: transactionId,
      metadata: { txHash, network: tx.network },
    });

    return jsonResponse({ transaction: updatedTx, verified: requestedState === 'confirmed' });
  } catch (err) {
    return errorResponse(err);
  }
});

