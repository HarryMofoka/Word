import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { AppError } from './errors.ts';

export async function enforceRateLimit(
  adminClient: SupabaseClient,
  userId: string,
  action: string,
  maxRequests = 30,
  windowSeconds = 60
): Promise<void> {
  const bucketKey = `${action}:${userId}`;
  const now = Date.now();
  const windowMs = windowSeconds * 1000;

  const { data: existing } = await adminClient
    .from('rate_limit_buckets')
    .select('window_start, request_count')
    .eq('bucket_key', bucketKey)
    .maybeSingle();

  if (!existing) {
    await adminClient.from('rate_limit_buckets').insert({
      bucket_key: bucketKey,
      window_start: new Date(now).toISOString(),
      request_count: 1,
    });
    return;
  }

  const windowStartMs = new Date(existing.window_start).getTime();
  if (now - windowStartMs >= windowMs) {
    await adminClient
      .from('rate_limit_buckets')
      .update({
        window_start: new Date(now).toISOString(),
        request_count: 1,
      })
      .eq('bucket_key', bucketKey);
    return;
  }

  if (existing.request_count >= maxRequests) {
    throw new AppError(
      429,
      'RATE_LIMITED',
      `Too many requests for ${action}. Please wait a moment and try again.`
    );
  }

  await adminClient
    .from('rate_limit_buckets')
    .update({ request_count: existing.request_count + 1 })
    .eq('bucket_key', bucketKey);
}

