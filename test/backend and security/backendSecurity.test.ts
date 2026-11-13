import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, callEdgeFunction } from '../../src/services/apiClient';
import {
  optionalString,
  requireAddress,
  requireNetwork,
  requireString,
  requireToken,
  requireUuid,
} from '../../supabase/functions/_shared/validation';
import { supabase } from '../../src/lib/supabase';

describe('Phase 4: Backend Validation, Auth & Security Contracts', () => {
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

  const validUuids = [
    '550e8400-e29b-41d4-a716-446655440000',
    '123e4567-e89b-12d3-a456-426614174000',
    '00000000-0000-0000-0000-000000000000',
    'ffffffff-ffff-ffff-ffff-ffffffffffff',
  ];

  it.each(validUuids)('requireUuid accepts valid UUID %s', (id) => {
    expect(requireUuid(id, 'id')).toBe(id);
  });

  const invalidUuids = [
    '',
    'not-a-uuid',
    '550e8400-e29b-41d4-a716-44665544000',
    '550e8400-e29b-41d4-a716-4466554400000',
    '550e8400-e29b-41d4-a716-44665544000g',
    12345,
    null,
    undefined,
  ];

  it.each(invalidUuids)('requireUuid rejects invalid input %s', (bad) => {
    expect(() => requireUuid(bad, 'id')).toThrow();
  });

  const validTokens = ['USDT', 'usdt', 'USDC', 'usdc', 'ETH', 'eth', 'WETH', 'weth'];
  it.each(validTokens)('requireToken normalizes %s', (tok) => {
    expect(requireToken(tok)).toBe(tok.toUpperCase());
  });

  const invalidTokens = ['BTC', 'SOL', 'DOGE', 'DAI', 'MATIC', '', '   ', 123, null];
  it.each(invalidTokens)('requireToken rejects %s', (bad) => {
    expect(() => requireToken(bad)).toThrow();
  });

  const validNetworks = ['Testnet', 'Base Sepolia', 'Polygon Amoy'];
  it.each(validNetworks)('requireNetwork accepts %s', (net) => {
    expect(requireNetwork(net)).toBe(net);
  });

  const invalidNetworks = ['Mainnet', 'Ethereum', 'Sepolia', 'Optimism', 'Solana', 'BSC'];
  it.each(invalidNetworks)('requireNetwork rejects %s', (bad) => {
    expect(() => requireNetwork(bad)).toThrow();
  });

  it('requireNetwork defaults empty or undefined to Testnet', () => {
    expect(requireNetwork(undefined)).toBe('Testnet');
    expect(requireNetwork('')).toBe('Testnet');
    expect(requireNetwork('   ')).toBe('Testnet');
  });

  const badStrings = ['', '   ', null, undefined, 42, {}, []];
  it.each(badStrings)('requireString rejects non-string or blank value %s', (bad) => {
    expect(() => requireString(bad, 'field', 1, 100)).toThrow();
  });

  it('requireString enforces maxLen boundary', () => {
    expect(requireString('abc', 'field', 1, 3)).toBe('abc');
    expect(() => requireString('abcd', 'field', 1, 3)).toThrow();
  });

  it('optionalString handles nullish/empty cleanly and trims valid strings', () => {
    expect(optionalString(undefined, 'notes')).toBeNull();
    expect(optionalString(null, 'notes')).toBeNull();
    expect(optionalString('', 'notes')).toBeNull();
    expect(optionalString('  ok  ', 'notes')).toBe('ok');
  });

  const badAddresses = ['0x', '0x123', 'bad!addr', '   ', '<script>alert(1)</script>', null];
  it.each(badAddresses)('requireAddress rejects %s', (bad) => {
    expect(() => requireAddress(bad)).toThrow();
  });

  it('callEdgeFunction blocks unauthenticated requests with 401 UNAUTHORIZED', async () => {
    vi.spyOn(supabase.auth, 'getSession').mockResolvedValueOnce({
      data: { session: null },
      error: null,
    });
    await expect(callEdgeFunction('profile')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      status: 401,
    });
  });

  it('callEdgeFunction sends Bearer token and parses structured ApiError', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 'RATE_LIMITED', message: 'Slow down' } }), {
        status: 429,
      })
    );
    await expect(callEdgeFunction('payment-prepare', { method: 'POST', body: {} })).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      status: 429,
    });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer jwt-token');
  });

  it('callEdgeFunction handles non-JSON 500 error responses gracefully', async () => {
    fetchMock.mockResolvedValueOnce(new Response('Internal Gateway Error', { status: 502 }));
    await expect(callEdgeFunction('profile')).rejects.toBeInstanceOf(ApiError);
  });
});

