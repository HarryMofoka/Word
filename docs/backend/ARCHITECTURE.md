# Word — Backend Architecture

**Hosting Stack:**
- **Frontend:** Vercel Free (static Vite React SPA with `vercel.json` fallback rewrite).
- **Backend:** Supabase Free (`Word` project `jbfefrxzawzbeixjbtmo`, Postgres 17, Supabase Auth, Supabase Storage, Deno Edge Functions).

---

## High-Level Architecture

```text
React + Vite Frontend (Vercel Free)
  ├── @supabase/supabase-js (anon/publishable key ONLY)
  │     ├── Supabase Auth (JWT sessions, email/password)
  │     ├── Direct RLS-guarded reads (profiles, wallets, transactions)
  │     └── Signed URL uploads to private Storage (dispute-evidence)
  └── Supabase Edge Functions (Deno TypeScript, verify_jwt = true)
        ├── _shared/ (cors, auth, errors, validation, logger, rateLimit)
        ├── profile
        ├── wallet-challenge
        ├── payment-requests
        ├── payment-agreements
        ├── risk-assessment
        ├── payment-prepare
        ├── payment-cancel
        ├── receipt-verify
        ├── disputes
        ├── evidence-auth
        ├── notifications
        └── assistant
              │
              ▼
        Supabase Postgres 17 (15 public tables + storage.buckets)
```

## Key Design Principles
1. **Zero Secret Exposure:** Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are exposed to the frontend. `SUPABASE_SERVICE_ROLE_KEY` stays strictly inside Edge Functions.
2. **Self-Custody Boundary:** Private keys and seed phrases are never transmitted to or stored in Supabase. `wallets` stores public addresses, network, setup method, and cryptographic verification timestamps only.
3. **Exact Financial Precision:** Token amounts are validated as exact decimal strings and stored as `NUMERIC(38, 18)` alongside integer atomic unit strings (`amount_atomic`) and `token_decimals`. No floating-point arithmetic is used.
4. **Server-Authoritative State Transitions:** Sensitive fields (`wallets.is_verified`, `transactions.status`, `transactions.receipt_verified_at`) are protected by Postgres triggers and updated exclusively by Edge Functions via `service_role`.

