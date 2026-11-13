-- Migration 2: Payment requests, agreements, transactions, verification records, and risk assessments
-- Uses exact NUMERIC(38, 18) and atomic integer strings for token amounts (never floating point).

-- 4. Payment Requests
CREATE TABLE IF NOT EXISTS public.payment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  share_code TEXT NOT NULL UNIQUE,
  amount_numeric NUMERIC(38, 18) NOT NULL CHECK (amount_numeric > 0),
  amount_atomic TEXT NOT NULL,
  token_symbol TEXT NOT NULL CHECK (token_symbol IN ('USDT', 'USDC', 'ETH', 'WETH')),
  token_decimals SMALLINT NOT NULL DEFAULT 6 CHECK (token_decimals BETWEEN 0 AND 18),
  network TEXT NOT NULL DEFAULT 'Testnet' CHECK (network IN ('Testnet', 'Base Sepolia', 'Polygon Amoy')),
  recipient_name TEXT NOT NULL CHECK (char_length(trim(recipient_name)) BETWEEN 1 AND 120),
  recipient_address TEXT NOT NULL CHECK (char_length(trim(recipient_address)) BETWEEN 10 AND 128),
  description TEXT NOT NULL CHECK (char_length(trim(description)) BETWEEN 1 AND 500),
  terms TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'cancelled', 'expired', 'completed')),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE TRIGGER trg_payment_requests_updated_at
  BEFORE UPDATE ON public.payment_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 5. Payment Agreements
CREATE TABLE IF NOT EXISTS public.payment_agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_request_id UUID REFERENCES public.payment_requests(id) ON DELETE SET NULL,
  creator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  counterparty_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 160),
  terms_text TEXT NOT NULL CHECK (char_length(trim(terms_text)) BETWEEN 1 AND 2000),
  amount_numeric NUMERIC(38, 18) NOT NULL CHECK (amount_numeric > 0),
  token_symbol TEXT NOT NULL CHECK (token_symbol IN ('USDT', 'USDC', 'ETH', 'WETH')),
  network TEXT NOT NULL DEFAULT 'Testnet',
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('draft', 'proposed', 'accepted', 'disputed', 'fulfilled', 'cancelled')),
  creator_accepted_at TIMESTAMPTZ,
  counterparty_accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE TRIGGER trg_payment_agreements_updated_at
  BEFORE UPDATE ON public.payment_agreements
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 6. Transactions
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_request_id UUID REFERENCES public.payment_requests(id) ON DELETE SET NULL,
  payment_agreement_id UUID REFERENCES public.payment_agreements(id) ON DELETE SET NULL,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  sender_address TEXT,
  recipient_name TEXT NOT NULL CHECK (char_length(trim(recipient_name)) BETWEEN 1 AND 120),
  recipient_address TEXT NOT NULL CHECK (char_length(trim(recipient_address)) BETWEEN 10 AND 128),
  amount_numeric NUMERIC(38, 18) NOT NULL CHECK (amount_numeric > 0),
  amount_atomic TEXT NOT NULL,
  token_symbol TEXT NOT NULL CHECK (token_symbol IN ('USDT', 'USDC', 'ETH', 'WETH')),
  token_decimals SMALLINT NOT NULL DEFAULT 6 CHECK (token_decimals BETWEEN 0 AND 18),
  network TEXT NOT NULL DEFAULT 'Testnet',
  purpose TEXT NOT NULL CHECK (char_length(trim(purpose)) BETWEEN 1 AND 500),
  tx_hash TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'confirmed', 'failed', 'cancelled')),
  verified_control BOOLEAN NOT NULL DEFAULT FALSE,
  receipt_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE TRIGGER trg_transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Prevent non-service-role clients from forging transaction verification or status transitions
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
    ELSIF TG_OP = 'UPDATE' THEN
      NEW.status := OLD.status;
      NEW.verified_control := OLD.verified_control;
      NEW.receipt_verified_at := OLD.receipt_verified_at;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_transactions_guard_sensitive
  BEFORE INSERT OR UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_sensitive_transaction_fields();

-- 7. Verification Records
CREATE TABLE IF NOT EXISTS public.verification_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  wallet_id UUID REFERENCES public.wallets(id) ON DELETE SET NULL,
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE CASCADE,
  verification_type TEXT NOT NULL CHECK (verification_type IN ('wallet_control', 'blockchain_receipt', 'recipient_check')),
  subject_address TEXT NOT NULL,
  network TEXT NOT NULL DEFAULT 'Testnet',
  status TEXT NOT NULL CHECK (status IN ('pending', 'verified', 'failed')),
  proof_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 8. Risk Assessments
CREATE TABLE IF NOT EXISTS public.risk_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  payment_request_id UUID REFERENCES public.payment_requests(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE CASCADE,
  recipient_address TEXT NOT NULL,
  network TEXT NOT NULL DEFAULT 'Testnet',
  risk_score SMALLINT NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  summary TEXT NOT NULL,
  factors JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

