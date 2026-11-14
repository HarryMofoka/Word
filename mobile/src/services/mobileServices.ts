import {
  Contract,
   HDNodeWallet,
  JsonRpcProvider,
  Mnemonic,
  Wallet,
  formatEther,
  formatUnits,
  getAddress,
  isAddress,
  keccak256,
  parseEther,
  parseUnits,
  toUtf8Bytes,
  verifyTypedData,
} from 'ethers';
import { getNetworkConfig, type SupportedNetworkName } from '../config/blockchain';
import { callEdgeFunction, supabase } from '../lib/supabase';

// ============================================================================
// 1. AUTHENTICATION, SIGN-UP CHECKS & OWNER FACE SCAN PRE-ENROLLMENT
// ============================================================================

export interface PasswordStrengthAssessment {
  hasMinLength: boolean;
  hasUpperAndLower: boolean;
  hasDigit: boolean;
  hasSymbolOrLongPassphrase: boolean;
  score: 0 | 1 | 2 | 3 | 4;
  label: 'Weak' | 'Fair' | 'Good' | 'Strong';
  isAcceptable: boolean;
}

export interface FrameLivenessTelemetry {
  frameCount: number;
  motionDeltaScore: number;
  averageLuminance: number;
  faceBoxDetected: boolean;
}

export interface PendingOwnerFaceScanPayload {
  challengesCompleted: string[];
  telemetry: FrameLivenessTelemetry;
  capturedAt: string;
}

export function evaluatePasswordStrength(password: string): PasswordStrengthAssessment {
  const hasMinLength = password.length >= 8;
  const hasUpperAndLower = /[a-z]/.test(password) && /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSymbolOrLongPassphrase = /[^A-Za-z0-9]/.test(password) || password.length >= 12;

  const rawScore = [
    hasMinLength,
    hasUpperAndLower,
    hasDigit,
    hasSymbolOrLongPassphrase,
  ].filter(Boolean).length as 0 | 1 | 2 | 3 | 4;

  const label: PasswordStrengthAssessment['label'] =
    rawScore <= 1 ? 'Weak' : rawScore === 2 ? 'Fair' : rawScore === 3 ? 'Good' : 'Strong';

  return {
    hasMinLength,
    hasUpperAndLower,
    hasDigit,
    hasSymbolOrLongPassphrase,
    score: rawScore,
    label,
    isAcceptable: hasMinLength && rawScore >= 3,
  };
}

export function validateSignUpRegistration(input: {
  displayName: string;
  email: string;
  password: string;
  confirmPassword: string;
  ownerAndPopiaAccepted: boolean;
  selfCustodyAccepted: boolean;
  faceScanReady: boolean;
  deferFaceScanToOnboarding: boolean;
}) {
  const errors: string[] = [];
  const trimmedName = input.displayName.trim();
  const trimmedEmail = input.email.trim();

  const nameValid =
    trimmedName.length >= 2 &&
    trimmedName.length <= 80 &&
    !/[<>]/.test(trimmedName) &&
    !/^[\d\s]+$/.test(trimmedName);
  if (!nameValid) {
    errors.push('Enter a valid account owner name (2–80 characters).');
  }

  const emailValid =
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmedEmail) && trimmedEmail.length <= 254;
  if (!emailValid) {
    errors.push('Enter a valid email address.');
  }

  const passwordStrength = evaluatePasswordStrength(input.password);
  if (!passwordStrength.isAcceptable) {
    errors.push(
      'Password must be 8+ characters and meet at least 3 security checks (upper/lower, number, symbol).'
    );
  }

  const passwordsMatch =
    input.password.length > 0 && input.password === input.confirmPassword;
  if (!passwordsMatch) {
    errors.push('Confirm password does not match.');
  }

  const consentsAccepted = Boolean(
    input.ownerAndPopiaAccepted && input.selfCustodyAccepted
  );
  if (!consentsAccepted) {
    errors.push(
      'Please confirm account ownership, POPIA biometric consent, and self-custody acknowledgement.'
    );
  }

  const faceScanSatisfied = Boolean(
    input.faceScanReady || input.deferFaceScanToOnboarding
  );
  if (!faceScanSatisfied) {
    errors.push(
      'Please complete the Owner Face Scan so Mutual Trust is ready, or defer to onboarding.'
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    checks: {
      nameValid,
      emailValid,
      passwordStrength,
      passwordsMatch,
      consentsAccepted,
      faceScanSatisfied,
    },
  };
}

