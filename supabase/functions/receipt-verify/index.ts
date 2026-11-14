import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { handleCors } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/auth.ts';
import { AppError, errorResponse, jsonResponse } from '../_shared/errors.ts';
import { assertNoSecretMaterial, parseJsonBody, requireString, requireUuid } from '../_shared/validation.ts';
import { recordAuditLog } from '../_shared/logger.ts';
import { enforceRateLimit } from '../_shared/rateLimit.ts';
import { toSanitizedCounterpartyReport } from '../_shared/identityProvider.ts';
import { signReceiptHmac } from '../_shared/mutualTrustServer.ts';

const NETWORK_RPC_URLS: Record<string, string> = {
  Testnet: Deno.env.get('SEPOLIA_RPC_URL') ?? 'https://ethereum-sepolia-rpc.publicnode.com',
  'Base Sepolia': Deno.env.get('BASE_SEPOLIA_RPC_URL') ?? 'https://sepolia.base.org',
  'Polygon Amoy': Deno.env.get('POLYGON_AMOY_RPC_URL') ?? 'https://rpc-amoy.polygon.technology',
};

async function fetchIndependentRpcReceipt(
  network: string,
  txHash: string
): Promise<{ transactionHash?: string; status?: string; blockNumber?: string; from?: string } | null> {
  const rpcUrl = NETWORK_RPC_URLS[network];
  if (!rpcUrl) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getTransactionReceipt',
        params: [txHash],
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      result?: { transactionHash?: string; status?: string; blockNumber?: string; from?: string } | null;
    };
    return json.result ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

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
    assertNoSecretMaterial(body);
    const transactionId = requireUuid(body.transactionId, 'transactionId');
    const txHash = requireString(body.txHash, 'txHash', 12, 128);

    if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
      throw new AppError(400, 'INVALID_TX_HASH', 'txHash must be a valid 32-byte hex transaction hash.');
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

    // Prevent txHash replay across distinct transactions
    const { data: duplicateTx } = await adminClient
      .from('transactions')
      .select('id')
      .eq('tx_hash', txHash)
      .neq('id', transactionId)
      .maybeSingle();

    if (duplicateTx) {
      throw new AppError(409, 'TX_HASH_REPLAY', 'This transaction hash is already linked to another payment.');
    }

    const nowIso = new Date().toISOString();
    let requestedState: 'processing' | 'failed' | 'confirmed' =
      body.awaitingConfirmation === true
        ? 'processing'
        : body.simulateFailure === true || body.outcome === 'failed'
          ? 'failed'
          : 'confirmed';

    let verificationSource = 'client_reported_pending';
    if (requestedState === 'confirmed') {
      const rpcReceipt = await fetchIndependentRpcReceipt(tx.network, txHash);
      if (rpcReceipt) {
        if (
          rpcReceipt.transactionHash &&
          rpcReceipt.transactionHash.toLowerCase() !== txHash.toLowerCase()
        ) {
          throw new AppError(400, 'RECEIPT_MISMATCH', 'On-chain receipt hash does not match txHash.');
        }
        if (rpcReceipt.status === '0x0') {
          requestedState = 'failed';
        }
        verificationSource = 'independent_rpc';
      } else {
        verificationSource = 'rpc_unavailable_deferred';
      }
    }

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

    let mutualTrustReceipt: Record<string, unknown> | null = null;

    if (tx.mutual_session_id) {
      const { data: mSession } = await adminClient
        .from('mutual_verification_sessions')
        .select('*')
        .eq('id', tx.mutual_session_id)
        .maybeSingle();

      if (mSession) {
        const canonicalHash = String(tx.canonical_tx_hash ?? mSession.canonical_tx_hash);
        const [
          { data: approvals },
          { data: profiles },
          { data: wallets },
          { data: senderIdentity },
          { data: recipientIdentity },
          { data: existingReceipt },
        ] = await Promise.all([
          adminClient
            .from('transaction_approvals')
            .select('id, approval_role, approved_at')
            .eq('session_id', mSession.id)
            .eq('canonical_tx_hash', canonicalHash)
            .eq('approval_status', 'approved'),
          adminClient
            .from('profiles')
            .select('id, display_name')
            .in('id', [mSession.sender_id, mSession.recipient_id]),
          adminClient
            .from('wallets')
            .select('user_id, address, is_verified')
            .in('user_id', [mSession.sender_id, mSession.recipient_id]),
          mSession.sender_identity_id
            ? adminClient
                .from('identity_verification_results')
                .select(
                  'provider, is_sandbox, verification_method, verification_outcome, liveness_outcome, assurance_level, verified_at, expires_at, revoked_at, security_warnings, attestation_hash'
                )
                .eq('id', mSession.sender_identity_id)
                .maybeSingle()
            : Promise.resolve({ data: null }),
          mSession.recipient_identity_id
            ? adminClient
                .from('identity_verification_results')
                .select(
                  'provider, is_sandbox, verification_method, verification_outcome, liveness_outcome, assurance_level, verified_at, expires_at, revoked_at, security_warnings, attestation_hash'
                )
                .eq('id', mSession.recipient_identity_id)
                .maybeSingle()
            : Promise.resolve({ data: null }),
          adminClient
            .from('mutual_trust_receipts')
            .select('*')
            .eq('session_id', mSession.id)
            .maybeSingle(),
        ]);

        const senderApp = (approvals ?? []).find((a) => a.approval_role === 'sender');
        const recipientApp = (approvals ?? []).find((a) => a.approval_role === 'recipient');
        const senderProf = (profiles ?? []).find((p) => p.id === mSession.sender_id);
        const recipientProf = (profiles ?? []).find((p) => p.id === mSession.recipient_id);
        const senderW = (wallets ?? []).find(
          (w) =>
            w.user_id === mSession.sender_id &&
            w.address.toLowerCase() === String(mSession.sender_wallet_address).toLowerCase()
        );
        const recipientW = (wallets ?? []).find(
          (w) =>
            w.user_id === mSession.recipient_id &&
            w.address.toLowerCase() === String(mSession.recipient_wallet_address).toLowerCase()
        );

        const senderSummary = toSanitizedCounterpartyReport({
          subjectRole: 'sender',
          displayName: senderProf?.display_name || 'Verified Sender',
          walletAddress: String(mSession.sender_wallet_address),
          walletVerified: Boolean(senderW?.is_verified),
          identityRow: senderIdentity ?? null,
        });
        const recipientSummary = toSanitizedCounterpartyReport({
          subjectRole: 'recipient',
          displayName: recipientProf?.display_name || 'Verified Recipient',
          walletAddress: String(mSession.recipient_wallet_address),
          walletVerified: Boolean(recipientW?.is_verified),
          identityRow: recipientIdentity ?? null,
        });

        const receiptCode =
          existingReceipt?.receipt_code ??
          `MTR-${String(tx.id).slice(0, 8).toUpperCase()}-${canonicalHash.slice(2, 8).toUpperCase()}`;

        const receiptSignature = await signReceiptHmac({
          receiptCode,
          sessionId: String(mSession.id),
          transactionId: String(tx.id),
          canonicalTxHash: canonicalHash,
          blockchainTxHash: txHash,
          settlementStatus: requestedState,
        });

        const { data: savedReceipt } = await adminClient
          .from('mutual_trust_receipts')
          .upsert(
            {
              receipt_code: receiptCode,
              session_id: mSession.id,
              transaction_id: tx.id,
              canonical_tx_hash: canonicalHash,
              sender_id: mSession.sender_id,
              recipient_id: mSession.recipient_id,
              sender_wallet_address: mSession.sender_wallet_address,
              recipient_wallet_address: mSession.recipient_wallet_address,
              amount_numeric: tx.amount_numeric,
              token_symbol: tx.token_symbol,
              network: tx.network,
              chain_id: mSession.chain_id,
              agreement_id: mSession.payment_agreement_id,
              agreement_version: mSession.agreement_version ?? 0,
              agreement_terms_hash: mSession.agreement_terms_hash,
              sender_verification_id: mSession.sender_identity_id,
              recipient_verification_id: mSession.recipient_identity_id,
              sender_verification_summary: senderSummary,
              recipient_verification_summary: recipientSummary,
              sender_approval_id: senderApp?.id ?? null,
              recipient_approval_id: recipientApp?.id ?? null,
              sender_approved_at:
                senderApp?.approved_at ?? mSession.sender_approved_at ?? mSession.created_at,
              recipient_approved_at:
                recipientApp?.approved_at ?? mSession.recipient_approved_at ?? mSession.created_at,
              blockchain_tx_hash: txHash,
              settlement_status: requestedState,
              receipt_signature: receiptSignature,
            },
            { onConflict: 'session_id' }
          )
          .select('*')
          .single();

        if (savedReceipt) {
          mutualTrustReceipt = savedReceipt;
          await adminClient
            .from('transactions')
            .update({ mutual_trust_receipt_id: savedReceipt.id })
            .eq('id', tx.id);
        }

        const nextSessionState =
          requestedState === 'confirmed'
            ? 'completed'
            : requestedState === 'failed'
              ? 'failed'
              : 'executing';
        await adminClient
          .from('mutual_verification_sessions')
          .update({ session_state: nextSessionState })
          .eq('id', mSession.id);
      }
    }

    if (requestedState === 'processing') {
      await recordAuditLog(adminClient, {
        actorUserId: user.id,
        action: 'transaction.broadcasted',
        resourceType: 'transactions',
        resourceId: transactionId,
        metadata: { txHash, network: tx.network, verificationSource },
      });
      return jsonResponse(
        { transaction: updatedTx, verified: false, mutualTrustReceipt },
        200,
        req
      );
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
      proof_metadata: {
        tx_hash: txHash,
        verified_by: 'word_receipt_verifier',
        verification_source: verificationSource,
        mutualTrustReceiptCode: mutualTrustReceipt?.receipt_code ?? null,
      },
      verified_at: requestedState === 'confirmed' ? nowIso : null,
    });

    const notifyUsers = Array.from(
      new Set([user.id, tx.sender_id, tx.recipient_id].filter((v): v is string => Boolean(v)))
    );

    await Promise.all(
      notifyUsers.map((uid) =>
        adminClient.from('notifications').insert({
          user_id: uid,
          category: 'Payment',
          title:
            requestedState === 'confirmed'
              ? `Transaction confirmed on ${tx.network}`
              : `Transaction failed on ${tx.network}`,
          detail: `${tx.amount_numeric} ${tx.token_symbol} to ${tx.recipient_name} (${txHash.slice(0, 12)}...).`,
          metadata: {
            transactionId,
            txHash,
            status: requestedState,
            mutualSessionId: tx.mutual_session_id ?? null,
            mutualTrustReceiptCode: mutualTrustReceipt?.receipt_code ?? null,
          },
        })
      )
    );

    await recordAuditLog(adminClient, {
      actorUserId: user.id,
      action: `transaction.receipt_${requestedState}`,
      resourceType: 'transactions',
      resourceId: transactionId,
      metadata: {
        txHash,
        network: tx.network,
        verificationSource,
        mutualTrustReceiptId: mutualTrustReceipt?.id ?? null,
      },
    });

    return jsonResponse(
      {
        transaction: mutualTrustReceipt
          ? { ...updatedTx, mutual_trust_receipt_id: mutualTrustReceipt.id }
          : updatedTx,
        verified: requestedState === 'confirmed',
        mutualTrustReceipt,
      },
      200,
      req
    );
  } catch (err) {
    return errorResponse(err, req);
  }
});
