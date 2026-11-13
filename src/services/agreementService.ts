import { isAddress } from 'ethers';
import { isSupportedNetworkName, validateTokenCompatibility } from '../config/blockchain';

export type AgreementPartyRole = 'creator' | 'counterparty';
export type AgreementStatus = 'proposed' | 'pending_acceptance' | 'accepted' | 'disputed';

export interface AgreementVersionSnapshot {
  versionNumber: number;
  title: string;
  purpose: string;
  agreedAmount: string;
  tokenSymbol: string;
  network: string;
  recipientName: string;
  recipientAddress: string;
  termsText: string;
  editedBy: AgreementPartyRole;
  changeNote: string;
  createdAt: string;
}

export interface PaymentAgreement {
  id: string;
  paymentRequestId: string;
  title: string;
  purpose: string;
  agreedAmount: string;
  tokenSymbol: string;
  network: string;
  recipientName: string;
  recipientAddress: string;
  termsText: string;
  creatorId: string;
  counterpartyId: string | null;
  creatorAcceptedAt: string | null;
  counterpartyAcceptedAt: string | null;
  lockedAt: string | null;
  status: AgreementStatus;
  currentVersion: number;
  versions: AgreementVersionSnapshot[];
  createdAt: string;
  updatedAt: string;
}

export class AgreementLockedError extends Error {
  constructor(message = 'Accepted payment agreements are locked and cannot be modified.') {
    super(message);
    this.name = 'AgreementLockedError';
  }
}

export interface CreateAgreementInput {
  id?: string;
  paymentRequestId: string;
  title: string;
  purpose: string;
  agreedAmount: string;
  tokenSymbol: string;
  network: string;
  recipientName: string;
  recipientAddress: string;
  termsText: string;
  creatorId: string;
  counterpartyId?: string | null;
  creatorAcceptsOnCreate?: boolean;
  nowIso?: string;
}

function validateAgreementFields(input: {
  paymentRequestId: string;
  title: string;
  purpose: string;
  agreedAmount: string;
  tokenSymbol: string;
  network: string;
  recipientName: string;
  recipientAddress: string;
  termsText: string;
}) {
  if (!input.paymentRequestId.trim()) {
    throw new Error('Agreement must be linked to a payment request.');
  }
  if (input.title.trim().length < 2) {
    throw new Error('Agreement title must be at least 2 characters.');
  }
  if (input.purpose.trim().length < 3) {
    throw new Error('Payment purpose must be at least 3 characters.');
  }
  const num = Number(input.agreedAmount);
  if (!Number.isFinite(num) || num <= 0) {
    throw new Error('Agreed amount must be a positive number.');
  }
  const network = input.network.trim();
  const tokenSymbol = input.tokenSymbol.trim().toUpperCase();
  if (!isSupportedNetworkName(network)) {
    throw new Error(`Unsupported agreement network: ${network}`);
  }
  const compat = validateTokenCompatibility(tokenSymbol, network);
  if (!compat.compatible) {
    throw new Error(compat.reason ?? 'Token is not compatible with selected network.');
  }
  if (!input.recipientName.trim()) {
    throw new Error('Recipient name is required.');
  }
  if (!isAddress(input.recipientAddress)) {
    throw new Error('Recipient wallet address is invalid.');
  }
  if (input.termsText.trim().length < 4) {
    throw new Error('Agreement terms must be at least 4 characters.');
  }
}

