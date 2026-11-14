-- Migration 7: Mutual Trust Verification System
-- Adds bilateral identity verification results (zero raw biometric storage),
-- canonical transaction sessions, EIP-712 dual-party approvals, permanent mutual trust receipts,
-- provider webhook idempotency tracking, strict RLS, trigger guards, and Realtime publication.

-- ==========================================
-- 1. EXTEND EXISTING VERIFICATION_RECORDS CONSTRAINTS
-- ==========================================
ALTER TABLE public.verification_records
  DROP CONSTRAINT IF EXISTS verification_records_verification_type_check;

ALTER TABLE public.verification_records
  ADD CONSTRAINT verification_records_verification_type_check
  CHECK (
    verification_type IN (
      'wallet_control',
      'blockchain_receipt',
      'recipient_check',
      'recipient_wallet_control',
      'mutual_identity_attestation'
    )
  );

ALTER TABLE public.verification_records
  DROP CONSTRAINT IF EXISTS verification_records_status_check;

ALTER TABLE public.verification_records
  ADD CONSTRAINT verification_records_status_check
  CHECK (status IN ('pending', 'verified', 'failed', 'mismatch', 'expired'));

-- ==========================================
-- 2. IDENTITY VERIFICATION RESULTS (NO RAW BIOMETRICS)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.identity_verification_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (
    provider IN ('word_sandbox', 'veriff', 'smile_id', 'persona', 'sumsub', 'alternative_attestation')
  ),
  provider_session_id TEXT NOT NULL,
  is_sandbox BOOLEAN NOT NULL DEFAULT FALSE,
  verification_method TEXT NOT NULL DEFAULT 'facial_liveness' CHECK (
    verification_method IN ('facial_liveness', 'alternative_fallback')
  ),
  verification_outcome TEXT NOT NULL DEFAULT 'pending' CHECK (
    verification_outcome IN (
      'pending',
      'verified',
      'failed',
      'liveness_failed',
      'expired',
      'unavailable',
      'manual_review'
    )
  ),
  liveness_outcome TEXT NOT NULL DEFAULT 'pending' CHECK (
    liveness_outcome IN ('pending', 'passed', 'failed', 'not_applicable', 'unavailable')
  ),
  assurance_level TEXT NOT NULL DEFAULT 'none' CHECK (
    assurance_level IN (
      'none',
      'sandbox_demo',
      'alternative_fallback',
      'biometric_liveness_l2',
      'document_plus_biometric_l3'
    )
  ),
  -- Salted non-reversible SHA-256 commitment only; never stores raw video, photos, or templates
  enrolled_commitment_hash TEXT,
  attestation_hash TEXT NOT NULL,
  attestation_signature TEXT NOT NULL,
  security_warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  failure_reason TEXT,
  popia_consent_at TIMESTAMPTZ,
  retention_expires_at TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc', now()) + interval '30 days'),
  verified_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT uq_identity_provider_session UNIQUE (provider, provider_session_id)
);

