# Word — Phase 4 Implementation Status

**Supabase Project:** `Word` (`jbfefrxzawzbeixjbtmo`, `eu-west-2`, Postgres `17.11.0.019`)

## Completed
- **Migrations Applied (5):**
  1. `core_profiles_wallets` (`20261113054017`)
  2. `payments_agreements_transactions` (`20261113054033`)
  3. `disputes_notifications_audit_assistant` (`20261113054044`)
  4. `rls_indexes_storage` (`20261113054059`)
  5. `security_hardening_and_fk_indexes` (`20261113054136`)
- **Edge Functions Deployed (12 `ACTIVE`):**
  `profile`, `wallet-challenge`, `payment-requests`, `payment-agreements`, `risk-assessment`, `payment-prepare`, `payment-cancel`, `receipt-verify`, `disputes`, `evidence-auth`, `notifications`, `assistant`
- **Database Types:** Generated from live schema into `src/types/database.ts`.
- **Frontend Services & Wiring:** `@supabase/supabase-js` installed; `src/lib/supabase.ts` and `src/services/*` connected to `AuthPages.tsx`, `App.tsx`, `WordApp.tsx`, `PaymentRequestFlow.tsx`, `PaymentPayFlow.tsx`, and `AssistantRiskHub.tsx`.
- **Deployment Config:** `.env.example`, `.env.local` (gitignored), `vercel.json` SPA rewrites.

## Environment Variables for Vercel Free
Set these in Vercel Project Settings -> Environment Variables:
- `VITE_SUPABASE_URL=https://jbfefrxzawzbeixjbtmo.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_KarTRQF097bPNrxYPXWayQ_5yNY9XgP`

## Manual Configuration Notes
- **Supabase Auth Redirect URLs:** Add your Vercel production/preview URLs in Supabase Dashboard -> Authentication -> URL Configuration.
- **Email Confirmation:** Currently uses Supabase project default email settings; configure custom SMTP if needed for production volume.