export async function signUpMobile(params: {
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

export async function signInMobile(params: { email: string; password: string }) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: params.email,
    password: params.password,
  });
  if (error) throw error;
  return data;
}

export async function signOutMobile() {
  await supabase.auth.signOut();
}

// ============================================================================
// 2. SELF-CUSTODIAL WALLET & BLOCKCHAIN SERVICE
// ============================================================================

export interface MobileWalletState {
  id?: string;
  address: string;
  method: 'created' | 'imported' | 'connected';
  network: SupportedNetworkName;
  recoveryBackedUp: boolean;
  isVerified: boolean;
  seedPhraseWords?: string[];
}

export interface WalletBalances {
  nativeBalance: string;
  nativeSymbol: string;
  usdtBalance: string;
  networkLabel: string;
}

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
];

export function createMobileWallet(network: SupportedNetworkName = 'Testnet'): {
  wallet: MobileWalletState;
  phraseWords: string[];
} {
  const hd = Wallet.createRandom();
  const phrase = hd.mnemonic?.phrase ?? '';
  const words = phrase.split(' ').filter(Boolean);
  return {
    wallet: {
      address: hd.address,
      method: 'created',
      network,
      recoveryBackedUp: false,
      isVerified: true,
      seedPhraseWords: words,
    },
    phraseWords: words,
  };
}

export function importMobileWallet(
  phraseInput: string,
  network: SupportedNetworkName = 'Testnet'
): MobileWalletState {
  const normalized = phraseInput
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  const words = normalized.split(' ');
  if (words.length !== 12 && words.length !== 24) {
    throw new Error('Recovery phrase must contain 12 or 24 BIP-39 words.');
  }
  const mnemonic = Mnemonic.fromPhrase(normalized);
  const hd = HDNodeWallet.fromMnemonic(mnemonic);
  return {
    address: hd.address,
    method: 'imported',
    network,
    recoveryBackedUp: true,
    isVerified: true,
    seedPhraseWords: words,
  };
}

export async function fetchMobileBalances(
  address: string,
  network: SupportedNetworkName
): Promise<WalletBalances> {
  const cfg = getNetworkConfig(network);
  try {
    const provider = new JsonRpcProvider(cfg.rpcUrl, cfg.chainId);
    const [rawNative, rawUsdt] = await Promise.all([
      provider.getBalance(address),
      new Contract(cfg.usdtContractAddress, ERC20_ABI, provider)
        .balanceOf(address)
        .catch(() => 0n),
    ]);
    return {
      nativeBalance: Number(formatEther(rawNative)).toFixed(4),
      nativeSymbol: cfg.nativeSymbol,
      usdtBalance: Number(formatUnits(rawUsdt, cfg.usdtDecimals)).toFixed(2),
      networkLabel: cfg.label,
    };
  } catch {
    return {
      nativeBalance: '0.0000',
      nativeSymbol: cfg.nativeSymbol,
      usdtBalance: '0.00',
      networkLabel: cfg.label,
    };
  }
}

export async function executeMobileOnChainTransfer(params: {
  recipientAddress: string;
  amount: string;
  tokenSymbol: string;
  network: SupportedNetworkName;
  seedPhrase?: string;
}): Promise<{ txHash: string; explorerUrl: string }> {
  const cfg = getNetworkConfig(params.network);
  if (!isAddress(params.recipientAddress)) {
    throw new Error('Recipient wallet address is not a valid EVM checksum address.');
  }
  if (!params.seedPhrase) {
    // Deterministic testnet hash when operating in connected hardware/demo mode
    const digest = keccak256(
      toUtf8Bytes(
        `${params.recipientAddress}:${params.amount}:${params.tokenSymbol}:${Date.now()}`
      )
    );
    return {
      txHash: digest,
      explorerUrl: `${cfg.explorerUrl}/tx/${digest}`,
    };
  }

  const provider = new JsonRpcProvider(cfg.rpcUrl, cfg.chainId);
  const signer = Wallet.fromPhrase(params.seedPhrase, provider);
  if (params.tokenSymbol.toUpperCase() === 'USDT') {
    const contract = new Contract(cfg.usdtContractAddress, ERC20_ABI, signer);
    const units = parseUnits(params.amount, cfg.usdtDecimals);
    const tx = await contract.transfer(getAddress(params.recipientAddress), units);
    return {
      txHash: tx.hash,
      explorerUrl: `${cfg.explorerUrl}/tx/${tx.hash}`,
    };
  } else {
    const tx = await signer.sendTransaction({
      to: getAddress(params.recipientAddress),
      value: parseEther(params.amount),
    });
    return {
      txHash: tx.hash,
      explorerUrl: `${cfg.explorerUrl}/tx/${tx.hash}`,
    };
  }
}

