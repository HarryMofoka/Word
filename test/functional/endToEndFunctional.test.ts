import { Wallet } from 'ethers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '../../src/lib/supabase';
import { signInWithEmail, signUpWithEmail } from '../../src/services/authService';
import { registerWalletAndChallenge, verifyWalletChallenge } from '../../src/services/walletService';
import {
  createPaymentRequest,
  fetchPaymentRequestByCode,
  listTransactions,
  preparePayment,
  runRiskAssessment,
  verifyBlockchainReceipt,
} from '../../src/services/paymentsService';
import { parsePaymentQrPayload } from '../../src/services/reliabilityService';
import {
  buildRecipientChallengeMessage,
  verifyRecipientChallengeSignature,
} from '../../src/services/recipientVerificationService';
import { validatePaymentDetails } from '../../src/services/paymentDetailValidationService';
import { evaluatePaymentRisk } from '../../src/services/riskIntelligenceService';
import { validateTransactionForSigning } from '../../src/services/walletSecurityService';
import {
  exportTransactionRecordAsJson,
  generateTransactionRecord,
} from '../../src/services/transactionRecordService';
import { createDisputeCase } from '../../src/services/disputeService';
import { createDispute } from '../../src/services/accountabilityService';

const SENDER_ADDR = '0x1111111111111111111111111111111111111111';
const RECIPIENT_ADDR = '0x2222222222222222222222222222222222222222';
const TX_HASH = `0x${'a'.repeat(64)}`;
const SIG_HEX = `0x${'c'.repeat(130)}`;

