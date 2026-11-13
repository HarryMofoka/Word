import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, callEdgeFunction } from '../../src/services/apiClient';
import {
  classifyBackendFailure,
  createIdempotencyKey,
  evaluatePaymentRequestAvailability,
  executeWithRpcFailover,
  parsePaymentQrPayload,
  reconcilePendingTransactions,
  ReliabilityError,
  resolveAiInferenceWithFallback,
  retryWithBackoff,
} from '../../src/services/reliabilityService';
import { supabase } from '../../src/lib/supabase';
import paymentPrepareSource from '../../supabase/functions/payment-prepare/index.ts?raw';

describe('Phase 10: Reliability & Resilience', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
      data: { session: { access_token: 'jwt-token' } as never },
      error: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('handles RPC outages with failover to backup endpoints and throws RPC_OUTAGE if all fail', async () => {
    const res = await executeWithRpcFailover(
      ['https://primary-rpc.invalid', 'https://backup-rpc.valid'],
      async (url) => {
        if (url.includes('invalid')) throw new Error('RPC timeout');
        return { blockNumber: '0x123' };
      },
      { sleep: async () => {} }
    );

    expect(res.result).toEqual({ blockNumber: '0x123' });
    expect(res.usedRpcUrl).toBe('https://backup-rpc.valid');
    expect(res.failedEndpoints).toEqual(['https://primary-rpc.invalid']);

    await expect(
      executeWithRpcFailover(
        ['https://rpc1.invalid', 'https://rpc2.invalid'],
        async () => {
          throw new Error('503 Service Unavailable');
        },
        { sleep: async () => {} }
      )
    ).rejects.toMatchObject({ code: 'RPC_OUTAGE', retryable: true });
  });

  it('classifies database outages vs duplicate requests vs permanent errors cleanly', () => {
    const dbOutage = classifyBackendFailure({
      status: 503,
      code: 'PGRST000',
      message: 'database connection pool exhausted',
    });
    expect(dbOutage.kind).toBe('database_outage');
    expect(dbOutage.retryable).toBe(true);
    expect(dbOutage.userMessage).toContain('No funds were moved');

    const dup = classifyBackendFailure({
      status: 409,
      code: 'DUPLICATE_SUBMISSION',
      message: 'Already submitted',
    });
    expect(dup.kind).toBe('duplicate_request');
    expect(dup.retryable).toBe(false);

    const perm = classifyBackendFailure({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Invalid amount',
    });
    expect(perm.kind).toBe('permanent');
    expect(perm.retryable).toBe(false);
  });

  it('handles network interruptions with safe retry on GET and never blind-retries non-idempotent POST', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ profile: { id: 'u1' } }), { status: 200 }));

    const profileRes = await callEdgeFunction<{ profile: { id: string } }>('profile', {
      method: 'GET',
    });
    expect(profileRes.profile.id).toBe('u1');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockReset();
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(
      callEdgeFunction('payment-prepare', {
        method: 'POST',
        body: { amount: '10' },
      })
    ).rejects.toMatchObject({
      code: 'NETWORK_INTERRUPTED',
      status: 503,
    });
    // Non-idempotent POST without idempotencyKey must NOT be auto-retried
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('allows safe retries on POST when an idempotencyKey is provided and prevents duplicate payments', async () => {
    const key1 = createIdempotencyKey({
      senderAddress: '0x1111111111111111111111111111111111111111',
      recipientAddress: '0x2222222222222222222222222222222222222222',
      amount: '20',
      token: 'usdt',
      network: 'Testnet',
      paymentRequestId: 'req-1',
    });
    const key2 = createIdempotencyKey({
      senderAddress: '0x1111111111111111111111111111111111111111',
      recipientAddress: '0x2222222222222222222222222222222222222222',
      amount: '20',
      token: 'USDT',
      network: 'Testnet',
      paymentRequestId: 'req-1',
    });
    expect(key1).toBe(key2);

    fetchMock
      .mockRejectedValueOnce(new TypeError('Network interrupted'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ transaction: { id: 'tx-1' } }), { status: 201 }));

    const res = await callEdgeFunction<{ transaction: { id: string } }>('payment-prepare', {
      method: 'POST',
      body: { amount: '20' },
      idempotencyKey: key1,
    });
    expect(res.transaction.id).toBe('tx-1');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['x-idempotency-key']).toBe(key1);

    // Backend duplicate protection in payment-prepare
    expect(paymentPrepareSource).toContain('DUPLICATE_SUBMISSION');
  });

  it('handles failed AI inference gracefully via deterministic fallback', async () => {
    const res = await resolveAiInferenceWithFallback(
      async () => {
        throw new Error('QVAC model failed to load');
      },
      (reason) => ({
        intent: 'fallback_parsed',
        notice: `Switched to deterministic parser: ${reason}`,
      })
    );

    expect(res.usedFallback).toBe(true);
    expect(res.fallbackReason).toContain('QVAC model failed');
    expect(res.output.intent).toBe('fallback_parsed');
  });

  it('rejects invalid, corrupted, or malicious QR codes cleanly', () => {
    expect(parsePaymentQrPayload('PAY-9K2M1X')).toEqual({ shareCode: 'PAY-9K2M1X' });
    expect(
      parsePaymentQrPayload(
        'word://pay?to=0x2222222222222222222222222222222222222222&amount=20&token=USDT&network=Testnet'
      )
    ).toMatchObject({
      recipientAddress: '0x2222222222222222222222222222222222222222',
      amount: '20',
      token: 'USDT',
      network: 'Testnet',
    });

    for (const badQr of [
      '',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      '{not valid json',
      '{"recipientAddress":"0xbad"}',
      'word://pay?to=0x2222222222222222222222222222222222222222&amount=-5',
      'totally-invalid-qr-string!!!',
    ]) {
      expect(() => parsePaymentQrPayload(badQr)).toThrow(ReliabilityError);
    }
  });

  it('detects expired, cancelled, and already-paid payment requests', () => {
    const now = Date.now();
    expect(
      evaluatePaymentRequestAvailability(
        { status: 'open', expires_at: new Date(now + 60_000).toISOString() },
        now
      )
    ).toEqual({ available: true, reason: 'OPEN' });

    expect(
      evaluatePaymentRequestAvailability(
        { status: 'open', expires_at: new Date(now - 1000).toISOString() },
        now
      )
    ).toEqual({ available: false, reason: 'EXPIRED' });

    expect(evaluatePaymentRequestAvailability({ status: 'completed' }, now)).toEqual({
      available: false,
      reason: 'ALREADY_PAID',
    });

    expect(evaluatePaymentRequestAvailability({ status: 'cancelled' }, now)).toEqual({
      available: false,
      reason: 'CANCELLED',
    });
  });

  it('reconciles incomplete and pending transactions against on-chain receipt status', async () => {
    const now = Date.now();
    const summary = await reconcilePendingTransactions(
      [
        {
          id: 'tx-confirmed',
          status: 'processing',
          tx_hash: '0x1111',
          network: 'Testnet',
          created_at: new Date(now - 60_000).toISOString(),
        },
        {
          id: 'tx-failed',
          status: 'processing',
          tx_hash: '0x2222',
          network: 'Testnet',
          created_at: new Date(now - 60_000).toISOString(),
        },
        {
          id: 'tx-stale-no-hash',
          status: 'pending',
          tx_hash: null,
          network: 'Testnet',
          created_at: new Date(now - 10 * 60_000).toISOString(),
        },
        {
          id: 'tx-fresh-no-hash',
          status: 'pending',
          tx_hash: null,
          network: 'Testnet',
          created_at: new Date(now - 10_000).toISOString(),
        },
      ],
      async (txHash) => {
        if (txHash === '0x1111') return 'confirmed';
        if (txHash === '0x2222') return 'failed';
        return 'pending';
      },
      now
    );

    expect(summary.reconciledConfirmed).toEqual(['tx-confirmed']);
    expect(summary.reconciledFailed).toEqual(['tx-failed']);
    expect(summary.incompleteWithoutHash).toEqual(['tx-stale-no-hash']);
    expect(summary.stillPending).toEqual(['tx-fresh-no-hash']);
  });

  it('does not retry permanent 4xx errors in retryWithBackoff', async () => {
    let attempts = 0;
    await expect(
      retryWithBackoff(
        async () => {
          attempts++;
          throw new ApiError('VALIDATION_ERROR', 'Bad input', 400);
        },
        { maxAttempts: 3, baseDelayMs: 1, sleep: async () => {} }
      )
    ).rejects.toMatchObject({ status: 400 });
    expect(attempts).toBe(1);
  });
});