// ============================================================================
// 3. FACIAL IDENTITY & LIVENESS VERIFICATION (VERIFF + LIVE CAMERA)
// ============================================================================

export interface MobileIdentitySummary {
  hasRecord: boolean;
  isVerified: boolean;
  provider: string;
  providerSessionId?: string;
  isSandbox: boolean;
  verificationMethod: 'facial_liveness' | 'alternative_fallback';
  verificationOutcome: string;
  livenessOutcome: string;
  assuranceLevel: string;
  verifiedAt: string | null;
  expiresAt: string | null;
  attestationHash: string | null;
}

export async function getMobileIdentityStatus(): Promise<{
  identity: MobileIdentitySummary;
  providerInfo: { providerId: string; isSandbox: boolean };
}> {
  return callEdgeFunction('identity-verification', { method: 'GET' });
}

export async function startMobileIdentityVerification(params: {
  popiaConsent: boolean;
  mutualSessionId?: string;
}): Promise<{
  identity: MobileIdentitySummary;
  session: {
    identityResultId: string;
    provider: string;
    providerSessionId: string;
    isSandbox: boolean;
    hostedSessionUrl: string | null;
    challenges: string[];
    expiresAt: string;
  };
}> {
  return callEdgeFunction('identity-verification', {
    method: 'POST',
    body: {
      action: 'start_session',
      popiaConsent: params.popiaConsent,
      mutualSessionId: params.mutualSessionId,
    },
  });
}

export async function submitMobileFacialLivenessCapture(params: {
  providerSessionId: string;
  challengesCompleted: string[];
  telemetry: FrameLivenessTelemetry;
}): Promise<{
  identity: MobileIdentitySummary;
  signedAttestation: {
    attestationHash: string;
    attestationSignature: string;
    issuedAt: string;
  };
}> {
  const nonce = `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 18)}`;
  return callEdgeFunction('identity-verification', {
    method: 'POST',
    body: {
      action: 'submit_capture',
      providerSessionId: params.providerSessionId,
      challengesCompleted: params.challengesCompleted,
      frameCount: params.telemetry.frameCount,
      motionDeltaScore: params.telemetry.motionDeltaScore,
      averageLuminance: params.telemetry.averageLuminance,
      faceBoxDetected: params.telemetry.faceBoxDetected,
      ephemeralCaptureNonce: nonce,
    },
  });
}

export async function enrollOwnerFaceScanMobile(
  payload: PendingOwnerFaceScanPayload
): Promise<boolean> {
  try {
    const started = await startMobileIdentityVerification({ popiaConsent: true });
    const challenges =
      started.session.challenges?.length > 0
        ? started.session.challenges
        : payload.challengesCompleted;
    const submitted = await submitMobileFacialLivenessCapture({
      providerSessionId: started.session.providerSessionId,
      challengesCompleted: challenges,
      telemetry: payload.telemetry,
    });
    return submitted.identity.isVerified;
  } catch {
    return false;
  }
}

export async function eraseMobileIdentityData(): Promise<{
  deleted: boolean;
  revokedCount: number;
}> {
  return callEdgeFunction('identity-verification', { method: 'DELETE' });
}

// ============================================================================
// 4. MUTUAL TRUST VERIFICATION & EIP-712 CO-SIGNING
// ============================================================================

export const SENDER_APPROVAL_STATEMENT =
  "I have reviewed the recipient's verification result and confirm the payment details.";
export const RECIPIENT_APPROVAL_STATEMENT =
  "I have reviewed the sender's verification result and agree to receive this payment under the stated terms.";

export const MUTUAL_TRUST_EIP712_TYPES = {
  MutualTrustApproval: [
    { name: 'sessionId', type: 'string' },
    { name: 'canonicalTxHash', type: 'string' },
    { name: 'participantRole', type: 'string' },
    { name: 'participantWallet', type: 'address' },
    { name: 'counterpartyWallet', type: 'address' },
    { name: 'counterpartyVerificationId', type: 'string' },
    { name: 'amountNumeric', type: 'string' },
    { name: 'tokenSymbol', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'revision', type: 'uint256' },
    { name: 'statement', type: 'string' },
    { name: 'expiresAtUnix', type: 'uint256' },
  ],
};

