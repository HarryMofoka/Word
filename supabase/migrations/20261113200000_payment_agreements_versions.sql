-- Phase 9: Payment agreement versions, locking after acceptance, and linked request metadata
ALTER TABLE public.payment_agreements
  ADD COLUMN IF NOT EXISTS purpose text,
  ADD COLUMN IF NOT EXISTS recipient_name text,
  ADD COLUMN IF NOT EXISTS recipient_address text,
  ADD COLUMN IF NOT EXISTS current_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz;

CREATE TABLE IF NOT EXISTS public.payment_agreement_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id uuid NOT NULL REFERENCES public.payment_agreements(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  title text NOT NULL,
  purpose text NOT NULL,
  amount_numeric numeric NOT NULL,
  token_symbol text NOT NULL,
  network text NOT NULL,
  recipient_name text NOT NULL,
  recipient_address text NOT NULL,
  terms_text text NOT NULL,
  edited_by uuid REFERENCES auth.users(id),
  change_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agreement_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_payment_agreement_versions_agreement_version
  ON public.payment_agreement_versions (agreement_id, version_number DESC);

ALTER TABLE public.payment_agreement_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants can view agreement versions" ON public.payment_agreement_versions;
CREATE POLICY "Participants can view agreement versions"
  ON public.payment_agreement_versions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.payment_agreements pa
      WHERE pa.id = payment_agreement_versions.agreement_id
        AND (
          pa.creator_id = (SELECT auth.uid())
          OR pa.counterparty_id = (SELECT auth.uid())
        )
    )
  );

CREATE OR REPLACE FUNCTION public.prevent_locked_agreement_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.locked_at IS NOT NULL OR OLD.status = 'accepted' THEN
    IF NEW.title IS DISTINCT FROM OLD.title
       OR NEW.purpose IS DISTINCT FROM OLD.purpose
       OR NEW.terms_text IS DISTINCT FROM OLD.terms_text
       OR NEW.amount_numeric IS DISTINCT FROM OLD.amount_numeric
       OR NEW.token_symbol IS DISTINCT FROM OLD.token_symbol
       OR NEW.network IS DISTINCT FROM OLD.network
       OR NEW.recipient_name IS DISTINCT FROM OLD.recipient_name
       OR NEW.recipient_address IS DISTINCT FROM OLD.recipient_address THEN
      RAISE EXCEPTION 'Accepted payment agreements are locked and cannot be silently modified.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_locked_agreement_mutation ON public.payment_agreements;
CREATE TRIGGER trg_prevent_locked_agreement_mutation
  BEFORE UPDATE ON public.payment_agreements
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_locked_agreement_mutation();

