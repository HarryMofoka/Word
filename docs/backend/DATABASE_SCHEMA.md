# Word — Database Schema (`public` & `storage`)

All schema changes are tracked in `supabase/migrations/`:
1. `20261113000100_core_profiles_wallets.sql`
2. `20261113000200_payments_agreements_transactions.sql`
3. `20261113000300_disputes_notifications_audit_assistant.sql`
4. `20261113000400_rls_indexes_storage.sql`
5. `20261113000500_security_hardening_and_fk_indexes.sql`

---

## Tables

| Table | Purpose | Key Constraints / Triggers |
| :--- | :--- | :--- |
| `profiles` | 1:1 user profile synced from `auth.users` | Auto-created by `handle_new_user()` trigger; `updated_at` trigger |
| `wallets` | Public wallet addresses & verification status | Unique `(user_id, address, network)`; `guard_sensitive_wallet_fields()` prevents client forging `is_verified` |
| `wallet_challenges` | Nonce & message challenges for wallet control proofs | Status in `('pending', 'verified', 'expired')`; expires after 10 min |
| `payment_requests` | Shareable QR/link payment requests | `amount_numeric NUMERIC(38,18) > 0`, `amount_atomic TEXT`, unique `share_code` |
| `payment_agreements` | Structured payment terms & participant acceptance | Status in `('draft','proposed','accepted','disputed','fulfilled','cancelled')` |
| `transactions` | Shared payment records between sender & recipient | `guard_sensitive_transaction_fields()` blocks client status/verification forgery |
| `verification_records` | Wallet control, receipt, and recipient check proofs | Linked to `user_id`, `wallet_id`, `transaction_id` |
| `risk_assessments` | Pre-approval risk score (`0-100`), level, and factors | Linked to `user_id`, `payment_request_id`, `transaction_id` |
| `disputes` | Participant-scoped dispute cases on transactions | Status in `('open','evidence_submitted','under_review','resolved','dismissed')` |
| `evidence` | Dispute evidence notes & Storage object metadata | Linked to `dispute_id` and `submitted_by` |
| `notifications` | Private per-user payment, verification, security, dispute alerts | Owner `is_read` & `read_at` updates |
| `audit_logs` | Append-only security & financial state-change log | Service-role writes only; immutable to `anon` / `authenticated` |
| `assistant_sessions` | Private per-user AI assistant conversation threads | Owner-scoped CRUD |
| `assistant_messages` | Messages belonging to `assistant_sessions` | Ordered by `created_at ASC` |
| `rate_limit_buckets` | Fixed-window rate limit counters for Edge Functions | RLS enabled, zero client policies (`service_role` only) |

## Storage Buckets
- **`dispute-evidence`** (`public = false`, 10 MB limit, allowed MIME types: `image/png`, `image/jpeg`, `image/webp`, `application/pdf`, `text/plain`).