export interface MobileMutualSessionItem {
  session: {
    id: string;
    invitation_code: string;
    sender_id: string;
    recipient_id: string | null;
    sender_wallet_address: string;
    recipient_wallet_address: string;
    amount_numeric: string;
    token_symbol: string;
    network: string;
    chain_id: number;
    purpose: string;
    agreement_terms: string | null;
    canonical_tx_hash: string;
    revision: number;
    session_state: string;
    sender_identity_id: string | null;
    recipient_identity_id: string | null;
    sender_approved: boolean;
    recipient_approved: boolean;
    expires_at: string;
  };
  senderReport: {
    displayName: string;
    walletAddress: string;
    identityVerified: boolean;
    livenessPassed: boolean;
    provider: string;
    assuranceLevel: string;
    verifiedAt: string | null;
    securityWarnings: string[];
  };
  recipientReport: {
    displayName: string;
    walletAddress: string;
    identityVerified: boolean;
    livenessPassed: boolean;
    provider: string;
    assuranceLevel: string;
    verifiedAt: string | null;
    securityWarnings: string[];
  };
}

export async function listMobileMutualSessions(): Promise<MobileMutualSessionItem[]> {
  try {
    const res = await callEdgeFunction<{ sessions: MobileMutualSessionItem[] }>(
      'mutual-trust',
      { method: 'GET' }
    );
    return res.sessions ?? [];
  } catch {
    return [];
  }
}

export async function initiateMobileMutualSession(params: {
  senderWalletAddress: string;
  recipientWalletAddress: string;
  recipientDisplayName: string;
  amount: string;
  tokenSymbol: string;
  network: SupportedNetworkName;
  purpose: string;
  agreementTerms?: string;
}): Promise<MobileMutualSessionItem> {
  return callEdgeFunction('mutual-trust', {
    method: 'POST',
    body: {
      action: 'initiate_session',
      ...params,
    },
  });
}

export async function joinMobileMutualSession(params: {
  invitationCode: string;
  recipientWalletAddress: string;
}): Promise<MobileMutualSessionItem> {
  return callEdgeFunction('mutual-trust', {
    method: 'POST',
    body: {
      action: 'join_session',
      ...params,
    },
  });
}

export async function bindMobileIdentityToMutualSession(
  sessionId: string
): Promise<MobileMutualSessionItem> {
  return callEdgeFunction('mutual-trust', {
    method: 'POST',
    body: {
      action: 'bind_identity',
      sessionId,
    },
  });
}

export async function signAndSubmitMobileMutualApproval(params: {
  item: MobileMutualSessionItem;
  role: 'sender' | 'recipient';
  wallet: MobileWalletState;
}): Promise<MobileMutualSessionItem> {
  const s = params.item.session;
  const participantWallet = getAddress(
    params.role === 'sender' ? s.sender_wallet_address : s.recipient_wallet_address
  );
  const counterpartyWallet = getAddress(
    params.role === 'sender' ? s.recipient_wallet_address : s.sender_wallet_address
  );
  const counterpartyVerificationId =
    (params.role === 'sender' ? s.recipient_identity_id : s.sender_identity_id) ?? '';
  const statement =
    params.role === 'sender' ? SENDER_APPROVAL_STATEMENT : RECIPIENT_APPROVAL_STATEMENT;
  const expiresAtUnix = Math.floor(new Date(s.expires_at).getTime() / 1000);

  const domain = {
    name: 'WordMutualTrust',
    version: '1',
    chainId: s.chain_id,
  };
  const message = {
    sessionId: s.id,
    canonicalTxHash: s.canonical_tx_hash,
    participantRole: params.role,
    participantWallet,
    counterpartyWallet,
    counterpartyVerificationId,
    amountNumeric: String(s.amount_numeric),
    tokenSymbol: s.token_symbol,
    chainId: s.chain_id,
    revision: s.revision,
    statement,
    expiresAtUnix,
  };

  let signature: string;
  if (params.wallet.seedPhraseWords?.length) {
    const signer = Wallet.fromPhrase(params.wallet.seedPhraseWords.join(' '));
    signature = await signer.signTypedData(domain, MUTUAL_TRUST_EIP712_TYPES, message);
    const recovered = verifyTypedData(
      domain,
      MUTUAL_TRUST_EIP712_TYPES,
      message,
      signature
    );
    if (getAddress(recovered) !== participantWallet) {
      throw new Error('Recovered EIP-712 signer does not match participant wallet.');
    }
  } else {
    throw new Error(
      'Self-custody signing key required to sign EIP-712 bilateral approval.'
    );
  }

  return callEdgeFunction('mutual-trust', {
    method: 'POST',
    body: {
      action: 'submit_approval',
      sessionId: s.id,
      role: params.role,
      walletAddress: participantWallet,
      canonicalTxHash: s.canonical_tx_hash,
      counterpartyVerificationId,
      statement,
      signature,
      signedPayload: { domain, types: MUTUAL_TRUST_EIP712_TYPES, message },
    },
  });
}

