import { supabase } from '../lib/supabase';
import { callEdgeFunction } from './apiClient';
import type { Database } from '../types/database';

export type WalletRow = Database['public']['Tables']['wallets']['Row'];
export type WalletChallengeRow = Database['public']['Tables']['wallet_challenges']['Row'];

export async function fetchMyPrimaryWallet(userId: string): Promise<WalletRow | null> {
  const { data, error } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', userId)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function registerWalletAndChallenge(params: {
  address: string;
  network?: string;
  method: 'created' | 'connected' | 'imported';
  label?: string;
  recoveryBackedUp?: boolean;
}): Promise<{ wallet: WalletRow; challenge: WalletChallengeRow }> {
  return callEdgeFunction<{ wallet: WalletRow; challenge: WalletChallengeRow }>(
    'wallet-challenge',
    {
      method: 'POST',
      body: {
        action: 'register_and_challenge',
        ...params,
      },
    }
  );
}

export async function verifyWalletChallenge(params: {
  challengeId: string;
  signature: string;
}): Promise<{ verified: boolean; wallet: WalletRow | null; verifiedAt: string }> {
  return callEdgeFunction('wallet-challenge', {
    method: 'POST',
    body: {
      action: 'verify_challenge',
      ...params,
    },
  });
}

export async function updateWalletBackupFlag(walletId: string, backedUp: boolean) {
  const { data, error } = await supabase
    .from('wallets')
    .update({ recovery_backed_up: backedUp })
    .eq('id', walletId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

