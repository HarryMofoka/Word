import { NETWORK_CONFIGS, type SupportedNetworkName, type SupportedTokenSymbol } from '../config/blockchain';

const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const SECRET_FIELD_NAMES = new Set([
  'privatekey',
  'private_key',
  'seedphrase',
  'seed_phrase',
  'mnemonic',
  'recoveryphrase',
  'recovery_phrase',
  'secretkey',
  'secret_key',
]);

export interface TransactionSigningInput {
  fromAddress: string;
  toAddress: string;
  amount: string;
  token: string;
  network: string;
  approvalAcknowledged: boolean;
  calldata?: string;
  extraPayload?: Record<string, unknown>;
}

export interface SigningPreview {
  fromAddress: string;
  destinationAddress: string;
  amount: string;
  token: string;
  network: string;
  explicitApprovalConfirmed: boolean;
}

export interface ChallengeRecord {
  id: string;
  status: string;
  expires_at: string;
  nonce: string;
  address: string;
}

export interface RpcTransactionReceipt {
  transactionHash?: string;
  status?: string;
  blockNumber?: string;
  from?: string;
  to?: string | null;
}

/**
 * Ensures no private keys, seed phrases, or mnemonics are ever included in API/DB payloads.
 */
export function assertNoSecretMaterialInPayload(payload: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(payload)) {
    if (SECRET_FIELD_NAMES.has(key.toLowerCase())) {
      throw new Error(`Security policy violation: secret field "${key}" must never be transmitted or stored.`);
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      assertNoSecretMaterialInPayload(value as Record<string, unknown>);
    }
  }
}

/**
 * Validates all transaction parameters before signing and requires explicit user approval.
 * Returns the exact destination and amount preview for user confirmation.
 */
export function validateTransactionForSigning(input: TransactionSigningInput): SigningPreview {
  if (input.extraPayload) {
    assertNoSecretMaterialInPayload(input.extraPayload);
  }

  if (!input.approvalAcknowledged) {
    throw new Error('Explicit user approval is required before signing this transaction.');
  }

  const from = input.fromAddress.trim();
  const to = input.toAddress.trim();
  if (!EVM_ADDRESS_RE.test(from)) {
    throw new Error('Sender wallet address is malformed.');
  }
  if (!EVM_ADDRESS_RE.test(to)) {
    throw new Error('Destination wallet address is malformed.');
  }
  if (to.toLowerCase() === ZERO_ADDRESS) {
    throw new Error('Destination cannot be the zero burn address.');
  }
  if (from.toLowerCase() === to.toLowerCase()) {
    throw new Error('Sender and destination addresses cannot be identical.');
  }

  const network = input.network.trim() as SupportedNetworkName;
  const networkConfig = NETWORK_CONFIGS[network];
  if (!networkConfig) {
    throw new Error(`Unsupported network for signing: ${input.network}`);
  }

  const token = input.token.trim().toUpperCase() as SupportedTokenSymbol;
  const tokenConfig = networkConfig.tokens[token];
  if (!tokenConfig) {
    throw new Error(`Unsupported token for signing: ${token}`);
  }
  const decimals = tokenConfig.decimals;

  const rawAmount = String(input.amount).trim();
  if (!/^\d+(\.\d+)?$/.test(rawAmount)) {
    throw new Error('Transaction amount must be a positive decimal number.');
  }

  const [whole, frac = ''] = rawAmount.split('.');
  if (frac.length > decimals) {
    throw new Error(`Amount exceeds ${decimals} decimal places for ${token}.`);
  }
  const numericAmount = Number(rawAmount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new Error('Transaction amount must be greater than zero.');
  }

  if (input.calldata !== undefined && input.calldata !== '' && input.calldata !== '0x') {
    if (token === 'ETH') {
      throw new Error('Unexpected calldata on native ETH transfer request.');
    }
    if (!/^0xa9059cbb[a-fA-F0-9]{128}$/.test(input.calldata)) {
      throw new Error('Malformed or unauthorized ERC-20 transfer calldata.');
    }
  }

  return {
    fromAddress: from,
    destinationAddress: to,
    amount: `${whole}${frac ? `.${frac}` : ''}`,
    token,
    network,
    explicitApprovalConfirmed: true,
  };
}

/**
 * Protects against replayed, expired, or malformed wallet verification challenges.
 */
export function verifyChallengeReplayGuard(
  challenge: ChallengeRecord,
  signature: string,
  nowMs = Date.now()
): { valid: true } {
  if (challenge.status !== 'pending') {
    throw new Error(`Challenge replay blocked: status is already "${challenge.status}".`);
  }
  if (!challenge.nonce || challenge.nonce.trim().length < 8) {
    throw new Error('Invalid challenge nonce.');
  }
  const expiresMs = new Date(challenge.expires_at).getTime();
  if (!Number.isFinite(expiresMs) || expiresMs <= nowMs) {
    throw new Error('Wallet verification challenge has expired.');
  }
  const cleanSig = signature.trim();
  if (!/^0x[a-fA-F0-9]{130}$/.test(cleanSig)) {
    throw new Error('Malformed ECDSA signature format.');
  }
  return { valid: true };
}

/**
 * Independently verifies a JSON-RPC eth_getTransactionReceipt response against expected tx details.
 */
export function verifyIndependentReceiptResponse(
  rpcReceipt: RpcTransactionReceipt | null,
  expected: { txHash: string; senderAddress?: string | null }
): { verified: boolean; status: 'confirmed' | 'failed' | 'pending'; reason: string } {
  if (!rpcReceipt) {
    return {
      verified: false,
      status: 'pending',
      reason: 'Transaction receipt not yet mined on-chain.',
    };
  }

  if (
    !rpcReceipt.transactionHash ||
    rpcReceipt.transactionHash.toLowerCase() !== expected.txHash.toLowerCase()
  ) {
    throw new Error('Independent RPC receipt transactionHash mismatch.');
  }

  if (
    expected.senderAddress &&
    rpcReceipt.from &&
    rpcReceipt.from.toLowerCase() !== expected.senderAddress.toLowerCase()
  ) {
    throw new Error('Independent RPC receipt sender address mismatch.');
  }

  if (!rpcReceipt.blockNumber) {
    return {
      verified: false,
      status: 'pending',
      reason: 'Transaction has no confirmed block number yet.',
    };
  }

  if (rpcReceipt.status === '0x0') {
    return {
      verified: false,
      status: 'failed',
      reason: 'On-chain transaction execution reverted (status 0x0).',
    };
  }

  if (rpcReceipt.status === '0x1') {
    return {
      verified: true,
      status: 'confirmed',
      reason: 'On-chain receipt independently confirmed (status 0x1).',
    };
  }

  return {
    verified: false,
    status: 'pending',
    reason: 'Unrecognized on-chain receipt status.',
  };
}
