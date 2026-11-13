import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

if (!supabaseUrl || !supabasePublishableKey) {
  console.warn(
    'Word: VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY is not configured.'
  );
}

export const supabase = createClient<Database>(
  supabaseUrl ?? 'https://jbfefrxzawzbeixjbtmo.supabase.co',
  supabasePublishableKey ?? '',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

export const SUPABASE_FUNCTIONS_BASE = `${
  supabaseUrl ?? 'https://jbfefrxzawzbeixjbtmo.supabase.co'
}/functions/v1`;

