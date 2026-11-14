import {
  AbiCoder,
  ZeroAddress,
  ZeroHash,
  getAddress,
  keccak256,
  toUtf8Bytes,
  verifyTypedData,
  type TypedDataDomain,
  type TypedDataField,
} from 'ethers';

export const NATIVE_ASSET_SENTINEL = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

export const SENDER_APPROVAL_STATEMENT =
  "I have reviewed the recipient's verification results and agree to proceed with this transaction.";

export const RECIPIENT_APPROVAL_STATEMENT =
  "I have reviewed the sender's verification results and agree to receive this transaction.";

export type MutualApprovalRole = 'sender' | 'recipient';

export interface CanonicalTransactionInput {
  sessionId: string;
  paymentRequestId?: string | null;
  agreementId?: string | null;
  agreementVersion?: number;
  agreementTerms?: string | null;
  agreementTermsHash?: string | null;
  senderUserId: string;
  senderWallet: string;
  recipientUserId: string;
  recipientWallet: string;
  amountAtomic: string;
  tokenAddress?: string | null;
  tokenSymbol: string;
  chainId: number;
  nonce: string;
  expiresAtUnix: number;
}

export interface CanonicalTransactionPayload {
  sessionId: string;
  paymentRequestId: string;
  agreementId: string;
  agreementVersion: number;
  agreementTermsHash: string;
  senderUserId: string;
  senderWallet: string;
  recipientUserId: string;
  recipientWallet: string;
  amountAtomic: string;
  tokenAddress: string;
  tokenSymbol: string;
  chainId: number;
  nonce: string;
  expiresAtUnix: number;
}

export interface MutualTrustApprovalTypedMessage {
  canonicalHash: string;
  sessionId: string;
  paymentRequestId: string;
  agreementTermsHash: string;
  sender: string;
  recipient: string;
  token: string;
  amountAtomic: string;
  nonce: string;
  expiresAt: number;
  role: MutualApprovalRole;
  statement: string;
}

