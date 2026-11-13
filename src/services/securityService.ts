const CONTROL_CHARS_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/**
 * Strips non-printable control characters and neutralizes angle brackets for plain-text rendering/exports.
 */
export function sanitizeUserText(input: string, maxLength = 2000): string {
  return input
    .replace(CONTROL_CHARS_RE, '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, maxLength);
}

/**
 * Allows only https URLs or localhost http URLs (blocks javascript:, data:, vbscript:).
 */
export function isSafeExternalUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol === 'https:') return true;
    if (
      parsed.protocol === 'http:' &&
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Redacts bearer tokens, JWTs, or API keys before logging or diagnostics.
 */
export function redactSensitiveToken(token: string | null | undefined): string {
  if (!token || token.trim().length === 0) return '[none]';
  const clean = token.trim();
  if (clean.length <= 10) return '[redacted]';
  return `${clean.slice(0, 4)}...${clean.slice(-4)}`;
}

const FORBIDDEN_CLIENT_ENV_PATTERNS = [
  'SERVICE_ROLE',
  'PRIVATE_KEY',
  'SECRET_KEY',
  'MNEMONIC',
  'SEED_PHRASE',
  'DATABASE_URL',
];

/**
 * Verifies that no server-only secret keys are exposed in VITE_* frontend environment variables.
 */
export function validateClientEnvSecurity(
  env: Record<string, string | undefined>
): { ok: boolean; violations: string[] } {
  const violations: string[] = [];
  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith('VITE_')) continue;
    const upperKey = key.toUpperCase();
    if (FORBIDDEN_CLIENT_ENV_PATTERNS.some((pat) => upperKey.includes(pat))) {
      violations.push(`Forbidden client env key: ${key}`);
    }
    if (typeof value === 'string' && /service_role/i.test(value)) {
      violations.push(`Potential service_role token in client env key: ${key}`);
    }
  }
  return { ok: violations.length === 0, violations };
}

