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
} from 'npm:ethers@6.13.4';

export const NATIVE_ASSET_SENTINEL = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

export const SENDER_APPROVAL_STATEMENT =
  "I have reviewed the recipient's verification results and agree to proceed with this transaction.";

export const RECIPIENT_APPROVAL_STATEMENT =
  "I have reviewed the sender's verification results and agree to receive this transaction.";

export type MutualApprovalRole = 'sender' | 'recipient';

export const SERVER_NETWORK_CHAIN_IDS: Record<string, number> = {
  Testnet: 11155111,
  'Base Sepolia': 84532,
  'Polygon Amoy': 80002,
};

export const SERVER_TOKEN_ADDRESSES: Record<string, Record<string, string>> = {
  Testnet: {
    USDT: '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06',
    USDC: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    ETH: NATIVE_ASSET_SENTINEL,
    WETH: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
  },
  'Base Sepolia': {
    USDC: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    ETH: NATIVE_ASSET_SENTINEL,
  },
  'Polygon Amoy': {
    USDC: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582',
    ETH: NATIVE_ASSET_SENTINEL,
  },
};

export function resolveAuthoritativeNetworkAndToken(network: string, tokenSymbol: string): {
  chainId: number;
  tokenAddress: string;
} {
  const chainId = SERVER_NETWORK_CHAIN_IDS[network];
  if (!chainId) {
    throw new Error(`Unsupported network for mutual trust canonical hash: ${network}`);
  }
  const tokenMap = SERVER_TOKEN_ADDRESSES[network];
  const tokenAddress = tokenMap?.[tokenSymbol.toUpperCase()];
  if (!tokenAddress) {
    throw new Error(`Token ${tokenSymbol} is not supported on ${network}`);
  }
  return { chainId, tokenAddress: getAddress(tokenAddress) };
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

export function buildCanonicalTransactionPayload(input: {
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
}): CanonicalTransactionPayload {
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
}) {
  const domain = buildMutualTrustEip712Domain(
    params.payload.chainId,
    params.verifyingContract ?? ZeroAddress
  );
  const message = {
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
  return { domain, types: MUTUAL_TRUST_EIP712_TYPES, message };
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
    return { valid: false, reason: 'Canonical transaction hash mismatch.' };
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

export async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  const cleanA = a.trim().toLowerCase();
  const cleanB = b.trim().toLowerCase();
  if (cleanA.length !== cleanB.length || cleanA.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < cleanA.length; i++) {
    diff |= cleanA.charCodeAt(i) ^ cleanB.charCodeAt(i);
  }
  return diff === 0;
}

