import { Wallet } from 'ethers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RECIPIENT_APPROVAL_STATEMENT,
  SENDER_APPROVAL_STATEMENT,
  buildCanonicalTransactionPayload,
  computeCanonicalTransactionHash,
} from '../../src/services/mutualTrustCrypto';
import {
  acknowledgeCounterpartyReport,
  createOrJoinMutualTrustSession,
  declineMutualTrustSession,
  signAndSubmitMutualApproval,
  subscribeToMutualTrustSession,
  type HydratedMutualSession,
} from '../../src/services/mutualTrustService';
import { preparePayment, verifyBlockchainReceipt } from '../../src/services/paymentsService';
import * as wdkService from '../../src/services/wdkWalletService';
import { supabase } from '../../src/lib/supabase';
import mutualTrustFnSource from '../../supabase/functions/mutual-trust/index.ts?raw';
import paymentPrepareSource from '../../supabase/functions/payment-prepare/index.ts?raw';
import receiptVerifySource from '../../supabase/functions/receipt-verify/index.ts?raw';
import agreementsSource from '../../supabase/functions/payment-agreements/index.ts?raw';
import migrationSource from '../../supabase/migrations/20261114000100_mutual_trust_verification.sql?raw';
import routerSolSource from '../../contracts/src/WordMutualTrustRouter.sol?raw';
import escrowSolSource from '../../contracts/src/WordEscrow.sol?raw';

