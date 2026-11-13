import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { handleCors } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/auth.ts';
import { AppError, errorResponse, jsonResponse } from '../_shared/errors.ts';
import {
  TOKEN_DECIMALS,
  optionalString,
  parseExactAmount,
  parseJsonBody,
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
    const { user, userClient, adminClient } = await requireAuth(req);
    await enforceRateLimit(adminClient, user.id, 'payment_agreements', 40, 60);

    if (req.method === 'GET') {
      const { data, error } = await userClient
        .from('payment_agreements')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw new AppError(500, 'FETCH_FAILED', error.message);
      return jsonResponse({ agreements: data ?? [] });
    }

    if (req.method === 'POST') {
      const body = await parseJsonBody<Record<string, unknown>>(req);
      const action = requireString(body.action ?? 'create', 'action', 3, 20);

      if (action === 'create') {
        const title = requireString(body.title, 'title', 2, 160);
        const termsText = requireString(body.termsText, 'termsText', 4, 2000);
        const tokenSymbol = requireToken(body.tokenSymbol ?? 'USDT');
        const decimals = TOKEN_DECIMALS[tokenSymbol] ?? 6;
        const { normalizedDecimal } = parseExactAmount(body.amount, decimals);
        const network = requireNetwork(body.network);
        const paymentRequestId = body.paymentRequestId
          ? requireUuid(body.paymentRequestId, 'paymentRequestId')
          : null;
        const counterpartyId = body.counterpartyId
          ? requireUuid(body.counterpartyId, 'counterpartyId')
          : null;

        const { data: created, error } = await adminClient
          .from('payment_agreements')
          .insert({
            payment_request_id: paymentRequestId,
            creator_id: user.id,
            counterparty_id: counterpartyId,
            title,
            terms_text: termsText,
            amount_numeric: normalizedDecimal,
            token_symbol: tokenSymbol,
            network,
            status: 'proposed',
            creator_accepted_at: new Date().toISOString(),
          })
          .select('*')
          .single();

        if (error) throw new AppError(400, 'CREATE_AGREEMENT_FAILED', error.message);

        await recordAuditLog(adminClient, {
          actorUserId: user.id,
          action: 'payment_agreement.created',
          resourceType: 'payment_agreements',
          resourceId: created.id,
          metadata: { title, amount: normalizedDecimal, tokenSymbol },
        });

        return jsonResponse({ agreement: created }, 201);
      }

      if (action === 'accept') {
        const agreementId = requireUuid(body.agreementId, 'agreementId');
        const { data: existing, error: fetchErr } = await adminClient
          .from('payment_agreements')
          .select('*')
          .eq('id', agreementId)
          .maybeSingle();

        if (fetchErr || !existing) {
          throw new AppError(404, 'AGREEMENT_NOT_FOUND', 'Payment agreement not found.');
        }

        const isCreator = existing.creator_id === user.id;
        const isCounterparty =
          existing.counterparty_id === user.id || existing.counterparty_id === null;

        if (!isCreator && !isCounterparty) {
          throw new AppError(403, 'FORBIDDEN', 'You are not a participant in this agreement.');
        }

        const nowIso = new Date().toISOString();
        const updates: Record<string, unknown> = isCreator
          ? { creator_accepted_at: nowIso }
          : {
              counterparty_id: user.id,
              counterparty_accepted_at: nowIso,
              status: existing.creator_accepted_at ? 'accepted' : 'proposed',
            };

        const { data: updated, error: updErr } = await adminClient
          .from('payment_agreements')
          .update(updates)
          .eq('id', agreementId)
          .select('*')
          .single();

        if (updErr) throw new AppError(400, 'ACCEPT_FAILED', updErr.message);

        await recordAuditLog(adminClient, {
          actorUserId: user.id,
          action: 'payment_agreement.accepted',
          resourceType: 'payment_agreements',
          resourceId: agreementId,
          metadata: { role: isCreator ? 'creator' : 'counterparty', note: optionalString(body.note, 'note', 200) },
        });

        return jsonResponse({ agreement: updated });
      }

      throw new AppError(400, 'UNKNOWN_ACTION', `Unsupported action: ${action}`);
    }

    throw new AppError(405, 'METHOD_NOT_ALLOWED', 'Unsupported HTTP method.');
  } catch (err) {
    return errorResponse(err);
  }
});

