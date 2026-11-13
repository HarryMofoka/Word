import { QVAC_DATA_BOUNDARY_SPEC } from './qvacAssistantService';

export interface DataCollectionCategory {
  category: string;
  fields: string[];
  purpose: string;
  retentionPeriod: string;
}

export const PRIVACY_DATA_COLLECTION_SPEC: readonly DataCollectionCategory[] = [
  {
    category: 'Account & Profile',
    fields: ['user_id (UUID)', 'email (authentication only)', 'display_name', 'default_network'],
    purpose: 'Authenticate sessions and display counterparty names on payment requests and agreements.',
    retentionPeriod: 'Active account lifetime + 30 days after account deletion request.',
  },
  {
    category: 'Public Wallet Metadata',
    fields: ['public wallet address', 'network', 'wallet label', 'verification status'],
    purpose: 'Verify wallet control via signed challenges and detect recipient mismatches.',
    retentionPeriod: 'Active account lifetime; verification challenge nonces expire after 10 minutes.',
  },
  {
    category: 'Payment Requests, Agreements & Transactions',
    fields: ['amount', 'token_symbol', 'network', 'payment_purpose', 'tx_hash', 'agreement_terms', 'risk_assessment'],
    purpose: 'Provide shared payment clarity, risk explanations, and bilateral accountability records.',
    retentionPeriod: '7 years from transaction settlement for bilateral auditability and dispute resolution.',
  },
  {
    category: 'Dispute Evidence',
    fields: ['dispute category', 'written explanation', 'private storage object path', 'mime_type', 'byte_size'],
    purpose: 'Allow both parties to review and verify submitted evidence during a dispute.',
    retentionPeriod: 'Until dispute resolution + 2 years, stored in a private participant-only bucket.',
  },
  {
    category: 'Operational Security & Rate Limits',
    fields: ['action bucket key', 'request_count', 'audit_log action & resource_id'],
    purpose: 'Prevent abuse, brute-force attacks, and replay attempts.',
    retentionPeriod: 'Rate-limit buckets: 24 hours; security audit logs: 1 year.',
  },
];

export const NEVER_COLLECTED_DATA: readonly string[] = [
  '12-word or 24-word recovery phrases (seed phrases / mnemonics)',
  'Wallet private keys or signing secrets',
  'Raw on-device QVAC AI prompts or local model conversation memory',
  'Ambient browser cookies across third-party sites',
];

export const AI_DATA_HANDLING_DISCLOSURE = {
  summary:
    'The Word payment assistant runs locally on your device using QVAC (or a local deterministic parser when QVAC is unavailable). Raw natural-language prompts and recovery phrases never leave your device.',
  staysOnDevice: QVAC_DATA_BOUNDARY_SPEC.staysOnDevice,
  neverTransmitted: QVAC_DATA_BOUNDARY_SPEC.neverTransmitted,
  explicitTransmissionOnly: QVAC_DATA_BOUNDARY_SPEC.leavesDeviceOnlyOnExplicitAction,
} as const;

export const DISPUTE_EVIDENCE_PROTECTION = {
  storageVisibility: 'private',
  accessControl: 'Participant-only RLS and signed 300-second download/upload URLs via evidence-auth',
  pathIsolation: 'Strict <disputeId>/<uuid>-<filename> prefix validation prevents cross-dispute access',
} as const;

/**
 * Strips non-essential personal fields and enforces strict length limits before storage.
 */
export function minimizeStoredPersonalInfo(input: {
  displayName?: string;
  defaultNetwork?: string;
  notes?: string;
}): {
  displayName?: string;
  defaultNetwork?: string;
  notes?: string;
} {
  const minimized: { displayName?: string; defaultNetwork?: string; notes?: string } = {};
  if (typeof input.displayName === 'string' && input.displayName.trim()) {
    minimized.displayName = input.displayName.trim().slice(0, 60);
  }
  if (typeof input.defaultNetwork === 'string' && input.defaultNetwork.trim()) {
    minimized.defaultNetwork = input.defaultNetwork.trim().slice(0, 32);
  }
  if (typeof input.notes === 'string' && input.notes.trim()) {
    minimized.notes = input.notes.trim().slice(0, 500);
  }
  return minimized;
}

export function redactEmailForDisplay(email: string | null | undefined): string {
  if (!email || !email.includes('@')) return '[hidden]';
  const [local, domain] = email.split('@');
  if (!local || !domain) return '[hidden]';
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

export function getPrivacyDisclosureSummary() {
  return {
    collectedCategories: PRIVACY_DATA_COLLECTION_SPEC,
    neverCollected: NEVER_COLLECTED_DATA,
    aiDataHandling: AI_DATA_HANDLING_DISCLOSURE,
    disputeEvidenceProtection: DISPUTE_EVIDENCE_PROTECTION,
  };
}

