export const DISPUTE_CATEGORIES = [
  'Item or service not delivered',
  'Item did not match agreed description',
  'Destination or payment request mismatch',
  'Unauthorized or duplicate payment',
  'Other agreement concern',
] as const;

export type DisputeCategory = (typeof DISPUTE_CATEGORIES)[number];
export type DisputeStatus = 'Open' | 'Evidence Submitted' | 'Under Review' | 'Resolved';

export const DISPUTE_LIMITATIONS_NOTICE =
  'Dispute reporting organises payment records, timestamps, and supporting evidence for both parties. It does not automatically reverse confirmed blockchain transactions or guarantee recovery of funds.';

export interface DisputeEvidenceItem {
  id: string;
  label: string;
  note: string;
  fileName?: string;
  mimeType?: string;
  byteSize?: number;
  addedAt: string;
}

export interface DisputeEvent {
  id: string;
  type: 'dispute_opened' | 'dispute_acknowledged' | 'evidence_attached' | 'status_updated';
  title: string;
  detail: string;
  timestamp: string;
}

export interface DisputeAcknowledgement {
  referenceId: string;
  acknowledgedAt: string;
  acknowledgedBy: string;
  message: string;
}

export interface ManagedDisputeCase {
  id: string;
  paymentId: string;
  agreementId: string | null;
  category: DisputeCategory;
  explanation: string;
  status: DisputeStatus;
  createdAt: string;
  updatedAt: string;
  evidence: DisputeEvidenceItem[];
  acknowledgement: DisputeAcknowledgement;
  eventHistory: DisputeEvent[];
  limitationsNotice: string;
}

export interface CreateDisputeInput {
  id?: string;
  paymentId: string;
  agreementId?: string | null;
  category: DisputeCategory;
  explanation: string;
  reporterId?: string;
  initialEvidence?: {
    label: string;
    note: string;
    fileName?: string;
    mimeType?: string;
    byteSize?: number;
  };
  nowIso?: string;
}

export function createDisputeCase(input: CreateDisputeInput): ManagedDisputeCase {
  if (!input.paymentId.trim()) {
    throw new Error('Dispute must be linked to a payment.');
  }
  if (!DISPUTE_CATEGORIES.includes(input.category)) {
    throw new Error(`Unsupported dispute category: ${input.category}`);
  }
  if (input.explanation.trim().length < 5) {
    throw new Error('Written explanation must be at least 5 characters.');
  }

  const nowIso = input.nowIso ?? new Date().toISOString();
  const disputeId = input.id ?? `dsp-${Date.now()}`;
  const ackRef = `ACK-${disputeId.slice(-6).toUpperCase()}`;

  const evidence: DisputeEvidenceItem[] = [];
  const eventHistory: DisputeEvent[] = [
    {
      id: `evt-open-${disputeId}`,
      type: 'dispute_opened',
      title: 'Dispute case created',
      detail: `${input.category}: ${input.explanation.trim()}`,
      timestamp: nowIso,
    },
    {
      id: `evt-ack-${disputeId}`,
      type: 'dispute_acknowledged',
      title: 'Dispute submission acknowledged',
      detail: `Reference ${ackRef} logged for payment ${input.paymentId.trim()}.`,
      timestamp: nowIso,
    },
  ];

  if (input.initialEvidence) {
    const ev: DisputeEvidenceItem = {
      id: `ev-${Date.now()}-1`,
      label: input.initialEvidence.label.trim() || 'Supporting evidence',
      note: input.initialEvidence.note.trim() || 'Initial evidence attached.',
      fileName: input.initialEvidence.fileName,
      mimeType: input.initialEvidence.mimeType,
      byteSize: input.initialEvidence.byteSize,
      addedAt: nowIso,
    };
    evidence.push(ev);
    eventHistory.push({
      id: `evt-ev-${ev.id}`,
      type: 'evidence_attached',
      title: 'Initial evidence attached',
      detail: ev.label,
      timestamp: nowIso,
    });
  }

  return {
    id: disputeId,
    paymentId: input.paymentId.trim(),
    agreementId: input.agreementId ?? null,
    category: input.category,
    explanation: input.explanation.trim(),
    status: evidence.length > 0 ? 'Evidence Submitted' : 'Open',
    createdAt: nowIso,
    updatedAt: nowIso,
    evidence,
    acknowledgement: {
      referenceId: ackRef,
      acknowledgedAt: nowIso,
      acknowledgedBy: input.reporterId ?? 'Word Accountability Ledger',
      message: `Dispute ${ackRef} has been timestamped and linked to payment ${input.paymentId.trim()}.`,
    },
    eventHistory,
    limitationsNotice: DISPUTE_LIMITATIONS_NOTICE,
  };
}

