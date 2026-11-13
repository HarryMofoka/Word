import { createClient, type SupabaseClient, type User } from 'jsr:@supabase/supabase-js@2';
import { AppError } from './errors.ts';

export interface AuthContext {
  user: User;
  userClient: SupabaseClient;
  adminClient: SupabaseClient;
}

export function getAdminClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) {
    throw new AppError(500, 'CONFIG_ERROR', 'Missing Supabase server configuration.');
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function requireAuth(req: Request): Promise<AuthContext> {
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) {
    throw new AppError(500, 'CONFIG_ERROR', 'Missing Supabase environment variables.');
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError(401, 'UNAUTHORIZED', 'Missing or invalid Authorization header.');
  }

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) {
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid or expired session token.');
  }

  const adminClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return { user: data.user, userClient, adminClient };
}

