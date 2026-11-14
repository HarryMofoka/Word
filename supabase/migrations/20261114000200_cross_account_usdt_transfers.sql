-- Cross-Account Simulated USDT Balance Ledger & Atomic Transfer RPC

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS usdt_balance numeric(20, 2) NOT NULL DEFAULT 2500.00;

-- Initialize mofokaharry@gmail.com to 400.00 USDT (or preserve existing simulatedUsdtBalance preference)
UPDATE public.profiles
SET usdt_balance = CASE
  WHEN lower(email) = 'mofokaharry@gmail.com' THEN 400.00
  WHEN preferences ? 'simulatedUsdtBalance' AND (preferences->>'simulatedUsdtBalance') ~ '^[0-9]+(\.[0-9]+)?$'
    THEN (preferences->>'simulatedUsdtBalance')::numeric(20, 2)
  ELSE 2500.00
END;

CREATE OR REPLACE FUNCTION public.get_my_usdt_balance()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_bal numeric(20, 2);
  v_email text;
  v_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT usdt_balance, email, display_name
    INTO v_bal, v_email, v_name
  FROM public.profiles
  WHERE id = v_uid;

  IF v_bal IS NULL THEN
    v_bal := 2500.00;
  END IF;

  RETURN jsonb_build_object(
    'usdt_balance', to_char(v_bal, 'FM999999999990.00'),
    'email', COALESCE(v_email, ''),
    'display_name', COALESCE(v_name, '')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_my_usdt_balance(p_balance numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_clean numeric(20, 2) := GREATEST(0, COALESCE(p_balance, 2500.00));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  UPDATE public.profiles
  SET
    usdt_balance = v_clean,
    preferences = COALESCE(preferences, '{}'::jsonb) || jsonb_build_object(
      'simulatedUsdtBalance', to_char(v_clean, 'FM999999999990.00')
    ),
    updated_at = now()
  WHERE id = v_uid;

  RETURN jsonb_build_object(
    'usdt_balance', to_char(v_clean, 'FM999999999990.00')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_platform_recipients()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows jsonb;
BEGIN
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'user_id', p.id,
        'display_name', p.display_name,
        'email', p.email,
        'wallet_address', w.address,
        'network', COALESCE(w.network, 'Testnet'),
        'usdt_balance', to_char(p.usdt_balance, 'FM999999999990.00'),
        'completed_tx_count', (
          SELECT count(*) FROM public.transactions t
          WHERE (t.sender_id = p.id OR t.recipient_id = p.id)
            AND t.status = 'confirmed'
        ),
        'disputes_count', (
          SELECT count(*) FROM public.disputes d
          WHERE d.counterparty_id = p.id
        )
      )
    ),
    '[]'::jsonb
  )
  INTO v_rows
  FROM public.profiles p
  JOIN LATERAL (
    SELECT address, network
    FROM public.wallets w_inner
    WHERE w_inner.user_id = p.id
    ORDER BY w_inner.is_primary DESC, w_inner.created_at DESC
    LIMIT 1
  ) w ON true;

  RETURN v_rows;
END;
$$;