export function addDisputeEvidence(
  dispute: ManagedDisputeCase,
  evidenceInput: {
    label: string;
    note: string;
    fileName?: string;
    mimeType?: string;
    byteSize?: number;
    nowIso?: string;
  }
): ManagedDisputeCase {
  if (!evidenceInput.label.trim()) {
    throw new Error('Evidence label is required.');
  }
  if (!evidenceInput.note.trim()) {
    throw new Error('Evidence note is required.');
  }

  const nowIso = evidenceInput.nowIso ?? new Date().toISOString();
  const item: DisputeEvidenceItem = {
    id: `ev-${Date.now()}-${dispute.evidence.length + 1}`,
    label: evidenceInput.label.trim(),
    note: evidenceInput.note.trim(),
    fileName: evidenceInput.fileName,
    mimeType: evidenceInput.mimeType,
    byteSize: evidenceInput.byteSize,
    addedAt: nowIso,
  };

  const nextStatus: DisputeStatus =
    dispute.status === 'Under Review' ? 'Under Review' : 'Evidence Submitted';

  const nextEvent: DisputeEvent = {
    id: `evt-ev-${item.id}`,
    type: 'evidence_attached',
    title: 'Additional evidence attached',
    detail: `${item.label} — ${item.note}`,
    timestamp: nowIso,
  };

  return {
    ...dispute,
    status: nextStatus,
    updatedAt: nowIso,
    evidence: [item, ...dispute.evidence],
    eventHistory: [...dispute.eventHistory, nextEvent],
  };
}

export function updateDisputeStatus(
  dispute: ManagedDisputeCase,
  nextStatus: DisputeStatus,
  note?: string,
  nowIso: string = new Date().toISOString()
): ManagedDisputeCase {
  const evt: DisputeEvent = {
    id: `evt-status-${Date.now()}`,
    type: 'status_updated',
    title: `Dispute status updated to ${nextStatus}`,
    detail: note?.trim() || `Transitioned from ${dispute.status} to ${nextStatus}.`,
    timestamp: nowIso,
  };
  return {
    ...dispute,
    status: nextStatus,
    updatedAt: nowIso,
    eventHistory: [...dispute.eventHistory, evt],
  };
}

export interface CoherentAccountabilityRecord {
  requested: {
    amount: string;
    token: string;
    network: string;
    recipient: string;
    purpose: string;
  };
  agreed: {
    agreementId: string | null;
    status: string;
    terms: string;
  };
  paid: {
    paymentId: string;
    txHash: string | null;
    confirmationStatus: string;
  };
  reported: ManagedDisputeCase | null;
}

export function buildCoherentAccountabilityBundle(params: {
  requested: CoherentAccountabilityRecord['requested'];
  agreed: CoherentAccountabilityRecord['agreed'];
  paid: CoherentAccountabilityRecord['paid'];
  reported: ManagedDisputeCase | null;
}): CoherentAccountabilityRecord {
  return {
    requested: params.requested,
    agreed: params.agreed,
    paid: params.paid,
    reported: params.reported,
  };
}

