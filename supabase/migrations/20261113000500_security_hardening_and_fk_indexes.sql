-- Migration 5: Security hardening (revoke RPC execute on trigger function) and covering FK indexes

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_assistant_messages_user_id ON public.assistant_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_disputes_counterparty_id ON public.disputes(counterparty_id);
CREATE INDEX IF NOT EXISTS idx_disputes_payment_agreement_id ON public.disputes(payment_agreement_id);
CREATE INDEX IF NOT EXISTS idx_evidence_submitted_by ON public.evidence(submitted_by);
CREATE INDEX IF NOT EXISTS idx_payment_agreements_counterparty_id ON public.payment_agreements(counterparty_id);
CREATE INDEX IF NOT EXISTS idx_transactions_payment_agreement_id ON public.transactions(payment_agreement_id);
CREATE INDEX IF NOT EXISTS idx_verification_records_wallet_id ON public.verification_records(wallet_id);

