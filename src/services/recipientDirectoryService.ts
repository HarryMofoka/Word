import { Wallet } from 'ethers';
import { DEFAULT_DEMO_NETWORK, type SupportedNetworkName } from '../config/blockchain';

export type RecipientRiskTier = 'low' | 'moderate' | 'high' | 'critical';

export interface RecipientPastRecord {
  id: string;
  date: string;
  amount: string;
  purpose: string;
  outcome: 'Completed' | 'Disputed' | 'Refunded';
}

export interface RecipientDisputeItem {
  id: string;
  caseRef: string;
  filedAt: string;
  amount: string;
  reason: string;
  summary: string;
  status: 'Open' | 'Under Review' | 'Unresolved' | 'Resolved';
}

export interface RecipientDirectoryEntry {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  avatarUrl: string;
  walletAddress: string;
  network: SupportedNetworkName;
  trustScore: number; // 0 to 100 (higher = better reputation)
  riskTier: RecipientRiskTier;
  completedTransactions: number;
  disputesRaisedCount: number;
  verifiedIdentity: boolean;
  memberSince: string;
  roleOrTag: string;
  trackRecordSummary: string;
  pastRecords: RecipientPastRecord[];
  disputes: RecipientDisputeItem[];
}

export interface AdaptiveFrictionPolicy {
  frictionLevel: 'standard' | 'elevated' | 'maximum';
  riskTier: RecipientRiskTier;
  requiresIdentityConfirmation: boolean;
  requiresDisputeWalkthrough: boolean;
  requiresAreYouSurePrompt: boolean;
  requiresPasskeyVerification: boolean;
  extraWaitSeconds: number;
  requiredStepsCount: number;
  stepLabels: string[];
  reasonBanner: string;
}

export interface SimulatedProfileWallet {
  address: string;
  seedWords: string[];
  network: SupportedNetworkName;
  linkedProfileName: string;
  linkedProfileEmail: string;
  initialUsdtBalance: string;
  initialNativeBalance: string;
  createdAt: string;
}

export interface PasskeyVerificationReceipt {
  verified: boolean;
  method: 'webauthn-biometric' | 'word-security-passkey';
  credentialId: string;
  verifiedAt: string;
}

const SIMULATED_WALLET_STORAGE_KEY = 'word_simulated_profile_wallets_v1';

const memoryWalletBalances = new Map<
  string,
  {
    usdtBalance: number;
    nativeBalance: number;
    linkedProfileName: string;
    linkedProfileEmail: string;
    createdAt: string;
  }
>();

