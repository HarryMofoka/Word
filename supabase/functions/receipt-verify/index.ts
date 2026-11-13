import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { handleCors } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/auth.ts';
import { AppError, errorResponse, jsonResponse } from '../_shared/errors.ts';
import { assertNoSecretMaterial, parseJsonBody, requireString, requireUuid } from '../_shared/validation.ts';
import { recordAuditLog } from '../_shared/logger.ts';
import { enforceRateLimit } from '../_shared/rateLimit.ts';

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

    if (requestedState === 'processing') {
      await recordAuditLog(adminClient, {
        actorUserId: user.id,
        action: 'transaction.broadcasted',
        resourceType: 'transactions',
        resourceId: transactionId,
        metadata: { txHash, network: tx.network, verificationSource },
      });
      return jsonResponse({ transaction: updatedTx, verified: false }, 200, req);
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
      },
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
      metadata: { txHash, network: tx.network, verificationSource },
    });

    return jsonResponse({ transaction: updatedTx, verified: requestedState === 'confirmed' }, 200, req);
  } catch (err) {
    return errorResponse(err, req);
  }
});
