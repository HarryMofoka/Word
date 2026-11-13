import { SUPABASE_FUNCTIONS_BASE, supabase } from '../lib/supabase';
import { isTransientNetworkOrServerError, retryWithBackoff } from './reliabilityService';

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export async function callEdgeFunction<T>(
  fnName: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    body?: Record<string, unknown>;
    query?: Record<string, string>;
    idempotencyKey?: string;
    timeoutMs?: number;
  } = {}
): Promise<T> {
  if (!/^[a-z0-9-]+$/.test(fnName)) {
    throw new ApiError('INVALID_ENDPOINT', 'Invalid API endpoint name.', 400);
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new ApiError('UNAUTHORIZED', 'Please sign in to continue.', 401);
  }

  const url = new URL(`${SUPABASE_FUNCTIONS_BASE}/${fnName}`);
  if (options.query) {
    for (const [k, v] of Object.entries(options.query)) {
      if (v) url.searchParams.set(k, v);
    }
  }

  const method = options.method ?? 'GET';
  const isSafeToRetry = method === 'GET' || Boolean(options.idempotencyKey);
  const timeoutMs = options.timeoutMs ?? 15000;

  const executeOnce = async (): Promise<T> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
      };
      if (options.idempotencyKey) {
        headers['x-idempotency-key'] = options.idempotencyKey;
      }

      res = await fetch(url.toString(), {
        method,
        credentials: 'omit',
        signal: controller.signal,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
      if (!res) {
        throw new TypeError('No HTTP response received.');
      }
    } catch (err) {
      const isAbort = (err as { name?: string })?.name === 'AbortError';
      throw new ApiError(
        'NETWORK_INTERRUPTED',
        isAbort
          ? 'The request timed out. Please check your connection and try again.'
          : 'Network connection was interrupted. Please try again.',
        503
      );
    } finally {
      clearTimeout(timer);
    }

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errObj = (json as { error?: { code?: string; message?: string } }).error;
      throw new ApiError(
        errObj?.code ?? 'REQUEST_FAILED',
        errObj?.message ?? `Request failed (${res.status})`,
        res.status
      );
    }

    return json as T;
  };

  if (!isSafeToRetry) {
    return executeOnce();
  }

  return retryWithBackoff(executeOnce, {
    maxAttempts: 3,
    baseDelayMs: 150,
    shouldRetry: (err) => isTransientNetworkOrServerError(err),
  });
}
