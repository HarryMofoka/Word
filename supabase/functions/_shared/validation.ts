import { AppError } from './errors.ts';

export const ALLOWED_TOKENS = new Set(['USDT', 'USDC', 'ETH', 'WETH']);
export const ALLOWED_NETWORKS = new Set(['Testnet', 'Base Sepolia', 'Polygon Amoy']);

export const TOKEN_DECIMALS: Record<string, number> = {
  USDT: 6,
  USDC: 6,
  ETH: 18,
  WETH: 18,
};

export async function parseJsonBody<T extends Record<string, unknown>>(req: Request): Promise<T> {
  try {
    const body = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new AppError(400, 'INVALID_BODY', 'Request body must be a JSON object.');
    }
    return body as T;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(400, 'INVALID_JSON', 'Malformed JSON request body.');
  }
}

export function requireString(
  val: unknown,
  field: string,
  minLen = 1,
  maxLen = 500
): string {
  if (typeof val !== 'string') {
    throw new AppError(400, 'VALIDATION_ERROR', `${field} must be a string.`);
  }
  const trimmed = val.trim();
  if (trimmed.length < minLen || trimmed.length > maxLen) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `${field} must be between ${minLen} and ${maxLen} characters.`
    );
  }
  return trimmed;
}

export function optionalString(val: unknown, field: string, maxLen = 2000): string | null {
  if (val === undefined || val === null || val === '') return null;
  return requireString(val, field, 1, maxLen);
}

export function requireUuid(val: unknown, field: string): string {
  const s = requireString(val, field, 36, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) {
    throw new AppError(400, 'VALIDATION_ERROR', `${field} must be a valid UUID.`);
  }
  return s;
}

export function requireAddress(val: unknown, field = 'address'): string {
  const s = requireString(val, field, 10, 128);
  if (!/^0x[a-fA-F0-9]{8,64}$/.test(s) && !/^[a-zA-Z0-9._-]{10,128}$/.test(s)) {
    throw new AppError(400, 'INVALID_ADDRESS', `${field} is not a valid wallet address.`);
  }
  return s;
}

export function requireToken(val: unknown): string {
  const token = requireString(val, 'tokenSymbol', 2, 10).toUpperCase();
  if (!ALLOWED_TOKENS.has(token)) {
    throw new AppError(400, 'INVALID_TOKEN', `Unsupported token: ${token}`);
  }
  return token;
}

export function requireNetwork(val: unknown): string {
  const net = typeof val === 'string' && val.trim() ? val.trim() : 'Testnet';
  if (!ALLOWED_NETWORKS.has(net)) {
    throw new AppError(400, 'INVALID_NETWORK', `Unsupported network: ${net}`);
  }
  return net;
}

/**
 * Parses an exact decimal string (e.g. "20.50") into normalized decimal + atomic integer string
 * without ever using floating-point arithmetic.
 */
export function parseExactAmount(
  rawAmount: unknown,
  decimals: number
): { normalizedDecimal: string; atomic: string } {
  const raw =
    typeof rawAmount === 'number'
      ? String(rawAmount)
      : requireString(rawAmount, 'amount', 1, 40);

  if (!/^\d+(\.\d+)?$/.test(raw)) {
    throw new AppError(400, 'INVALID_AMOUNT', 'Amount must be a positive decimal string.');
  }

  const [wholePart, fracPart = ''] = raw.split('.');
  if (fracPart.length > decimals) {
    throw new AppError(
      400,
      'INVALID_AMOUNT',
      `Amount exceeds ${decimals} decimal places for this token.`
    );
  }

  const paddedFrac = fracPart.padEnd(decimals, '0');
  const atomicBigInt = BigInt(wholePart + paddedFrac);
  if (atomicBigInt <= 0n) {
    throw new AppError(400, 'INVALID_AMOUNT', 'Amount must be greater than zero.');
  }

  const normalizedDecimal = fracPart.length > 0 ? `${BigInt(wholePart)}.${fracPart}` : `${BigInt(wholePart)}`;
  return {
    normalizedDecimal,
    atomic: atomicBigInt.toString(),
  };
}

