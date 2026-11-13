import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { verifyMessage } from 'npm:ethers@6.13.4';
import { handleCors } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/auth.ts';
import { AppError, errorResponse, jsonResponse } from '../_shared/errors.ts';
import {
  parseJsonBody,
  requireAddress,
  requireNetwork,
  requireString,
  requireUuid,
} from '../_shared/validation.ts';
import { recordAuditLog } from '../_shared/logger.ts';
import { enforceRateLimit } from '../_shared/rateLimit.ts';

const IDENTITY_DISCLAIMER =
  'Wallet-control verification confirms cryptographic control of the wallet address only and does not establish real-world identity.';

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { user, adminClient } = await requireAuth(req);
    await enforceRateLimit(adminClient, user.id, 'recipient_verify', 40, 60);

    if (req.method === 'GET') {
      const url = new URL(req.url);
      const paymentRequestId = requireUuid(
        url.searchParams.get('paymentRequestId'),
        'paymentRequestId'
      );

      const { data: reqRow } = await adminClient
        .from('payment_requests')
        .select('id, recipient_address, network')
        .eq('id', paymentRequestId)
        .maybeSingle();

      if (!reqRow) {
        throw new AppError(404, 'REQUEST_NOT_FOUND', 'Payment request not found.');
      }

      const { data: records } = await adminClient
        .from('verification_records')
        .select('*')
        .eq('verification_type', 'recipient_wallet_control')
        .contains('proof_metadata', { payment_request_id: paymentRequestId })
        .order('created_at', { ascending: false })
        .limit(1);

      const latest = records?.[0] ?? null;
      if (!latest) {
        return jsonResponse({
          status: 'unverified',
          intendedAddress: reqRow.recipient_address,
          recoveredAddress: null,
          verifiedAt: null,
          network: reqRow.network,
          disclaimer: IDENTITY_DISCLAIMER,
        }, 200, req);
      }

      const meta = (latest.proof_metadata ?? {}) as Record<string, unknown>;
      return jsonResponse({
        status: latest.status === 'verified' ? 'verified' : 'mismatch',
        intendedAddress: reqRow.recipient_address,
        recoveredAddress:
          typeof meta.recovered_address === 'string' ? meta.recovered_address : null,
        verifiedAt: latest.verified_at,
        network: latest.network,
        disclaimer: IDENTITY_DISCLAIMER,
      }, 200, req);
    }

    if (req.method !== 'POST') {
      throw new AppError(405, 'METHOD_NOT_ALLOWED', 'Use GET or POST for recipient-verify.');
    }

    const body = await parseJsonBody<Record<string, unknown>>(req);
    const action = requireString(body.action, 'action', 3, 40);

    if (action === 'issue_challenge') {
      const paymentRequestId = requireUuid(body.paymentRequestId, 'paymentRequestId');
      const recipientAddress = requireAddress(body.recipientAddress, 'recipientAddress');
      const network = requireNetwork(body.network);

      const { data: reqRow } = await adminClient
        .from('payment_requests')
        .select('id, creator_id, share_code, recipient_address, status, expires_at')
        .eq('id', paymentRequestId)
        .maybeSingle();

      if (!reqRow) {
        throw new AppError(404, 'REQUEST_NOT_FOUND', 'Payment request not found.');
      }
      if (reqRow.creator_id !== user.id) {
        throw new AppError(
          403,
          'FORBIDDEN',
          'Only the payment request creator can issue a recipient control challenge.'
        );
      }
      if (reqRow.status !== 'open') {
        throw new AppError(400, 'REQUEST_UNAVAILABLE', `Payment request is ${reqRow.status}.`);
      }
      if (reqRow.recipient_address.toLowerCase() !== recipientAddress.toLowerCase()) {
        throw new AppError(
          400,
          'ADDRESS_MISMATCH',
          'Challenge address does not match the payment request recipient address.'
        );
      }

      const nonce = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const message = [
        'Word Recipient Wallet-Control Challenge',
        `Request ID: ${reqRow.id}`,
        `Share Code: ${reqRow.share_code}`,
        `Intended Address: ${reqRow.recipient_address}`,
        `Network: ${network}`,
        `Nonce: ${nonce}`,
        `Expires: ${expiresAt}`,
        'Notice: Signing proves wallet control only and does not establish real-world identity.',
      ].join('\n');

      const { data: challenge, error: chErr } = await adminClient
        .from('wallet_challenges')
        .insert({
          user_id: user.id,
          address: reqRow.recipient_address,
          network,
          nonce,
          message,
          status: 'pending',
          expires_at: expiresAt,
        })
        .select('*')
        .single();

      if (chErr) {
        throw new AppError(500, 'CHALLENGE_CREATE_FAILED', chErr.message);
      }

      await recordAuditLog(adminClient, {
        actorUserId: user.id,
        action: 'recipient.challenge_issued',
        resourceType: 'wallet_challenges',
        resourceId: challenge.id,
        metadata: { paymentRequestId, address: reqRow.recipient_address, network },
      });

      return jsonResponse({ challenge, disclaimer: IDENTITY_DISCLAIMER }, 201, req);
    }

    if (action === 'verify_signature') {
      const challengeId = requireUuid(body.challengeId, 'challengeId');
      const paymentRequestId = requireUuid(body.paymentRequestId, 'paymentRequestId');
      const signature = requireString(body.signature, 'signature', 20, 512);

      const { data: challenge } = await adminClient
        .from('wallet_challenges')
        .select('*')
        .eq('id', challengeId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!challenge) {
        throw new AppError(404, 'CHALLENGE_NOT_FOUND', 'Verification challenge not found.');
      }

      // Replay prevention: challenge may only be verified once
      if (challenge.status === 'verified' || challenge.signature !== null) {
        throw new AppError(
          409,
          'REPLAY_DETECTED',
          'This verification challenge has already been used.'
        );
      }

      if (
        challenge.status === 'expired' ||
        new Date(challenge.expires_at).getTime() <= Date.now()
      ) {
        await adminClient
          .from('wallet_challenges')
          .update({ status: 'expired' })
          .eq('id', challenge.id);
        throw new AppError(
          400,
          'CHALLENGE_EXPIRED',
          'Verification challenge has expired. Generate a new challenge.'
        );
      }

      if (!challenge.message.includes(`Request ID: ${paymentRequestId}`)) {
        throw new AppError(
          400,
          'REQUEST_MISMATCH',
          'Challenge is not bound to this payment request.'
        );
      }

      const { data: reqRow } = await adminClient
        .from('payment_requests')
        .select('id, share_code, recipient_address')
        .eq('id', paymentRequestId)
        .maybeSingle();

      if (!reqRow) {
        throw new AppError(404, 'REQUEST_NOT_FOUND', 'Payment request not found.');
      }

      let recoveredAddress: string;
      try {
        recoveredAddress = verifyMessage(challenge.message, signature);
      } catch {
        throw new AppError(400, 'INVALID_SIGNATURE', 'Malformed cryptographic signature.');
      }

      const nowIso = new Date().toISOString();
      const matchesIntended =
        recoveredAddress.toLowerCase() === reqRow.recipient_address.toLowerCase() &&
        recoveredAddress.toLowerCase() === challenge.address.toLowerCase();

      if (!matchesIntended) {
        await adminClient.from('verification_records').insert({
          user_id: user.id,
          verification_type: 'recipient_wallet_control',
          subject_address: reqRow.recipient_address,
          network: challenge.network,
          status: 'mismatch',
          proof_metadata: {
            payment_request_id: paymentRequestId,
            share_code: reqRow.share_code,
            challenge_id: challenge.id,
            nonce: challenge.nonce,
            recovered_address: recoveredAddress,
            disclaimer: IDENTITY_DISCLAIMER,
          },
          verified_at: null,
        });

        throw new AppError(
          400,
          'ADDRESS_MISMATCH',
          `Signing address (${recoveredAddress}) does not match intended recipient (${reqRow.recipient_address}).`
        );
      }

      await adminClient
        .from('wallet_challenges')
        .update({
          status: 'verified',
          signature,
          verified_at: nowIso,
        })
        .eq('id', challenge.id);

      await adminClient.from('verification_records').insert({
        user_id: user.id,
        verification_type: 'recipient_wallet_control',
        subject_address: reqRow.recipient_address,
        network: challenge.network,
        status: 'verified',
        proof_metadata: {
          payment_request_id: paymentRequestId,
          share_code: reqRow.share_code,
          challenge_id: challenge.id,
          nonce: challenge.nonce,
          recovered_address: recoveredAddress,
          disclaimer: IDENTITY_DISCLAIMER,
        },
        verified_at: nowIso,
      });

      await adminClient.from('notifications').insert({
        user_id: user.id,
        category: 'Verification',
        title: 'Recipient wallet control verified',
        detail: `Signed control proof recorded for ${reqRow.share_code} (${reqRow.recipient_address}).`,
      });

      await recordAuditLog(adminClient, {
        actorUserId: user.id,
        action: 'recipient.wallet_control_verified',
        resourceType: 'payment_requests',
        resourceId: paymentRequestId,
        metadata: {
          challengeId: challenge.id,
          recoveredAddress,
          intendedAddress: reqRow.recipient_address,
        },
      });

      return jsonResponse({
        verified: true,
        status: 'verified',
        intendedAddress: reqRow.recipient_address,
        recoveredAddress,
        verifiedAt: nowIso,
        disclaimer: IDENTITY_DISCLAIMER,
      }, 200, req);
    }

    throw new AppError(400, 'UNKNOWN_ACTION', `Unsupported action: ${action}`);
  } catch (err) {
    return errorResponse(err, req);
  }
});

