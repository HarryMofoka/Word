import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

const DEFAULT_SUPABASE_URL = 'https://jbfefrxzawzbeixjbtmo.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_KarTRQF097bPNrxYPXWayQ_5yNY9XgP';

const envUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const envKey =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim() ||
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

const supabaseUrl = envUrl || DEFAULT_SUPABASE_URL;
const supabasePublishableKey = envKey || DEFAULT_SUPABASE_PUBLISHABLE_KEY;

export const supabase = createClient<Database>(
  supabaseUrl,
  supabasePublishableKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

export const SUPABASE_FUNCTIONS_BASE = `${supabaseUrl}/functions/v1`;