describe('Phase 11: End-to-End Functional Testing', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
      data: { session: { access_token: 'functional-jwt-token' } as never },
      error: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('1-2. registers a new user and signs in', async () => {
    const signUpSpy = vi.spyOn(supabase.auth, 'signUp').mockResolvedValueOnce({
      data: { user: { id: 'user-1', email: 'thabo@example.com' } as never, session: null },
      error: null,
    });
    const signInSpy = vi.spyOn(supabase.auth, 'signInWithPassword').mockResolvedValueOnce({
      data: {
        user: { id: 'user-1', email: 'thabo@example.com' } as never,
        session: { access_token: 'jwt-1' } as never,
      },
      error: null,
    });

    const reg = await signUpWithEmail({
      email: 'thabo@example.com',
      password: 'StrongPassword!123',
      displayName: 'Thabo',
    });
    expect(reg.user?.email).toBe('thabo@example.com');
    expect(signUpSpy).toHaveBeenCalledTimes(1);

    const auth = await signInWithEmail({
      email: 'thabo@example.com',
      password: 'StrongPassword!123',
    });
    expect(auth.session?.access_token).toBe('jwt-1');
    expect(signInSpy).toHaveBeenCalledTimes(1);
  });

  it('3. connects a wallet and verifies cryptographic challenge ownership', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            wallet: { id: 'w-1', address: SENDER_ADDR, network: 'Testnet', is_verified: false },
            challenge: {
              id: '550e8400-e29b-41d4-a716-446655440000',
              message: 'Word Wallet Control Verification',
            },
          }),
          { status: 201 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            verified: true,
            wallet: { id: 'w-1', address: SENDER_ADDR, network: 'Testnet', is_verified: true },
            verifiedAt: '2026-11-13T18:00:00.000Z',
          }),
          { status: 200 }
        )
      );

    const { wallet, challenge } = await registerWalletAndChallenge({
      address: SENDER_ADDR,
      network: 'Testnet',
      method: 'connected',
    });
    expect(wallet.address).toBe(SENDER_ADDR);

    const verification = await verifyWalletChallenge({
      challengeId: challenge.id,
      signature: SIG_HEX,
    });
    expect(verification.verified).toBe(true);
    expect(verification.wallet?.is_verified).toBe(true);
  });

  it('4-6. creates a payment request, generates a QR payload, and scans/parses it', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            request: {
              id: 'req-100',
              share_code: 'PAY-48291A',
              amount_numeric: '25.00',
              token_symbol: 'USDT',
              network: 'Testnet',
              recipient_name: 'Thabo Mokoena',
              recipient_address: RECIPIENT_ADDR,
              description: 'Laptop deposit',
              status: 'open',
            },
          }),
          { status: 201 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            request: {
              id: 'req-100',
              share_code: 'PAY-48291A',
              amount_numeric: '25.00',
              token_symbol: 'USDT',
              network: 'Testnet',
              recipient_name: 'Thabo Mokoena',
              recipient_address: RECIPIENT_ADDR,
              description: 'Laptop deposit',
              status: 'open',
            },
          }),
          { status: 200 }
        )
      );

    const created = await createPaymentRequest({
      amount: '25.00',
      tokenSymbol: 'USDT',
      network: 'Testnet',
      recipientName: 'Thabo Mokoena',
      recipientAddress: RECIPIENT_ADDR,
      description: 'Laptop deposit',
    });
    expect(created.share_code).toBe('PAY-48291A');

    // Generate QR payload
    const qrString = `word://pay?code=${created.share_code}&to=${created.recipient_address}&amount=${created.amount_numeric}&token=${created.token_symbol}&network=${created.network}`;

    // Scan QR payload and resolve request
    const scanned = parsePaymentQrPayload(qrString);
    expect(scanned.shareCode).toBe('PAY-48291A');
    expect(scanned.recipientAddress).toBe(RECIPIENT_ADDR);

    const fetched = await fetchPaymentRequestByCode(scanned.shareCode!);
    expect(fetched.id).toBe('req-100');
  });

  it('7-9. verifies recipient, reviews payment details, and generates a risk assessment', async () => {
    const recipientWallet = Wallet.createRandom();
    const challengeMsg = buildRecipientChallengeMessage({
      paymentRequestId: 'req-100',
      shareCode: 'PAY-48291A',
      intendedAddress: recipientWallet.address,
      network: 'Testnet',
      nonce: 'nonce-func-1234',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const sig = await recipientWallet.signMessage(challengeMsg);

    const recipientCheck = verifyRecipientChallengeSignature({
      message: challengeMsg,
      signature: sig,
      intendedAddress: recipientWallet.address,
      paymentRequestId: 'req-100',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(recipientCheck.status).toBe('verified');
    expect(recipientCheck.verified).toBe(true);

    const detailValidation = validatePaymentDetails({
      requested: {
        recipientAddress: recipientWallet.address,
        recipientName: 'Thabo Mokoena',
        amount: '25.00',
        token: 'USDT',
        network: 'Testnet',
        status: 'open',
      },
      intended: {
        expectedRecipientAddress: recipientWallet.address,
        expectedAmount: '25.00',
        expectedToken: 'USDT',
        expectedNetwork: 'Testnet',
      },
    });
    expect(detailValidation.valid).toBe(true);

    const riskReport = evaluatePaymentRisk({
      recipientName: 'Thabo Mokoena',
      recipientAddress: recipientWallet.address,
      amount: '25.00',
      tokenSymbol: 'USDT',
      network: 'Testnet',
      purpose: 'Laptop deposit',
      walletControlStatus: 'verified',
    });
    expect(riskReport.classificationLabel).toBe('Low');

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          assessment: {
            id: 'risk-1',
            risk_level: 'low',
            risk_score: riskReport.riskScore,
            summary: riskReport.summary,
          },
        }),
        { status: 201 }
      )
    );
    const savedAssessment = await runRiskAssessment({
      recipientAddress: recipientWallet.address,
      network: 'Testnet',
      tokenSymbol: 'USDT',
      amount: '25.00',
      purpose: 'Laptop deposit',
    });
    expect(savedAssessment.risk_level).toBe('low');
  });

  it('10-13. approves, submits, confirms a transaction, and views transaction history', async () => {
    const signingPreview = validateTransactionForSigning({
      fromAddress: SENDER_ADDR,
      toAddress: RECIPIENT_ADDR,
      amount: '25.00',
      token: 'USDT',
      network: 'Testnet',
      approvalAcknowledged: true,
    });
    expect(signingPreview.explicitApprovalConfirmed).toBe(true);

    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            transaction: {
              id: 'tx-100',
              status: 'pending',
              amount_numeric: '25.00',
              token_symbol: 'USDT',
              network: 'Testnet',
              recipient_address: RECIPIENT_ADDR,
            },
          }),
          { status: 201 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            verified: true,
            transaction: {
              id: 'tx-100',
              status: 'confirmed',
              tx_hash: TX_HASH,
              amount_numeric: '25.00',
              token_symbol: 'USDT',
              network: 'Testnet',
              recipient_address: RECIPIENT_ADDR,
            },
          }),
          { status: 200 }
        )
      );

    const prepared = await preparePayment({
      amount: signingPreview.amount,
      tokenSymbol: signingPreview.token,
      network: signingPreview.network,
      recipientName: 'Thabo Mokoena',
      recipientAddress: signingPreview.destinationAddress,
      purpose: 'Laptop deposit',
      senderAddress: signingPreview.fromAddress,
    });
    expect(prepared.status).toBe('pending');

    const confirmed = await verifyBlockchainReceipt({
      transactionId: prepared.id,
      txHash: TX_HASH,
    });
    expect(confirmed.verified).toBe(true);
    expect(confirmed.transaction.status).toBe('confirmed');

    const limitMock = vi.fn().mockResolvedValueOnce({
      data: [confirmed.transaction],
      error: null,
    });
    const orderMock = vi.fn().mockReturnValue({ limit: limitMock });
    const selectMock = vi.fn().mockReturnValue({ order: orderMock });
    vi.spyOn(supabase, 'from').mockReturnValueOnce({ select: selectMock } as never);

    const history = await listTransactions();
    expect(history).toHaveLength(1);
    expect(history[0].tx_hash).toBe(TX_HASH);
  });

  it('14-15. accesses a shared payment record and submits a dispute', async () => {
    const record = generateTransactionRecord({
      recordId: 'tx-100',
      senderAddress: SENDER_ADDR,
      recipientAddress: RECIPIENT_ADDR,
      recipientName: 'Thabo Mokoena',
      amount: '25.00',
      tokenSymbol: 'USDT',
      network: 'Testnet',
      txHash: TX_HASH,
      confirmationStatus: 'confirmed',
      purpose: 'Laptop deposit',
      agreementReference: {
        agreementId: 'AGR-100',
        version: 1,
        status: 'accepted',
        acceptedAt: '2026-11-13T17:55:00.000Z',
      },
      verificationResult: {
        status: 'verified',
        verifiedAt: '2026-11-13T17:58:00.000Z',
        identityNote: 'Cryptographic wallet control verified.',
      },
      riskAssessment: {
        riskScore: 0,
        riskLevel: 'low',
        classificationLabel: 'Low',
        summary: 'No significant issues detected',
        assessedAt: '2026-11-13T17:59:00.000Z',
      },
      nowIso: '2026-11-13T18:00:00.000Z',
    });

    const exported = exportTransactionRecordAsJson(record);
    expect(exported).toContain('AGR-100');
    expect(exported).toContain(TX_HASH);

    const localDispute = createDisputeCase({
      paymentId: 'tx-100',
      category: 'Item or service not delivered',
      explanation: 'Laptop was not handed over after settlement.',
      initialEvidence: {
        label: 'Chat screenshot',
        note: 'Seller stopped replying after payment confirmation.',
      },
    });
    expect(localDispute.status).toBe('Evidence Submitted');
    expect(localDispute.acknowledgement.referenceId).toMatch(/^ACK-/);

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          dispute: {
            id: 'dsp-100',
            transaction_id: 'tx-100',
            reason: 'Item or service not delivered',
            status: 'submitted',
          },
        }),
        { status: 201 }
      )
    );
    const persistedDispute = await createDispute({
      transactionId: 'tx-100',
      reason: 'Item or service not delivered',
      summary: 'Laptop was not handed over after settlement.',
    });
    expect(persistedDispute.id).toBe('dsp-100');
  });
});
