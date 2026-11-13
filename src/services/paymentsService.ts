import { supabase } from '../lib/supabase';
import { callEdgeFunction } from './apiClient';
import type { Database } from '../types/database';

export type PaymentRequestRow = Database['public']['Tables']['payment_requests']['Row'];
export type TransactionRow = Database['public']['Tables']['transactions']['Row'];
export type RiskAssessmentRow = Database['public']['Tables']['risk_assessments']['Row'];

export async function listTransactions(): Promise<TransactionRow[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  return data ?? [];
}

export async function createPaymentRequest(params: {
  amount: string;
  tokenSymbol: string;
  network: string;
  recipientName: string;
  recipientAddress: string;
  description: string;
  terms?: string;
}): Promise<PaymentRequestRow> {
  const res = await callEdgeFunction<{ request: PaymentRequestRow }>('payment-requests', {
    method: 'POST',
    body: params,
  });
  return res.request;
}

export async function listPaymentRequests(): Promise<PaymentRequestRow[]> {
  const res = await callEdgeFunction<{ requests: PaymentRequestRow[] }>('payment-requests', {
    method: 'GET',
  });
  return res.requests;
}

export async function fetchPaymentRequestByCode(shareCode: string): Promise<PaymentRequestRow> {
  const res = await callEdgeFunction<{ request: PaymentRequestRow }>('payment-requests', {
    method: 'GET',
    query: { shareCode },
  });
  return res.request;
}

export async function runRiskAssessment(params: {
  recipientAddress: string;
  network: string;
  tokenSymbol: string;
  amount: string;
  paymentRequestId?: string;
}): Promise<RiskAssessmentRow> {
  const res = await callEdgeFunction<{ assessment: RiskAssessmentRow }>('risk-assessment', {
    method: 'POST',
    body: params,
  });
  return res.assessment;
}

export async function preparePayment(params: {
  amount: string;
  tokenSymbol: string;
  network: string;
  recipientName: string;
  recipientAddress: string;
  purpose: string;
  senderAddress?: string;
  paymentRequestId?: string;
  paymentAgreementId?: string;
}): Promise<TransactionRow> {
  const res = await callEdgeFunction<{ transaction: TransactionRow }>('payment-prepare', {
    method: 'POST',
    body: params,
  });
  return res.transaction;
}

export async function verifyBlockchainReceipt(params: {
  transactionId: string;
  txHash: string;
  awaitingConfirmation?: boolean;
  outcome?: 'confirmed' | 'failed';
  simulateFailure?: boolean;
}): Promise<{ transaction: TransactionRow; verified: boolean }> {
  return callEdgeFunction('receipt-verify', {
    method: 'POST',
    body: params,
  });
}

export async function cancelPayment(params: {
  transactionId?: string;
  paymentRequestId?: string;
  reason?: string;
}) {
  return callEdgeFunction('payment-cancel', {
    method: 'POST',
    body: params,
  });
}

