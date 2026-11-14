# Codebase Change History (`Word`)

This document records all changes made to the **Word** codebase across this development and hardening effort, including which files were affected and why.

---

## Uncommitted Changes (Logo Integration & Full Code Audit Fixes)

### 1. Brand Logo & Asset Integration
- **[public/word-logo.png](file:///c:/Users/mofok/OneDrive/Desktop/Word/public/word-logo.png)** & **[public/word-mark.png](file:///c:/Users/mofok/OneDrive/Desktop/Word/public/word-mark.png)** *(added)*
  - **Why:** Added the full Word horizontal logo (`1024x682`) and cropped square emblem mark (`331x331`) as static public assets for use in `<head>` icons and UI headers.
- **[index.html](file:///c:/Users/mofok/OneDrive/Desktop/Word/index.html)** *(modified)*
  - **Why:** Linked `/word-mark.png` in `<link rel="icon">` and `<link rel="apple-touch-icon">` inside `<head>` so the Word brand mark renders in browser tabs, bookmarks, and mobile home-screen shortcuts.
- **[src/components/ui/WordLogo.tsx](file:///c:/Users/mofok/OneDrive/Desktop/Word/src/components/ui/WordLogo.tsx)** *(modified)*
  - **Why:** Replaced the inline SVG mark with `/word-mark.png` so the navbar, footer, and workspace header consistently display the official Word emblem alongside the typography.
- **[src/app-workspace/components/OnboardingWelcome.tsx](file:///c:/Users/mofok/OneDrive/Desktop/Word/src/app-workspace/components/OnboardingWelcome.tsx)** *(modified)*
  - **Why:** Added the `/word-mark.png` emblem to the workspace onboarding welcome screen.

### 2. Full Code Audit Fixes (Functional, Reliability, Security & Repo Hygiene)
- **[src/app-workspace/components/payments/PaymentPayFlow.tsx](file:///c:/Users/mofok/OneDrive/Desktop/Word/src/app-workspace/components/payments/PaymentPayFlow.tsx)** *(modified)*
  - **Why:** Fixed two critical payment-outcome reliability issues:
    1. Added `applyServerOutcome(transaction)` so `executeRealPayment` and `handleRecheckPending` treat the server's RPC-verified `transaction.status` (`confirmed`, `processing`/`pending`, or `failed`) as authoritative rather than relying solely on the client poll outcome.
    2. Tracked `broadcastHash` inside `executeRealPayment` so if a network/status-sync error occurs *after* `executeOnChainPayment` broadcasts a transaction, the UI transitions to `pending` ("Status sync interrupted after broadcast") instead of falsely reporting `failure` ("No funds were transferred").
- **[src/app-workspace/WordApp.tsx](file:///c:/Users/mofok/OneDrive/Desktop/Word/src/app-workspace/WordApp.tsx)** & **[src/app-workspace/components/WalletImport.tsx](file:///c:/Users/mofok/OneDrive/Desktop/Word/src/app-workspace/components/WalletImport.tsx)** *(modified)*
  - **Why:**
    1. Fixed broken wallet registration challenge verification: `persistWalletRegistration` previously sent a placeholder non-hex string (`0xword_sig_...`) that `supabase/functions/wallet-challenge/index.ts` always rejected with `400 INVALID_SIGNATURE`. Updated `persistWalletRegistration` to sign `challenge.message` via `signChallengeMessage` (producing a valid 65-byte ECDSA hex signature), and updated `WalletImport.tsx` to pass the normalized phrase transiently to `onImportSuccess` after clearing component state.
    2. Fixed in-memory mnemonic retention: cleared `demoSeedWords: undefined` in `onConfirmBackup` inside `WordApp.tsx` once the user confirms they backed up their recovery phrase, preventing plaintext seed words from remaining in React state for the rest of the session.
- **[.gitignore](file:///c:/Users/mofok/OneDrive/Desktop/Word/.gitignore)** *(modified)*
  - **Why:** Added `*.tsbuildinfo` so TypeScript incremental build cache files stop dirtying the Git working tree on every build.

---

## Committed Milestones

### Phase 10–11: Security, Reliability, Privacy & QA (`6796946`, `06ffaaa`)
- **Edge Function & API Hardening:**
  - [supabase/functions/_shared/cors.ts](file:///c:/Users/mofok/OneDrive/Desktop/Word/supabase/functions/_shared/cors.ts), [supabase/functions/_shared/errors.ts](file:///c:/Users/mofok/OneDrive/Desktop/Word/supabase/functions/_shared/errors.ts), [supabase/functions/_shared/validation.ts](file:///c:/Users/mofok/OneDrive/Desktop/Word/supabase/functions/_shared/validation.ts)
  - Updated all 13 Edge Functions (`assistant`, `disputes`, `evidence-auth`, `notifications`, `payment-agreements`, `payment-cancel`, `payment-prepare`, `payment-requests`, `profile`, `receipt-verify`, `recipient-verify`, `risk-assessment`, `wallet-challenge`) to pass `req` to `jsonResponse`/`errorResponse` for dynamic origin-matched CORS headers and `Vary: Origin`, hardened `evidence-auth` path traversal & MIME/size checks, enforced 65-byte ECDSA signature format + replay protection in `wallet-challenge`, and added server-side RPC receipt verification in `receipt-verify`.
  - [vercel.json](file:///c:/Users/mofok/OneDrive/Desktop/Word/vercel.json) & [index.html](file:///c:/Users/mofok/OneDrive/Desktop/Word/index.html): Added security headers (`CSP`, `HSTS`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`).
- **Frontend Security, Wallet Security, Reliability & Privacy Services:**
  - [src/services/securityService.ts](file:///c:/Users/mofok/OneDrive/Desktop/Word/src/services/securityService.ts): Sanitization and secret-redaction helpers.
  - [src/services/walletSecurityService.ts](file:///c:/Users/mofok/OneDrive/Desktop/Word/src/services/walletSecurityService.ts): Pre-signing transaction validation, approval acknowledgment enforcement, and address/network/token checks.
  - [src/services/reliabilityService.ts](file:///c:/Users/mofok/OneDrive/Desktop/Word/src/services/reliabilityService.ts): Safe retry/backoff, idempotency, and failure-mode state guards so funds are protected and payment success is never falsely reported.
  - [src/services/privacyService.ts](file:///c:/Users/mofok/OneDrive/Desktop/Word/src/services/privacyService.ts): Personal data inventory, retention policy definitions, and AI data-handling disclosures surfaced in [src/app-workspace/components/SettingsView.tsx](file:///c:/Users/mofok/OneDrive/Desktop/Word/src/app-workspace/components/SettingsView.tsx) and [src/app-workspace/components/DashboardView.tsx](file:///c:/Users/mofok/OneDrive/Desktop/Word/src/app-workspace/components/DashboardView.tsx).
  - [src/services/apiClient.ts](file:///c:/Users/mofok/OneDrive/Desktop/Word/src/services/apiClient.ts): Retry/backoff on transient `5xx`/network failures and normalized `ApiError` handling.
- **QA Test Suites Added:**
  - [test/backend and security/applicationSecurity.test.ts](file:///c:/Users/mofok/OneDrive/Desktop/Word/test/backend%20and%20security/applicationSecurity.test.ts)
  - [test/backend and security/walletSecurity.test.ts](file:///c:/Users/mofok/OneDrive/Desktop/Word/test/backend%20and%20security/walletSecurity.test.ts)
  - [test/backend and security/reliability.test.ts](file:///c:/Users/mofok/OneDrive/Desktop/Word/test/backend%20and%20security/reliability.test.ts)
  - [test/backend and security/privacy.test.ts](file:///c:/Users/mofok/OneDrive/Desktop/Word/test/backend%20and%20security/privacy.test.ts)
  - [test/functional/endToEndFunctional.test.ts](file:///c:/Users/mofok/OneDrive/Desktop/Word/test/functional/endToEndFunctional.test.ts)
  - [test/functional/negativeTesting.test.ts](file:///c:/Users/mofok/OneDrive/Desktop/Word/test/functional/negativeTesting.test.ts)
  - [test/functional/integrationTesting.test.ts](file:///c:/Users/mofok/OneDrive/Desktop/Word/test/functional/integrationTesting.test.ts)
  - [test/functional/uiAndDeviceTesting.test.ts](file:///c:/Users/mofok/OneDrive/Desktop/Word/test/functional/uiAndDeviceTesting.test.ts)

### Phase 9: Payment Agreements, Transaction Records & Dispute Management (`d3bc69d`)
- **Why:** Added versioned payment agreements, structured transaction records, and dispute evidence workflows.
- **Files:**
  - `src/services/agreementService.ts`, `src/services/transactionRecordService.ts`, `src/services/disputeService.ts`, `src/services/accountabilityService.ts`
  - `src/app-workspace/components/accountability/PaymentAgreementView.tsx`, `SharedRecordView.tsx`, `DisputeFlowView.tsx`
  - `src/app-workspace/types.ts`
  - `supabase/functions/payment-agreements/index.ts`, `supabase/migrations/20261113200000_payment_agreements_versions.sql`
  - `test/agreements and disputes/paymentAgreements.test.ts`, `transactionRecords.test.ts`, `disputeManagement.test.ts`

### Phase 8: QVAC On-Device AI Assistant (`a4a772d`)
- **Why:** Added on-device AI payment interpretation, natural-language parsing, safety guards, and documentation/tests.
- **Files:** `src/services/qvacAssistantService.ts`, `src/app-workspace/components/advanced/AssistantRiskHub.tsx`, `docs/qvac-on-device-ai.md`, `test/on-device ai/qvacAssistant.test.ts`

### Phase 7: Explainable Risk Intelligence (`f92cd13`)
- **Why:** Implemented explainable payment risk scoring, UI warnings, and audit trails.
- **Files:** `src/services/riskIntelligenceService.ts`, `test/risk intelligence/riskIntelligence.test.ts`, and risk integration in payment flows.

### Phases 4–6: Backend, WDK Wallet, On-Chain Payments, QR Requests & Recipient Verification (`eabdb32`, `7798818`, `f56c017`, `9d8d368`, `b94ecba`)
- **Why:** Built the Supabase schema/migrations (`supabase/migrations/20261113000100`–`20261113000500`), all core Edge Functions, Tether WDK wallet integration (`src/services/wdkWalletService.ts`), Vite polyfills (`sodium-javascript`), on-chain transaction execution/receipt verification, QR payment requests with expiry and tamper protection, and cryptographic recipient verification (`recipientVerificationService.ts`).

### Phases 1–3: Platform Rebuild, Marketing Site & App Workspace (`156992b` – `1e74dfbd`)
- **Why:** Rebuilt Word in React, TypeScript, Vite, and Three.js; added frosted auth/info pages, responsive mobile/canvas optimizations, and the full `src/app-workspace` UI (onboarding, wallet setup/import, dashboard, payments, accountability, assistant, notifications, profile, settings).

