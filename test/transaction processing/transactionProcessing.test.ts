import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  executeOnChainPayment,
  quoteTransferCost,
} from '../../src/services/wdkWalletService';
import {
  cancelPayment,
  preparePayment,
  runRiskAssessment,
  verifyBlockchainReceipt,
} from '../../src/services/paymentsService';
import { parseExactAmount } from '../../supabase/functions/_shared/validation';
import { supabase } from '../../src/lib/supabase';

const VALID_ADDR = '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06';
const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('Phase 5B: Transaction Processing & Settlement', () => {
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

  const exact6Cases: Array<[string, string]> = [
    ['1', '1000000'],
    ['0.000001', '1'],
    ['0.00001', '10'],
    ['0.1', '100000'],
    ['0.2', '200000'],
    ['0.3', '300000'],
    ['1.5', '1500000'],
    ['19.99', '19990000'],
    ['20.00', '20000000'],
    ['250.123456', '250123456'],
    ['1234.567891', '1234567891'],
    ['999999.999999', '999999999999'],
  ];

  it.each(exact6Cases)('exact 6-decimal atomic amount for %s -> %s', (amt, atomic) => {
    expect(parseExactAmount(amt, 6).atomic).toBe(atomic);
  });

  const exact18Cases: Array<[string, string]> = [
    ['1', '1000000000000000000'],
    ['0.5', '500000000000000000'],
    ['0.000000000000000001', '1'],
    ['2.25', '2250000000000000000'],
    ['0.001', '1000000000000000'],
    ['100.000000000000000001', '100000000000000000001'],
  ];

  it.each(exact18Cases)('exact 18-decimal atomic amount for %s -> %s', (amt, atomic) => {
    expect(parseExactAmount(amt, 18).atomic).toBe(atomic);
  });

  const invalidAmounts = [
    '0',
    '0.0',
    '0.000000',
    '-5',
    '-0.000001',
    '1.1234567',
    '1e6',
    'NaN',
    'Infinity',
    'abc',
    '.5',
    '5.',
    '10,00',
    '20 USDT',
    '',
    '   ',
  ];
  it.each(invalidAmounts)('rejects invalid financial amount "%s"', (bad) => {
    expect(() => parseExactAmount(bad, 6)).toThrow();
  });

  it('quoteTransferCost flags incompatible token/network before RPC calls', async () => {
    const q = await quoteTransferCost({
      senderAddress: VALID_ADDR,
      recipientAddress: VALID_ADDR,
      amount: '10.00',
      tokenSymbol: 'USDT',
      network: 'Base Sepolia',
    });
    expect(q.hasSufficientBalance).toBe(false);
    expect(q.insufficientReason).toContain('not configured');
  });

  const badExecCases: Array<[string, Partial<Parameters<typeof executeOnChainPayment>[0]>, RegExp]> = [
    ['invalid recipient', { recipientAddress: '0x123' }, /not a valid/],
    ['empty recipient', { recipientAddress: '' }, /required/],
    ['unsupported token on Base Sepolia', { tokenSymbol: 'USDT', network: 'Base Sepolia' }, /not configured/],
    ['unsupported token on Polygon Amoy', { tokenSymbol: 'USDT', network: 'Polygon Amoy' }, /not configured/],
    ['unknown token DOGE', { tokenSymbol: 'DOGE', network: 'Testnet' }, /not configured/],
    ['missing browser wallet', { walletMethod: 'connected' }, /Browser wallet provider not found/],
    ['missing WDK seed', { walletMethod: 'created', signingPhrase: '' }, /valid 12 or 24-word/],
    ['short WDK seed', { walletMethod: 'created', signingPhrase: 'abandon abandon' }, /valid 12 or 24-word/],
    ['invalid WDK seed', { walletMethod: 'imported', signingPhrase: 'bad words' }, /valid 12 or 24-word/],
    ['mismatched WDK seed address', { walletMethod: 'created', signingPhrase: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about' }, /does not match/],
  ];

  it.each(badExecCases)('executeOnChainPayment blocks %s', async (_label, overrides, pattern) => {
    await expect(
      executeOnChainPayment({
        senderAddress: VALID_ADDR,
        recipientAddress: VALID_ADDR,
        amount: '10.00',
        tokenSymbol: 'USDT',
        network: 'Testnet',
        walletMethod: 'created',
        signingPhrase: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
        ...overrides,
      })
    ).rejects.toThrow(pattern);
  });

  it('preparePayment propagates 409 DUPLICATE_SUBMISSION', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { code: 'DUPLICATE_SUBMISSION', message: 'Already pending' } }),
        { status: 409 }
      )
    );
    await expect(
      preparePayment({
        amount: '20.00',
        tokenSymbol: 'USDT',
        network: 'Testnet',
        recipientName: 'Thabo',
        recipientAddress: VALID_ADDR,
        purpose: 'Laptop',
      })
    ).rejects.toMatchObject({ code: 'DUPLICATE_SUBMISSION', status: 409 });
  });

  it('verifyBlockchainReceipt sends awaitingConfirmation and confirmed/failed outcomes', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ transaction: { id: 'tx-1', status: 'processing' }, verified: false }), {
        status: 200,
      })
    );
    const proc = await verifyBlockchainReceipt({
      transactionId: VALID_UUID,
      txHash: '0x' + 'a'.repeat(64),
      awaitingConfirmation: true,
    });
    expect(proc.verified).toBe(false);

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ transaction: { id: 'tx-1', status: 'failed' }, verified: false }), {
        status: 200,
      })
    );
    const failed = await verifyBlockchainReceipt({
      transactionId: VALID_UUID,
      txHash: '0x' + 'a'.repeat(64),
      outcome: 'failed',
    });
    expect(failed.verified).toBe(false);
  });

  it('cancelPayment and runRiskAssessment call their respective Edge Functions', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await cancelPayment({ transactionId: VALID_UUID, reason: 'User aborted' });
    expect(String(fetchMock.mock.calls[0][0])).toContain('/payment-cancel');

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ assessment: { id: 'r1', risk_level: 'low' } }), { status: 200 })
    );
    const risk = await runRiskAssessment({
      recipientAddress: VALID_ADDR,
      network: 'Testnet',
      tokenSymbol: 'USDT',
      amount: '20.00',
    });
    expect(risk.risk_level).toBe('low');
  });
});
