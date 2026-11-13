import { verifyMessage } from 'ethers';
import { callEdgeFunction } from './apiClient';
import type { WalletChallengeRow } from './walletService';

export const WALLET_CONTROL_IDENTITY_DISCLAIMER =
  'Wallet-control verification confirms cryptographic control of the wallet address only and does not establish real-world identity.';

export type RecipientVerificationState = 'verified' | 'mismatch' | 'unverified';

export interface RecipientVerificationResult {
  status: RecipientVerificationState;
  intendedAddress: string;
  recoveredAddress: string | null;
  verifiedAt: string | null;
  network?: string;
  disclaimer: string;
}

export interface ChallengeVerificationCheck {
  verified: boolean;
  status: RecipientVerificationState;
  recoveredAddress: string | null;
  intendedAddress: string;
  reason?: string;
  disclaimer: string;
}

export function buildRecipientChallengeMessage(params: {
  paymentRequestId: string;
  shareCode: string;
  intendedAddress: string;
  network: string;
  nonce: string;
  expiresAt: string;
}): string {
  return [
    'Word Recipient Wallet-Control Challenge',
    `Request ID: ${params.paymentRequestId}`,
    `Share Code: ${params.shareCode}`,
    `Intended Address: ${params.intendedAddress}`,
    `Network: ${params.network}`,
    `Nonce: ${params.nonce}`,
    `Expires: ${params.expiresAt}`,
    'Notice: Signing proves wallet control only and does not establish real-world identity.',
  ].join('\n');
}

export function isChallengeExpired(
  challenge: { status: string; expires_at: string },
  nowMs = Date.now()
): boolean {
  if (challenge.status === 'expired') return true;
  const expMs = new Date(challenge.expires_at).getTime();
  return !Number.isFinite(expMs) || expMs <= nowMs;
}

export function isChallengeReplayed(challenge: {
  status: string;
  signature: string | null;
}): boolean {
  return challenge.status === 'verified' || challenge.signature !== null;
}

export function verifyRecipientChallengeSignature(params: {
  message: string;
  signature: string;
  intendedAddress: string;
  paymentRequestId: string;
  expiresAt: string;
  status?: string;
  existingSignature?: string | null;
  nowMs?: number;
}): ChallengeVerificationCheck {
  if (
    isChallengeReplayed({
      status: params.status ?? 'pending',
      signature: params.existingSignature ?? null,
    })
  ) {
    return {
      verified: false,
      status: 'unverified',
      recoveredAddress: null,
      intendedAddress: params.intendedAddress,
      reason: 'Replay detected: verification challenge was already used.',
      disclaimer: WALLET_CONTROL_IDENTITY_DISCLAIMER,
    };
  }

  if (
    isChallengeExpired(
      { status: params.status ?? 'pending', expires_at: params.expiresAt },
      params.nowMs
    )
  ) {
    return {
      verified: false,
      status: 'unverified',
      recoveredAddress: null,
      intendedAddress: params.intendedAddress,
      reason: 'Verification challenge has expired.',
      disclaimer: WALLET_CONTROL_IDENTITY_DISCLAIMER,
    };
  }

  if (!params.message.includes(`Request ID: ${params.paymentRequestId}`)) {
    return {
      verified: false,
      status: 'mismatch',
      recoveredAddress: null,
      intendedAddress: params.intendedAddress,
      reason: 'Challenge message is not bound to this payment request.',
      disclaimer: WALLET_CONTROL_IDENTITY_DISCLAIMER,
    };
  }

  let recovered: string;
  try {
    recovered = verifyMessage(params.message, params.signature);
  } catch {
    return {
      verified: false,
      status: 'unverified',
      recoveredAddress: null,
      intendedAddress: params.intendedAddress,
      reason: 'Malformed cryptographic signature.',
      disclaimer: WALLET_CONTROL_IDENTITY_DISCLAIMER,
    };
  }

  if (recovered.toLowerCase() !== params.intendedAddress.toLowerCase()) {
    return {
      verified: false,
      status: 'mismatch',
      recoveredAddress: recovered,
      intendedAddress: params.intendedAddress,
      reason: `Signing address (${recovered}) does not match intended recipient (${params.intendedAddress}).`,
      disclaimer: WALLET_CONTROL_IDENTITY_DISCLAIMER,
    };
  }

  return {
    verified: true,
    status: 'verified',
    recoveredAddress: recovered,
    intendedAddress: params.intendedAddress,
    disclaimer: WALLET_CONTROL_IDENTITY_DISCLAIMER,
  };
}

export async function issueRecipientChallenge(params: {
  paymentRequestId: string;
  recipientAddress: string;
  network: string;
}): Promise<{ challenge: WalletChallengeRow; disclaimer: string }> {
  return callEdgeFunction('recipient-verify', {
    method: 'POST',
    body: {
      action: 'issue_challenge',
      ...params,
    },
  });
}

export async function verifyRecipientChallenge(params: {
  challengeId: string;
  paymentRequestId: string;
  signature: string;
}): Promise<{
  verified: boolean;
  status: RecipientVerificationState;
  intendedAddress: string;
  recoveredAddress: string;
  verifiedAt: string;
  disclaimer: string;
}> {
  return callEdgeFunction('recipient-verify', {
    method: 'POST',
    body: {
      action: 'verify_signature',
      ...params,
    },
  });
}

export async function getRecipientVerificationStatus(
  paymentRequestId: string
): Promise<RecipientVerificationResult> {
  return callEdgeFunction('recipient-verify', {
    method: 'GET',
    query: { paymentRequestId },
  });
}