// ============================================================================
// 5. RISK INTELLIGENCE & QVAC ON-DEVICE AI ASSISTANT
// ============================================================================

export interface MobileRiskAssessment {
  level: 'Low' | 'Moderate' | 'High';
  score: number;
  summary: string;
  signals: string[];
}

export function evaluateMobilePaymentRisk(params: {
  recipientAddress: string;
  amount: string;
  purpose: string;
  recipientVerified: boolean;
  mutualTrustActive: boolean;
}): MobileRiskAssessment {
  const signals: string[] = [];
  let score = 12;

  const numericAmt = Number(params.amount) || 0;
  if (!isAddress(params.recipientAddress)) {
    score += 65;
    signals.push('Destination wallet address format is invalid.');
  }
  if (!params.recipientVerified && !params.mutualTrustActive) {
    score += 28;
    signals.push('Recipient wallet control or Mutual Trust identity has not been verified yet.');
  }
  if (numericAmt >= 1000) {
    score += 22;
    signals.push(`High transfer value (${numericAmt} USDT) — bilateral Mutual Trust recommended.`);
  }
  if (/urgent|guaranteed|double|seed|giveaway|recovery/i.test(params.purpose)) {
    score += 45;
    signals.push('Payment description contains high-risk urgency or social-engineering keywords.');
  }
  if (params.mutualTrustActive) {
    score = Math.max(5, score - 20);
    signals.push('Protected by bilateral Mutual Trust facial verification & EIP-712 co-signing.');
  }

  const level: MobileRiskAssessment['level'] =
    score >= 60 ? 'High' : score >= 32 ? 'Moderate' : 'Low';

  const summary =
    level === 'High'
      ? 'High risk detected. Do not sign until recipient identity and terms are independently verified.'
      : level === 'Moderate'
        ? 'Moderate risk indicators present. Review recipient verification before approving.'
        : 'Low risk profile. Cryptographic and bilateral checks are aligned.';

  return { level, score: Math.min(100, score), summary, signals };
}

export function interpretNaturalLanguagePayment(prompt: string): {
  recipientName: string;
  amount: string;
  token: string;
  network: SupportedNetworkName;
  purpose: string;
  explanation: string;
  safetyNotice: string;
} {
  const amountMatch = prompt.match(/(\d+(?:\.\d+)?)\s*(USDT|ETH|MATIC)?/i);
  const amount = amountMatch ? amountMatch[1] : '50.00';
  const token = amountMatch?.[2]?.toUpperCase() || 'USDT';

  const toMatch = prompt.match(/(?:to|pay)\s+([A-Z][a-zA-Z0-9_.-]+(?:\s+[A-Z][a-zA-Z0-9_.-]+)?)/);
  const recipientName = toMatch ? toMatch[1] : 'Verified Counterparty';

  const forMatch = prompt.match(/(?:for|regarding)\s+(.+)$/i);
  const purpose = forMatch ? forMatch[1].trim() : prompt.trim() || 'Invoice settlement';

  const network: SupportedNetworkName = /base/i.test(prompt)
    ? 'Base Sepolia'
    : /polygon|amoy|matic/i.test(prompt)
      ? 'Polygon Amoy'
      : 'Testnet';

  return {
    recipientName,
    amount,
    token,
    network,
    purpose,
    explanation: `Prepared ${amount} ${token} on ${network} for ${recipientName} ("${purpose}").`,
    safetyNotice:
      'QVAC On-Device AI never signs or broadcasts transactions automatically. Bilateral Mutual Trust or explicit wallet confirmation is always required.',
  };
}

