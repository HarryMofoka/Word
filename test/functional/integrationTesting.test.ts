import { Wallet } from 'ethers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase, SUPABASE_FUNCTIONS_BASE } from '../../src/lib/supabase';
import { callEdgeFunction } from '../../src/services/apiClient';
import {
  listTransactions,
  preparePayment,
  verifyBlockchainReceipt,
} from '../../src/services/paymentsService';
import {
  fetchMyPrimaryWallet,
  registerWalletAndChallenge,
  verifyWalletChallenge,
} from '../../src/services/walletService';
import { createWdkWallet } from '../../src/services/wdkWalletService';
import {
  interpretPaymentRequestLocally,
  prepareAssistantPaymentHandoff,
  validateProposalWithBackend,
} from '../../src/services/qvacAssistantService';
import {
  buildRecipientChallengeMessage,
  verifyRecipientChallengeSignature,
} from '../../src/services/recipientVerificationService';
import {
  validateTransactionForSigning,
  verifyIndependentReceiptResponse,
} from '../../src/services/walletSecurityService';
import { reconcilePendingTransactions } from '../../src/services/reliabilityService';
import {
  appendRecordEvent,
  exportTransactionRecordAsCsv,
  exportTransactionRecordAsJson,
  generateTransactionRecord,
} from '../../src/services/transactionRecordService';
import { buildCoherentAccountabilityBundle, createDisputeCase } from '../../src/services/disputeService';
import paymentPrepareSource from '../../supabase/functions/payment-prepare/index.ts?raw';
import receiptVerifySource from '../../supabase/functions/receipt-verify/index.ts?raw';

const RECIPIENT = '0x2222222222222222222222222222222222222222';
const TX_HASH = `0x${'f'.repeat(64)}`;

