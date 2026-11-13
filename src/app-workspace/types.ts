export type OnboardingStep =
  | 'welcome'
  | 'wallet-setup'
  | 'wallet-import'
  | 'recovery-info'
  | 'wallet-confirm'
  | 'workspace';

export type WalletMethod = 'created' | 'connected' | 'imported';

export interface UserSession {
  displayName: string;
  email: string;
  isNewUser: boolean;
}

export interface WalletState {
  address: string;
  method: WalletMethod;
  network: 'Testnet';
  recoveryBackedUp: boolean;
  demoSeedWords?: string[];
}

export interface PaymentRecord {
  id: string;
  recipient: string;
  address: string;
  amount: string;
  purpose: string;
  network: string;
  status: 'Confirmed' | 'Pending';
  verifiedControl: boolean;
  timestamp: string;
}

