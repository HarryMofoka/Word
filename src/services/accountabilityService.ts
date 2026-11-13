import { callEdgeFunction } from './apiClient';
import type { Database } from '../types/database';

export type PaymentAgreementRow = Database['public']['Tables']['payment_agreements']['Row'];
export type DisputeRow = Database['public']['Tables']['disputes']['Row'];
export type EvidenceRow = Database['public']['Tables']['evidence']['Row'];
export type NotificationRow = Database['public']['Tables']['notifications']['Row'];

export interface DisputeWithEvidence extends DisputeRow {
  evidence: EvidenceRow[];
}

export async function listPaymentAgreements(): Promise<PaymentAgreementRow[]> {
  const res = await callEdgeFunction<{ agreements: PaymentAgreementRow[] }>('payment-agreements', {
    method: 'GET',
  });
  return res.agreements;
}

export async function createPaymentAgreement(params: {
  paymentRequestId?: string;
  title: string;
  purpose: string;
  amount: string;
  tokenSymbol: string;
  network: string;
  recipientName: string;
  recipientAddress: string;
  termsText: string;
}): Promise<PaymentAgreementRow> {
  const res = await callEdgeFunction<{ agreement: PaymentAgreementRow }>('payment-agreements', {
    method: 'POST',
    body: { action: 'create', ...params },
  });
  return res.agreement;
}

export async function revisePaymentAgreement(params: {
  agreementId: string;
  changeNote: string;
  title?: string;
  purpose?: string;
  amount?: string;
  tokenSymbol?: string;
  network?: string;
  recipientName?: string;
  recipientAddress?: string;
  termsText?: string;
}): Promise<PaymentAgreementRow> {
  const res = await callEdgeFunction<{ agreement: PaymentAgreementRow }>('payment-agreements', {
    method: 'POST',
    body: { action: 'revise', ...params },
  });
  return res.agreement;
}

export async function acceptPaymentAgreement(agreementId: string): Promise<PaymentAgreementRow> {
  const res = await callEdgeFunction<{ agreement: PaymentAgreementRow }>('payment-agreements', {
    method: 'POST',
    body: { action: 'accept', agreementId },
  });
  return res.agreement;
}

export async function listDisputes(): Promise<DisputeWithEvidence[]> {
  const res = await callEdgeFunction<{ disputes: DisputeWithEvidence[] }>('disputes', {
    method: 'GET',
  });
  return res.disputes;
}

export async function createDispute(params: {
  transactionId: string;
  reason: string;
  summary: string;
}): Promise<DisputeWithEvidence> {
  const res = await callEdgeFunction<{ dispute: DisputeWithEvidence }>('disputes', {
    method: 'POST',
    body: params,
  });
  return res.dispute;
}

export async function submitDisputeEvidence(params: {
  disputeId: string;
  label: string;
  note: string;
  file?: File | null;
}): Promise<EvidenceRow> {
  let storagePath: string | undefined;
  let mimeType: string | undefined;
  let byteSize: number | undefined;

  if (params.file) {
    const uploadAuth = await callEdgeFunction<{
      objectPath: string;
      signedUrl: string;
    }>('evidence-auth', {
      method: 'POST',
      body: {
        action: 'create_upload_url',
        disputeId: params.disputeId,
        fileName: params.file.name,
      },
    });

    const uploadRes = await fetch(uploadAuth.signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': params.file.type || 'application/octet-stream' },
      body: params.file,
    });
    if (!uploadRes.ok) {
      throw new Error('Failed to upload evidence file to secure storage.');
    }

    storagePath = uploadAuth.objectPath;
    mimeType = params.file.type || 'application/octet-stream';
    byteSize = params.file.size;
  }

  const res = await callEdgeFunction<{ evidence: EvidenceRow }>('evidence-auth', {
    method: 'POST',
    body: {
      action: 'commit_evidence',
      disputeId: params.disputeId,
      label: params.label,
      note: params.note,
      storagePath,
      mimeType,
      byteSize,
    },
  });

  return res.evidence;
}

export async function listNotifications(): Promise<NotificationRow[]> {
  const res = await callEdgeFunction<{ notifications: NotificationRow[] }>('notifications', {
    method: 'GET',
  });
  return res.notifications;
}

export async function markNotificationRead(notificationId: string): Promise<NotificationRow> {
  const res = await callEdgeFunction<{ notification: NotificationRow }>('notifications', {
    method: 'PATCH',
    body: { notificationId },
  });
  return res.notification;
}

export async function markAllNotificationsRead(): Promise<void> {
  await callEdgeFunction('notifications', {
    method: 'PATCH',
    body: { markAllRead: true },
  });
}