function createAvatarDataUri(
  initials: string,
  bgStart: string,
  bgEnd: string,
  accentRing: string
): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${bgStart}" />
        <stop offset="100%" stop-color="${bgEnd}" />
      </linearGradient>
    </defs>
    <circle cx="60" cy="60" r="58" fill="url(#g)" stroke="${accentRing}" stroke-width="3" />
    <circle cx="60" cy="46" r="18" fill="rgba(255,255,255,0.22)" />
    <path d="M28 98 C32 76, 88 76, 92 98" fill="rgba(255,255,255,0.22)" />
    <text x="60" y="68" text-anchor="middle" fill="#ffffff" font-family="Inter, -apple-system, sans-serif" font-weight="700" font-size="28" letter-spacing="1">${initials}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const RECIPIENT_DIRECTORY: RecipientDirectoryEntry[] = [
  {
    id: 'rec-thabo-mokoena',
    firstName: 'Thabo',
    lastName: 'Mokoena',
    fullName: 'Thabo Mokoena',
    avatarUrl: createAvatarDataUri('TM', '#0f5132', '#198754', '#75b798'),
    walletAddress: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
    network: 'Testnet',
    trustScore: 96,
    riskTier: 'low',
    completedTransactions: 48,
    disputesRaisedCount: 0,
    verifiedIdentity: true,
    memberSince: 'Jan 2025',
    roleOrTag: 'Verified UI/UX Studio · Clean Track Record',
    trackRecordSummary:
      '48 completed stablecoin settlements with zero disputes raised. Verified biometric owner and cryptographic wallet control.',
    pastRecords: [
      {
        id: 'tx-hist-101',
        date: '2026-10-28',
        amount: '320.00 USDT',
        purpose: 'Design system milestone #3',
        outcome: 'Completed',
      },
      {
        id: 'tx-hist-102',
        date: '2026-10-14',
        amount: '150.00 USDT',
        purpose: 'Brand sprint & prototype handoff',
        outcome: 'Completed',
      },
      {
        id: 'tx-hist-103',
        date: '2026-09-29',
        amount: '85.00 USDT',
        purpose: 'Iconography package delivery',
        outcome: 'Completed',
      },
    ],
    disputes: [],
  },
  {
    id: 'rec-lerato-ndlovu',
    firstName: 'Lerato',
    lastName: 'Ndlovu',
    fullName: 'Lerato Ndlovu',
    avatarUrl: createAvatarDataUri('LN', '#111827', '#2563eb', '#93c5fd'),
    walletAddress: '0x71C8f92c10a7d44e19c3f8b2a91e2448901289A1',
    network: 'Testnet',
    trustScore: 98,
    riskTier: 'low',
    completedTransactions: 64,
    disputesRaisedCount: 0,
    verifiedIdentity: true,
    memberSince: 'Nov 2024',
    roleOrTag: 'Verified Cloud Logistics · Top Reputation',
    trackRecordSummary:
      '64 successful settlements across Testnet and Base Sepolia. 100% on-time delivery fulfilment and zero buyer disputes.',
    pastRecords: [
      {
        id: 'tx-hist-201',
        date: '2026-11-04',
        amount: '540.00 USDT',
        purpose: 'Cross-border freight settlement',
        outcome: 'Completed',
      },
      {
        id: 'tx-hist-202',
        date: '2026-10-19',
        amount: '210.00 USDT',
        purpose: 'Warehouse customs clearance',
        outcome: 'Completed',
      },
    ],
    disputes: [],
  },
  {
    id: 'rec-sipho-dlamini',
    firstName: 'Sipho',
    lastName: 'Dlamini',
    fullName: 'Sipho Dlamini',
    avatarUrl: createAvatarDataUri('SD', '#7c2d12', '#d97706', '#fcd34d'),
    walletAddress: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE',
    network: 'Testnet',
    trustScore: 56,
    riskTier: 'moderate',
    completedTransactions: 11,
    disputesRaisedCount: 1,
    verifiedIdentity: true,
    memberSince: 'Jun 2025',
    roleOrTag: 'Independent Supplier · 1 Open Dispute',
    trackRecordSummary:
      '11 completed transfers, but 1 active dispute was raised last month regarding delayed equipment delivery.',
    pastRecords: [
      {
        id: 'tx-hist-301',
        date: '2026-10-22',
        amount: '180.00 USDT',
        purpose: 'Audio interface hardware shipment',
        outcome: 'Disputed',
      },
      {
        id: 'tx-hist-302',
        date: '2026-09-18',
        amount: '95.00 USDT',
        purpose: 'Studio cabling batch',
        outcome: 'Completed',
      },
    ],
    disputes: [
      {
        id: 'disp-sipho-1',
        caseRef: 'DSP-2026-409',
        filedAt: '2026-10-24',
        amount: '180.00 USDT',
        reason: 'Delayed Delivery / Missing Tracking Proof',
        summary:
          'Sender reported that tracking documentation was provided 9 days late. Currently under mediation review.',
        status: 'Under Review',
      },
    ],
  },
  {
    id: 'rec-vusi-sithole',
    firstName: 'Vusi',
    lastName: 'Sithole',
    fullName: 'Vusi Sithole',
    avatarUrl: createAvatarDataUri('VS', '#7f1d1d', '#dc2626', '#fca5a5'),
    walletAddress: '0xDead00000000000000000000000000000000beef',
    network: 'Testnet',
    trustScore: 21,
    riskTier: 'high',
    completedTransactions: 5,
    disputesRaisedCount: 4,
    verifiedIdentity: false,
    memberSince: 'Aug 2025',
    roleOrTag: 'High-Risk Counterparty · 4 Disputes Raised',
    trackRecordSummary:
      'SEVERE CAUTION: 4 disputes raised across 9 total transactions. Multiple senders reported non-delivery of goods and unresponsiveness after stablecoin settlement.',
    pastRecords: [
      {
        id: 'tx-hist-401',
        date: '2026-11-02',
        amount: '450.00 USDT',
        purpose: 'MacBook Pro M3 escrow deposit',
        outcome: 'Disputed',
      },
      {
        id: 'tx-hist-402',
        date: '2026-10-15',
        amount: '275.00 USDT',
        purpose: 'Bulk electronics invoice #88',
        outcome: 'Disputed',
      },
      {
        id: 'tx-hist-403',
        date: '2026-09-30',
        amount: '120.00 USDT',
        purpose: 'Software license transfer',
        outcome: 'Disputed',
      },
      {
        id: 'tx-hist-404',
        date: '2026-09-12',
        amount: '310.00 USDT',
        purpose: 'Server rack components',
        outcome: 'Disputed',
      },
      {
        id: 'tx-hist-405',
        date: '2026-08-20',
        amount: '40.00 USDT',
        purpose: 'Initial test transfer',
        outcome: 'Completed',
      },
    ],
    disputes: [
      {
        id: 'disp-vusi-1',
        caseRef: 'DSP-2026-881',
        filedAt: '2026-11-03',
        amount: '450.00 USDT',
        reason: 'Undelivered Hardware After Settlement',
        summary:
          'Buyer transferred 450 USDT for laptop delivery; recipient ceased communication immediately after on-chain confirmation.',
        status: 'Open',
      },
      {
        id: 'disp-vusi-2',
        caseRef: 'DSP-2026-794',
        filedAt: '2026-10-17',
        amount: '275.00 USDT',
        reason: 'Counterfeit / Incomplete Shipment',
        summary:
          'Sender submitted photographic evidence that only 2 of 10 invoiced units were shipped.',
        status: 'Unresolved',
      },
      {
        id: 'disp-vusi-3',
        caseRef: 'DSP-2026-662',
        filedAt: '2026-10-02',
        amount: '120.00 USDT',
        reason: 'Revoked License Key Post-Payment',
        summary:
          'Delivered activation credentials were revoked 24 hours after USDT settlement.',
        status: 'Unresolved',
      },
      {
        id: 'disp-vusi-4',
        caseRef: 'DSP-2026-519',
        filedAt: '2026-09-14',
        amount: '310.00 USDT',
        reason: 'Invoice Terms Altered After Agreement',
        summary:
          'Recipient demanded additional off-platform fees before releasing goods.',
        status: 'Under Review',
      },
    ],
  },
  {
    id: 'rec-kabelo-khumalo',
    firstName: 'Kabelo',
    lastName: 'Khumalo',
    fullName: 'Kabelo Khumalo',
    avatarUrl: createAvatarDataUri('KK', '#4c0519', '#be123c', '#fda4af'),
    walletAddress: '0x8888999900001111222233334444555566667777',
    network: 'Testnet',
    trustScore: 14,
    riskTier: 'critical',
    completedTransactions: 2,
    disputesRaisedCount: 5,
    verifiedIdentity: false,
    memberSince: 'Sep 2025',
    roleOrTag: 'Critical Risk · 5 Disputes Raised · Flagged Address',
    trackRecordSummary:
      'CRITICAL RISK PROFILE: 5 unresolved disputes raised by independent senders. Address is flagged for repeated breach of payment agreements.',
    pastRecords: [
      {
        id: 'tx-hist-501',
        date: '2026-11-08',
        amount: '600.00 USDT',
        purpose: 'Vehicle import deposit',
        outcome: 'Disputed',
      },
      {
        id: 'tx-hist-502',
        date: '2026-10-25',
        amount: '390.00 USDT',
        purpose: 'Solar inverter procurement',
        outcome: 'Disputed',
      },
      {
        id: 'tx-hist-503',
        date: '2026-10-10',
        amount: '150.00 USDT',
        purpose: 'Generator spare parts',
        outcome: 'Disputed',
      },
    ],
    disputes: [
      {
        id: 'disp-kabelo-1',
        caseRef: 'DSP-2026-912',
        filedAt: '2026-11-09',
        amount: '600.00 USDT',
        reason: 'Non-Delivery & Unverified Identity',
        summary:
          'Recipient failed to provide customs release papers after receiving 600 USDT deposit.',
        status: 'Open',
      },
      {
        id: 'disp-kabelo-2',
        caseRef: 'DSP-2026-845',
        filedAt: '2026-10-27',
        amount: '390.00 USDT',
        reason: 'Breach of Signed Payment Agreement',
        summary:
          'Goods never dispatched by agreed milestone deadline; no refund issued.',
        status: 'Unresolved',
      },
      {
        id: 'disp-kabelo-3',
        caseRef: 'DSP-2026-771',
        filedAt: '2026-10-12',
        amount: '150.00 USDT',
        reason: 'Defective Goods Delivered',
        summary:
          'Counterparty refused mediation evidence review.',
        status: 'Unresolved',
      },
      {
        id: 'disp-kabelo-4',
        caseRef: 'DSP-2026-688',
        filedAt: '2026-09-29',
        amount: '220.00 USDT',
        reason: 'Duplicate Invoice Claim',
        summary:
          'Requested second settlement for an already-settled invoice.',
        status: 'Unresolved',
      },
      {
        id: 'disp-kabelo-5',
        caseRef: 'DSP-2026-604',
        filedAt: '2026-09-19',
        amount: '175.00 USDT',
        reason: 'Ghosting After Transfer',
        summary:
          'Recipient blocked sender following transfer confirmation.',
        status: 'Unresolved',
      },
    ],
  },
];