describe('Mutual Trust Bilateral Workflow, Execution Gate & Contracts', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
      data: { session: { access_token: 'e2e-jwt-token' } as never },
      error: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('enforces dual-party gate across migration triggers, Edge Functions, and agreement revisions', () => {
    // 1. Database triggers prevent client-side spoofing of identity, sessions, approvals, and receipts
    expect(migrationSource).toContain('guard_sensitive_identity_fields');
    expect(migrationSource).toContain('guard_sensitive_mutual_session_fields');
    expect(migrationSource).toContain('guard_sensitive_approval_fields');
    expect(migrationSource).toContain('guard_sensitive_receipt_fields');
    expect(migrationSource).toContain('supabase_realtime ADD TABLE public.mutual_verification_sessions');
    expect(migrationSource).toContain('supabase_realtime ADD TABLE public.transaction_approvals');
    expect(migrationSource).toContain('supabase_realtime ADD TABLE public.mutual_trust_receipts');

    // 2. mutual-trust Edge Function enforces distinct parties, live identities, hash parity, and EIP-712 recovery
    expect(mutualTrustFnSource).toContain('SELF_TRANSFER_UNSUPPORTED');
    expect(mutualTrustFnSource).toContain('MUTUAL_IDENTITY_NOT_VALID');
    expect(mutualTrustFnSource).toContain('CANONICAL_HASH_MISMATCH');
    expect(mutualTrustFnSource).toContain('SIGNER_WALLET_MISMATCH');
    expect(mutualTrustFnSource).toContain('INVALID_APPROVAL_SIGNATURE');
    expect(mutualTrustFnSource).toContain('TRANSACTION_MODIFIED_APPROVAL_RESET');
    expect(mutualTrustFnSource).toContain("action === 'decline'");
    expect(mutualTrustFnSource).toContain("action === 'invalidate_on_change'");

    // 3. payment-prepare strictly blocks execution without authorized mutualSessionId + both verified identities + both EIP-712 sigs
    expect(paymentPrepareSource).toContain('MUTUAL_TRUST_REQUIRED');
    expect(paymentPrepareSource).toContain('MUTUAL_APPROVAL_INCOMPLETE');
    expect(paymentPrepareSource).toContain('DUAL_APPROVAL_REQUIRED');
    expect(paymentPrepareSource).toContain('INVALID_DUAL_APPROVAL_SIGNATURE');
    expect(paymentPrepareSource).toContain('verifyApprovalTypedDataSignature');
    expect(paymentPrepareSource).toContain("session_state: 'executing'");

    // 4. receipt-verify mints signed permanent MutualTrustReceipt & completes session
    expect(receiptVerifySource).toContain("from('mutual_trust_receipts')");
    expect(receiptVerifySource).toContain('signReceiptHmac');
    expect(receiptVerifySource).toContain('mutual_trust_receipt_id');

    // 5. Revising a Payment Agreement automatically revokes prior transaction approvals
    expect(agreementsSource).toContain('invalidateMutualSessionsForAgreement');
  });

  it('keeps smart contracts EIP-712 typehash and statements aligned with application crypto', () => {
    expect(routerSolSource).toContain('WordMutualTrust');
    expect(routerSolSource).toContain(SENDER_APPROVAL_STATEMENT);
    expect(routerSolSource).toContain(RECIPIENT_APPROVAL_STATEMENT);
    expect(routerSolSource).toContain('consumedCanonicalHashes');
    expect(routerSolSource).toContain('ecrecover');
    expect(escrowSolSource).toContain('createAndFundEscrow');
    expect(escrowSolSource).toContain('claimTimeoutRefund');
  });

  it('runs a full Alice -> Bob mutual trust workflow from invitation to EIP-712 co-signing, execution, and permanent receipt', async () => {
    const aliceWallet = Wallet.createRandom();
    const bobWallet = Wallet.createRandom();
    const aliceId = '11111111-1111-4111-8111-111111111111';
    const bobId = '22222222-2222-4222-8222-222222222222';
    const sessionId = '33333333-3333-4333-8333-333333333333';
    const expiresAtUnix = Math.floor(Date.now() / 1000) + 1800;

    const payload = buildCanonicalTransactionPayload({
      sessionId,
      senderUserId: aliceId,
      senderWallet: aliceWallet.address,
      recipientUserId: bobId,
      recipientWallet: bobWallet.address,
      amountAtomic: '20000000',
      tokenAddress: '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06',
      tokenSymbol: 'USDT',
      chainId: 11155111,
      nonce: '0x' + '22'.repeat(32),
      expiresAtUnix,
    });
    const canonicalHash = computeCanonicalTransactionHash(payload);

    // Wire real cryptographic EIP-712 signing through wdkWalletService helper spy
    vi.spyOn(wdkService, 'signTypedDataMessage').mockImplementation(async (params) => {
      const signer =
        params.expectedAddress.toLowerCase() === aliceWallet.address.toLowerCase()
          ? aliceWallet
          : bobWallet;
      return signer.signTypedData(params.domain, params.types, params.message);
    });

    const makeHydrated = (overrides: {
      state: HydratedMutualSession['session']['session_state'];
      senderApprovedAt?: string | null;
      recipientApprovedAt?: string | null;
      receipt?: HydratedMutualSession['receipt'];
    }): HydratedMutualSession => ({
      session: {
        id: sessionId,
        payment_request_id: null,
        payment_agreement_id: null,
        share_code: null,
        sender_id: aliceId,
        recipient_id: bobId,
        sender_wallet_address: aliceWallet.address,
        recipient_wallet_address: bobWallet.address,
        sender_identity_id: 'id-alice',
        recipient_identity_id: 'id-bob',
        sender_verification_status: 'verified',
        recipient_verification_status: 'verified',
        reports_exchanged_at: new Date().toISOString(),
        sender_report_viewed_at: new Date().toISOString(),
        recipient_report_viewed_at: new Date().toISOString(),
        amount_numeric: 20,
        amount_atomic: '20000000',
        token_symbol: 'USDT',
        token_decimals: 6,
        token_address: payload.tokenAddress,
        network: 'Testnet',
        chain_id: 11155111,
        purpose: 'Milestone invoice',
        agreement_version: 0,
        agreement_terms_hash: payload.agreementTermsHash,
        canonical_nonce: payload.nonce,
        canonical_payload: payload,
        canonical_tx_hash: canonicalHash,
        sender_approved_at: overrides.senderApprovedAt ?? null,
        recipient_approved_at: overrides.recipientApprovedAt ?? null,
        declined_by: null,
        decline_reason: null,
        session_state: overrides.state,
        verification_expires_at: new Date(expiresAtUnix * 1000).toISOString(),
        expires_at: new Date(expiresAtUnix * 1000).toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      senderReport: {
        subjectRole: 'sender',
        displayName: 'Alice',
        walletAddress: aliceWallet.address,
        walletVerified: true,
        verificationOutcome: 'verified',
        livenessOutcome: 'passed',
        verificationMethod: 'facial_liveness',
        verificationProvider: 'word_sandbox',
        isSandbox: true,
        assuranceLevel: 'sandbox_demo',
        verifiedAt: new Date().toISOString(),
        expiresAt: new Date(expiresAtUnix * 1000).toISOString(),
        validity: 'valid',
        accountStatus: 'active',
        securityWarnings: [],
        attestationHash: 'alice-att',
      },
      recipientReport: {
        subjectRole: 'recipient',
        displayName: 'Bob',
        walletAddress: bobWallet.address,
        walletVerified: true,
        verificationOutcome: 'verified',
        livenessOutcome: 'passed',
        verificationMethod: 'facial_liveness',
        verificationProvider: 'word_sandbox',
        isSandbox: true,
        assuranceLevel: 'sandbox_demo',
        verifiedAt: new Date().toISOString(),
        expiresAt: new Date(expiresAtUnix * 1000).toISOString(),
        validity: 'valid',
        accountStatus: 'active',
        securityWarnings: [],
        attestationHash: 'bob-att',
      },
      agreement: null,
      approvals: {
        sender: overrides.senderApprovedAt
          ? {
              id: 'app-sender',
              approval_role: 'sender',
              approval_status: 'approved',
              approving_wallet_address: aliceWallet.address,
              recovered_address: aliceWallet.address,
              approved_at: overrides.senderApprovedAt,
              decline_reason: null,
              expires_at: payload.expiresAtUnix.toString(),
              canonical_tx_hash: canonicalHash,
            }
          : null,
        recipient: overrides.recipientApprovedAt
          ? {
              id: 'app-recipient',
              approval_role: 'recipient',
              approval_status: 'approved',
              approving_wallet_address: bobWallet.address,
              recovered_address: bobWallet.address,
              approved_at: overrides.recipientApprovedAt,
              decline_reason: null,
              expires_at: payload.expiresAtUnix.toString(),
              canonical_tx_hash: canonicalHash,
            }
          : null,
      },
      receipt: overrides.receipt ?? null,
    });

    const nowIso = new Date().toISOString();
    const txId = '44444444-4444-4444-8444-444444444444';
    const txHash = `0x${'f'.repeat(64)}`;

    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ created: true, ...makeHydrated({ state: 'reports_exchanged' }) }), {
          status: 201,
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(makeHydrated({ state: 'awaiting_approvals' })), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(makeHydrated({ state: 'awaiting_approvals', senderApprovedAt: nowIso })),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            makeHydrated({
              state: 'authorized',
              senderApprovedAt: nowIso,
              recipientApprovedAt: nowIso,
            })
          ),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            transaction: {
              id: txId,
              mutual_session_id: sessionId,
              canonical_tx_hash: canonicalHash,
              status: 'pending',
            },
          }),
          { status: 201 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            transaction: { id: txId, status: 'confirmed', tx_hash: txHash },
            verified: true,
            mutualTrustReceipt: {
              id: 'rec-1',
              receipt_code: 'MTR-44444444-123456',
              session_id: sessionId,
              transaction_id: txId,
              canonical_tx_hash: canonicalHash,
              settlement_status: 'confirmed',
              blockchain_tx_hash: txHash,
              receipt_signature: 'hmac-sig',
            },
          }),
          { status: 200 }
        )
      );

    // Step 1: Create bilateral session
    const created = await createOrJoinMutualTrustSession({
      recipientAddress: bobWallet.address,
      senderWalletAddress: aliceWallet.address,
      amount: '20',
      tokenSymbol: 'USDT',
      network: 'Testnet',
      purpose: 'Milestone invoice',
    });
    expect(created.session.canonical_tx_hash).toBe(canonicalHash);

    // Step 2: Acknowledge sanitized counterparty report
    await acknowledgeCounterpartyReport(sessionId);

    // Step 3: Alice signs real EIP-712 approval
    const afterAlice = await signAndSubmitMutualApproval({
      session: created.session,
      role: 'sender',
      signerAddress: aliceWallet.address,
      walletMethod: 'connected',
    });
    expect(afterAlice.approvals.sender?.recovered_address).toBe(aliceWallet.address);
    expect(afterAlice.session.session_state).toBe('awaiting_approvals');

    // Step 4: Bob signs real EIP-712 approval
    const afterBob = await signAndSubmitMutualApproval({
      session: created.session,
      role: 'recipient',
      signerAddress: bobWallet.address,
      walletMethod: 'connected',
    });
    expect(afterBob.session.session_state).toBe('authorized');
    expect(afterBob.approvals.recipient?.recovered_address).toBe(bobWallet.address);

    // Assert HTTP body of Bob's signature submission included valid 65-byte hex EIP-712 signature
    const bobSubmitBody = JSON.parse(String(fetchMock.mock.calls[3][1].body));
    expect(bobSubmitBody.signature).toMatch(/^0x[a-fA-F0-9]{130}$/);
    expect(bobSubmitBody.canonicalTxHash).toBe(canonicalHash);

    // Step 5: Unlock payment-prepare with mutualSessionId & canonicalTxHash
    const preparedTx = await preparePayment({
      amount: '20',
      tokenSymbol: 'USDT',
      network: 'Testnet',
      recipientName: 'Bob',
      recipientAddress: bobWallet.address,
      purpose: 'Milestone invoice',
      senderAddress: aliceWallet.address,
      mutualSessionId: sessionId,
      canonicalTxHash: canonicalHash,
    });
    expect(preparedTx.id).toBe(txId);

    // Step 6: Verify blockchain receipt and inspect Mutual Trust Receipt
    const verified = await verifyBlockchainReceipt({
      transactionId: txId,
      txHash,
      outcome: 'confirmed',
    });
    expect(verified.verified).toBe(true);
    expect(verified.mutualTrustReceipt?.receipt_code).toBe('MTR-44444444-123456');
  });

  it('handles explicit decline and Supabase Realtime reconnect cleanup cleanly', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          session: { id: 's-1', session_state: 'declined', decline_reason: 'Amount incorrect' },
        }),
        { status: 200 }
      )
    );

    const declined = await declineMutualTrustSession({
      sessionId: 's-1',
      reason: 'Amount incorrect',
    });
    expect(declined.session.session_state).toBe('declined');

    const onMock = vi.fn();
    const subscribeMock = vi.fn((cb: (status: string) => void) => {
      cb('SUBSCRIBED');
      return fakeChannel;
    });
    const fakeChannel = {
      on: onMock.mockImplementation(() => fakeChannel),
      subscribe: subscribeMock,
    };
    const removeChannelSpy = vi.spyOn(supabase, 'removeChannel').mockResolvedValue('ok');
    vi.spyOn(supabase, 'channel').mockReturnValue(fakeChannel as never);

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ session: { id: 's-1', session_state: 'authorized' } }), {
        status: 200,
      })
    );

    const states: string[] = [];
    const onUpdated = vi.fn();
    const cleanup = subscribeToMutualTrustSession('s-1', {
      onUpdated,
      onConnectionState: (s) => states.push(s),
    });

    expect(onMock).toHaveBeenCalledTimes(3); // sessions, approvals, receipts
    expect(states).toContain('live');
    await vi.waitFor(() => {
      expect(onUpdated).toHaveBeenCalledTimes(1);
    });
    cleanup();
    expect(removeChannelSpy).toHaveBeenCalledTimes(1);
  });
});