CREATE OR REPLACE FUNCTION public.execute_simulated_usdt_transfer(
  p_sender_address text,
  p_recipient_address text,
  p_recipient_name text,
  p_amount numeric,
  p_purpose text DEFAULT 'Stablecoin settlement',
  p_network text DEFAULT 'Testnet',
  p_tx_hash text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_id uuid := auth.uid();
  v_sender_name text;
  v_sender_bal numeric(20, 2);
  v_sender_new_bal numeric(20, 2);
  v_recipient_id uuid;
  v_recipient_actual_name text;
  v_recipient_bal numeric(20, 2);
  v_recipient_new_bal numeric(20, 2);
  v_amount numeric(20, 2) := GREATEST(0.01, ROUND(COALESCE(p_amount, 0), 2));
  v_tx_id uuid;
  v_hash text := COALESCE(
    p_tx_hash,
    '0x' || encode(gen_random_bytes(32), 'hex')
  );
BEGIN
  -- If auth.uid() is null, try resolving sender by wallet address
  IF v_sender_id IS NULL AND p_sender_address IS NOT NULL THEN
    SELECT user_id INTO v_sender_id
    FROM public.wallets
    WHERE lower(address) = lower(trim(p_sender_address))
    ORDER BY is_primary DESC, created_at DESC
    LIMIT 1;
  END IF;

  -- Resolve recipient user by wallet address (or display_name / email fallback)
  SELECT w.user_id, p.display_name, p.usdt_balance
    INTO v_recipient_id, v_recipient_actual_name, v_recipient_bal
  FROM public.wallets w
  JOIN public.profiles p ON p.id = w.user_id
  WHERE lower(w.address) = lower(trim(p_recipient_address))
  ORDER BY w.is_primary DESC, w.created_at DESC
  LIMIT 1;

  IF v_recipient_id IS NULL AND p_recipient_name IS NOT NULL THEN
    SELECT p.id, p.display_name, p.usdt_balance
      INTO v_recipient_id, v_recipient_actual_name, v_recipient_bal
    FROM public.profiles p
    WHERE lower(p.display_name) = lower(trim(p_recipient_name))
       OR lower(p.email) = lower(trim(p_recipient_name))
    LIMIT 1;
  END IF;

  -- 1. Deduct from sender if sender profile exists
  IF v_sender_id IS NOT NULL THEN
    SELECT display_name, usdt_balance
      INTO v_sender_name, v_sender_bal
    FROM public.profiles
    WHERE id = v_sender_id
    FOR UPDATE;

    v_sender_new_bal := GREATEST(0, COALESCE(v_sender_bal, 2500.00) - v_amount);

    UPDATE public.profiles
    SET
      usdt_balance = v_sender_new_bal,
      preferences = COALESCE(preferences, '{}'::jsonb) || jsonb_build_object(
        'simulatedUsdtBalance', to_char(v_sender_new_bal, 'FM999999999990.00')
      ),
      updated_at = now()
    WHERE id = v_sender_id;
  END IF;

  -- 2. Credit recipient if recipient profile exists
  IF v_recipient_id IS NOT NULL THEN
    SELECT usdt_balance INTO v_recipient_bal
    FROM public.profiles
    WHERE id = v_recipient_id
    FOR UPDATE;

    v_recipient_new_bal := COALESCE(v_recipient_bal, 2500.00) + v_amount;

    UPDATE public.profiles
    SET
      usdt_balance = v_recipient_new_bal,
      preferences = COALESCE(preferences, '{}'::jsonb) || jsonb_build_object(
        'simulatedUsdtBalance', to_char(v_recipient_new_bal, 'FM999999999990.00')
      ),
      updated_at = now()
    WHERE id = v_recipient_id;
  END IF;

  -- 3. Record confirmed transaction for both sender and recipient
  IF v_sender_id IS NOT NULL THEN
    INSERT INTO public.transactions (
      sender_id,
      recipient_id,
      sender_address,
      recipient_name,
      recipient_address,
      amount_numeric,
      amount_atomic,
      token_symbol,
      token_decimals,
      network,
      purpose,
      tx_hash,
      status,
      verified_control,
      receipt_verified_at
    )
    VALUES (
      v_sender_id,
      v_recipient_id,
      COALESCE(p_sender_address, '0x0000000000000000000000000000000000000000'),
      COALESCE(v_recipient_actual_name, p_recipient_name, 'Recipient'),
      p_recipient_address,
      v_amount,
      (v_amount * 1000000)::bigint::text,
      'USDT',
      6,
      COALESCE(p_network, 'Testnet'),
      COALESCE(p_purpose, 'Stablecoin settlement'),
      v_hash,
      'confirmed',
      true,
      now()
    )
    RETURNING id INTO v_tx_id;

    -- Sender notification
    INSERT INTO public.notifications (
      user_id,
      category,
      title,
      detail,
      is_read
    )
    VALUES (
      v_sender_id,
      'Payment',
      'Stablecoin Sent: ' || to_char(v_amount, 'FM999999999990.00') || ' USDT',
      'Sent ' || to_char(v_amount, 'FM999999999990.00') || ' USDT to ' || COALESCE(v_recipient_actual_name, p_recipient_name) || '. Updated balance: ' || to_char(v_sender_new_bal, 'FM999999999990.00') || ' USDT.',
      false
    );
  END IF;

  -- 4. Recipient notification when credited
  IF v_recipient_id IS NOT NULL AND (v_sender_id IS NULL OR v_recipient_id <> v_sender_id) THEN
    INSERT INTO public.notifications (
      user_id,
      category,
      title,
      detail,
      is_read
    )
    VALUES (
      v_recipient_id,
      'Payment',
      'Stablecoin Received: +' || to_char(v_amount, 'FM999999999990.00') || ' USDT',
      'Received ' || to_char(v_amount, 'FM999999999990.00') || ' USDT from ' || COALESCE(v_sender_name, p_sender_address, 'Word Sender') || ' (' || COALESCE(p_purpose, 'Stablecoin settlement') || '). Your updated balance is ' || to_char(v_recipient_new_bal, 'FM999999999990.00') || ' USDT.',
      false
    );
  END IF;

  RETURN jsonb_build_object(
    'transaction_id', v_tx_id,
    'tx_hash', v_hash,
    'sender_new_balance', CASE WHEN v_sender_new_bal IS NOT NULL THEN to_char(v_sender_new_bal, 'FM999999999990.00') ELSE NULL END,
    'recipient_new_balance', CASE WHEN v_recipient_new_bal IS NOT NULL THEN to_char(v_recipient_new_bal, 'FM999999999990.00') ELSE NULL END,
    'recipient_credited', (v_recipient_id IS NOT NULL)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_usdt_balance() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_my_usdt_balance(numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_platform_recipients() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.execute_simulated_usdt_transfer(text, text, text, numeric, text, text, text) TO anon, authenticated;
