import { isAddress } from 'ethers';
import { getNetworkConfig } from '../config/blockchain';

export type BlockchainConfirmationStatus = 'pending' | 'confirming' | 'confirmed' | 'failed';

export interface RecordAgreementReference {
  agreementId: string;
  version: number;
  status: string;
  acceptedAt: string | null;
}

export interface RecordVerificationResult {
  status: 'verified' | 'mismatch' | 'unverified';
  verifiedAt: string | null;
  identityNote: string;
}

export interface RecordRiskSummary {
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  classificationLabel: string;
  summary: string;
  assessedAt: string;
}

export interface TransactionRecordEvent {
  id: string;
  type:
    | 'request_created'
    | 'agreement_accepted'
    | 'recipient_verified'
    | 'risk_assessed'
    | 'tx_submitted'
    | 'tx_confirmed'
    | 'tx_failed'
    | 'dispute_opened';
  title: string;
  detail: string;
  timestamp: string;
}

export interface TransactionRecordDocument {
  recordId: string;
  generatedAt: string;
  senderUserId?: string | null;
  recipientUserId?: string | null;
  senderAddress: string;
  recipientName: string;
  recipientAddress: string;
  amount: string;
  tokenSymbol: string;
  network: string;
  txHash: string | null;
  explorerUrl: string | null;
  confirmationStatus: BlockchainConfirmationStatus;
  confirmationsCount: number;
  purpose: string;
  agreementReference: RecordAgreementReference | null;
  verificationResult: RecordVerificationResult;
  riskAssessment: RecordRiskSummary;
  disputeStatus: string | null;
  eventHistory: TransactionRecordEvent[];
}

export interface GenerateTransactionRecordInput {
  recordId: string;
  senderUserId?: string | null;
  recipientUserId?: string | null;
  senderAddress: string;
  recipientName: string;
  recipientAddress: string;
  amount: string;
  tokenSymbol: string;
  network: string;
  txHash?: string | null;
  confirmationStatus: BlockchainConfirmationStatus;
  confirmationsCount?: number;
  purpose: string;
  agreementReference?: RecordAgreementReference | null;
  verificationResult?: RecordVerificationResult;
  riskAssessment?: RecordRiskSummary;
  disputeStatus?: string | null;
  eventHistory?: TransactionRecordEvent[];
  nowIso?: string;
}

