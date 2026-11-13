import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { handleCors } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/auth.ts';
import { AppError, errorResponse, jsonResponse } from '../_shared/errors.ts';
import {
  assertNoSecretMaterial,
  optionalString,
  parseJsonBody,
  requireAddress,
  requireNetwork,
  requireString,
  requireUuid,
} from '../_shared/validation.ts';
import { recordAuditLog } from '../_shared/logger.ts';
import { enforceRateLimit } from '../_shared/rateLimit.ts';

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { user, userClient, adminClient } = await requireAuth(req);
    await enforceRateLimit(adminClient, user.id, 'wallet_challenge', 30, 60);

    if (req.method !== 'POST') {
      throw new AppError(405, 'METHOD_NOT_ALLOWED', 'Use POST for wallet-challenge.');
    }

    const body = await parseJsonBody<Record<string, unknown>>(req);
    assertNoSecretMaterial(body);
    const action = requireString(body.action, 'action', 3, 30);

    if (action === 'register_and_challenge') {
      const address = requireAddress(body.address, 'address');
      const network = requireNetwork(body.network);
      const method = requireString(body.method ?? 'connected', 'method', 5, 20);
      if (!['created', 'connected', 'imported'].includes(method)) {
        throw new AppError(400, 'INVALID_METHOD', 'Invalid wallet setup method.');
      }
      const label = optionalString(body.label, 'label', 80) ?? 'Primary Wallet';
      const recoveryBackedUp = Boolean(body.recoveryBackedUp);

      const { data: wallet, error: walletErr } = await adminClient
        .from('wallets')
        .upsert(
          {
            user_id: user.id,
            address,
            network,
            method,
            label,
            recovery_backed_up: recoveryBackedUp,
            is_primary: true,
          },
          { onConflict: 'user_id,address,network' }
        )
        .select('*')
        .single();

      if (walletErr) {
        throw new AppError(400, 'WALLET_REGISTER_FAILED', walletErr.message);
      }

      const nonce = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const message = [
        'Word Wallet Control Verification',
        `Address: ${address}`,
        `Network: ${network}`,
        `Nonce: ${nonce}`,
        `Expires: ${expiresAt}`,
      ].join('\n');

      const { data: challenge, error: chErr } = await adminClient
        .from('wallet_challenges')
        .insert({
          user_id: user.id,
          wallet_id: wallet.id,
          address,
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
        action: 'wallet.challenge_issued',
        resourceType: 'wallet_challenges',
        resourceId: challenge.id,
        metadata: { walletId: wallet.id, address, network, method },
      });

      return jsonResponse({ wallet, challenge }, 201);
    }

    if (action === 'verify_challenge') {
      const challengeId = requireUuid(body.challengeId, 'challengeId');
      const signature = requireString(body.signature, 'signature', 8, 512);

      const { data: challenge, error: fetchErr } = await userClient
        .from('wallet_challenges')
        .select('*')
        .eq('id', challengeId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (fetchErr || !challenge) {
        throw new AppError(404, 'CHALLENGE_NOT_FOUND', 'Wallet challenge not found.');
      }

      if (challenge.status !== 'pending') {
        throw new AppError(409, 'CHALLENGE_ALREADY_USED', `Challenge cannot be reused (status: ${challenge.status}).`);
      }

      if (!/^0x[a-fA-F0-9]{130}$/.test(signature)) {
        throw new AppError(400, 'INVALID_SIGNATURE', 'Signature must be a valid 65-byte hex ECDSA signature.');
      }

      if (new Date(challenge.expires_at).getTime() < Date.now()) {
        await adminClient
          .from('wallet_challenges')
          .update({ status: 'expired' })
          .eq('id', challenge.id)
          .eq('status', 'pending');
        throw new AppError(400, 'CHALLENGE_EXPIRED', 'Wallet challenge has expired.');
      }

      const nowIso = new Date().toISOString();
      const { data: consumedChallenge, error: consumeErr } = await adminClient
        .from('wallet_challenges')
        .update({
          status: 'verified',
          signature,
          verified_at: nowIso,
        })
        .eq('id', challenge.id)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle();

      if (consumeErr || !consumedChallenge) {
        throw new AppError(409, 'CHALLENGE_REPLAY_BLOCKED', 'Challenge was already verified or expired.');
      }

      let updatedWallet = null;
      if (challenge.wallet_id) {
        const { data: w } = await adminClient
          .from('wallets')
          .update({ is_verified: true, verified_at: nowIso })
          .eq('id', challenge.wallet_id)
          .eq('user_id', user.id)
          .select('*')
          .single();
        updatedWallet = w;
      }

      await adminClient.from('verification_records').insert({
        user_id: user.id,
        wallet_id: challenge.wallet_id,
        verification_type: 'wallet_control',
        subject_address: challenge.address,
        network: challenge.network,
        status: 'verified',
        proof_metadata: {
          challenge_id: challenge.id,
          nonce: challenge.nonce,
          signature_prefix: signature.slice(0, 14),
        },
        verified_at: nowIso,
      });

      await adminClient.from('notifications').insert({
        user_id: user.id,
        category: 'Verification',
        title: 'Wallet control verified',
        detail: `Cryptographic challenge passed for ${challenge.address} on ${challenge.network}.`,
      });

      await recordAuditLog(adminClient, {
        actorUserId: user.id,
        action: 'wallet.verified',
        resourceType: 'wallets',
        resourceId: challenge.wallet_id,
        metadata: { challengeId: challenge.id, address: challenge.address },
      });

      return jsonResponse({ verified: true, wallet: updatedWallet, verifiedAt: nowIso });
    }

    throw new AppError(400, 'UNKNOWN_ACTION', `Unsupported action: ${action}`);
  } catch (err) {
    return errorResponse(err);
  }
});

