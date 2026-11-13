import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import vercelConfigRaw from '../../vercel.json?raw';
import gitignoreRaw from '../../.gitignore?raw';
import { callEdgeFunction } from '../../src/services/apiClient';
import {
  isSafeExternalUrl,
  redactSensitiveToken,
  sanitizeUserText,
  validateClientEnvSecurity,
} from '../../src/services/securityService';
import { supabase } from '../../src/lib/supabase';
import {
  buildCorsHeaders,
  getAllowedOrigins,
  handleCors,
  resolveAllowedOrigin,
  securityHeaders,
} from '../../supabase/functions/_shared/cors';
import { AppError, errorResponse, jsonResponse } from '../../supabase/functions/_shared/errors';
import { enforceRateLimit } from '../../supabase/functions/_shared/rateLimit';
import {
  assertNoDangerousHtml,
  assertSafeStoragePath,
  parseExactAmount,
  requireAddress,
  requireSafeUrl,
  requireString,
  requireUuid,
} from '../../supabase/functions/_shared/validation';

const EDGE_FUNCTION_SOURCES = import.meta.glob('/supabase/functions/*/index.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const FRONTEND_SRC_FILES = import.meta.glob('/src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

describe('Phase 10: Application Security, Privacy & Reliability', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
      data: { session: { access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig' } as never },
      error: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('enforces authenticated sessions and omits ambient cookies on Edge Function calls', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await callEdgeFunction('profile', { method: 'GET' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.credentials).toBe('omit');
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Bearer /);

    vi.spyOn(supabase.auth, 'getSession').mockResolvedValueOnce({
      data: { session: null },
      error: null,
    });
    await expect(callEdgeFunction('profile')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      status: 401,
    });
  });

  it('rejects path traversal or invalid endpoint slugs in apiClient', async () => {
    await expect(callEdgeFunction('../admin/secrets')).rejects.toMatchObject({
      code: 'INVALID_ENDPOINT',
      status: 400,
    });
    await expect(callEdgeFunction('profile?evil=1')).rejects.toMatchObject({
      code: 'INVALID_ENDPOINT',
      status: 400,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('redacts sensitive tokens safely for diagnostics', () => {
    const redacted = redactSensitiveToken('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secret');
    expect(redacted).toBe('eyJh...cret');
    expect(redacted).not.toContain('secret');
    expect(redactSensitiveToken('short')).toBe('[redacted]');
    expect(redactSensitiveToken('')).toBe('[none]');
  });

  it('enforces strict CORS allowlist and rejects untrusted origins', () => {
    const allowed = getAllowedOrigins('https://word.example.com');
    expect(resolveAllowedOrigin('https://word.example.com/', allowed)).toBe('https://word.example.com');
    expect(resolveAllowedOrigin('http://localhost:5173', allowed)).toBe('http://localhost:5173');
    expect(resolveAllowedOrigin('https://evil-phish.example', allowed)).toBeNull();

    const evilReq = new Request('https://api.example.com/profile', {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil-phish.example' },
    });
    const blockedResp = handleCors(evilReq);
    expect(blockedResp?.status).toBe(403);
    expect(blockedResp?.headers.get('Access-Control-Allow-Origin')).toBeNull();

    const goodReq = new Request('https://api.example.com/profile', {
      method: 'GET',
      headers: { Origin: 'http://localhost:5173' },
    });
    const headers = buildCorsHeaders(goodReq, allowed);
    expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost:5173');
    expect(headers['Access-Control-Allow-Origin']).not.toBe('*');
    expect(headers['Vary']).toBe('Origin');
  });

  it('attaches API security headers and hides internal error details on 500 responses', async () => {
    const req = new Request('https://api.example.com/profile', {
      headers: { Origin: 'http://localhost:5173' },
    });
    const okRes = jsonResponse({ ok: true }, 200, req);
    for (const [k, v] of Object.entries(securityHeaders)) {
      expect(okRes.headers.get(k)).toBe(v);
    }

    const errRes = errorResponse(new Error('DB connection string leaked: postgres://secret'), req);
    expect(errRes.status).toBe(500);
    const body = await errRes.json();
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(body)).not.toContain('postgres://secret');

    const appErrRes = errorResponse(new AppError(403, 'FORBIDDEN', 'Access denied.'), req);
    expect(appErrRes.status).toBe(403);
  });

  it('prevents IDOR and path traversal on evidence storage paths', () => {
    const disputeId = '550e8400-e29b-41d4-a716-446655440000';
    expect(assertSafeStoragePath(`${disputeId}/receipt.png`, `${disputeId}/`)).toBe(
      `${disputeId}/receipt.png`
    );

    expect(() =>
      assertSafeStoragePath('other-dispute-id/receipt.png', `${disputeId}/`)
    ).toThrow();
    expect(() =>
      assertSafeStoragePath(`${disputeId}/../other-dispute/secret.png`, `${disputeId}/`)
    ).toThrow();
    expect(() =>
      assertSafeStoragePath(`${disputeId}\\..\\secret.png`, `${disputeId}/`)
    ).toThrow();
    expect(() => assertSafeStoragePath(`/${disputeId}/receipt.png`, `${disputeId}/`)).toThrow();
  });

  it('protects against XSS, control-char injection, and dangerous URL schemes', () => {
    expect(() => requireString('hello\u0000world', 'note', 1, 100)).toThrow();
    expect(() => assertNoDangerousHtml('<script>alert(1)</script>', 'note')).toThrow();
    expect(() => assertNoDangerousHtml('<img src=x onerror=alert(1)>', 'note')).toThrow();
    expect(() => assertNoDangerousHtml('javascript:alert(1)', 'note')).toThrow();
    expect(assertNoDangerousHtml('Paid 20 USDT for laptop deposit', 'note')).toBe(
      'Paid 20 USDT for laptop deposit'
    );

    expect(() => requireSafeUrl('javascript:alert(1)', 'link')).toThrow();
    expect(() => requireSafeUrl('data:text/html,<script>alert(1)</script>', 'link')).toThrow();
    expect(requireSafeUrl('https://word.example.com/receipt/1', 'link')).toBe(
      'https://word.example.com/receipt/1'
    );

    expect(sanitizeUserText('<b>Laptop</b>\u0000')).toBe('bLaptop/b');
    expect(isSafeExternalUrl('https://sepolia.etherscan.io/tx/0xabc')).toBe(true);
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeExternalUrl('vbscript:msgbox(1)')).toBe(false);
  });

  it('blocks SQL/filter injection patterns in UUID, address, and numeric amount validators', () => {
    expect(() => requireUuid("' OR 1=1 --", 'id')).toThrow();
    expect(() => requireUuid('550e8400-e29b-41d4-a716-446655440000,id.neq.null', 'id')).toThrow();
    expect(() => requireAddress("0x1234' OR '1'='1", 'recipient')).toThrow();
    expect(() => parseExactAmount('10; DROP TABLE transactions;--', 6)).toThrow();
    expect(() => parseExactAmount('-50', 6)).toThrow();
  });

  it('enforces per-user rate limiting and returns 429 RATE_LIMITED when exceeded', async () => {
    const state = {
      bucket: null as null | { window_start: string; request_count: number },
    };

    const mockAdminClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: state.bucket }),
          }),
        }),
        insert: async (row: { window_start: string; request_count: number }) => {
          state.bucket = { window_start: row.window_start, request_count: row.request_count };
          return { error: null };
        },
        update: (patch: Partial<{ window_start: string; request_count: number }>) => ({
          eq: async () => {
            if (state.bucket) {
              state.bucket = { ...state.bucket, ...patch };
            }
            return { error: null };
          },
        }),
      }),
    };

    await enforceRateLimit(mockAdminClient as never, 'user-1', 'payment_prepare', 2, 60);
    await enforceRateLimit(mockAdminClient as never, 'user-1', 'payment_prepare', 2, 60);
    await expect(
      enforceRateLimit(mockAdminClient as never, 'user-1', 'payment_prepare', 2, 60)
    ).rejects.toMatchObject({
      status: 429,
      code: 'RATE_LIMITED',
    });
  });

  it('every Edge Function enforces auth, rate limiting, and CORS handling', () => {
    const entries = Object.entries(EDGE_FUNCTION_SOURCES).filter(
      ([filePath]) => !filePath.includes('/_shared/')
    );

    expect(entries.length).toBeGreaterThanOrEqual(13);
    for (const [filePath, code] of entries) {
      expect(code, `${filePath} must call requireAuth`).toMatch(/requireAuth\s*\(/);
      expect(code, `${filePath} must call enforceRateLimit`).toMatch(/enforceRateLimit\s*\(/);
      expect(code, `${filePath} must call handleCors`).toMatch(/handleCors\s*\(/);
      expect(code, `${filePath} must pass req to errorResponse`).toMatch(/errorResponse\s*\(\s*err\s*,\s*req\s*\)/);
    }
  });

  it('never exposes secret keys or dangerous DOM sinks in frontend src/', () => {
    const entries = Object.entries(FRONTEND_SRC_FILES);
    expect(entries.length).toBeGreaterThan(10);

    for (const [file, content] of entries) {
      expect(content, `${file} must not reference SUPABASE_SERVICE_ROLE_KEY`).not.toContain(
        'SUPABASE_SERVICE_ROLE_KEY'
      );
      expect(content, `${file} must not use dangerouslySetInnerHTML`).not.toContain(
        'dangerouslySetInnerHTML'
      );
      expect(content, `${file} must not use eval(`).not.toMatch(/\beval\s*\(/);
      expect(content, `${file} must not use innerHTML`).not.toContain('.innerHTML');
    }

    const envCheck = validateClientEnvSecurity({
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_123',
    });
    expect(envCheck.ok).toBe(true);

    const badEnvCheck = validateClientEnvSecurity({
      VITE_SUPABASE_SERVICE_ROLE_KEY: 'eyJservice_role_leak',
    });
    expect(badEnvCheck.ok).toBe(false);
    expect(badEnvCheck.violations.length).toBeGreaterThan(0);
  });

  it('configures web security headers in vercel.json and ignores .env files in .gitignore', () => {
    const vercelConfig = JSON.parse(vercelConfigRaw) as {
      headers?: Array<{ headers: Array<{ key: string; value: string }> }>;
    };

    const headerMap = new Map(
      (vercelConfig.headers?.[0]?.headers ?? []).map((h) => [h.key, h.value])
    );

    expect(headerMap.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headerMap.get('X-Frame-Options')).toBe('DENY');
    expect(headerMap.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(headerMap.get('Strict-Transport-Security')).toContain('max-age=31536000');
    expect(headerMap.get('Content-Security-Policy')).toContain("object-src 'none'");
    expect(headerMap.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");

    expect(gitignoreRaw).toContain('.env');
    expect(gitignoreRaw).toContain('.env.local');
  });
});
