import { isAddress } from 'ethers';
import {
  NETWORK_CONFIGS,
  isSupportedNetworkName,
  validateTokenCompatibility,
} from '../config/blockchain';

export type RiskCategory =
  | 'wallet_verification'
  | 'request_integrity'
  | 'duplicate_activity'
  | 'amount_anomaly'
  | 'network_compatibility'
  | 'token_contract'
  | 'behavioral_context';

export type RiskSeverity = 'low' | 'medium' | 'high' | 'critical';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type RiskClassificationLabel = 'Low' | 'Moderate' | 'High' | 'Critical';
export type RiskIndicatorType = 'confirmed_mismatch' | 'suspicious_indicator' | 'verified_signal';
export type PaymentDetailField =
  | 'recipient_address'
  | 'wallet_signature'
  | 'payment_request'
  | 'duplicate_history'
  | 'amount'
  | 'network'
  | 'token_contract'
  | 'payment_purpose'
  | 'counterparty_history';

export const RISK_CLASSIFICATION_MEANINGS: Record<RiskLevel, { label: RiskClassificationLabel; meaning: string }> = {
  low: {
    label: 'Low',
    meaning: 'No significant issues detected',
  },
  medium: {
    label: 'Moderate',
    meaning: 'Some details require attention',
  },
  high: {
    label: 'High',
    meaning: 'Significant warning signs detected',
  },
  critical: {
    label: 'Critical',
    meaning: 'A serious issue requires stopping and investigating',
  },
};

export const RISK_CATEGORY_WEIGHTS: Record<RiskCategory, number> = {
  wallet_verification: 25,
  request_integrity: 20,
  duplicate_activity: 15,
  amount_anomaly: 15,
  network_compatibility: 10,
  token_contract: 10,
  behavioral_context: 5,
};

export interface RiskFinding {
  code: string;
  category: RiskCategory;
  label: string;
  weight: number;
  pointsAwarded: number;
  severity: RiskSeverity;
  indicatorType: RiskIndicatorType;
  triggeredBy: PaymentDetailField;
  triggeredValue?: string;
  detail: string;
  whyItMatters: string;
  recommendedAction: string;
}

export interface RiskIntelligenceInput {
  recipientAddress: string;
  recipientName?: string;
  amount: string;
  tokenSymbol: string;
  network: string;
  walletNetwork?: string;
  tokenContractAddress?: string | null;
  purpose?: string;
  walletControlStatus?: 'verified' | 'mismatch' | 'unverified';
  isAlteredRequest?: boolean;
  isExpiredRequest?: boolean;
  isDuplicateAttempt?: boolean;
  hasSuspiciousInteractions?: boolean;
  priorDisputeCount?: number;
  historicalAverageAmount?: number | null;
  /** Informational only: never treated as proof of legitimacy. */
  walletAgeDays?: number | null;
  /** Informational only: never treated as proof of legitimacy. */
  walletTransactionCount?: number | null;
}

export interface RiskIntelligenceReport {
  riskScore: number;
  riskLevel: RiskLevel;
  classificationLabel: RiskClassificationLabel;
  classificationMeaning: string;
  summary: string;
  safetyDisclaimer: string;
  assessedAt: string;
  categoryBreakdown: Record<RiskCategory, number>;
  findings: RiskFinding[];
}

