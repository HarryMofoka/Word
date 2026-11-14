const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
];

function getEnv(name: string): string | undefined {
  try {
    return typeof Deno !== 'undefined' ? Deno.env.get(name) : undefined;
  } catch {
    return undefined;
  }
}

export function getAllowedOrigins(envOverride?: string): string[] {
  const configured = envOverride ?? getEnv('ALLOWED_ORIGINS') ?? '';
  const siteUrl = getEnv('SITE_URL') ?? '';
  const parsed = `${configured},${siteUrl}`
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  return Array.from(new Set([...DEFAULT_ALLOWED_ORIGINS, ...parsed]));
}

export function resolveAllowedOrigin(
  origin: string | null | undefined,
  allowedOrigins?: string[]
): string | null {
  if (!origin) return null;
  const normalized = origin.trim().replace(/\/+$/, '');
  const allowlist = allowedOrigins ?? getAllowedOrigins();
  if (allowlist.includes(normalized)) {
    return normalized;
  }
  if (!allowedOrigins && /^https:\/\/[a-zA-Z0-9-]+\.vercel\.app$/i.test(normalized)) {
    return normalized;
  }
  return null;
}

export const securityHeaders: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cache-Control': 'no-store',
  Pragma: 'no-cache',
};

export function buildCorsHeaders(
  req?: Request,
  allowedOrigins?: string[]
): Record<string, string> {
  const origin = req?.headers.get('Origin') ?? req?.headers.get('origin') ?? null;
  const matchedOrigin = resolveAllowedOrigin(origin, allowedOrigins);

  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
    ...securityHeaders,
  };

  if (matchedOrigin) {
    headers['Access-Control-Allow-Origin'] = matchedOrigin;
  }

  return headers;
}

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': DEFAULT_ALLOWED_ORIGINS[0],
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  Vary: 'Origin',
  ...securityHeaders,
};

export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    const origin = req.headers.get('Origin') ?? req.headers.get('origin');
    if (origin && !resolveAllowedOrigin(origin)) {
      return new Response(JSON.stringify({ error: { code: 'CORS_FORBIDDEN', message: 'Origin not allowed.' } }), {
        status: 403,
        headers: {
          'Content-Type': 'application/json',
          ...securityHeaders,
          Vary: 'Origin',
        },
      });
    }
    return new Response('ok', {
      status: 200,
      headers: buildCorsHeaders(req),
    });
  }
  return null;
}
