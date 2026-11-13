import { describe, expect, it } from 'vitest';
import { validatePaymentDetails } from '../../src/services/paymentDetailValidationService';

const ADDR_A = '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06';
const ADDR_B = '0x1111111111111111111111111111111111111111';

const BASE_REQUEST = {
  recipientAddress: ADDR_A,
  recipientName: 'Thabo M.',
  amount: '20.00',
  token: 'USDT',
  network: 'Testnet',
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  status: 'open' as const,
  authoritativeDestinationAddress: ADDR_A,
};

describe('Phase 6C: Payment Detail Validation & Discrepancy Detection', () => {
  it('passes when all requested and intended details match and request is open & unexpired', () => {
    const res = validatePaymentDetails({
      requested: BASE_REQUEST,
      intended: {
        expectedRecipientAddress: ADDR_A,
        expectedAmount: '20.00',
        expectedToken: 'USDT',
        expectedNetwork: 'Testnet',
      },
    });
    expect(res.valid).toBe(true);
    expect(res.discrepancies).toHaveLength(0);
    expect(Object.values(res.checks).every(Boolean)).toBe(true);
  });

  it('passes with case-insensitive address, token, and Testnet (Sepolia) alias', () => {
    const res = validatePaymentDetails({
      requested: {
        ...BASE_REQUEST,
        network: 'Testnet (Sepolia)',
      },
      intended: {
        expectedRecipientAddress: ADDR_A.toLowerCase(),
        expectedAmount: '20',
        expectedToken: 'usdt',
        expectedNetwork: 'Testnet',
      },
    });
    expect(res.valid).toBe(true);
    expect(res.discrepancies).toHaveLength(0);
  });

  it('detects recipient address mismatch', () => {
    const res = validatePaymentDetails({
      requested: BASE_REQUEST,
      intended: { expectedRecipientAddress: ADDR_B },
    });
    expect(res.valid).toBe(false);
    expect(res.checks.recipientMatches).toBe(false);
    expect(res.discrepancies[0].field).toBe('recipient');
  });

  it('detects changed destination address vs authoritative record', () => {
    const res = validatePaymentDetails({
      requested: {
        ...BASE_REQUEST,
        recipientAddress: ADDR_B,
        authoritativeDestinationAddress: ADDR_A,
      },
    });
    expect(res.valid).toBe(false);
    expect(res.checks.destinationUnchanged).toBe(false);
    expect(res.discrepancies.some((d) => d.field === 'destination_changed')).toBe(true);
  });

  const amountMismatchPairs: Array<[string, string, string, boolean]> = [
    ['20.00', '20', 'USDT', true],
    ['20.00', '20.000000', 'USDT', true],
    ['20.00', '20.01', 'USDT', false],
    ['20.00', '19.999999', 'USDT', false],
    ['20.00', '200.00', 'USDT', false],
    ['1.5', '1.500000000000000000', 'ETH', true],
    ['1.5', '1.500000000000000001', 'ETH', false],
    ['20.00', '0', 'USDT', false],
    ['20.00', '-20', 'USDT', false],
    ['20.00', 'abc', 'USDT', false],
    ['20.00', '20.1234567', 'USDT', false],
  ];

  it.each(amountMismatchPairs)(
    'compares requested=%s vs expected=%s (%s) -> match=%s',
    (reqAmt, expAmt, token, expectedMatch) => {
      const res = validatePaymentDetails({
        requested: { ...BASE_REQUEST, amount: reqAmt, token },
        intended: { expectedAmount: expAmt },
      });
      expect(res.checks.amountMatches).toBe(expectedMatch);
      expect(res.valid).toBe(expectedMatch);
    }
  );

  const tokenPairs: Array<[string, string, boolean]> = [
    ['USDT', 'USDT', true],
    ['USDT', 'usdt', true],
    ['USDT', 'USDC', false],
    ['USDT', 'ETH', false],
    ['USDC', 'WETH', false],
    ['ETH', 'WETH', false],
  ];

  it.each(tokenPairs)('compares requested token %s vs expected %s -> %s', (reqTok, expTok, ok) => {
    const res = validatePaymentDetails({
      requested: { ...BASE_REQUEST, token: reqTok },
      intended: { expectedToken: expTok },
    });
    expect(res.checks.tokenMatches).toBe(ok);
  });

  const networkPairs: Array<[string, string, boolean]> = [
    ['Testnet', 'Testnet', true],
    ['Testnet (Sepolia)', 'Testnet', true],
    ['Base Sepolia', 'Base Sepolia', true],
    ['Polygon Amoy', 'Polygon Amoy', true],
    ['Testnet', 'Base Sepolia', false],
    ['Base Sepolia', 'Polygon Amoy', false],
    ['Polygon Amoy', 'Testnet', false],
  ];

  it.each(networkPairs)(
    'compares requested network %s vs expected %s -> %s',
    (reqNet, expNet, ok) => {
      const res = validatePaymentDetails({
        requested: { ...BASE_REQUEST, network: reqNet },
        intended: { expectedNetwork: expNet },
      });
      expect(res.checks.networkMatches).toBe(ok);
    }
  );

  const expiryCases: Array<['open' | 'expired' | 'completed' | 'cancelled', number | null, number, boolean]> = [
    ['open', null, 1000, true],
    ['open', 2000, 1000, true],
    ['open', 1000, 1000, false],
    ['open', 1000, 1001, false],
    ['expired', 5000, 1000, false],
    ['expired', null, 1000, false],
  ];

  it.each(expiryCases)(
    'validates expiry status=%s exp=%s now=%s -> notExpired=%s',
    (status, expMs, nowMs, expected) => {
      const res = validatePaymentDetails({
        requested: {
          ...BASE_REQUEST,
          status,
          expiresAt: expMs === null ? null : new Date(expMs).toISOString(),
        },
        nowMs,
      });
      expect(res.checks.notExpired).toBe(expected);
    }
  );

  const paidCases: Array<[boolean, 'open' | 'completed' | 'cancelled', string | null, boolean]> = [
    [false, 'open', null, true],
    [true, 'open', 'confirmed', false],
    [true, 'open', 'processing', false],
    [true, 'open', 'pending', false],
    [false, 'completed', null, false],
    [false, 'cancelled', null, false],
  ];

  it.each(paidCases)(
    'checks alreadyPaid=%s status=%s txStatus=%s -> notAlreadyPaid=%s',
    (alreadyPaid, status, existingTxStatus, expected) => {
      const res = validatePaymentDetails({
        requested: { ...BASE_REQUEST, status },
        alreadyPaid,
        existingTxStatus,
      });
      expect(res.checks.notAlreadyPaid).toBe(expected);
      expect(res.valid).toBe(expected);
    }
  );

  it('aggregates multiple simultaneous discrepancies before approval', () => {
    const res = validatePaymentDetails({
      requested: {
        ...BASE_REQUEST,
        recipientAddress: ADDR_B,
        authoritativeDestinationAddress: ADDR_A,
        status: 'expired',
      },
      intended: {
        expectedRecipientAddress: ADDR_A,
        expectedAmount: '99.00',
        expectedToken: 'USDC',
        expectedNetwork: 'Base Sepolia',
      },
      alreadyPaid: true,
      existingTxStatus: 'confirmed',
    });
    expect(res.valid).toBe(false);
    expect(res.discrepancies.length).toBeGreaterThanOrEqual(6);
    const fields = res.discrepancies.map((d) => d.field);
    expect(fields).toContain('destination_changed');
    expect(fields).toContain('recipient');
    expect(fields).toContain('amount');
    expect(fields).toContain('token');
    expect(fields).toContain('network');
    expect(fields).toContain('expiry');
    expect(fields).toContain('already_paid');
  });

  const whitespaceMatrix = ['  USDT  ', '  Testnet  ', `  ${ADDR_A}  `, '  20.00  '];
  it.each(whitespaceMatrix)('trims intended input "%s" cleanly without false mismatch', (val) => {
    const trimmed = val.trim();
    const res = validatePaymentDetails({
      requested: BASE_REQUEST,
      intended: {
        expectedToken: trimmed === 'USDT' ? val : undefined,
        expectedNetwork: trimmed === 'Testnet' ? val : undefined,
        expectedRecipientAddress: trimmed.startsWith('0x') ? val : undefined,
        expectedAmount: trimmed === '20.00' ? val : undefined,
      },
    });
    expect(res.valid).toBe(true);
  });

  it.each([
    ['0.000001', '0.000001', true],
    ['0.000001', '0.000002', false],
    ['100000.5', '100000.500000', true],
    ['100000.5', '100000.500001', false],
    ['10.1', '10.10', true],
  ])('handles boundary decimal precision (%s vs %s) -> %s', (reqAmt, expAmt, ok) => {
    const res = validatePaymentDetails({
      requested: { ...BASE_REQUEST, amount: reqAmt },
      intended: { expectedAmount: expAmt },
    });
    expect(res.valid).toBe(ok);
  });
});