export function createAgreementRecord(input: CreateAgreementInput): PaymentAgreement {
  validateAgreementFields(input);
  const nowIso = input.nowIso ?? new Date().toISOString();
  const creatorAcceptedAt = input.creatorAcceptsOnCreate === false ? null : nowIso;

  const v1: AgreementVersionSnapshot = {
    versionNumber: 1,
    title: input.title.trim(),
    purpose: input.purpose.trim(),
    agreedAmount: input.agreedAmount.trim(),
    tokenSymbol: input.tokenSymbol.trim().toUpperCase(),
    network: input.network.trim(),
    recipientName: input.recipientName.trim(),
    recipientAddress: input.recipientAddress.trim(),
    termsText: input.termsText.trim(),
    editedBy: 'creator',
    changeNote: 'Initial agreement proposal',
    createdAt: nowIso,
  };

  return {
    id: input.id ?? `agr-${Date.now()}`,
    paymentRequestId: input.paymentRequestId.trim(),
    title: v1.title,
    purpose: v1.purpose,
    agreedAmount: v1.agreedAmount,
    tokenSymbol: v1.tokenSymbol,
    network: v1.network,
    recipientName: v1.recipientName,
    recipientAddress: v1.recipientAddress,
    termsText: v1.termsText,
    creatorId: input.creatorId,
    counterpartyId: input.counterpartyId ?? null,
    creatorAcceptedAt,
    counterpartyAcceptedAt: null,
    lockedAt: null,
    status: creatorAcceptedAt ? 'pending_acceptance' : 'proposed',
    currentVersion: 1,
    versions: [v1],
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export function acceptAgreementByParty(
  agreement: PaymentAgreement,
  role: AgreementPartyRole,
  options?: { actorUserId?: string; nowIso?: string }
): PaymentAgreement {
  const nowIso = options?.nowIso ?? new Date().toISOString();
  const creatorAcceptedAt =
    role === 'creator'
      ? agreement.creatorAcceptedAt ?? nowIso
      : agreement.creatorAcceptedAt;
  const counterpartyAcceptedAt =
    role === 'counterparty'
      ? agreement.counterpartyAcceptedAt ?? nowIso
      : agreement.counterpartyAcceptedAt;

  const bothAccepted = Boolean(creatorAcceptedAt && counterpartyAcceptedAt);
  const status: AgreementStatus = bothAccepted ? 'accepted' : 'pending_acceptance';
  const lockedAt = bothAccepted ? agreement.lockedAt ?? nowIso : null;

  return {
    ...agreement,
    counterpartyId:
      role === 'counterparty' && options?.actorUserId
        ? options.actorUserId
        : agreement.counterpartyId,
    creatorAcceptedAt,
    counterpartyAcceptedAt,
    lockedAt,
    status,
    updatedAt: nowIso,
  };
}

export function reviseAgreementRecord(
  agreement: PaymentAgreement,
  updates: Partial<{
    title: string;
    purpose: string;
    agreedAmount: string;
    tokenSymbol: string;
    network: string;
    recipientName: string;
    recipientAddress: string;
    termsText: string;
  }>,
  options: {
    editedBy: AgreementPartyRole;
    changeNote: string;
    nowIso?: string;
  }
): PaymentAgreement {
  if (
    agreement.lockedAt !== null ||
    agreement.status === 'accepted' ||
    (agreement.creatorAcceptedAt !== null && agreement.counterpartyAcceptedAt !== null)
  ) {
    throw new AgreementLockedError(
      'Cannot modify an agreement after both parties have accepted. Create a new agreement or open a dispute.'
    );
  }

  if (!options.changeNote.trim()) {
    throw new Error('A change note is required when revising an agreement.');
  }

  const nextFields = {
    paymentRequestId: agreement.paymentRequestId,
    title: (updates.title ?? agreement.title).trim(),
    purpose: (updates.purpose ?? agreement.purpose).trim(),
    agreedAmount: (updates.agreedAmount ?? agreement.agreedAmount).trim(),
    tokenSymbol: (updates.tokenSymbol ?? agreement.tokenSymbol).trim().toUpperCase(),
    network: (updates.network ?? agreement.network).trim(),
    recipientName: (updates.recipientName ?? agreement.recipientName).trim(),
    recipientAddress: (updates.recipientAddress ?? agreement.recipientAddress).trim(),
    termsText: (updates.termsText ?? agreement.termsText).trim(),
  };

  validateAgreementFields(nextFields);

  const nowIso = options.nowIso ?? new Date().toISOString();
  const nextVersion = agreement.currentVersion + 1;
  const snapshot: AgreementVersionSnapshot = {
    versionNumber: nextVersion,
    title: nextFields.title,
    purpose: nextFields.purpose,
    agreedAmount: nextFields.agreedAmount,
    tokenSymbol: nextFields.tokenSymbol,
    network: nextFields.network,
    recipientName: nextFields.recipientName,
    recipientAddress: nextFields.recipientAddress,
    termsText: nextFields.termsText,
    editedBy: options.editedBy,
    changeNote: options.changeNote.trim(),
    createdAt: nowIso,
  };

  // Reset acceptances on revision so neither party is bound to silently changed terms
  return {
    ...agreement,
    ...nextFields,
    creatorAcceptedAt: options.editedBy === 'creator' ? nowIso : null,
    counterpartyAcceptedAt: options.editedBy === 'counterparty' ? nowIso : null,
    lockedAt: null,
    status: 'pending_acceptance',
    currentVersion: nextVersion,
    versions: [...agreement.versions, snapshot],
    updatedAt: nowIso,
  };
}

export function getAgreementStatusSummary(agreement: PaymentAgreement): {
  label: string;
  isLocked: boolean;
  creatorAccepted: boolean;
  counterpartyAccepted: boolean;
} {
  const creatorAccepted = Boolean(agreement.creatorAcceptedAt);
  const counterpartyAccepted = Boolean(agreement.counterpartyAcceptedAt);
  const isLocked = Boolean(agreement.lockedAt) || agreement.status === 'accepted';

  if (agreement.status === 'disputed') {
    return {
      label: 'Disputed',
      isLocked: true,
      creatorAccepted,
      counterpartyAccepted,
    };
  }
  if (isLocked) {
    return {
      label: 'Accepted & Locked',
      isLocked: true,
      creatorAccepted,
      counterpartyAccepted,
    };
  }
  if (creatorAccepted && !counterpartyAccepted) {
    return {
      label: 'Awaiting counterparty acceptance',
      isLocked: false,
      creatorAccepted,
      counterpartyAccepted,
    };
  }
  if (!creatorAccepted && counterpartyAccepted) {
    return {
      label: 'Awaiting creator acceptance',
      isLocked: false,
      creatorAccepted,
      counterpartyAccepted,
    };
  }
  return {
    label: 'Proposed (awaiting both parties)',
    isLocked: false,
    creatorAccepted,
    counterpartyAccepted,
  };
}