CREATE TRIGGER trg_identity_verification_updated_at
  BEFORE UPDATE ON public.identity_verification_results
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.guard_sensitive_identity_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(current_setting('role', true), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Identity verification outcomes are server-authoritative and cannot be modified directly.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_identity_verification_guard
  BEFORE INSERT OR UPDATE ON public.identity_verification_results
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_sensitive_identity_fields();

-- ==========================================
-- 3. MUTUAL VERIFICATION SESSIONS
-- ==========================================
CREATE TABLE IF NOT EXISTS public.mutual_verification_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_request_id UUID REFERENCES public.payment_requests(id) ON DELETE SET NULL,
  payment_agreement_id UUID REFERENCES public.payment_agreements(id) ON DELETE SET NULL,
  share_code TEXT,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sender_wallet_address TEXT NOT NULL CHECK (char_length(trim(sender_wallet_address)) BETWEEN 10 AND 128),
  recipient_wallet_address TEXT NOT NULL CHECK (char_length(trim(recipient_wallet_address)) BETWEEN 10 AND 128),
  sender_identity_id UUID REFERENCES public.identity_verification_results(id) ON DELETE SET NULL,
  recipient_identity_id UUID REFERENCES public.identity_verification_results(id) ON DELETE SET NULL,
  sender_verification_status TEXT NOT NULL DEFAULT 'not_started' CHECK (
    sender_verification_status IN (
      'not_started',
      'in_progress',
      'verified',
      'failed',
      'expired',
      'manual_review'
    )
  ),
  recipient_verification_status TEXT NOT NULL DEFAULT 'not_started' CHECK (
    recipient_verification_status IN (
      'not_started',
      'in_progress',
      'verified',
      'failed',
      'expired',
      'manual_review'
    )
  ),
  reports_exchanged_at TIMESTAMPTZ,
  sender_report_viewed_at TIMESTAMPTZ,
  recipient_report_viewed_at TIMESTAMPTZ,
  amount_numeric NUMERIC(38, 18) NOT NULL CHECK (amount_numeric > 0),
  amount_atomic TEXT NOT NULL,
  token_symbol TEXT NOT NULL CHECK (token_symbol IN ('USDT', 'USDC', 'ETH', 'WETH')),
  token_decimals SMALLINT NOT NULL DEFAULT 6 CHECK (token_decimals BETWEEN 0 AND 18),
  token_address TEXT NOT NULL,
  network TEXT NOT NULL CHECK (network IN ('Testnet', 'Base Sepolia', 'Polygon Amoy')),
  chain_id INTEGER NOT NULL,
  purpose TEXT NOT NULL CHECK (char_length(trim(purpose)) BETWEEN 1 AND 500),
  agreement_version INTEGER NOT NULL DEFAULT 0,
  agreement_terms_hash TEXT NOT NULL,
  canonical_nonce TEXT NOT NULL,
  canonical_payload JSONB NOT NULL,
  canonical_tx_hash TEXT NOT NULL,
  sender_approved_at TIMESTAMPTZ,
  recipient_approved_at TIMESTAMPTZ,
  declined_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  decline_reason TEXT,
  session_state TEXT NOT NULL DEFAULT 'invited' CHECK (
    session_state IN (
      'invited',
      'verifying',
      'reports_exchanged',
      'awaiting_approvals',
      'authorized',
      'executing',
      'completed',
      'declined',
      'failed',
      'expired'
    )
  ),
  verification_expires_at TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc', now()) + interval '30 minutes'),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc', now()) + interval '30 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT chk_mutual_distinct_parties CHECK (sender_id <> recipient_id)
);