export function generateTransactionRecord(
  input: GenerateTransactionRecordInput
): TransactionRecordDocument {
  if (!input.recordId.trim()) {
    throw new Error('Record ID is required to generate a transaction record.');
  }
  if (!isAddress(input.senderAddress)) {
    throw new Error('Valid sender wallet address is required.');
  }
  if (!isAddress(input.recipientAddress)) {
    throw new Error('Valid recipient wallet address is required.');
  }
  const numAmount = Number(input.amount);
  if (!Number.isFinite(numAmount) || numAmount <= 0) {
    throw new Error('Valid positive amount is required.');
  }

  const nowIso = input.nowIso ?? new Date().toISOString();
  const txHash = input.txHash?.trim() || null;
  const explorerBase = getNetworkConfig(input.network).explorerUrl;
  const explorerUrl = txHash ? `${explorerBase}/tx/${txHash}` : null;

  const verificationResult: RecordVerificationResult = input.verificationResult ?? {
    status: 'unverified',
    verifiedAt: null,
    identityNote: 'Cryptographic wallet control does not establish real-world identity.',
  };

  const riskAssessment: RecordRiskSummary = input.riskAssessment ?? {
    riskScore: 0,
    riskLevel: 'low',
    classificationLabel: 'Low',
    summary: 'Low: No significant issues detected.',
    assessedAt: nowIso,
  };

  const defaultEvents: TransactionRecordEvent[] = [
    {
      id: `evt-req-${input.recordId}`,
      type: 'request_created',
      title: 'Payment details recorded',
      detail: `${input.amount} ${input.tokenSymbol.toUpperCase()} for "${input.purpose}"`,
      timestamp: nowIso,
    },
  ];

  if (input.agreementReference) {
    defaultEvents.push({
      id: `evt-agr-${input.agreementReference.agreementId}`,
      type: 'agreement_accepted',
      title: `Agreement ${input.agreementReference.status}`,
      detail: `Ref ${input.agreementReference.agreementId} (v${input.agreementReference.version})`,
      timestamp: input.agreementReference.acceptedAt ?? nowIso,
    });
  }

  defaultEvents.push({
    id: `evt-ver-${input.recordId}`,
    type: 'recipient_verified',
    title: `Recipient verification: ${verificationResult.status}`,
    detail: verificationResult.identityNote,
    timestamp: verificationResult.verifiedAt ?? nowIso,
  });

  defaultEvents.push({
    id: `evt-risk-${input.recordId}`,
    type: 'risk_assessed',
    title: `Risk assessment: ${riskAssessment.classificationLabel} (${riskAssessment.riskScore}/100)`,
    detail: riskAssessment.summary,
    timestamp: riskAssessment.assessedAt,
  });

  if (txHash) {
    defaultEvents.push({
      id: `evt-sub-${input.recordId}`,
      type: 'tx_submitted',
      title: 'Transaction submitted',
      detail: `Hash ${txHash} on ${input.network}`,
      timestamp: nowIso,
    });
  }

  if (input.confirmationStatus === 'confirmed' || input.confirmationStatus === 'failed') {
    defaultEvents.push({
      id: `evt-settle-${input.recordId}`,
      type: input.confirmationStatus === 'confirmed' ? 'tx_confirmed' : 'tx_failed',
      title:
        input.confirmationStatus === 'confirmed'
          ? 'Blockchain settlement confirmed'
          : 'Blockchain transaction failed',
      detail: `${input.confirmationsCount ?? (input.confirmationStatus === 'confirmed' ? 1 : 0)} confirmation(s)`,
      timestamp: nowIso,
    });
  }

  const eventHistory = (input.eventHistory ?? defaultEvents)
    .slice()
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

  return {
    recordId: input.recordId.trim(),
    generatedAt: nowIso,
    senderUserId: input.senderUserId ?? null,
    recipientUserId: input.recipientUserId ?? null,
    senderAddress: input.senderAddress.trim(),
    recipientName: input.recipientName.trim() || 'Recipient',
    recipientAddress: input.recipientAddress.trim(),
    amount: input.amount.trim(),
    tokenSymbol: input.tokenSymbol.trim().toUpperCase(),
    network: input.network.trim(),
    txHash,
    explorerUrl,
    confirmationStatus: input.confirmationStatus,
    confirmationsCount: input.confirmationsCount ?? (input.confirmationStatus === 'confirmed' ? 1 : 0),
    purpose: input.purpose.trim(),
    agreementReference: input.agreementReference ?? null,
    verificationResult,
    riskAssessment,
    disputeStatus: input.disputeStatus ?? null,
    eventHistory,
  };
}

export function canPartyAccessRecord(
  record: TransactionRecordDocument,
  actor: { userId?: string | null; walletAddress?: string | null }
): boolean {
  if (actor.userId) {
    if (record.senderUserId === actor.userId || record.recipientUserId === actor.userId) {
      return true;
    }
  }
  if (actor.walletAddress) {
    const addr = actor.walletAddress.trim().toLowerCase();
    if (
      record.senderAddress.toLowerCase() === addr ||
      record.recipientAddress.toLowerCase() === addr
    ) {
      return true;
    }
  }
  return false;
}

export function appendRecordEvent(
  record: TransactionRecordDocument,
  event: TransactionRecordEvent
): TransactionRecordDocument {
  const next = [...record.eventHistory, event].sort(
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)
  );
  return {
    ...record,
    eventHistory: next,
  };
}

export function buildRecordShareLink(record: TransactionRecordDocument, origin = 'https://word.app'): string {
  return `${origin.replace(/\/$/, '')}/record/${encodeURIComponent(record.recordId)}`;
}

export function exportTransactionRecordAsJson(record: TransactionRecordDocument): string {
  return JSON.stringify(record, null, 2);
}

function escapeCsv(val: string): string {
  if (/[",\n]/.test(val)) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export function exportTransactionRecordAsCsv(record: TransactionRecordDocument): string {
  const headers = [
    'recordId',
    'senderAddress',
    'recipientName',
    'recipientAddress',
    'amount',
    'tokenSymbol',
    'network',
    'txHash',
    'confirmationStatus',
    'purpose',
    'agreementId',
    'verificationStatus',
    'riskScore',
    'riskLevel',
    'disputeStatus',
    'generatedAt',
  ];
  const values = [
    record.recordId,
    record.senderAddress,
    record.recipientName,
    record.recipientAddress,
    record.amount,
    record.tokenSymbol,
    record.network,
    record.txHash ?? '',
    record.confirmationStatus,
    record.purpose,
    record.agreementReference?.agreementId ?? '',
    record.verificationResult.status,
    String(record.riskAssessment.riskScore),
    record.riskAssessment.riskLevel,
    record.disputeStatus ?? 'None',
    record.generatedAt,
  ];
  return `${headers.join(',')}\n${values.map(escapeCsv).join(',')}`;
}

