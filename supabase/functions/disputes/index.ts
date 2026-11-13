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
    const { user, userClient, adminClient } = await requireAuth(req);
    await enforceRateLimit(adminClient, user.id, 'disputes', 30, 60);

    if (req.method === 'GET') {
      const { data, error } = await userClient
        .from('disputes')
        .select('*, evidence(*)')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw new AppError(500, 'DISPUTES_FETCH_FAILED', error.message);
      return jsonResponse({ disputes: data ?? [] }, 200, req);
    }

    if (req.method === 'POST') {
      const body = await parseJsonBody<Record<string, unknown>>(req);
      const transactionId = requireUuid(body.transactionId, 'transactionId');
      const reason = requireString(body.reason, 'reason', 3, 200);
      const summary = requireString(body.summary, 'summary', 5, 2000);

      const { data: tx } = await adminClient
        .from('transactions')
        .select('*')
        .eq('id', transactionId)
        .maybeSingle();

      if (!tx) throw new AppError(404, 'TX_NOT_FOUND', 'Transaction not found.');
      if (tx.sender_id !== user.id && tx.recipient_id !== user.id) {
        throw new AppError(403, 'FORBIDDEN', 'Only transaction participants can open a dispute.');
      }

      const counterpartyId = tx.sender_id === user.id ? tx.recipient_id : tx.sender_id;

      const { data: dispute, error } = await adminClient
        .from('disputes')
        .insert({
          transaction_id: transactionId,
          payment_agreement_id: tx.payment_agreement_id,
          reporter_id: user.id,
          counterparty_id: counterpartyId,
          reason,
          summary,
          status: 'open',
        })
        .select('*, evidence(*)')
        .single();

      if (error) throw new AppError(400, 'DISPUTE_CREATE_FAILED', error.message);

      await adminClient.from('notifications').insert({
        user_id: user.id,
        category: 'Dispute',
        title: 'Dispute opened',
        detail: `Dispute logged for ${tx.amount_numeric} ${tx.token_symbol} (${reason}).`,
        metadata: { disputeId: dispute.id, transactionId },
      });

      await recordAuditLog(adminClient, {
        actorUserId: user.id,
        action: 'dispute.created',
        resourceType: 'disputes',
        resourceId: dispute.id,
        metadata: { transactionId, reason },
      });

      return jsonResponse({ dispute }, 201, req);
    }

    throw new AppError(405, 'METHOD_NOT_ALLOWED', 'Unsupported HTTP method.');
  } catch (err) {
    return errorResponse(err, req);
  }
});

