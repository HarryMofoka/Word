import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { handleCors } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/auth.ts';
import { AppError, errorResponse, jsonResponse } from '../_shared/errors.ts';
import {
  TOKEN_DECIMALS,
  optionalString,
  parseExactAmount,
  parseJsonBody,
  requireAddress,
  requireNetwork,
  requireString,
  requireToken,
} from '../_shared/validation.ts';
import { recordAuditLog } from '../_shared/logger.ts';
import { enforceRateLimit } from '../_shared/rateLimit.ts';

function generateShareCode(): string {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return 'WRD-' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

async function expireIfPastDue<
  T extends { id: string; status: string; expires_at: string | null }
>(adminClient: Parameters<typeof recordAuditLog>[0], row: T): Promise<T> {
  if (
    row.status === 'open' &&
    row.expires_at &&
    new Date(row.expires_at).getTime() <= Date.now()
  ) {
    const { data: updated } = await adminClient
      .from('payment_requests')
      .update({ status: 'expired' })
      .eq('id', row.id)
      .eq('status', 'open')
      .select('*')
      .maybeSingle();
    if (updated) return updated as T;
    return { ...row, status: 'expired' };
  }
  return row;
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { user, userClient, adminClient } = await requireAuth(req);
    await enforceRateLimit(adminClient, user.id, 'payment_requests', 40, 60);

    if (req.method === 'GET') {
      const url = new URL(req.url);
      const shareCode = url.searchParams.get('shareCode');
      const id = url.searchParams.get('id');

      if (shareCode) {
        const { data, error } = await userClient
          .from('payment_requests')
          .select('*')
          .eq('share_code', shareCode.trim())
          .maybeSingle();
        if (error) throw new AppError(500, 'FETCH_FAILED', error.message);
        if (!data) throw new AppError(404, 'NOT_FOUND', 'Payment request not found.');
        const checked = await expireIfPastDue(adminClient, data);
        return jsonResponse({ request: checked });
      }

      if (id) {
        const { data, error } = await userClient
          .from('payment_requests')
          .select('*')
          .eq('id', id.trim())
          .maybeSingle();
        if (error) throw new AppError(500, 'FETCH_FAILED', error.message);
        if (!data) throw new AppError(404, 'NOT_FOUND', 'Payment request not found.');
        const checked = await expireIfPastDue(adminClient, data);
        return jsonResponse({ request: checked });
      }

      const { data, error } = await userClient
        .from('payment_requests')
        .select('*')
        .eq('creator_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw new AppError(500, 'LIST_FAILED', error.message);
      const checkedList = await Promise.all(
        (data ?? []).map((row) => expireIfPastDue(adminClient, row))
      );
      return jsonResponse({ requests: checkedList });
    }

    if (req.method === 'POST') {
      const body = await parseJsonBody<Record<string, unknown>>(req);
      const tokenSymbol = requireToken(body.tokenSymbol ?? 'USDT');
      const decimals = TOKEN_DECIMALS[tokenSymbol] ?? 6;
      const { normalizedDecimal, atomic } = parseExactAmount(body.amount, decimals);
      const network = requireNetwork(body.network);
      const recipientName = requireString(body.recipientName, 'recipientName', 1, 120);
      const recipientAddress = requireAddress(body.recipientAddress, 'recipientAddress');
      const description = requireString(body.description, 'description', 1, 500);
      const terms = optionalString(body.terms, 'terms', 2000);
      const shareCode = generateShareCode();

      let expiresAt: string | null = null;
      if (body.expiresInMinutes !== undefined && body.expiresInMinutes !== null && body.expiresInMinutes !== '') {
        const mins = Number(body.expiresInMinutes);
        if (!Number.isFinite(mins) || mins <= 0 || mins > 43200) {
          throw new AppError(
            400,
            'INVALID_EXPIRY',
            'expiresInMinutes must be between 1 and 43200 minutes (30 days).'
          );
        }
        expiresAt = new Date(Date.now() + Math.round(mins) * 60_000).toISOString();
      }

      const { data: created, error } = await adminClient
        .from('payment_requests')
        .insert({
          creator_id: user.id,
          share_code: shareCode,
          amount_numeric: normalizedDecimal,
          amount_atomic: atomic,
          token_symbol: tokenSymbol,
          token_decimals: decimals,
          network,
          recipient_name: recipientName,
          recipient_address: recipientAddress,
          description,
          terms,
          expires_at: expiresAt,
          status: 'open',
        })
        .select('*')
        .single();

      if (error) {
        throw new AppError(400, 'CREATE_REQUEST_FAILED', error.message);
      }

      if (terms) {
        await adminClient.from('payment_agreements').insert({
          payment_request_id: created.id,
          creator_id: user.id,
          title: `Agreement: ${description.slice(0, 80)}`,
          terms_text: terms,
          amount_numeric: normalizedDecimal,
          token_symbol: tokenSymbol,
          network,
          status: 'proposed',
          creator_accepted_at: new Date().toISOString(),
        });
      }

      await recordAuditLog(adminClient, {
        actorUserId: user.id,
        action: 'payment_request.created',
        resourceType: 'payment_requests',
        resourceId: created.id,
        metadata: { shareCode, tokenSymbol, amount: normalizedDecimal, network },
      });

      return jsonResponse({ request: created }, 201);
    }

    throw new AppError(405, 'METHOD_NOT_ALLOWED', 'Unsupported HTTP method.');
  } catch (err) {
    return errorResponse(err);
  }
});

