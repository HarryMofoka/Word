import { buildCorsHeaders, securityHeaders } from './cors.ts';

export class AppError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function jsonResponse(data: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...buildCorsHeaders(req),
      ...securityHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

export function errorResponse(err: unknown, req?: Request): Response {
  if (err instanceof AppError) {
    return jsonResponse(
      { error: { code: err.code, message: err.message } },
      err.status,
      req
    );
  }
  console.error('Unhandled Edge Function error:', err);
  return jsonResponse(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected server error occurred.',
      },
    },
    500,
    req
  );
}
