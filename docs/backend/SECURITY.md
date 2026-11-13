# Word — Security Architecture

## 1. Row Level Security (RLS)
- RLS is enabled on all **15** `public` tables.
- All user-scoped policies evaluate `(select auth.uid())` once per query for performance and isolation.
- **Profiles & Wallets:** Strictly owner-only (`(select auth.uid()) = user_id`).
- **Payment Agreements, Transactions, Verification Records, Risk Assessments, Disputes, Evidence:** Scoped to participants (`sender_id`, `recipient_id`, `creator_id`, `counterparty_id`, `reporter_id`).
- **Notifications & Assistant Sessions/Messages:** Strictly private to `(select auth.uid()) = user_id`.
- **Audit Logs:** Authenticated users can read their own `actor_user_id` rows; `INSERT`/`UPDATE`/`DELETE` are blocked for `anon` and `authenticated`.
- **Rate Limit Buckets:** RLS enabled with zero client policies (`service_role` only).

## 2. Database Defense-in-Depth Triggers
- `guard_sensitive_wallet_fields()` prevents non-`service_role` clients from setting `wallets.is_verified = true`.
- `guard_sensitive_transaction_fields()` forces client-inserted transactions to `pending` / `verified_control = false` and blocks client-side status/receipt updates.
- `public.handle_new_user()` has `SET search_path = ''` and `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated`.

## 3. Private Key & Credential Boundaries
- Private keys and recovery seed phrases are **never** accepted, logged, or stored in Supabase.
- `SUPABASE_SERVICE_ROLE_KEY` is never bundled into Vite (`VITE_*`) or committed to Git.

## 4. Storage Security
- `dispute-evidence` is a private bucket (`public = false`) with `storage.objects` policies enforcing that folder prefix `(storage.foldername(name))[1]` matches a `disputes.id` where the caller is `reporter_id` or `counterparty_id`.