export const MUTUAL_TRUST_EIP712_TYPES: Record<string, TypedDataField[]> = {
  MutualTrustApproval: [
    { name: 'canonicalHash', type: 'bytes32' },
    { name: 'sessionId', type: 'string' },
    { name: 'paymentRequestId', type: 'string' },
    { name: 'agreementTermsHash', type: 'bytes32' },
    { name: 'sender', type: 'address' },
    { name: 'recipient', type: 'address' },
    { name: 'token', type: 'address' },
    { name: 'amountAtomic', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
    { name: 'expiresAt', type: 'uint256' },
    { name: 'role', type: 'string' },
    { name: 'statement', type: 'string' },
  ],
};

const TYPE_TAG = keccak256(toUtf8Bytes('WORD_MUTUAL_TRUST_TX_V1'));

export function normalizeNonceBytes32(rawNonce: string): string {
  if (/^0x[a-fA-F0-9]{64}$/.test(rawNonce.trim())) {
    return rawNonce.trim().toLowerCase();
  }
  return keccak256(toUtf8Bytes(rawNonce.trim()));
}

export function computeAgreementTermsHash(params: {
  agreementId?: string | null;
  agreementVersion?: number;
  termsText?: string | null;
}): string {
  const cleanTerms = (params.termsText ?? '').trim();
  const cleanId = (params.agreementId ?? '').trim();
  const version = Number(params.agreementVersion ?? 0);
  if (!cleanTerms && !cleanId && version === 0) {
    return ZeroHash;
  }
  return keccak256(
    toUtf8Bytes(
      JSON.stringify({
        agreementId: cleanId,
        version,
        terms: cleanTerms,
      })
    )
  );
}

export function buildCanonicalTransactionPayload(
  input: CanonicalTransactionInput
): CanonicalTransactionPayload {
  const senderWallet = getAddress(input.senderWallet.trim());
  const recipientWallet = getAddress(input.recipientWallet.trim());
  const tokenAddress = input.tokenAddress?.trim()
    ? getAddress(input.tokenAddress.trim())
    : NATIVE_ASSET_SENTINEL;
  const nonce = normalizeNonceBytes32(input.nonce);
  const agreementTermsHash =
    input.agreementTermsHash && /^0x[a-fA-F0-9]{64}$/.test(input.agreementTermsHash)
      ? input.agreementTermsHash.toLowerCase()
      : computeAgreementTermsHash({
          agreementId: input.agreementId,
          agreementVersion: input.agreementVersion,
          termsText: input.agreementTerms,
        });

  if (!/^\d+$/.test(input.amountAtomic) || BigInt(input.amountAtomic) <= 0n) {
    throw new Error('Canonical transaction amountAtomic must be a positive integer string.');
  }
  if (!Number.isInteger(input.chainId) || input.chainId <= 0) {
    throw new Error('Canonical transaction chainId must be a positive integer.');
  }
  if (!Number.isInteger(input.expiresAtUnix) || input.expiresAtUnix <= 0) {
    throw new Error('Canonical transaction expiresAtUnix must be a valid Unix timestamp.');
  }

  return {
    sessionId: input.sessionId.trim(),
    paymentRequestId: (input.paymentRequestId ?? '').trim(),
    agreementId: (input.agreementId ?? '').trim(),
    agreementVersion: Number(input.agreementVersion ?? 0),
    agreementTermsHash,
    senderUserId: input.senderUserId.trim(),
    senderWallet,
    recipientUserId: input.recipientUserId.trim(),
    recipientWallet,
    amountAtomic: input.amountAtomic.trim(),
    tokenAddress,
    tokenSymbol: input.tokenSymbol.trim().toUpperCase(),
    chainId: input.chainId,
    nonce,
    expiresAtUnix: input.expiresAtUnix,
  };
}

export function computeCanonicalTransactionHash(payload: CanonicalTransactionPayload): string {
  const coder = AbiCoder.defaultAbiCoder();
  const encoded = coder.encode(
    [
      'bytes32',
      'bytes32',
      'bytes32',
      'bytes32',
      'uint256',
      'bytes32',
      'bytes32',
      'address',
      'bytes32',
      'address',
      'address',
      'uint256',
      'uint256',
      'bytes32',
      'uint256',
    ],
    [
      TYPE_TAG,
      keccak256(toUtf8Bytes(payload.sessionId)),
      keccak256(toUtf8Bytes(payload.paymentRequestId)),
      keccak256(toUtf8Bytes(payload.agreementId)),
      BigInt(payload.agreementVersion),
      payload.agreementTermsHash,
      keccak256(toUtf8Bytes(payload.senderUserId)),
      payload.senderWallet,
      keccak256(toUtf8Bytes(payload.recipientUserId)),
      payload.recipientWallet,
      payload.tokenAddress,
      BigInt(payload.amountAtomic),
      BigInt(payload.chainId),
      payload.nonce,
      BigInt(payload.expiresAtUnix),
    ]
  );
  return keccak256(encoded);
}

export function getApprovalStatement(role: MutualApprovalRole): string {
  return role === 'sender' ? SENDER_APPROVAL_STATEMENT : RECIPIENT_APPROVAL_STATEMENT;
}

export function buildMutualTrustEip712Domain(
  chainId: number,
  verifyingContract: string = ZeroAddress
): TypedDataDomain {
  return {
    name: 'WordMutualTrust',
    version: '1',
    chainId,
    verifyingContract: getAddress(verifyingContract),
  };
}

export function buildApprovalTypedData(params: {
  payload: CanonicalTransactionPayload;
  canonicalHash: string;
  role: MutualApprovalRole;
  verifyingContract?: string;
}): {
  domain: TypedDataDomain;
  types: Record<string, TypedDataField[]>;
  message: MutualTrustApprovalTypedMessage;
} {
  const domain = buildMutualTrustEip712Domain(
    params.payload.chainId,
    params.verifyingContract ?? ZeroAddress
  );
  const message: MutualTrustApprovalTypedMessage = {
    canonicalHash: params.canonicalHash,
    sessionId: params.payload.sessionId,
    paymentRequestId: params.payload.paymentRequestId,
    agreementTermsHash: params.payload.agreementTermsHash,
    sender: params.payload.senderWallet,
    recipient: params.payload.recipientWallet,
    token: params.payload.tokenAddress,
    amountAtomic: params.payload.amountAtomic,
    nonce: params.payload.nonce,
    expiresAt: params.payload.expiresAtUnix,
    role: params.role,
    statement: getApprovalStatement(params.role),
  };
  return {
    domain,
    types: MUTUAL_TRUST_EIP712_TYPES,
    message,
  };
}

export function verifyApprovalTypedDataSignature(params: {
  payload: CanonicalTransactionPayload;
  canonicalHash: string;
  role: MutualApprovalRole;
  expectedWalletAddress: string;
  signature: string;
  verifyingContract?: string;
  nowUnix?: number;
}): { valid: true; recoveredAddress: string } | { valid: false; reason: string; recoveredAddress?: string } {
  const nowUnix = params.nowUnix ?? Math.floor(Date.now() / 1000);
  if (params.payload.expiresAtUnix <= nowUnix) {
    return { valid: false, reason: 'Transaction approval window has expired.' };
  }

  const recomputedHash = computeCanonicalTransactionHash(params.payload);
  if (recomputedHash.toLowerCase() !== params.canonicalHash.toLowerCase()) {
    return { valid: false, reason: 'Canonical transaction hash mismatch (details altered).' };
  }

  const { domain, types, message } = buildApprovalTypedData({
    payload: params.payload,
    canonicalHash: recomputedHash,
    role: params.role,
    verifyingContract: params.verifyingContract,
  });

  try {
    const recovered = verifyTypedData(domain, types, message, params.signature);
    if (recovered.toLowerCase() !== params.expectedWalletAddress.toLowerCase()) {
      return {
        valid: false,
        recoveredAddress: recovered,
        reason: `Signature signer (${recovered}) does not match registered ${params.role} wallet (${params.expectedWalletAddress}).`,
      };
    }
    return { valid: true, recoveredAddress: getAddress(recovered) };
  } catch {
    return { valid: false, reason: 'Invalid or malformed EIP-712 approval signature.' };
  }
}

