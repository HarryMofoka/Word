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
      const url = new URL(req.url);
      const agreementId = url.searchParams.get('agreementId');

      if (agreementId) {
        const id = requireUuid(agreementId, 'agreementId');
        const { data: agreement, error } = await userClient
          .from('payment_agreements')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (error) throw new AppError(500, 'FETCH_FAILED', error.message);
        if (!agreement) throw new AppError(404, 'AGREEMENT_NOT_FOUND', 'Payment agreement not found.');

        const { data: versions } = await adminClient
          .from('payment_agreement_versions')
          .select('*')
          .eq('agreement_id', id)
          .order('version_number', { ascending: false });

        return jsonResponse({ agreement, versions: versions ?? [] });
      }

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
        const purpose = requireString(body.purpose ?? body.title, 'purpose', 3, 400);
        const termsText = requireString(body.termsText, 'termsText', 4, 2000);
        const tokenSymbol = requireToken(body.tokenSymbol ?? 'USDT');
        const decimals = TOKEN_DECIMALS[tokenSymbol] ?? 6;
        const { normalizedDecimal } = parseExactAmount(body.amount, decimals);
        const network = requireNetwork(body.network);
        const recipientName = requireString(body.recipientName ?? 'Recipient', 'recipientName', 1, 120);
        const recipientAddress = body.recipientAddress
          ? requireAddress(body.recipientAddress, 'recipientAddress')
          : '0x0000000000000000000000000000000000000000';
        const paymentRequestId = body.paymentRequestId
          ? requireUuid(body.paymentRequestId, 'paymentRequestId')
          : null;
        const counterpartyId = body.counterpartyId
          ? requireUuid(body.counterpartyId, 'counterpartyId')
          : null;
        const nowIso = new Date().toISOString();

        const { data: created, error } = await adminClient
          .from('payment_agreements')
          .insert({
            payment_request_id: paymentRequestId,
            creator_id: user.id,
            counterparty_id: counterpartyId,
            title,
            purpose,
            recipient_name: recipientName,
            recipient_address: recipientAddress,
            terms_text: termsText,
            amount_numeric: normalizedDecimal,
            token_symbol: tokenSymbol,
            network,
            status: 'pending_acceptance',
            current_version: 1,
            creator_accepted_at: nowIso,
          })
          .select('*')
          .single();

        if (error) throw new AppError(400, 'CREATE_AGREEMENT_FAILED', error.message);

        await adminClient.from('payment_agreement_versions').insert({
          agreement_id: created.id,
          version_number: 1,
          title,
          purpose,
          amount_numeric: normalizedDecimal,
          token_symbol: tokenSymbol,
          network,
          recipient_name: recipientName,
          recipient_address: recipientAddress,
          terms_text: termsText,
          edited_by: user.id,
          change_note: 'Initial agreement proposal',
          created_at: nowIso,
        });

        await recordAuditLog(adminClient, {
          actorUserId: user.id,
          action: 'payment_agreement.created',
          resourceType: 'payment_agreements',
          resourceId: created.id,
          metadata: { title, purpose, amount: normalizedDecimal, tokenSymbol, version: 1 },
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
        const nextCreatorAcceptedAt = isCreator
          ? existing.creator_accepted_at ?? nowIso
          : existing.creator_accepted_at;
        const nextCounterpartyAcceptedAt = !isCreator
          ? existing.counterparty_accepted_at ?? nowIso
          : existing.counterparty_accepted_at;
        const bothAccepted = Boolean(nextCreatorAcceptedAt && nextCounterpartyAcceptedAt);

        const updates: Record<string, unknown> = {
          creator_accepted_at: nextCreatorAcceptedAt,
          counterparty_accepted_at: nextCounterpartyAcceptedAt,
          counterparty_id: !isCreator ? user.id : existing.counterparty_id,
          status: bothAccepted ? 'accepted' : 'pending_acceptance',
          locked_at: bothAccepted ? existing.locked_at ?? nowIso : null,
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
          metadata: {
            role: isCreator ? 'creator' : 'counterparty',
            locked: bothAccepted,
            note: optionalString(body.note, 'note', 200),
          },
        });

        return jsonResponse({ agreement: updated });
      }

      if (action === 'revise') {
        const agreementId = requireUuid(body.agreementId, 'agreementId');
        const changeNote = requireString(body.changeNote ?? 'Revised agreement terms', 'changeNote', 2, 300);

        const { data: existing, error: fetchErr } = await adminClient
          .from('payment_agreements')
          .select('*')
          .eq('id', agreementId)
          .maybeSingle();

        if (fetchErr || !existing) {
          throw new AppError(404, 'AGREEMENT_NOT_FOUND', 'Payment agreement not found.');
        }

        const isCreator = existing.creator_id === user.id;
        const isCounterparty = existing.counterparty_id === user.id;
        if (!isCreator && !isCounterparty) {
          throw new AppError(403, 'FORBIDDEN', 'You are not a participant in this agreement.');
        }

        if (existing.locked_at || existing.status === 'accepted') {
          throw new AppError(
            409,
            'AGREEMENT_LOCKED',
            'Accepted payment agreements are locked and cannot be silently modified.'
          );
        }

        const title = body.title ? requireString(body.title, 'title', 2, 160) : existing.title;
        const purpose = body.purpose ? requireString(body.purpose, 'purpose', 3, 400) : existing.purpose ?? existing.title;
        const termsText = body.termsText ? requireString(body.termsText, 'termsText', 4, 2000) : existing.terms_text;
        const tokenSymbol = body.tokenSymbol ? requireToken(body.tokenSymbol) : existing.token_symbol;
        const decimals = TOKEN_DECIMALS[tokenSymbol] ?? 6;
        const normalizedDecimal = body.amount
          ? parseExactAmount(body.amount, decimals).normalizedDecimal
          : String(existing.amount_numeric);
        const network = body.network ? requireNetwork(body.network) : existing.network;
        const recipientName = body.recipientName
          ? requireString(body.recipientName, 'recipientName', 1, 120)
          : existing.recipient_name ?? 'Recipient';
        const recipientAddress = body.recipientAddress
          ? requireAddress(body.recipientAddress, 'recipientAddress')
          : existing.recipient_address ?? '0x0000000000000000000000000000000000000000';

        const nowIso = new Date().toISOString();
        const nextVersion = Number(existing.current_version ?? 1) + 1;

        const { data: updated, error: updErr } = await adminClient
          .from('payment_agreements')
          .update({
            title,
            purpose,
            terms_text: termsText,
            amount_numeric: normalizedDecimal,
            token_symbol: tokenSymbol,
            network,
            recipient_name: recipientName,
            recipient_address: recipientAddress,
            current_version: nextVersion,
            status: 'pending_acceptance',
            creator_accepted_at: isCreator ? nowIso : null,
            counterparty_accepted_at: !isCreator ? nowIso : null,
            locked_at: null,
          })
          .eq('id', agreementId)
          .select('*')
          .single();

        if (updErr) throw new AppError(400, 'REVISE_FAILED', updErr.message);

        await adminClient.from('payment_agreement_versions').insert({
          agreement_id: agreementId,
          version_number: nextVersion,
          title,
          purpose,
          amount_numeric: normalizedDecimal,
          token_symbol: tokenSymbol,
          network,
          recipient_name: recipientName,
          recipient_address: recipientAddress,
          terms_text: termsText,
          edited_by: user.id,
          change_note: changeNote,
          created_at: nowIso,
        });

        await recordAuditLog(adminClient, {
          actorUserId: user.id,
          action: 'payment_agreement.revised',
          resourceType: 'payment_agreements',
          resourceId: agreementId,
          metadata: { version: nextVersion, changeNote },
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