CREATE TRIGGER trg_mutual_sessions_updated_at
  BEFORE UPDATE ON public.mutual_verification_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.guard_sensitive_mutual_session_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(current_setting('role', true), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Mutual verification sessions are server-authoritative and cannot be modified directly.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_mutual_sessions_guard
  BEFORE INSERT OR UPDATE ON public.mutual_verification_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_sensitive_mutual_session_fields();

-- ==========================================
-- 4. DUAL-PARTY TRANSACTION APPROVALS
-- ==========================================
CREATE TABLE IF NOT EXISTS public.transaction_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.mutual_verification_sessions(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  canonical_tx_hash TEXT NOT NULL,
  approving_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  approving_wallet_address TEXT NOT NULL CHECK (char_length(trim(approving_wallet_address)) BETWEEN 10 AND 128),
  approval_role TEXT NOT NULL CHECK (approval_role IN ('sender', 'recipient')),
  approval_status TEXT NOT NULL CHECK (approval_status IN ('approved', 'declined', 'revoked', 'expired')),
  statement_text TEXT NOT NULL,
  signature TEXT,
  signature_type TEXT NOT NULL DEFAULT 'eip712_wallet' CHECK (
    signature_type IN ('eip712_wallet', 'decline_record')
  ),
  eip712_domain JSONB,
  eip712_message JSONB,
  recovered_address TEXT,
  decline_reason TEXT,
  approved_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_approval_per_user_hash
  ON public.transaction_approvals (session_id, approving_user_id, canonical_tx_hash)
  WHERE approval_status = 'approved';

CREATE OR REPLACE FUNCTION public.guard_sensitive_approval_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(current_setting('role', true), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Transaction approvals must be cryptographically verified via Edge Functions.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_transaction_approvals_guard
  BEFORE INSERT OR UPDATE ON public.transaction_approvals
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_sensitive_approval_fields();

-- ==========================================
-- 5. PERMANENT MUTUAL TRUST RECEIPTS
-- ==========================================
CREATE TABLE IF NOT EXISTS public.mutual_trust_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_code TEXT NOT NULL UNIQUE,
  session_id UUID NOT NULL UNIQUE REFERENCES public.mutual_verification_sessions(id) ON DELETE CASCADE,
  transaction_id UUID NOT NULL UNIQUE REFERENCES public.transactions(id) ON DELETE CASCADE,
  canonical_tx_hash TEXT NOT NULL,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sender_wallet_address TEXT NOT NULL,
  recipient_wallet_address TEXT NOT NULL,
  amount_numeric NUMERIC(38, 18) NOT NULL,
  token_symbol TEXT NOT NULL,
  network TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  agreement_id UUID REFERENCES public.payment_agreements(id) ON DELETE SET NULL,
  agreement_version INTEGER NOT NULL DEFAULT 0,
  agreement_terms_hash TEXT NOT NULL,
  sender_verification_id UUID REFERENCES public.identity_verification_results(id) ON DELETE SET NULL,
  recipient_verification_id UUID REFERENCES public.identity_verification_results(id) ON DELETE SET NULL,
  sender_verification_summary JSONB NOT NULL,
  recipient_verification_summary JSONB NOT NULL,
  sender_approval_id UUID REFERENCES public.transaction_approvals(id) ON DELETE SET NULL,
  recipient_approval_id UUID REFERENCES public.transaction_approvals(id) ON DELETE SET NULL,
  sender_approved_at TIMESTAMPTZ NOT NULL,
  recipient_approved_at TIMESTAMPTZ NOT NULL,
  blockchain_tx_hash TEXT,
  settlement_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    settlement_status IN ('pending', 'processing', 'confirmed', 'failed')
  ),
  receipt_signature TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE TRIGGER trg_mutual_trust_receipts_updated_at
  BEFORE UPDATE ON public.mutual_trust_receipts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.guard_sensitive_receipt_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(current_setting('role', true), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Mutual Trust Receipts are server-authoritative and cannot be modified directly.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_mutual_trust_receipts_guard
  BEFORE INSERT OR UPDATE ON public.mutual_trust_receipts
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_sensitive_receipt_fields();

-- ==========================================
-- 6. PROVIDER WEBHOOK EVENTS (IDEMPOTENCY / ANTI-REPLAY)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.provider_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  provider_session_id TEXT,
  signature_valid BOOLEAN NOT NULL DEFAULT FALSE,
  payload_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT uq_provider_webhook_event UNIQUE (provider, event_id)
);

-- ==========================================
-- 7. EXTEND TRANSACTIONS TABLE
-- ==========================================
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS mutual_session_id UUID REFERENCES public.mutual_verification_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS canonical_tx_hash TEXT,
  ADD COLUMN IF NOT EXISTS mutual_authorized_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mutual_trust_receipt_id UUID REFERENCES public.mutual_trust_receipts(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.guard_sensitive_transaction_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(current_setting('role', true), '') <> 'service_role' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.status := 'pending';
      NEW.verified_control := FALSE;
      NEW.receipt_verified_at := NULL;
      NEW.mutual_session_id := NULL;
      NEW.canonical_tx_hash := NULL;
      NEW.mutual_authorized_at := NULL;
      NEW.mutual_trust_receipt_id := NULL;
    ELSIF TG_OP = 'UPDATE' THEN
      NEW.status := OLD.status;
      NEW.verified_control := OLD.verified_control;
      NEW.receipt_verified_at := OLD.receipt_verified_at;
      NEW.mutual_session_id := OLD.mutual_session_id;
      NEW.canonical_tx_hash := OLD.canonical_tx_hash;
      NEW.mutual_authorized_at := OLD.mutual_authorized_at;
      NEW.mutual_trust_receipt_id := OLD.mutual_trust_receipt_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ==========================================
-- 8. INDEXES FOR FOREIGN KEYS & HOT QUERIES
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_identity_verification_user_created
  ON public.identity_verification_results(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mutual_sessions_sender
  ON public.mutual_verification_sessions(sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mutual_sessions_recipient
  ON public.mutual_verification_sessions(recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mutual_sessions_request
  ON public.mutual_verification_sessions(payment_request_id);
CREATE INDEX IF NOT EXISTS idx_mutual_sessions_agreement
  ON public.mutual_verification_sessions(payment_agreement_id);
CREATE INDEX IF NOT EXISTS idx_mutual_sessions_sender_identity
  ON public.mutual_verification_sessions(sender_identity_id);
CREATE INDEX IF NOT EXISTS idx_mutual_sessions_recipient_identity
  ON public.mutual_verification_sessions(recipient_identity_id);
CREATE INDEX IF NOT EXISTS idx_mutual_sessions_declined_by
  ON public.mutual_verification_sessions(declined_by);

CREATE INDEX IF NOT EXISTS idx_transaction_approvals_session
  ON public.transaction_approvals(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transaction_approvals_user
  ON public.transaction_approvals(approving_user_id);
CREATE INDEX IF NOT EXISTS idx_transaction_approvals_tx
  ON public.transaction_approvals(transaction_id);

CREATE INDEX IF NOT EXISTS idx_mutual_receipts_sender
  ON public.mutual_trust_receipts(sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mutual_receipts_recipient
  ON public.mutual_trust_receipts(recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mutual_receipts_agreement
  ON public.mutual_trust_receipts(agreement_id);
CREATE INDEX IF NOT EXISTS idx_mutual_receipts_sender_verif
  ON public.mutual_trust_receipts(sender_verification_id);
CREATE INDEX IF NOT EXISTS idx_mutual_receipts_recipient_verif
  ON public.mutual_trust_receipts(recipient_verification_id);
CREATE INDEX IF NOT EXISTS idx_mutual_receipts_sender_app
  ON public.mutual_trust_receipts(sender_approval_id);
CREATE INDEX IF NOT EXISTS idx_mutual_receipts_recipient_app
  ON public.mutual_trust_receipts(recipient_approval_id);

CREATE INDEX IF NOT EXISTS idx_transactions_mutual_session
  ON public.transactions(mutual_session_id);
CREATE INDEX IF NOT EXISTS idx_transactions_mutual_receipt
  ON public.transactions(mutual_trust_receipt_id);

-- ==========================================
-- 9. ROW LEVEL SECURITY POLICIES
-- ==========================================
ALTER TABLE public.identity_verification_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mutual_verification_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mutual_trust_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_webhook_events ENABLE ROW LEVEL SECURITY;

-- Identity Verification Results: strictly owner-only SELECT; never expose to counterparty directly
-- Counterparty receives sanitized, non-biometric reports only via Edge Function / session exchange
CREATE POLICY "identity_results_select_own"
  ON public.identity_verification_results
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

-- Mutual Verification Sessions: participants only
CREATE POLICY "mutual_sessions_select_participant"
  ON public.mutual_verification_sessions
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = sender_id OR (select auth.uid()) = recipient_id);

-- Transaction Approvals: session participants only
CREATE POLICY "transaction_approvals_select_participant"
  ON public.transaction_approvals
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.mutual_verification_sessions mvs
      WHERE mvs.id = transaction_approvals.session_id
        AND (mvs.sender_id = (select auth.uid()) OR mvs.recipient_id = (select auth.uid()))
    )
  );

-- Mutual Trust Receipts: sender or recipient only
CREATE POLICY "mutual_receipts_select_participant"
  ON public.mutual_trust_receipts
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = sender_id OR (select auth.uid()) = recipient_id);

-- provider_webhook_events: zero client policies (service_role only)

-- ==========================================
-- 10. ENABLE SUPABASE REALTIME PUBLICATION
-- ==========================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.mutual_verification_sessions;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.transaction_approvals;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.mutual_trust_receipts;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;
