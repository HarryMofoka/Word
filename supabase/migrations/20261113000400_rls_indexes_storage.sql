-- Migration 4: Performance indexes, Row Level Security (RLS) policies, and Private Evidence Storage Bucket

-- ==========================================
-- 1. INDEXES FOR FOREIGN KEYS & HOT QUERIES
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON public.wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_challenges_user_id ON public.wallet_challenges(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_challenges_wallet_id ON public.wallet_challenges(wallet_id);

CREATE INDEX IF NOT EXISTS idx_payment_requests_creator_id ON public.payment_requests(creator_id);
CREATE INDEX IF NOT EXISTS idx_payment_requests_status_created ON public.payment_requests(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_agreements_request_id ON public.payment_agreements(payment_request_id);
CREATE INDEX IF NOT EXISTS idx_payment_agreements_participants ON public.payment_agreements(creator_id, counterparty_id);

CREATE INDEX IF NOT EXISTS idx_transactions_sender_created ON public.transactions(sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_recipient_created ON public.transactions(recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_request_id ON public.transactions(payment_request_id);
CREATE INDEX IF NOT EXISTS idx_transactions_tx_hash ON public.transactions(tx_hash) WHERE tx_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_verification_records_user_id ON public.verification_records(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_verification_records_tx_id ON public.verification_records(transaction_id);

CREATE INDEX IF NOT EXISTS idx_risk_assessments_user_id ON public.risk_assessments(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_request_id ON public.risk_assessments(payment_request_id);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_tx_id ON public.risk_assessments(transaction_id);

CREATE INDEX IF NOT EXISTS idx_disputes_tx_id ON public.disputes(transaction_id);
CREATE INDEX IF NOT EXISTS idx_disputes_participants ON public.disputes(reporter_id, counterparty_id);

CREATE INDEX IF NOT EXISTS idx_evidence_dispute_id ON public.evidence(dispute_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created ON public.audit_logs(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assistant_sessions_user_updated ON public.assistant_sessions(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_assistant_messages_session_created ON public.assistant_messages(session_id, created_at ASC);

-- ==========================================
-- 2. ENABLE RLS ON ALL PUBLIC TABLES
-- ==========================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- 3. RLS POLICIES
-- ==========================================

-- Profiles: owner only
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = id);

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

-- Wallets: owner only
CREATE POLICY "wallets_select_own" ON public.wallets
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "wallets_insert_own" ON public.wallets
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "wallets_update_own" ON public.wallets
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "wallets_delete_own" ON public.wallets
  FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);

-- Wallet Challenges: owner read only (mutations via Edge Functions)
CREATE POLICY "wallet_challenges_select_own" ON public.wallet_challenges
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

-- Payment Requests: creator full control; authenticated users can read open requests to pay
CREATE POLICY "payment_requests_select_visible" ON public.payment_requests
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = creator_id OR status = 'open');

CREATE POLICY "payment_requests_insert_creator" ON public.payment_requests
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = creator_id);

CREATE POLICY "payment_requests_update_creator" ON public.payment_requests
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = creator_id)
  WITH CHECK ((select auth.uid()) = creator_id);

-- Payment Agreements: participants only
CREATE POLICY "payment_agreements_select_participant" ON public.payment_agreements
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = creator_id OR (select auth.uid()) = counterparty_id);

CREATE POLICY "payment_agreements_insert_creator" ON public.payment_agreements
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = creator_id);

CREATE POLICY "payment_agreements_update_participant" ON public.payment_agreements
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = creator_id OR (select auth.uid()) = counterparty_id)
  WITH CHECK ((select auth.uid()) = creator_id OR (select auth.uid()) = counterparty_id);

-- Transactions: sender or recipient only
CREATE POLICY "transactions_select_participant" ON public.transactions
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = sender_id OR (select auth.uid()) = recipient_id);

-- Verification Records: owner or transaction participant
CREATE POLICY "verification_records_select_participant" ON public.verification_records
  FOR SELECT TO authenticated
  USING (
    (select auth.uid()) = user_id
    OR EXISTS (
      SELECT 1 FROM public.transactions t
      WHERE t.id = verification_records.transaction_id
        AND (t.sender_id = (select auth.uid()) OR t.recipient_id = (select auth.uid()))
    )
  );

-- Risk Assessments: owner or transaction participant
CREATE POLICY "risk_assessments_select_participant" ON public.risk_assessments
  FOR SELECT TO authenticated
  USING (
    (select auth.uid()) = user_id
    OR EXISTS (
      SELECT 1 FROM public.transactions t
      WHERE t.id = risk_assessments.transaction_id
        AND (t.sender_id = (select auth.uid()) OR t.recipient_id = (select auth.uid()))
    )
  );

-- Disputes: reporter or counterparty
CREATE POLICY "disputes_select_participant" ON public.disputes
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = reporter_id OR (select auth.uid()) = counterparty_id);

CREATE POLICY "disputes_insert_reporter" ON public.disputes
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = reporter_id);

-- Evidence: dispute participants only
CREATE POLICY "evidence_select_dispute_participant" ON public.evidence
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.disputes d
      WHERE d.id = evidence.dispute_id
        AND (d.reporter_id = (select auth.uid()) OR d.counterparty_id = (select auth.uid()))
    )
  );

CREATE POLICY "evidence_insert_dispute_participant" ON public.evidence
  FOR INSERT TO authenticated
  WITH CHECK (
    (select auth.uid()) = submitted_by
    AND EXISTS (
      SELECT 1 FROM public.disputes d
      WHERE d.id = evidence.dispute_id
        AND (d.reporter_id = (select auth.uid()) OR d.counterparty_id = (select auth.uid()))
    )
  );

-- Notifications: private per user
CREATE POLICY "notifications_select_own" ON public.notifications
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "notifications_update_own" ON public.notifications
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- Audit Logs: user can read own actor events; NO client writes
CREATE POLICY "audit_logs_select_own" ON public.audit_logs
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = actor_user_id);

-- Assistant Sessions & Messages: private per user
CREATE POLICY "assistant_sessions_all_own" ON public.assistant_sessions
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "assistant_messages_all_own" ON public.assistant_messages
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ==========================================
-- 4. PRIVATE STORAGE BUCKET FOR EVIDENCE
-- ==========================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'dispute-evidence',
  'dispute-evidence',
  FALSE,
  10485760,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'text/plain']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "evidence_bucket_select_participant" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'dispute-evidence'
    AND (storage.foldername(name))[1] IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.disputes d
      WHERE d.id::text = (storage.foldername(name))[1]
        AND (d.reporter_id = (select auth.uid()) OR d.counterparty_id = (select auth.uid()))
    )
  );

CREATE POLICY "evidence_bucket_insert_participant" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'dispute-evidence'
    AND (storage.foldername(name))[1] IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.disputes d
      WHERE d.id::text = (storage.foldername(name))[1]
        AND (d.reporter_id = (select auth.uid()) OR d.counterparty_id = (select auth.uid()))
    )
  );

