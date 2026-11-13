import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { handleCors } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/auth.ts';
import { AppError, errorResponse, jsonResponse } from '../_shared/errors.ts';
import { optionalString, parseJsonBody, requireUuid } from '../_shared/validation.ts';
import { recordAuditLog } from '../_shared/logger.ts';
import { enforceRateLimit } from '../_shared/rateLimit.ts';

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { user, adminClient } = await requireAuth(req);
    await enforceRateLimit(adminClient, user.id, 'payment_cancel', 20, 60);

    if (req.method !== 'POST') {
      throw new AppError(405, 'METHOD_NOT_ALLOWED', 'Use POST for payment-cancel.');
    }

    const body = await parseJsonBody<Record<string, unknown>>(req);
    const reason = optionalString(body.reason, 'reason', 300) ?? 'Cancelled by user';

    if (body.transactionId) {
      const txId = requireUuid(body.transactionId, 'transactionId');
      const { data: tx } = await adminClient
        .from('transactions')
        .select('*')
        .eq('id', txId)
        .maybeSingle();

      if (!tx) throw new AppError(404, 'TX_NOT_FOUND', 'Transaction not found.');
      if (tx.sender_id !== user.id) {
        throw new AppError(403, 'FORBIDDEN', 'Only the sender can cancel this pending transaction.');
      }
      if (!['pending', 'processing'].includes(tx.status)) {
        throw new AppError(409, 'CANNOT_CANCEL', `Transaction is already ${tx.status}.`);
      }

      const { data: updated, error } = await adminClient
        .from('transactions')
        .update({ status: 'cancelled' })
        .eq('id', txId)
        .select('*')
        .single();

      if (error) throw new AppError(500, 'CANCEL_FAILED', error.message);

      await recordAuditLog(adminClient, {
        actorUserId: user.id,
        action: 'transaction.cancelled',
        resourceType: 'transactions',
        resourceId: txId,
        metadata: { reason },
      });

      return jsonResponse({ transaction: updated });
    }

    if (body.paymentRequestId) {
      const reqId = requireUuid(body.paymentRequestId, 'paymentRequestId');
      const { data: pr } = await adminClient
        .from('payment_requests')
        .select('*')
        .eq('id', reqId)
        .maybeSingle();

      if (!pr) throw new AppError(404, 'REQUEST_NOT_FOUND', 'Payment request not found.');
      if (pr.creator_id !== user.id) {
        throw new AppError(403, 'FORBIDDEN', 'Only the creator can cancel this payment request.');
      }
      if (pr.status !== 'open') {
        throw new AppError(409, 'CANNOT_CANCEL', `Payment request is already ${pr.status}.`);
      }

      const { data: updated, error } = await adminClient
        .from('payment_requests')
        .update({ status: 'cancelled' })
        .eq('id', reqId)
        .select('*')
        .single();

      if (error) throw new AppError(500, 'CANCEL_FAILED', error.message);

      await recordAuditLog(adminClient, {
        actorUserId: user.id,
        action: 'payment_request.cancelled',
        resourceType: 'payment_requests',
        resourceId: reqId,
        metadata: { reason },
      });

      return jsonResponse({ request: updated });
    }

    throw new AppError(400, 'MISSING_TARGET', 'Provide transactionId or paymentRequestId.');
  } catch (err) {
    return errorResponse(err);
  }
});