export function listRecipientDirectory(): RecipientDirectoryEntry[] {
  return RECIPIENT_DIRECTORY;
}

export function searchRecipients(
  query: string,
  riskFilter: 'all' | 'low' | 'moderate' | 'high' = 'all'
): RecipientDirectoryEntry[] {
  const normalized = query.trim().toLowerCase();

  return RECIPIENT_DIRECTORY.filter((entry) => {
    if (riskFilter !== 'all') {
      if (riskFilter === 'high') {
        if (entry.riskTier !== 'high' && entry.riskTier !== 'critical') return false;
      } else if (entry.riskTier !== riskFilter) {
        return false;
      }
    }

    if (!normalized) return true;

    return (
      entry.firstName.toLowerCase().includes(normalized) ||
      entry.lastName.toLowerCase().includes(normalized) ||
      entry.fullName.toLowerCase().includes(normalized) ||
      entry.walletAddress.toLowerCase().includes(normalized) ||
      entry.roleOrTag.toLowerCase().includes(normalized)
    );
  });
}

const FALLBACK_FIRST_NAMES = ['Naledi', 'Bongani', 'Zanele', 'Mandla', 'Ayanda', 'Tshepo'];
const FALLBACK_LAST_NAMES = ['Mahlangu', 'Nkosi', 'Mthembu', 'Zulu', 'Molefe', 'Cele'];

