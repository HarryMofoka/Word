-- Migration 1: Core profiles, wallets, and wallet verification challenges
-- Uses exact timestamps, strict constraints, and zero private key / seed phrase storage.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$;

-- 1. User Profiles (1:1 with auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT 'Word User' CHECK (char_length(trim(display_name)) BETWEEN 1 AND 120),
  email TEXT,
  default_network TEXT NOT NULL DEFAULT 'Testnet' CHECK (default_network IN ('Testnet', 'Base Sepolia', 'Polygon Amoy')),
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  preferences JSONB NOT NULL DEFAULT '{"riskAlerts": true, "soundEffects": false, "compactMode": false}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Auto-create profile when a new auth user is created
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_display_name TEXT;
BEGIN
  v_display_name := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data ->> 'display_name'), ''),
    NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
    'Word User'
  );

  INSERT INTO public.profiles (id, display_name, email)
  VALUES (NEW.id, left(v_display_name, 120), NEW.email)
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 2. Wallets (public addresses only; never store private keys or seed phrases)
CREATE TABLE IF NOT EXISTS public.wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  address TEXT NOT NULL CHECK (char_length(trim(address)) BETWEEN 10 AND 128),
  network TEXT NOT NULL DEFAULT 'Testnet' CHECK (network IN ('Testnet', 'Base Sepolia', 'Polygon Amoy')),
  method TEXT NOT NULL CHECK (method IN ('created', 'connected', 'imported')),
  label TEXT NOT NULL DEFAULT 'Primary Wallet' CHECK (char_length(trim(label)) BETWEEN 1 AND 80),
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  verified_at TIMESTAMPTZ,
  recovery_backed_up BOOLEAN NOT NULL DEFAULT FALSE,
  is_primary BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT uq_wallets_user_address_network UNIQUE (user_id, address, network)
);

CREATE TRIGGER trg_wallets_updated_at
  BEFORE UPDATE ON public.wallets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Prevent non-service-role clients from forging wallet verification flags directly
CREATE OR REPLACE FUNCTION public.guard_sensitive_wallet_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(current_setting('role', true), '') <> 'service_role' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.is_verified := FALSE;
      NEW.verified_at := NULL;
    ELSIF TG_OP = 'UPDATE' THEN
      NEW.is_verified := OLD.is_verified;
      NEW.verified_at := OLD.verified_at;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_wallets_guard_sensitive
  BEFORE INSERT OR UPDATE ON public.wallets
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_sensitive_wallet_fields();

-- 3. Wallet Verification Challenges
CREATE TABLE IF NOT EXISTS public.wallet_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  wallet_id UUID REFERENCES public.wallets(id) ON DELETE CASCADE,
  address TEXT NOT NULL CHECK (char_length(trim(address)) BETWEEN 10 AND 128),
  network TEXT NOT NULL DEFAULT 'Testnet',
  nonce TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'expired')),
  signature TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);
