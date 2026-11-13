import { supabase } from '../lib/supabase';
import { callEdgeFunction } from './apiClient';
import type { Database } from '../types/database';

export type ProfileRow = Database['public']['Tables']['profiles']['Row'];

export async function signUpWithEmail(params: {
  email: string;
  password: string;
  displayName: string;
}) {
  const { data, error } = await supabase.auth.signUp({
    email: params.email,
    password: params.password,
    options: {
      data: {
        display_name: params.displayName,
      },
    },
  });
  if (error) throw error;
  return data;
}

export async function signInWithEmail(params: { email: string; password: string }) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: params.email,
    password: params.password,
  });
  if (error) throw error;
  return data;
}

export async function signOutSession() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function fetchMyProfile(): Promise<ProfileRow> {
  const res = await callEdgeFunction<{ profile: ProfileRow }>('profile', {
    method: 'GET',
  });
  return res.profile;
}

export async function updateMyProfile(updates: {
  displayName?: string;
  defaultNetwork?: string;
  onboardingCompleted?: boolean;
  preferences?: Record<string, unknown>;
}): Promise<ProfileRow> {
  const res = await callEdgeFunction<{ profile: ProfileRow }>('profile', {
    method: 'PATCH',
    body: updates,
  });
  return res.profile;
}