export function lookupRecipientByAddressOrQuery(
  input: string
): RecipientDirectoryEntry | null {
  const cleaned = input.trim();
  if (!cleaned) return null;

  const exactByAddress = RECIPIENT_DIRECTORY.find(
    (r) => r.walletAddress.toLowerCase() === cleaned.toLowerCase()
  );
  if (exactByAddress) return exactByAddress;

  const byName = RECIPIENT_DIRECTORY.find(
    (r) =>
      r.fullName.toLowerCase() === cleaned.toLowerCase() ||
      r.firstName.toLowerCase() === cleaned.toLowerCase() ||
      r.lastName.toLowerCase() === cleaned.toLowerCase()
  );
  if (byName) return byName;

  // If it's a valid EVM address not in our preset list, deterministically resolve a profile
  if (/^0x[a-fA-F0-9]{40}$/.test(cleaned)) {
    const seedByte = parseInt(cleaned.slice(2, 4), 16) || 0;
    const secondByte = parseInt(cleaned.slice(4, 6), 16) || 0;
    const firstName = FALLBACK_FIRST_NAMES[seedByte % FALLBACK_FIRST_NAMES.length];
    const lastName = FALLBACK_LAST_NAMES[secondByte % FALLBACK_LAST_NAMES.length];
    const initials = `${firstName[0]}${lastName[0]}`;
    const isFlaggedPattern =
      cleaned.toLowerCase().includes('dead') ||
      cleaned.toLowerCase().includes('beef') ||
      cleaned.toLowerCase().includes('0000');

    if (isFlaggedPattern) {
      return {
        id: `rec-custom-high-${cleaned.slice(2, 8).toLowerCase()}`,
        firstName,
        lastName,
        fullName: `${firstName} ${lastName}`,
        avatarUrl: createAvatarDataUri(initials, '#7f1d1d', '#dc2626', '#fca5a5'),
        walletAddress: cleaned,
        network: DEFAULT_DEMO_NETWORK,
        trustScore: 24,
        riskTier: 'high',
        completedTransactions: 3,
        disputesRaisedCount: 3,
        verifiedIdentity: false,
        memberSince: 'Oct 2025',
        roleOrTag: 'Flagged Address Pattern · 3 Disputes Raised',
        trackRecordSummary:
          'High-risk wallet address pattern with 3 prior counterparty disputes recorded on Word.',
        pastRecords: [
          {
            id: `tx-cust-1`,
            date: '2026-10-30',
            amount: '240.00 USDT',
            purpose: 'Peer-to-peer trade settlement',
            outcome: 'Disputed',
          },
        ],
        disputes: [
          {
            id: 'disp-cust-1',
            caseRef: 'DSP-2026-901',
            filedAt: '2026-10-31',
            amount: '240.00 USDT',
            reason: 'Unfulfilled Delivery Commitment',
            summary: 'Counterparty did not complete agreed service after transfer.',
            status: 'Open',
          },
          {
            id: 'disp-cust-2',
            caseRef: 'DSP-2026-812',
            filedAt: '2026-10-12',
            amount: '115.00 USDT',
            reason: 'Disputed Invoice Terms',
            summary: 'Mismatch between agreed deliverables and final handoff.',
            status: 'Under Review',
          },
          {
            id: 'disp-cust-3',
            caseRef: 'DSP-2026-733',
            filedAt: '2026-09-25',
            amount: '90.00 USDT',
            reason: 'Unresponsive Counterparty',
            summary: 'No response to post-settlement verification messages.',
            status: 'Unresolved',
          },
        ],
      };
    }

    return {
      id: `rec-custom-${cleaned.slice(2, 8).toLowerCase()}`,
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`,
      avatarUrl: createAvatarDataUri(initials, '#1e293b', '#475569', '#94a3b8'),
      walletAddress: cleaned,
      network: DEFAULT_DEMO_NETWORK,
      trustScore: 84,
      riskTier: 'low',
      completedTransactions: 14,
      disputesRaisedCount: 0,
      verifiedIdentity: true,
      memberSince: 'Mar 2025',
      roleOrTag: 'Verified Word Wallet Holder · Clean Record',
      trackRecordSummary:
        '14 completed stablecoin transactions with 0 disputes on record.',
      pastRecords: [
        {
          id: 'tx-cust-clean-1',
          date: '2026-10-20',
          amount: '125.00 USDT',
          purpose: 'Service settlement',
          outcome: 'Completed',
        },
      ],
      disputes: [],
    };
  }

  const partialMatches = searchRecipients(cleaned);
  return partialMatches[0] ?? null;
}

export function getAdaptiveFrictionPolicy(
  recipient: RecipientDirectoryEntry
): AdaptiveFrictionPolicy {
  if (
    recipient.riskTier === 'high' ||
    recipient.riskTier === 'critical' ||
    recipient.trustScore < 45 ||
    recipient.disputesRaisedCount >= 2
  ) {
    const waitSeconds = recipient.riskTier === 'critical' ? 10 : 8;
    return {
      frictionLevel: 'maximum',
      riskTier: recipient.riskTier,
      requiresIdentityConfirmation: true,
      requiresDisputeWalkthrough: true,
      requiresAreYouSurePrompt: true,
      requiresPasskeyVerification: true,
      extraWaitSeconds: waitSeconds,
      requiredStepsCount: 5,
      stepLabels: [
        '1. Confirm Receiver Info (Name, Surname & Image)',
        `2. Review Receiver Track Record & Disputes (${recipient.disputesRaisedCount} Disputes)`,
        '3. Explicit High-Risk "Are You Sure?" Confirmation',
        '4. Passkey Identity Verification (Verify It Is You)',
        `5. Mandatory ${waitSeconds}s Cooling-Off Wait Timer`,
      ],
      reasonBanner: `High-friction protection triggered: ${recipient.fullName} has a low trust score (${recipient.trustScore}/100) and ${recipient.disputesRaisedCount} disputes raised against them.`,
    };
  }

  if (
    recipient.riskTier === 'moderate' ||
    recipient.trustScore < 75 ||
    recipient.disputesRaisedCount === 1
  ) {
    return {
      frictionLevel: 'elevated',
      riskTier: 'moderate',
      requiresIdentityConfirmation: true,
      requiresDisputeWalkthrough: true,
      requiresAreYouSurePrompt: true,
      requiresPasskeyVerification: false,
      extraWaitSeconds: 4,
      requiredStepsCount: 4,
      stepLabels: [
        '1. Confirm Receiver Info (Name, Surname & Image)',
        `2. Review Receiver Track Record & Dispute (${recipient.disputesRaisedCount} Dispute)`,
        '3. Caution "Are You Sure?" Confirmation',
        '4. Mandatory 4s Cooling-Off Wait Timer',
      ],
      reasonBanner: `Elevated caution triggered: ${recipient.fullName} has a moderate trust score (${recipient.trustScore}/100) and ${recipient.disputesRaisedCount} recorded dispute.`,
    };
  }

  return {
    frictionLevel: 'standard',
    riskTier: 'low',
    requiresIdentityConfirmation: true,
    requiresDisputeWalkthrough: false,
    requiresAreYouSurePrompt: false,
    requiresPasskeyVerification: false,
    extraWaitSeconds: 0,
    requiredStepsCount: 1,
    stepLabels: ['1. Confirm Receiver Info (Name, Surname & Image)'],
    reasonBanner: `Trusted track record: ${recipient.fullName} has a ${recipient.trustScore}/100 score with ${recipient.completedTransactions} completed transactions and 0 disputes.`,
  };
}

function readStoredWalletMap(): Record<
  string,
  {
    usdtBalance: number;
    nativeBalance: number;
    linkedProfileName: string;
    linkedProfileEmail: string;
    createdAt: string;
  }
> {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return {};
    const raw = window.localStorage.getItem(SIMULATED_WALLET_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeStoredWalletMap(
  map: Record<
    string,
    {
      usdtBalance: number;
      nativeBalance: number;
      linkedProfileName: string;
      linkedProfileEmail: string;
      createdAt: string;
    }
  >
): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(SIMULATED_WALLET_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore storage errors in restricted environments
  }
}

export function createSimulatedProfileWallet(params: {
  displayName: string;
  email: string;
  network?: SupportedNetworkName;
  initialUsdt?: number;
}): SimulatedProfileWallet {
  const network = params.network ?? DEFAULT_DEMO_NETWORK;
  const initialUsdt = params.initialUsdt ?? 2500.0;
  const initialNative = 1.5;

  const randomWallet = Wallet.createRandom();
  const phrase =
    randomWallet.mnemonic?.phrase ??
    'abandon ability able about above absent absorb abstract absurd abuse access accident';
  const seedWords = phrase.split(' ');
  const address = randomWallet.address;
  const createdAt = new Date().toISOString();

  const record = {
    usdtBalance: initialUsdt,
    nativeBalance: initialNative,
    linkedProfileName: params.displayName || 'Word Account Owner',
    linkedProfileEmail: params.email || 'owner@word.fi',
    createdAt,
  };

  const key = address.toLowerCase();
  memoryWalletBalances.set(key, record);

  const map = readStoredWalletMap();
  map[key] = record;
  writeStoredWalletMap(map);

  return {
    address,
    seedWords,
    network,
    linkedProfileName: record.linkedProfileName,
    linkedProfileEmail: record.linkedProfileEmail,
    initialUsdtBalance: initialUsdt.toFixed(2),
    initialNativeBalance: initialNative.toFixed(4),
    createdAt,
  };
}

export function ensureSimulatedWalletBalance(
  address: string,
  profile?: { displayName?: string; email?: string }
): {
  usdtBalance: string;
  nativeBalance: string;
  linkedProfileName: string;
  linkedProfileEmail: string;
} {
  const key = address.toLowerCase();
  const map = readStoredWalletMap();
  const existing = memoryWalletBalances.get(key) ?? map[key];

  if (existing) {
    memoryWalletBalances.set(key, existing);
    return {
      usdtBalance: existing.usdtBalance.toFixed(2),
      nativeBalance: existing.nativeBalance.toFixed(4),
      linkedProfileName: existing.linkedProfileName,
      linkedProfileEmail: existing.linkedProfileEmail,
    };
  }

  const seeded = {
    usdtBalance: 2500.0,
    nativeBalance: 1.5,
    linkedProfileName: profile?.displayName || 'Word Account Owner',
    linkedProfileEmail: profile?.email || 'owner@word.fi',
    createdAt: new Date().toISOString(),
  };
  memoryWalletBalances.set(key, seeded);
  map[key] = seeded;
  writeStoredWalletMap(map);

  return {
    usdtBalance: seeded.usdtBalance.toFixed(2),
    nativeBalance: seeded.nativeBalance.toFixed(4),
    linkedProfileName: seeded.linkedProfileName,
    linkedProfileEmail: seeded.linkedProfileEmail,
  };
}

export function deductSimulatedUsdtBalance(
  address: string,
  amountUsdt: number
): {
  usdtBalance: string;
  nativeBalance: string;
} {
  const key = address.toLowerCase();
  const current = ensureSimulatedWalletBalance(address);
  const nextUsdt = Math.max(0, Number(current.usdtBalance) - (Number.isFinite(amountUsdt) ? amountUsdt : 0));
  const nextNative = Math.max(0.01, Number(current.nativeBalance) - 0.0004);

  const updated = {
    usdtBalance: nextUsdt,
    nativeBalance: nextNative,
    linkedProfileName: current.linkedProfileName,
    linkedProfileEmail: current.linkedProfileEmail,
    createdAt: new Date().toISOString(),
  };

  memoryWalletBalances.set(key, updated);
  const map = readStoredWalletMap();
  map[key] = updated;
  writeStoredWalletMap(map);

  return {
    usdtBalance: nextUsdt.toFixed(2),
    nativeBalance: nextNative.toFixed(4),
  };
}

export async function verifySenderPasskey(params: {
  passkeyPin?: string;
  useBiometricWebAuthn?: boolean;
  userEmail?: string;
}): Promise<PasskeyVerificationReceipt> {
  if (params.useBiometricWebAuthn && typeof window !== 'undefined' && window.PublicKeyCredential) {
    try {
      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);
      const userIdBytes = new Uint8Array(16);
      window.crypto.getRandomValues(userIdBytes);

      const cred = await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: 'Word Stablecoin Security' },
          user: {
            id: userIdBytes,
            name: params.userEmail || 'owner@word.fi',
            displayName: params.userEmail || 'Word Account Owner',
          },
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
          timeout: 15000,
          authenticatorSelection: {
            userVerification: 'preferred',
          },
        },
      });
      if (cred) {
        return {
          verified: true,
          method: 'webauthn-biometric',
          credentialId: cred.id.slice(0, 24),
          verifiedAt: new Date().toISOString(),
        };
      }
    } catch {
      // Fallback to deterministic passkey verification if browser blocks WebAuthn in non-HTTPS/headless context
    }
  }

  const cleanedPin = (params.passkeyPin ?? '').trim();
  if (cleanedPin.length < 4) {
    throw new Error('Enter your 4+ character Word Security Passkey or use Biometric Passkey.');
  }

  return {
    verified: true,
    method: params.useBiometricWebAuthn ? 'webauthn-biometric' : 'word-security-passkey',
    credentialId: `pk-${Date.now().toString(36).toUpperCase()}`,
    verifiedAt: new Date().toISOString(),
  };
}

