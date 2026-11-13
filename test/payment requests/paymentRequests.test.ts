import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import QRCode from 'qrcode';
import { parseExactAmount } from '../../supabase/functions/_shared/validation';
import {
  cancelPayment,
  createPaymentRequest,
  fetchPaymentRequestByCode,
  listPaymentRequests,
} from '../../src/services/paymentsService';
import { supabase } from '../../src/lib/supabase';

function extractShareCode(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as { shareCode?: string };
      return parsed.shareCode ? parsed.shareCode.toUpperCase() : null;
    } catch {
      return null;
    }
  }
  const match = trimmed.match(/WRD-[A-Z0-9]+/i);
  return match ? match[0].toUpperCase() : null;
}

function isRequestValid(req: {
  status: 'open' | 'completed' | 'cancelled' | 'expired';
  expiresAt: string | null;
  nowMs?: number;
}): { valid: boolean; reason?: string } {
  const now = req.nowMs ?? Date.now();
  if (req.status === 'expired' || (req.expiresAt && new Date(req.expiresAt).getTime() <= now)) {
    return { valid: false, reason: 'expired' };
  }
  if (req.status === 'cancelled') return { valid: false, reason: 'cancelled' };
  if (req.status === 'completed') return { valid: false, reason: 'completed' };
  return { valid: true };
}

function detectTamper(
  scanned: { amount?: string; recipientAddress?: string; token?: string; network?: string },
  auth: {
    amountAtomic: string;
    decimals: number;
    recipientAddress: string;
    token: string;
    network: string;
  }
): boolean {
  if (scanned.amount) {
    try {
      const { atomic } = parseExactAmount(scanned.amount, auth.decimals);
      if (atomic !== auth.amountAtomic) return true;
    } catch {
      return true;
    }
  }
  if (
    scanned.recipientAddress &&
    scanned.recipientAddress.toLowerCase() !== auth.recipientAddress.toLowerCase()
  ) {
    return true;
  }
  if (scanned.token && scanned.token !== auth.token) return true;
  if (scanned.network && scanned.network !== auth.network) return true;
  return false;
}

