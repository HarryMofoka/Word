# Word Mutual Trust Verification System

**Branch:** `feature/facial-verification`  
**Status:** Feature implemented locally across database migrations, Supabase Edge Functions, frontend services/UI, Vitest suite, and reference Solidity contracts (pending remote Supabase migration/function push and optional testnet contract deployment).

---

## 1. Core Security Guarantee

No payment transaction in Word can obtain payment preparation (`payment-prepare`), proceed to execution, or finalize receipt verification (`receipt-verify`) until **both the sender and the recipient** have:

1. Independently completed identity verification (`facial_liveness` via provider/adapter or explicit `alternative_fallback`).
2. Received and acknowledged the counterparty's **sanitized verification report** (zero biometrics, zero facial media, zero email/identity documents disclosed).
3. Reviewed the identical **canonical transaction payload** (`canonicalTxHash`) and linked payment agreement terms.
4. Cryptographically co-signed **EIP-712 typed data** (`WordMutualTrust v1`) containing role-specific confirmation statements:
   - **Sender:** `"I have reviewed the recipient's verification results and agree to proceed with this transaction."`
   - **Recipient:** `"I have reviewed the sender's verification results and agree to receive this transaction."`

If transaction parameters, agreement terms (`payment-agreements` `revise`), or verification validity change prior to execution, all active signatures in `transaction_approvals` are marked `revoked` and both parties must review and co-sign the new canonical hash.

---

## 2. Provider Architecture (`IdentityVerificationProvider`)

Implemented in `supabase/functions/_shared/identityProvider.ts`:

- **Production Adapter (`VeriffProviderAdapter`):** Active automatically when `VERIFF_API_KEY` and `VERIFF_SHARED_SECRET` are set in Supabase Edge Function secrets. Chosen for POPIA/global compatibility, 3D liveness & presentation-attack detection, hosted verification sessions, and HMAC-SHA256 webhooks (`x-hmac-signature` verified with constant-time compare + replay guard in `provider_webhook_events`).
- **Development Sandbox Adapter (`SandboxIdentityProvider`):** Active when external credentials are not configured.
  - Clearly sets `isSandbox = true` and `assuranceLevel = 'sandbox_demo'` on all records, UI badges, counterparty reports, and receipts.
  - Runs genuine in-memory browser WebRTC canvas liveness checks (inter-frame motion delta score, luminance bounds, oval contrast check, randomized challenges) so static images fail liveness, while explicitly warning users that sandbox mode is **never genuine KYC**.
- **Accessible Alternative Route (`alternative_verify`):** Available when a device lacks a working camera or requires an accessibility accommodation. Records `verificationMethod = 'alternative_fallback'`, `assuranceLevel = 'alternative_fallback'`, optionally co-signed via wallet message, and displays a security warning on the counterparty's report.

---

## 3. POPIA Privacy & Zero Raw Biometric Storage

- Raw camera video streams and photos stay exclusively in transient browser RAM for inter-frame liveness scoring and are released immediately when capture ends.
- `identity-verification` rejects any request body containing image/video/base64/template keys with HTTP `400 BIOMETRIC_MEDIA_REJECTED`.
- Database table `identity_verification_results` stores only signed status outcomes, assurance level, salted commitment hash (never raw biometric vectors), consent timestamp (`popia_consent_at`), and 30-day retention deadline (`retention_expires_at`).
- Counterparty reports (`toSanitizedCounterpartyReport`) strictly omit commitment hashes, email addresses, identity documents, and provider secrets.
- `DELETE /identity-verification` allows users anytime from Profile or Settings privacy controls to revoke and erase active records and automatically invalidate pending open approvals.

---

## 4. Environment Variables & Deployment Checklist

### Required / Optional Edge Function Secrets (Supabase)
| Variable | Required? | Purpose |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Yes (auto-managed) | Supabase client & privileged trigger bypass inside Edge Functions |
| `MUTUAL_TRUST_ATTESTATION_SECRET` | Recommended | Dedicated HMAC-SHA256 signing key for verification attestations & `MutualTrustReceipt` HMACs |
| `VERIFF_API_KEY` | Production KYC | Enables live `VeriffProviderAdapter` |
| `VERIFF_SHARED_SECRET` | Production KYC | Validates Veriff webhooks (`x-hmac-signature`) & decision polling |
| `VERIFF_BASE_URL` | Optional | Defaults to `https://stationapi.veriff.com` |
| `WORD_SANDBOX_WEBHOOK_SECRET` | Optional (dev/QA) | Validates `x-word-webhook-signature` on sandbox webhook tests |

### Deploying Database & Functions to Supabase
1. Apply migration `supabase/migrations/20261114000100_mutual_trust_verification.sql` (adds tables, strict RLS, trigger guards, indexes, and adds `mutual_verification_sessions`, `transaction_approvals`, `mutual_trust_receipts` to `supabase_realtime`).
2. Deploy updated/new Edge Functions:
   - `identity-verification`
   - `mutual-trust`
   - `payment-prepare`
   - `receipt-verify`
   - `payment-agreements`
3. Frontend requires no new `VITE_` secrets (`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` only). CSP in `vercel.json` already permits `wss://*.supabase.co` Realtime connections.

---

## 5. Architecture & Honest Production Boundary

- **What IS Enforced Today:** Database-level RLS & `service_role` triggers prevent direct client spoofing of verification states, mutual sessions, EIP-712 approvals, or receipts. Edge Functions enforce the dual-party signature gate, canonical hash integrity, replay checks, and agreement mutation invalidation before payment execution or receipt issuance.
- **Smart Contract Boundary:** Reference bilateral contracts `contracts/src/WordMutualTrustRouter.sol` and `contracts/src/WordEscrow.sol` are authored in-repo matching Word's exact `WordMutualTrust` EIP-712 struct and statements, **but are not yet compiled (`forge` not present locally) or deployed on-chain**. Direct wallet RPC transfers outside Word cannot be blocked on-chain until `WordMutualTrustRouter` is deployed and wired into `wdkWalletService.ts`.