describe('Phase 11: Integration Testing', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
      data: { session: { access_token: 'integration-jwt' } as never },
      error: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('1. verifies frontend-to-backend communication headers, URLs, and error handling', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ requests: [{ id: 'req-1' }] }), { status: 200 })
    );

    const res = await callEdgeFunction<{ requests: Array<{ id: string }> }>('payment-requests', {
      method: 'GET',
      query: { shareCode: 'PAY-123' },
    });

    expect(res.requests[0].id).toBe('req-1');
    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe(`${SUPABASE_FUNCTIONS_BASE}/payment-requests?shareCode=PAY-123`);
    expect(init.credentials).toBe('omit');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer integration-jwt');
  });

  it('2. verifies backend-to-database communication contracts and Supabase client queries', async () => {
    expect(paymentPrepareSource).toContain("from('transactions')");
    expect(paymentPrepareSource).toContain("from('payment_requests')");
    expect(receiptVerifySource).toContain("from('verification_records')");
    expect(receiptVerifySource).toContain('recordAuditLog');

    const maybeSingleMock = vi.fn().mockResolvedValueOnce({
      data: { id: 'w-1', user_id: 'u-1', address: RECIPIENT, is_primary: true },
      error: null,
    });
    const limitWalletMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock });
    const order2Mock = vi.fn().mockReturnValue({ limit: limitWalletMock });
    const order1Mock = vi.fn().mockReturnValue({ order: order2Mock });
    const eqMock = vi.fn().mockReturnValue({ order: order1Mock });
    const selectWalletMock = vi.fn().mockReturnValue({ eq: eqMock });

    vi.spyOn(supabase, 'from').mockReturnValueOnce({ select: selectWalletMock } as never);
    const wallet = await fetchMyPrimaryWallet('u-1');
    expect(wallet?.id).toBe('w-1');

    const limitTxMock = vi.fn().mockResolvedValueOnce({
      data: [{ id: 'tx-1', status: 'confirmed' }],
      error: null,
    });
    const orderTxMock = vi.fn().mockReturnValue({ limit: limitTxMock });
    const selectTxMock = vi.fn().mockReturnValue({ order: orderTxMock });
    vi.spyOn(supabase, 'from').mockReturnValueOnce({ select: selectTxMock } as never);
    const txs = await listTransactions();
    expect(txs[0].id).toBe('tx-1');
  });

  it('3. verifies backend-to-WDK communication across wallet registration and payment preparation', async () => {
    const wdkWallet = await createWdkWallet('Testnet');
    expect(wdkWallet.address).toMatch(/^0x[a-fA-F0-9]{40}$/);

    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            wallet: { id: 'w-wdk', address: wdkWallet.address, network: 'Testnet' },
            challenge: { id: '550e8400-e29b-41d4-a716-446655440000', message: 'Challenge' },
          }),
          { status: 201 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            transaction: {
              id: 'tx-wdk-1',
              sender_address: wdkWallet.address,
              recipient_address: RECIPIENT,
              status: 'pending',
            },
          }),
          { status: 201 }
        )
      );

    const reg = await registerWalletAndChallenge({
      address: wdkWallet.address,
      network: 'Testnet',
      method: 'created',
    });
    expect(reg.wallet.address).toBe(wdkWallet.address);

    const prepared = await preparePayment({
      amount: '15.00',
      tokenSymbol: 'USDT',
      network: 'Testnet',
      recipientName: 'Thabo',
      recipientAddress: RECIPIENT,
      purpose: 'WDK integration test',
      senderAddress: wdkWallet.address,
    });
    expect(prepared.sender_address).toBe(wdkWallet.address);
  });

  it('4. verifies QVAC integration, proposal handoff, and backend parameter validation', async () => {
    const interpretation = interpretPaymentRequestLocally(
      `Send 20 USDT to ${RECIPIENT} on Testnet for a laptop`
    );
    expect(interpretation.proposal).not.toBeNull();
    expect(interpretation.proposalValidation.valid).toBe(true);

    const handoff = prepareAssistantPaymentHandoff(interpretation);
    expect(handoff.requiresExplicitApproval).toBe(true);
    expect(handoff.preparedByAssistant).toBe(true);

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ valid: true, normalized: interpretation.proposal }), {
        status: 200,
      })
    );
    const backendCheck = await validateProposalWithBackend(
      interpretation.proposal!,
      async (p) =>
        callEdgeFunction('assistant', {
          method: 'POST',
          body: { action: 'validate', proposal: p as unknown as Record<string, unknown> },
        })
    );
    expect(backendCheck.valid).toBe(true);
  });

  it('5. verifies cryptographic wallet signing and challenge verification', async () => {
    const signer = Wallet.createRandom();
    const msg = buildRecipientChallengeMessage({
      paymentRequestId: 'req-sign-1',
      shareCode: 'PAY-SIGN',
      intendedAddress: signer.address,
      network: 'Testnet',
      nonce: 'nonce-sign-9999',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const signature = await signer.signMessage(msg);

    const verified = verifyRecipientChallengeSignature({
      message: msg,
      signature,
      intendedAddress: signer.address,
      paymentRequestId: 'req-sign-1',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(verified.verified).toBe(true);
    expect(verified.recoveredAddress?.toLowerCase()).toBe(signer.address.toLowerCase());

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ verified: true, wallet: { address: signer.address, is_verified: true } }),
        { status: 200 }
      )
    );
    const serverVerify = await verifyWalletChallenge({
      challengeId: '550e8400-e29b-41d4-a716-446655440000',
      signature,
    });
    expect(serverVerify.verified).toBe(true);

    const preview = validateTransactionForSigning({
      fromAddress: signer.address,
      toAddress: RECIPIENT,
      amount: '20.00',
      token: 'USDT',
      network: 'Testnet',
      approvalAcknowledged: true,
    });
    expect(preview.destinationAddress).toBe(RECIPIENT);
  });

  it('6-7. verifies blockchain receipt verification and transaction status synchronisation', async () => {
    const rpcCheck = verifyIndependentReceiptResponse(
      { transactionHash: TX_HASH, status: '0x1', blockNumber: '0x2a', from: RECIPIENT },
      { txHash: TX_HASH, senderAddress: RECIPIENT }
    );
    expect(rpcCheck.verified).toBe(true);
    expect(rpcCheck.status).toBe('confirmed');

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          verified: true,
          transaction: { id: 'tx-sync-1', status: 'confirmed', tx_hash: TX_HASH },
        }),
        { status: 200 }
      )
    );
    const syncRes = await verifyBlockchainReceipt({
      transactionId: 'tx-sync-1',
      txHash: TX_HASH,
    });
    expect(syncRes.verified).toBe(true);
    expect(syncRes.transaction.status).toBe('confirmed');

    const reconciliation = await reconcilePendingTransactions(
      [
        {
          id: 'tx-sync-1',
          status: 'processing',
          tx_hash: TX_HASH,
          network: 'Testnet',
          created_at: new Date().toISOString(),
        },
      ],
      async () => 'confirmed'
    );
    expect(reconciliation.reconciledConfirmed).toEqual(['tx-sync-1']);
  });

  it('8. verifies complete payment record generation, event appending, and exports', () => {
    const baseRecord = generateTransactionRecord({
      recordId: 'rec-int-1',
      senderUserId: 'u-sender',
      recipientUserId: 'u-recipient',
      senderAddress: '0x1111111111111111111111111111111111111111',
      recipientName: 'Thabo Mokoena',
      recipientAddress: RECIPIENT,
      amount: '20.00',
      tokenSymbol: 'USDT',
      network: 'Testnet',
      txHash: TX_HASH,
      confirmationStatus: 'confirmed',
      purpose: 'Laptop purchase',
      nowIso: '2026-11-13T19:00:00.000Z',
    });

    const updatedRecord = appendRecordEvent(baseRecord, {
      id: 'evt-confirm-1',
      type: 'tx_confirmed',
      title: 'On-chain confirmation recorded',
      detail: `Confirmed on Testnet (${TX_HASH.slice(0, 10)})`,
      timestamp: '2026-11-13T19:01:00.000Z',
    });

    expect(updatedRecord.eventHistory.length).toBeGreaterThan(baseRecord.eventHistory.length);

    const jsonExport = exportTransactionRecordAsJson(updatedRecord);
    const csvExport = exportTransactionRecordAsCsv(updatedRecord);
    expect(jsonExport).toContain(TX_HASH);
    expect(csvExport).toContain('rec-int-1');

    const dispute = createDisputeCase({
      paymentId: 'rec-int-1',
      category: 'Item or service not delivered',
      explanation: 'Laptop not delivered on agreed date.',
    });
    const bundle = buildCoherentAccountabilityBundle({
      requested: {
        amount: '20.00',
        token: 'USDT',
        network: 'Testnet',
        recipient: RECIPIENT,
        purpose: 'Laptop purchase',
      },
      agreed: {
        agreementId: 'agr-1',
        status: 'Accepted',
        terms: 'Deliver laptop on settlement.',
      },
      paid: {
        paymentId: updatedRecord.recordId,
        txHash: updatedRecord.txHash,
        confirmationStatus: updatedRecord.confirmationStatus,
      },
      reported: dispute,
    });

    expect(bundle.paid.txHash).toBe(TX_HASH);
    expect(bundle.reported?.acknowledgement.referenceId).toMatch(/^ACK-/);
  });
});
