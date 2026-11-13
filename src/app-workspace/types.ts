export type OnboardingStep =
  | 'welcome'
  | 'wallet-setup'
  | 'wallet-import'
  | 'recovery-info'
  | 'wallet-confirm'
  | 'workspace';

export type WorkspaceTab =
  | 'dashboard'
  | 'payments'
  | 'records'
  | 'wallet'
  | 'notifications'
  | 'profile'
  | 'settings';

export interface EvidenceItem {
  id: string;
  label: string;
  note: string;
  addedAt: string;
}

export interface DisputeCase {
  id: string;
  recordId: string;
  reason: string;
  summary: string;
  status: 'Open' | 'Evidence Submitted' | 'Under Review';
  createdAt: string;
  evidence: EvidenceItem[];
}

export type PaymentFlowMode = 'hub' | 'create-request' | 'scan-pay';

export interface PaymentRequestData {
  id: string;
  amount: string;
  token: string;
  network: string;
  recipientName: string;
  recipientAddress: string;
  description: string;
  terms?: string;
  shareUrl: string;
}

export type QuickActionMode = 'send' | 'request' | 'verify' | null;

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
  status: 'Confirmed' | 'Pending' | 'Failed';
  verifiedControl: boolean;
  timestamp: string;
}

export interface AppNotification {
  id: string;
  title: string;
  detail: string;
  time: string;
  category: 'Payment' | 'Verification' | 'Security';
  read: boolean;
}