export function evaluatePaymentRisk(input: RiskIntelligenceInput): RiskIntelligenceReport {
  const findings: RiskFinding[] = [];
  const categoryBreakdown: Record<RiskCategory, number> = {
    wallet_verification: 0,
    request_integrity: 0,
    duplicate_activity: 0,
    amount_anomaly: 0,
    network_compatibility: 0,
    token_contract: 0,
    behavioral_context: 0,
  };

  const addFinding = (f: RiskFinding) => {
    findings.push(f);
    categoryBreakdown[f.category] = Math.min(
      RISK_CATEGORY_WEIGHTS[f.category],
      categoryBreakdown[f.category] + f.pointsAwarded
    );
  };

  const addr = input.recipientAddress.trim();
  const net = input.network.trim() === 'Testnet (Sepolia)' ? 'Testnet' : input.network.trim();
  const token = input.tokenSymbol.trim().toUpperCase();

  // 1. Wallet Verification (weight: 25)
  if (!isAddress(addr)) {
    addFinding({
      code: 'INVALID_RECIPIENT_ADDRESS',
      category: 'wallet_verification',
      label: 'Invalid recipient wallet format',
      weight: RISK_CATEGORY_WEIGHTS.wallet_verification,
      pointsAwarded: 25,
      severity: 'critical',
      indicatorType: 'confirmed_mismatch',
      triggeredBy: 'recipient_address',
      triggeredValue: addr || '(empty)',
      detail: `Address "${addr}" is not a valid EVM hex/checksummed address.`,
      whyItMatters:
        'Sending tokens to a malformed address will fail or permanently lose funds.',
      recommendedAction:
        'Stop and obtain a valid 42-character EVM address (0x...) directly from the recipient.',
    });
  } else if (/^0x0{6,}/i.test(addr) || addr.toLowerCase().includes('dead')) {
    addFinding({
      code: 'SUSPICIOUS_BURN_ADDRESS',
      category: 'wallet_verification',
      label: 'Burn or null-like address pattern',
      weight: RISK_CATEGORY_WEIGHTS.wallet_verification,
      pointsAwarded: 25,
      severity: 'critical',
      indicatorType: 'suspicious_indicator',
      triggeredBy: 'recipient_address',
      triggeredValue: addr,
      detail: `Address ${addr} matches a known null/burn address pattern.`,
      whyItMatters:
        'Funds sent to a burn or zero-prefixed address are typically unrecoverable.',
      recommendedAction:
        'Do not send funds until the recipient provides a verified active wallet address.',
    });
  } else if (input.walletControlStatus === 'mismatch') {
    addFinding({
      code: 'ADDRESS_MISMATCH',
      category: 'wallet_verification',
      label: 'Mismatched recipient wallet signature',
      weight: RISK_CATEGORY_WEIGHTS.wallet_verification,
      pointsAwarded: 25,
      severity: 'critical',
      indicatorType: 'confirmed_mismatch',
      triggeredBy: 'wallet_signature',
      triggeredValue: addr,
      detail: 'The cryptographic signature does not match the destination address in this request.',
      whyItMatters:
        'Address substitution is a common phishing and man-in-the-middle attack vector.',
      recommendedAction:
        'Stop immediately and confirm the destination address with the recipient over a trusted out-of-band channel.',
    });
  } else if (input.walletControlStatus === 'verified') {
    addFinding({
      code: 'RECIPIENT_VERIFIED',
      category: 'wallet_verification',
      label: 'Recipient wallet control verified',
      weight: RISK_CATEGORY_WEIGHTS.wallet_verification,
      pointsAwarded: 0,
      severity: 'low',
      indicatorType: 'verified_signal',
      triggeredBy: 'wallet_signature',
      triggeredValue: addr,
      detail: 'Recipient proved cryptographic control of this address via signed challenge.',
      whyItMatters:
        'Confirms the requester controls the destination key (though not real-world identity or trustworthiness).',
      recommendedAction:
        'Confirm you still trust the counterparty and the agreed delivery terms before approving.',
    });
  } else {
    addFinding({
      code: 'UNVERIFIED_EXTERNAL_ADDRESS',
      category: 'wallet_verification',
      label: 'Unverified recipient wallet control',
      weight: RISK_CATEGORY_WEIGHTS.wallet_verification,
      pointsAwarded: 14,
      severity: 'medium',
      indicatorType: 'suspicious_indicator',
      triggeredBy: 'wallet_signature',
      triggeredValue: addr,
      detail:
        'No cryptographic wallet-control signature is attached to this payment request. An unknown or unverified wallet is not proof of malicious intent, but ownership is unconfirmed.',
      whyItMatters:
        'Without a signed control proof, an attacker or typo could redirect your payment to an unintended destination.',
      recommendedAction:
        'Ask the recipient to complete wallet-control verification or confirm the full address directly before sending.',
    });
  }

  // 2. Request Integrity (weight: 20)
  if (input.isAlteredRequest) {
    addFinding({
      code: 'ALTERED_PAYMENT_REQUEST',
      category: 'request_integrity',
      label: 'Altered payment request detected',
      weight: RISK_CATEGORY_WEIGHTS.request_integrity,
      pointsAwarded: 20,
      severity: 'critical',
      indicatorType: 'confirmed_mismatch',
      triggeredBy: 'payment_request',
      detail: 'One or more fields (amount, destination, token, or network) differ from the stored request.',
      whyItMatters:
        'Tampered QR codes or links can redirect funds or inflate the payment amount.',
      recommendedAction:
        'Reject this link or QR code and request a fresh, unaltered payment request from the sender.',
    });
  } else if (input.isExpiredRequest) {
    addFinding({
      code: 'EXPIRED_PAYMENT_REQUEST',
      category: 'request_integrity',
      label: 'Expired payment request',
      weight: RISK_CATEGORY_WEIGHTS.request_integrity,
      pointsAwarded: 18,
      severity: 'high',
      indicatorType: 'confirmed_mismatch',
      triggeredBy: 'payment_request',
      detail: 'This payment request has passed its configured expiry timestamp.',
      whyItMatters:
        'Paying an expired request may violate agreed delivery terms or go to a stale address.',
      recommendedAction:
        'Do not pay an expired request; ask the recipient to issue a new active payment request.',
    });
  } else {
    addFinding({
      code: 'REQUEST_INTEGRITY_INTACT',
      category: 'request_integrity',
      label: 'Payment request integrity intact',
      weight: RISK_CATEGORY_WEIGHTS.request_integrity,
      pointsAwarded: 0,
      severity: 'low',
      indicatorType: 'verified_signal',
      triggeredBy: 'payment_request',
      detail: 'Request fields match the authoritative record and have not expired.',
      whyItMatters:
        'Ensures the terms you review match what the requester originally issued.',
      recommendedAction:
        'Verify the amount, token, and recipient still match your expectations.',
    });
  }

  // 3. Duplicate Activity (weight: 15)
  if (input.isDuplicateAttempt) {
    addFinding({
      code: 'DUPLICATE_PAYMENT_ATTEMPT',
      category: 'duplicate_activity',
      label: 'Duplicate payment attempt detected',
      weight: RISK_CATEGORY_WEIGHTS.duplicate_activity,
      pointsAwarded: 15,
      severity: 'high',
      indicatorType: 'confirmed_mismatch',
      triggeredBy: 'duplicate_history',
      detail: 'A pending, processing, or confirmed payment already exists for this request or matching parameters.',
      whyItMatters:
        'Submitting twice can result in accidental double-spending of your tokens.',
      recommendedAction:
        'Check your transaction history and wait for the existing payment to settle instead of submitting again.',
    });
  }

  // 4. Amount Anomaly (weight: 15)
  const numericAmount = Number(input.amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    addFinding({
      code: 'INVALID_AMOUNT_VALUE',
      category: 'amount_anomaly',
      label: 'Invalid transaction amount',
      weight: RISK_CATEGORY_WEIGHTS.amount_anomaly,
      pointsAwarded: 15,
      severity: 'high',
      indicatorType: 'confirmed_mismatch',
      triggeredBy: 'amount',
      triggeredValue: `${input.amount} ${token}`,
      detail: `Amount "${input.amount}" is not a valid positive number.`,
      whyItMatters: 'Malformed amounts cannot be safely quoted or settled on-chain.',
      recommendedAction: 'Correct the payment amount to a valid positive number before proceeding.',
    });
  } else if (numericAmount >= 10000) {
    addFinding({
      code: 'VERY_HIGH_VALUE_TRANSFER',
      category: 'amount_anomaly',
      label: 'Unusually large transfer amount',
      weight: RISK_CATEGORY_WEIGHTS.amount_anomaly,
      pointsAwarded: 15,
      severity: 'high',
      indicatorType: 'suspicious_indicator',
      triggeredBy: 'amount',
      triggeredValue: `${input.amount} ${token}`,
      detail: `Amount (${input.amount} ${token}) is far above typical P2P transaction sizes.`,
      whyItMatters:
        'On-chain transfers are irreversible; large transfers merit extra verification.',
      recommendedAction:
        'Double-check every digit of the amount and consider sending a small test transfer first.',
    });
  } else if (
    input.historicalAverageAmount &&
    input.historicalAverageAmount > 0 &&
    numericAmount >= input.historicalAverageAmount * 5
  ) {
    addFinding({
      code: 'OUTLIER_TRANSFER_AMOUNT',
      category: 'amount_anomaly',
      label: 'Amount significantly above your usual average',
      weight: RISK_CATEGORY_WEIGHTS.amount_anomaly,
      pointsAwarded: 12,
      severity: 'medium',
      indicatorType: 'suspicious_indicator',
      triggeredBy: 'amount',
      triggeredValue: `${input.amount} ${token}`,
      detail: `${input.amount} ${token} is more than 5x your recent average (${input.historicalAverageAmount.toFixed(2)}).`,
      whyItMatters:
        'Sudden spikes in payment size can indicate a mistyped decimal or social engineering.',
      recommendedAction:
        'Confirm the decimal placement and verify the invoice amount with the recipient.',
    });
  } else if (numericAmount >= 1000) {
    addFinding({
      code: 'HIGH_VALUE_TRANSFER',
      category: 'amount_anomaly',
      label: 'Elevated transfer value',
      weight: RISK_CATEGORY_WEIGHTS.amount_anomaly,
      pointsAwarded: 8,
      severity: 'medium',
      indicatorType: 'suspicious_indicator',
      triggeredBy: 'amount',
      triggeredValue: `${input.amount} ${token}`,
      detail: `Amount (${input.amount} ${token}) exceeds standard small-payment threshold (1,000).`,
      whyItMatters: 'Verify recipient identity and terms carefully for high-value transfers.',
      recommendedAction:
        'Review the recipient details and payment terms carefully before signing.',
    });
  } else if (numericAmount < 0.01) {
    addFinding({
      code: 'DUST_TRANSFER_AMOUNT',
      category: 'amount_anomaly',
      label: 'Unusually small micro-transfer',
      weight: RISK_CATEGORY_WEIGHTS.amount_anomaly,
      pointsAwarded: 6,
      severity: 'low',
      indicatorType: 'suspicious_indicator',
      triggeredBy: 'amount',
      triggeredValue: `${input.amount} ${token}`,
      detail: `Amount (${input.amount} ${token}) is under 0.01 and may be disproportionate to gas fees.`,
      whyItMatters: 'Dust-sized transfers can sometimes be used in address-poisoning probes.',
      recommendedAction:
        'Confirm you intended a micro-transfer and that the destination address was not copied from a dust transaction.',
    });
  }

  // 5. Network Compatibility (weight: 10)
  if (!isSupportedNetworkName(net)) {
    addFinding({
      code: 'UNSUPPORTED_NETWORK',
      category: 'network_compatibility',
      label: 'Unsupported blockchain network',
      weight: RISK_CATEGORY_WEIGHTS.network_compatibility,
      pointsAwarded: 10,
      severity: 'high',
      indicatorType: 'confirmed_mismatch',
      triggeredBy: 'network',
      triggeredValue: net,
      detail: `Network "${net}" is not in Word's supported testnet configurations.`,
      whyItMatters:
        'Sending assets on an unconfigured or mismatched chain can cause permanent loss.',
      recommendedAction:
        'Switch to a supported network (Sepolia, Base Sepolia, or Polygon Amoy) before continuing.',
    });
  } else if (input.walletNetwork && input.walletNetwork !== net) {
    addFinding({
      code: 'NETWORK_MISMATCH',
      category: 'network_compatibility',
      label: 'Wallet and request network mismatch',
      weight: RISK_CATEGORY_WEIGHTS.network_compatibility,
      pointsAwarded: 8,
      severity: 'medium',
      indicatorType: 'confirmed_mismatch',
      triggeredBy: 'network',
      triggeredValue: `${input.walletNetwork} vs ${net}`,
      detail: `Your active wallet is on ${input.walletNetwork}, while the request specifies ${net}.`,
      whyItMatters:
        'Tokens on different chains are not interchangeable; ensure your wallet switches to the target network.',
      recommendedAction:
        `Switch your active wallet network to ${net} or confirm the intended chain with the recipient.`,
    });
  }

  // 6. Token Contract Verification (weight: 10)
  const tokenCheck = validateTokenCompatibility(token, net);
  if (!tokenCheck.compatible || !tokenCheck.config) {
    addFinding({
      code: 'UNSUPPORTED_TOKEN_ON_NETWORK',
      category: 'token_contract',
      label: 'Token not supported on selected network',
      weight: RISK_CATEGORY_WEIGHTS.token_contract,
      pointsAwarded: 10,
      severity: 'high',
      indicatorType: 'confirmed_mismatch',
      triggeredBy: 'token_contract',
      triggeredValue: `${token} on ${net}`,
      detail: tokenCheck.reason ?? `${token} is not configured on ${net}.`,
      whyItMatters:
        'Attempting to send an unconfigured token contract risks interacting with a spoofed asset.',
      recommendedAction:
        'Select a supported token for this network or ask the recipient for a compatible payment request.',
    });
  } else if (
    input.tokenContractAddress &&
    tokenCheck.config.contractAddress &&
    input.tokenContractAddress.toLowerCase() !== tokenCheck.config.contractAddress.toLowerCase()
  ) {
    addFinding({
      code: 'SUSPICIOUS_TOKEN_CONTRACT',
      category: 'token_contract',
      label: 'Suspicious or non-canonical token contract',
      weight: RISK_CATEGORY_WEIGHTS.token_contract,
      pointsAwarded: 10,
      severity: 'critical',
      indicatorType: 'confirmed_mismatch',
      triggeredBy: 'token_contract',
      triggeredValue: input.tokenContractAddress,
      detail: `Contract ${input.tokenContractAddress} does not match the official ${token} contract (${tokenCheck.config.contractAddress}) on ${isSupportedNetworkName(net) ? NETWORK_CONFIGS[net].label : net}.`,
      whyItMatters:
        'Fake stablecoin contracts mimic USDT/USDC symbols to deceive payers.',
      recommendedAction:
        'Stop and do not interact with this token contract; use only the canonical contract address.',
    });
  }

  // 7. Behavioral Context & Suspicious Wallet Interactions (weight: 5 + dispute escalation)
  if (input.hasSuspiciousInteractions || (input.priorDisputeCount ?? 0) > 0) {
    const disputes = input.priorDisputeCount ?? 1;
    addFinding({
      code: 'SUSPICIOUS_WALLET_INTERACTIONS',
      category: 'behavioral_context',
      label: 'Prior disputes or suspicious wallet interactions',
      weight: RISK_CATEGORY_WEIGHTS.behavioral_context,
      pointsAwarded: 5,
      severity: disputes >= 3 ? 'high' : 'medium',
      indicatorType: 'suspicious_indicator',
      triggeredBy: 'counterparty_history',
      triggeredValue: `${disputes} dispute/flag(s)`,
      detail: `Recipient address is associated with ${disputes} open or prior dispute/flagged interaction(s).`,
      whyItMatters:
        'Addresses linked to unresolved disputes carry elevated counterparty risk.',
      recommendedAction:
        'Review the dispute context and consider using an escrow or smaller milestone payment.',
    });
  } else if (!input.purpose || input.purpose.trim().length < 4) {
    addFinding({
      code: 'INCONSISTENT_PAYMENT_INFO',
      category: 'behavioral_context',
      label: 'Missing or vague payment purpose',
      weight: RISK_CATEGORY_WEIGHTS.behavioral_context,
      pointsAwarded: 4,
      severity: 'low',
      indicatorType: 'suspicious_indicator',
      triggeredBy: 'payment_purpose',
      triggeredValue: input.purpose?.trim() || '(empty)',
      detail: 'Payment purpose is missing or too brief to document what is being purchased.',
      whyItMatters:
        'Clear payment descriptions protect both parties if a dispute arises later.',
      recommendedAction:
        'Add or request a clear description of the goods or services before approving.',
    });
  }

  // Note: walletAgeDays and walletTransactionCount are intentionally NOT used to lower risk scores
  // because older wallets or high transaction volume do not prove legitimacy.
  const rawScore = Object.values(categoryBreakdown).reduce((sum, v) => sum + v, 0);
  const riskScore = Math.min(100, Math.max(0, rawScore));
  const riskLevel: RiskLevel =
    riskScore >= 75
      ? 'critical'
      : riskScore >= 50
        ? 'high'
        : riskScore >= 25
          ? 'medium'
          : 'low';

  const { label: classificationLabel, meaning: classificationMeaning } =
    RISK_CLASSIFICATION_MEANINGS[riskLevel];

  const safetyDisclaimer =
    'A low risk score does not guarantee a transaction is safe or that the counterparty is trustworthy. Wallet age, transaction volume, and cryptographic control do not establish real-world identity or legitimacy.';

  const summary =
    riskLevel === 'critical'
      ? `${classificationLabel}: ${classificationMeaning}. Resolve every flagged issue before proceeding.`
      : riskLevel === 'high'
        ? `${classificationLabel}: ${classificationMeaning}. Review each warning and verify the recipient before approving.`
        : riskLevel === 'medium'
          ? `${classificationLabel}: ${classificationMeaning}. Verify unconfirmed details directly with the recipient.`
          : `${classificationLabel}: ${classificationMeaning}. Note that low risk does not guarantee safety—always verify you trust the recipient.`;

  return {
    riskScore,
    riskLevel,
    classificationLabel,
    classificationMeaning,
    summary,
    safetyDisclaimer,
    assessedAt: new Date().toISOString(),
    categoryBreakdown,
    findings,
  };
}
