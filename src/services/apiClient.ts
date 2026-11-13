import { SUPABASE_FUNCTIONS_BASE, supabase } from '../lib/supabase';

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

  const res = await fetch(url.toString(), {
    method: options.method ?? 'GET',
    credentials: 'omit',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

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
}