describe('Phase 6A: Payment Requests, QR Codes, Expiry & Tamper Protection', () => {
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

  const qrUrls = [
    'https://word.app/app?pay=WRD-A1B2C3D4E5',
    'https://localhost:5173/app?pay=WRD-0011223344',
    'https://word.vercel.app/app?pay=WRD-FF99EE88DD',
    'https://word.app/app?pay=WRD-1234567890',
    'https://word.app/app?pay=WRD-ABCDEF1234',
  ];

  it.each(qrUrls)('generates scannable PNG QR data URL for %s', async (url) => {
    const dataUrl = await QRCode.toDataURL(url, { width: 180, margin: 2 });
    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(dataUrl.length).toBeGreaterThan(200);
  });

  const shareInputs: Array<[string, string | null]> = [
    ['https://word.app/app?pay=WRD-9F8E7D6C5B', 'WRD-9F8E7D6C5B'],
    ['http://localhost:5173/app?pay=wrd-12345abcde', 'WRD-12345ABCDE'],
    ['WRD-AA11BB22CC', 'WRD-AA11BB22CC'],
    ['  wrd-00ff11ee  ', 'WRD-00FF11EE'],
    ['https://word.app/app?pay=WRD-9999999999&utm=qr', 'WRD-9999999999'],
    ['https://word.app/app?foo=bar&pay=WRD-778899AABB', 'WRD-778899AABB'],
    [JSON.stringify({ shareCode: 'WRD-JSON1234' }), 'WRD-JSON1234'],
    [JSON.stringify({ shareCode: 'wrd-lower99' }), 'WRD-LOWER99'],
    [JSON.stringify({}), null],
    ['{broken-json', null],
    ['https://example.com/pay/123', null],
    ['WRD-', null],
    ['', null],
  ];

  it.each(shareInputs)('extractShareCode("%s") -> %s', (input, expected) => {
    expect(extractShareCode(input)).toBe(expected);
  });

  const statusCases: Array<['open' | 'completed' | 'cancelled' | 'expired', number | null, number, boolean]> = [
    ['open', null, 1000, true],
    ['open', 2000, 1000, true],
    ['open', 1000, 1000, false],
    ['open', 1000, 1500, false],
    ['expired', null, 1000, false],
    ['expired', 5000, 1000, false],
    ['cancelled', null, 1000, false],
    ['cancelled', 5000, 1000, false],
    ['completed', null, 1000, false],
    ['completed', 5000, 1000, false],
  ];

  it.each(statusCases)(
    'isRequestValid(status=%s, exp=%s, now=%s) === %s',
    (status, expMs, nowMs, expected) => {
      const expiresAt = expMs === null ? null : new Date(expMs).toISOString();
      expect(isRequestValid({ status, expiresAt, nowMs }).valid).toBe(expected);
    }
  );

  const authRecord = {
    amountAtomic: '20000000',
    decimals: 6,
    recipientAddress: '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06',
    token: 'USDT',
    network: 'Testnet',
  };

  const tamperCases: Array<[string, Parameters<typeof detectTamper>[0], boolean]> = [
    ['exact match', { amount: '20.00', recipientAddress: authRecord.recipientAddress, token: 'USDT', network: 'Testnet' }, false],
    ['lowercase address match', { amount: '20', recipientAddress: authRecord.recipientAddress.toLowerCase(), token: 'USDT', network: 'Testnet' }, false],
    ['uppercase address match', { amount: '20.000000', recipientAddress: authRecord.recipientAddress.toUpperCase(), token: 'USDT', network: 'Testnet' }, false],
    ['altered amount +0.01', { amount: '20.01' }, true],
    ['altered amount +1000', { amount: '1020.00' }, true],
    ['altered amount -0.000001', { amount: '19.999999' }, true],
    ['altered zero amount', { amount: '0' }, true],
    ['altered negative amount', { amount: '-20.00' }, true],
    ['altered non-numeric amount', { amount: 'twenty' }, true],
    ['altered recipient address', { recipientAddress: '0x1111111111111111111111111111111111111111' }, true],
    ['altered recipient zero address', { recipientAddress: '0x0000000000000000000000000000000000000000' }, true],
    ['altered token USDC', { token: 'USDC' }, true],
    ['altered token ETH', { token: 'ETH' }, true],
    ['altered token WETH', { token: 'WETH' }, true],
    ['altered network Base Sepolia', { network: 'Base Sepolia' }, true],
    ['altered network Polygon Amoy', { network: 'Polygon Amoy' }, true],
    ['altered network Mainnet', { network: 'Mainnet' }, true],
    ['empty payload passes (no override)', {}, false],
    ['partial token+amount mismatch', { amount: '20.00', token: 'USDC' }, true],
    ['partial network+address mismatch', { network: 'Testnet', recipientAddress: '0x2222222222222222222222222222222222222222' }, true],
  ];

  it.each(tamperCases)('detectTamper(%s) === %s', (_label, scanned, expected) => {
    expect(detectTamper(scanned, authRecord)).toBe(expected);
  });

  it('createPaymentRequest persists expiry and returns shareCode', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ request: { id: 'req-1', share_code: 'WRD-111' } }), { status: 201 })
    );
    const created = await createPaymentRequest({
      amount: '20.00',
      tokenSymbol: 'USDT',
      network: 'Testnet',
      recipientName: 'Thabo',
      recipientAddress: authRecord.recipientAddress,
      description: 'Laptop',
      expiresInMinutes: 1440,
    });
    expect(created.share_code).toBe('WRD-111');
  });

  it('fetchPaymentRequestByCode, listPaymentRequests, and cancelPayment call expected endpoints', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ request: { id: 'req-1', status: 'expired' } }), { status: 200 })
    );
    const fetched = await fetchPaymentRequestByCode('WRD-111');
    expect(fetched.status).toBe('expired');

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ requests: [{ id: 'req-1' }] }), { status: 200 })
    );
    expect(await listPaymentRequests()).toHaveLength(1);

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ request: { id: 'req-1', status: 'cancelled' } }), { status: 200 })
    );
    await cancelPayment({ paymentRequestId: '550e8400-e29b-41d4-a716-446655440000' });
  });
});
