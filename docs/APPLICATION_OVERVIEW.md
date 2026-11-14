# Word (`word-platform`) — Comprehensive Application & Feature Documentation

**Word** is a trust-first, self-custodial peer-to-peer digital payment and accountability platform built with React, TypeScript, Vite, Supabase, Ethers.js, and Tether's Wallet Development Kit (WDK). It wraps everyday on-chain transfers with structured payment requests, cryptographic recipient wallet-control verification, pre-approval risk intelligence, an on-device AI payment assistant, versioned payment agreements, verifiable shared transaction records, and evidence-backed dispute tracking.

---

## 1. Core Philosophy & Trust Boundaries

Word is designed around three foundational boundaries:

1. **Self-Custody by Design:** Word never holds user funds, private keys, or recovery seed phrases. Seed phrases are generated/imported strictly in-memory on the client (`wdkWalletService.ts`), stripped from React state once backup is confirmed (`WordApp.tsx`), and blocked from outbound API payloads (`assertNoSecretMaterialInPayload` in `walletSecurityService.ts`).
2. **Honest Verification Boundaries:** Wallet-control verification confirms cryptographic signature control over an EVM address (`verifyMessage` against a nonce challenge). It **does not** establish real-world legal identity (`WALLET_CONTROL_IDENTITY_DISCLAIMER`), nor can Word reverse confirmed on-chain transactions.
3. **Server-Authoritative Accountability:** While funds move directly on-chain, all off-chain accountability state (`wallets.is_verified`, `transactions.status`, `transactions.receipt_verified_at`, locked `payment_agreements`, `audit_logs`, and `rate_limit_buckets`) is protected by Postgres Row Level Security (RLS), database triggers, and Supabase Deno Edge Functions.

---

## 2. Technology Stack & Build Configuration

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend Framework** | React `18.3.1`, TypeScript `5.6.3`, Vite `5.4.10` | Single-Page Application (SPA) with client-side routing (`src/app/App.tsx`) |
| **3D & Visuals** | Three.js `0.169.0`, Lucide React `0.454.0`, `qrcode` `1.5.4` | Interactive WebGL/dot-matrix hero visuals (`HeroCanvas.tsx`, `DotMatrixHands.tsx`) and payment QR generation |
| **Wallet & Blockchain** | `@tetherto/wdk`, `@tetherto/wdk-wallet-evm`, `ethers` `6.17.0`, `sodium-javascript` | Self-custodial EVM wallet creation/import, EIP-1193 browser wallet integration, RPC queries, signing, native/ERC-20 transfers |
| **Build Polyfills** | `vite-plugin-node-polyfills` (`Buffer`, `global`, `process`), `sodium-native` → `sodium-javascript` alias | Enables WDK cryptographic modules in the browser bundle (`vite.config.ts`) |
| **Backend & Database** | Supabase (`@supabase/supabase-js` `2.119.0`, Postgres 17, Auth, Storage, Deno Edge Functions) | Auth, 15 RLS-guarded tables, private `dispute-evidence` storage bucket, 13 Edge Functions |
| **On-Device AI** | `@qvac/sdk` (via `scripts/qvac-quickstart.mjs`) + `qvacAssistantService.ts` | Hardware capability probing, local GGUF model fit assessment, and browser-safe deterministic payment parsing |
| **Hosting & Security** | Vercel Free (`vercel.json`) | SPA fallback rewrite + strict CSP, HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Permissions-Policy` |
| **Testing** | Vitest `2.1.8` | 19 test files / 550 automated tests (`npm test`) |

---

## 3. Repository Structure

```text
Word/
├── src/
│   ├── app/App.tsx                  # Root router, Supabase auth hydration, marketing vs. workspace switch
│   ├── app-workspace/               # Authenticated Word Workspace (/app)
│   │   ├── WordApp.tsx              # Onboarding state machine, 8-tab workspace shell, live Supabase sync
│   │   ├── types.ts                 # Workspace types (OnboardingStep, WorkspaceTab, PaymentRequestData, etc.)
│   │   └── components/
│   │       ├── OnboardingWelcome.tsx, WalletSetup.tsx, WalletImport.tsx, SecurityRecovery.tsx, WalletConfirmation.tsx
│   │       ├── DashboardView.tsx, WalletOverviewView.tsx, NotificationsView.tsx, ProfileView.tsx, SettingsView.tsx
│   │       ├── payments/            # PaymentsHub, PaymentRequestFlow, PaymentPayFlow
│   │       ├── accountability/      # AccountabilityHub, TransactionDetailView, PaymentAgreementView, SharedRecordView, DisputeFlowView
│   │       └── advanced/            # AssistantRiskHub (AI chat, scam intel, alerts, risk breakdown)
│   ├── components/                  # Marketing website & auth UI
│   │   ├── hero/                    # Hero, HeroCanvas, DotMatrixHands (Three.js)
│   │   ├── sections/                # Problem, HowItWorks, Features, Security, Assistant, Audience, Accountability, Ecosystem, FAQ, FinalCTA
│   │   ├── pages/                   # AuthPages (/signin, /signup), FrostedInfoPage (/about, /contact, /docs, /privacy, /terms)
│   │   ├── navigation/ & footer/    # Navbar, MobileMenu, Footer
│   │   └── ui/                      # Accordion, Button, SectionHeading, WordLogo
│   ├── config/blockchain.ts         # Network & token registry (Ethereum Sepolia, Base Sepolia, Polygon Amoy)
│   ├── lib/supabase.ts              # Supabase browser client (anon/publishable key only)
│   ├── services/                    # 18 modular frontend service files (wallet, payments, risk, AI, security, privacy, reliability)
│   ├── styles/                      # tokens.css, global.css, typography.css, animations.css
│   └── types/                       # AppRoute & generated Supabase Database types (database.ts)
├── supabase/
│   ├── migrations/                  # 6 SQL migrations defining 15 tables, triggers, RLS, indexes, Storage bucket
│   └── functions/                   # 13 Deno Edge Functions + 6 _shared utilities
├── scripts/qvac-quickstart.mjs      # Native QVAC SDK hardware & model-fit probe script
├── docs/                            # Backend architecture, API contracts, schema, security, QVAC AI, and smart contract specs
└── test/                            # 19 Vitest suites (550 tests) organized by domain
```

---

## 4. Public Marketing Website & Routing

Handled in `src/app/App.tsx`, Word serves both a public marketing experience and the authenticated workspace without a separate router dependency:

- **`/` (`home`)**: Full landing page composed of 11 sections:
  1. `Hero` (`HeroCanvas` + `DotMatrixHands` Three.js WebGL visuals, primary CTA to `/signup`, smooth scroll to `#how-it-works`)
  2. `Problem` — Highlights blind address sending and lack of context in traditional wallets
  3. `HowItWorks` — Step-by-step overview of request, verify, assess, approve, and record
  4. `Features` — Core capabilities overview
  5. `Security` — Self-custody, non-custodial signing, and RLS protections
  6. `Assistant` — On-device AI assistant introduction
  7. `Audience` — Target users (freelancers, peer-to-peer buyers/sellers, teams)
  8. `Accountability` — Agreements, shared records, and dispute evidence
  9. `Ecosystem` — Supported networks, Tether WDK, and QVAC ecosystem
  10. `FAQ` — Interactive `Accordion` answers
  11. `FinalCTA` — Conversion call-to-action
- **Info Pages (`FrostedInfoPage.tsx`)**: `/about`, `/contact`, `/docs`, `/privacy`, `/terms` rendered with frosted glass panels over the `HeroCanvas` / `DotMatrixHands` backdrop.
- **Authentication (`/signin`, `/signup` via `AuthPages.tsx`)**: Email/password sign-in and sign-up backed by Supabase Auth (`authService.ts`), including display name metadata and email confirmation handling.
- **Workspace (`/app` via `WordApp.tsx`)**: Requires an active Supabase session; unauthenticated visitors to `/app` are presented with `AuthPage` in `signin` mode.

---

## 5. Onboarding & Wallet Management

### 5.1 Onboarding Flow (`WordApp.tsx`)
New users (or users without a backed-up wallet) progress through a 3-step onboarding indicator (`OnboardingStep`):
1. **`welcome` (`OnboardingWelcome.tsx`)**: Introduces Word's trust-first workflow.
2. **`wallet-setup` (`WalletSetup.tsx`)** or **`wallet-import` (`WalletImport.tsx`)**:
   - **Create WDK Wallet (`createWdkWallet`)**: Generates a 12-word BIP-39 mnemonic and EVM address locally using `@tetherto/wdk` + `@tetherto/wdk-wallet-evm`.
   - **Connect Browser Wallet (`connectBrowserWallet`)**: Connects an EIP-1193 provider (e.g., MetaMask) via `ethers.BrowserProvider`, detects chain ID, and maps it to Word's supported networks.
   - **Import Wallet (`importWdkWallet`)**: Validates and derives an address from a user-supplied seed phrase locally.
3. **`recovery-info` (`SecurityRecovery.tsx`)**: Displays the demo/new seed phrase for backup confirmation, updates `wallets.recovery_backed_up` via `updateWalletBackupFlag`, and immediately strips `demoSeedWords` from React state.
4. **`wallet-confirm` (`WalletConfirmation.tsx`)**: Registers the public wallet address with `/wallet-challenge` (`action: "register_and_challenge"`), signs the returned cryptographic nonce challenge (`signChallengeMessage`), verifies it via `/wallet-challenge` (`action: "verify_challenge"`), marks `profiles.onboarding_completed = true`, and enters the `workspace`.

### 5.2 Supported Networks & Tokens (`src/config/blockchain.ts`)
| Network Name | Label | Chain ID | Native Asset | Configured Tokens | Explorer |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `Testnet` (default) | Ethereum Sepolia (Testnet) | `11155111` | `ETH` | `USDT`, `USDC`, `ETH`, `WETH` | `sepolia.etherscan.io` |
| `Base Sepolia` | Base Sepolia (Testnet) | `84532` | `ETH` | `USDC`, `ETH` | `sepolia.basescan.org` |
| `Polygon Amoy` | Polygon Amoy (Testnet) | `80002` | `POL` | `USDC`, `ETH` | `amoy.polygonscan.com` |

Each network specifies a primary RPC URL (configurable via `VITE_SEPOLIA_RPC_URL`, `VITE_BASE_SEPOLIA_RPC_URL`, `VITE_POLYGON_AMOY_RPC_URL`) plus `fallbackRpcUrls` used by `executeWithRpcFailover`.

---

## 6. Workspace Features (8 Tabs)

Once onboarded, `WordApp.tsx` renders an 8-tab workspace:

### 6.1 Dashboard (`DashboardView.tsx`)
- Displays live token and native balances (`fetchWdkBalances`) with a privacy hide/show toggle (`balanceHidden`).
- Shows wallet verification badge, active network, and quick actions (`Send`, `Request`, `Verify`).
- Lists recent transactions (`records`) and unread notifications (`notifications`) with one-click navigation to record details or security recovery.

### 6.2 Payments Hub (`PaymentsHub.tsx`, `PaymentRequestFlow.tsx`, `PaymentPayFlow.tsx`)
1. **Request Creation (`PaymentRequestFlow.tsx`)**:
   - Validates exact decimal amounts (no floating-point arithmetic), token/network compatibility, and checksummed EVM recipient addresses.
   - Calls `/payment-requests` (`POST`) to persist a `payment_requests` row with a unique `WRD-*` `share_code`, optional `terms`, and optional linked `payment_agreements` record.
   - Generates a shareable URL (`${origin}/app?pay=WRD-...`) and QR code (`qrcode`).
   - Supports cancelling open requests via `/payment-cancel`.
2. **Payment Execution (`PaymentPayFlow.tsx`)**:
   - **Lookup & Deep Link**: Loads requests by `WRD-*` share code or QR payload (`parsePaymentQrPayload`), including `?pay=WRD-...` URL parameters and handoffs from the AI Assistant.
   - **Recipient Wallet-Control Verification (`recipientVerificationService.ts` + `/recipient-verify`)**: Issues a challenge or checks whether the recipient has cryptographically signed proof of control over `recipient_address` (`verified`, `mismatch`, or `unverified`), always displaying the identity boundary disclaimer.
   - **Payment Detail Validation (`paymentDetailValidationService.ts`)**: Compares requested details against intended details across fields (`recipientAddress`, `amount`, `token`, `network`, `purpose`, `terms`) and surfaces explicit `PaymentDiscrepancy` warnings.
   - **Pre-Approval Risk Assessment (`riskIntelligenceService.ts` + `/risk-assessment`)**: Computes a `0–100` risk score and level (`low`, `medium`, `high`, `critical`) and persists a `risk_assessments` audit row.
   - **Cost Quote & Signing Preview (`quoteTransferCost`, `validateTransactionForSigning`)**: Estimates gas fees (`estimateWdkGasFee`), checks balance sufficiency, and validates parameters before signing.
   - **Prepare → Execute → Verify Receipt**:
     1. `/payment-prepare` creates a `pending` `transactions` row using server-authoritative destination/amount data and prevents duplicate payment of already-completed requests.
     2. `executeOnChainPayment` sends the native or ERC-20 `transfer(to, amount)` transaction on-chain.
     3. `pollTransactionReceipt` waits for confirmation, and `/receipt-verify` independently verifies `eth_getTransactionReceipt` (`status === '0x1'`) via RPC, prevents `tx_hash` replay, marks the transaction `confirmed`/`failed`, completes the linked request, and writes a `verification_records` row.

### 6.3 Records & Accountability (`AccountabilityHub.tsx`)
Provides a filterable (`all`, `Confirmed`, `Pending`, `disputed`) ledger of transactions with four drill-down views:
1. **`TransactionDetailView.tsx`**: Full transaction metadata, on-chain explorer link (`txHash`), verification badge, and navigation to Agreement, Shared Record, or Dispute.
2. **`PaymentAgreementView.tsx` & `agreementService.ts`**:
   - Supports creating structured payment agreements (`title`, `purpose`, `amount`, `token`, `network`, `recipientName`, `recipientAddress`, `termsText`), revising draft/proposed agreements (creating immutable `payment_agreement_versions` snapshots), and dual-party acceptance (`creator` + `counterparty`).
   - Once accepted, `locked_at` is set and Postgres trigger `trg_prevent_locked_agreement_mutation` + `AgreementLockedError` prevent silent edits.
3. **`SharedRecordView.tsx` & `transactionRecordService.ts`**:
   - Generates a coherent `TransactionRecordDocument` combining transaction data, agreement reference, verification result, risk summary, and event timeline.
   - Enforces participant-only access (`canPartyAccessRecord`) and supports **JSON** (`exportTransactionRecordAsJson`) and **CSV** (`exportTransactionRecordAsCsv`) export.
4. **`DisputeFlowView.tsx` & `disputeService.ts` + `/disputes` + `/evidence-auth`**:
   - Allows transaction participants to open a dispute with a standardized category (`DISPUTE_CATEGORIES`), summary, and automatic acknowledgement ID.
   - Supports adding text evidence notes and uploading files (`image/png`, `image/jpeg`, `image/webp`, `application/pdf`, `text/plain`, up to 10 MB) to the private `dispute-evidence` Supabase Storage bucket via short-lived signed upload/download URLs from `/evidence-auth`.

### 6.4 AI Assistant & Risk Intelligence (`AssistantRiskHub.tsx`)
Combines 6 sub-views (`chat`, `history`, `summary`, `scam-intel`, `alerts`, `risk-details`):
- **QVAC On-Device AI (`qvacAssistantService.ts` & `docs/qvac-on-device-ai.md`)**:
  - Targets `LLAMA_3_2_1B_INST_Q4_0` (~770 MB, 4 GB+ RAM) and `QWEN_2_5_0_5B_INST_Q4_0` (~400 MB, 2 GB+ RAM) via `@qvac/sdk` in native/Bare runtimes (`scripts/qvac-quickstart.mjs`), with automatic fallback to `word-local-deterministic-v1` (`LOCAL_DETERMINISTIC_PARSER`) in the browser or on constrained/unsupported devices.
  - **Strict Permission Boundaries (`ASSISTANT_PERMISSIONS`)**: The assistant can *only* `draft_proposal` and explain risks. It is programmatically blocked (`assertAssistantActionAllowed`) from `sign_transaction`, `send_funds`, `export_private_key`, `override_risk_block`, or `modify_recipient_address`.
  - **Prompt-Injection Defense**: `detectPromptInjection` and `sanitizeUntrustedPaymentDescription` neutralize untrusted instructions embedded in payment descriptions.
  - **Data Boundary (`QVAC_DATA_BOUNDARY_SPEC` & `sanitizeForOutboundSync`)**: Raw prompts, hardware probes, and seed phrases never leave the device; only structured non-secret proposal fields sync when the user explicitly initiates an action or saves a thread to `/assistant`.
  - **Payment Handoff**: `prepareAssistantPaymentHandoff` passes a validated `PaymentRequestData` object directly to `PaymentPayFlow`.
- **Risk Intelligence (`riskIntelligenceService.ts`)**:
  - Weighted scoring across categories (`RISK_CATEGORY_WEIGHTS`) distinguishing `confirmed_mismatch`, `suspicious_indicator`, and `verified_signal`, producing `Low`, `Moderate`, `High`, or `Critical` classifications with plain-language explanations.

### 6.5 Wallet Overview, Notifications, Profile & Settings
- **`WalletOverviewView.tsx`**: Displays public address, wallet method (`created` / `connected` / `imported`), network, verification status, manual balance refresh, and quick access to `SecurityRecovery`.
- **`NotificationsView.tsx`**: Lists private notifications (`Payment`, `Verification`, `Security`) from `/notifications` with individual and bulk mark-as-read actions.
- **`ProfileView.tsx`**: Updates user `displayName` via `/profile`.
- **`SettingsView.tsx`**: Balance visibility toggle, network switcher (`Testnet`, `Base Sepolia`, `Polygon Amoy` — also triggers `switchBrowserNetwork` for EIP-1193 wallets and persists `defaultNetwork` to `/profile`), security recovery access, and sign-out.

---

## 7. Backend Architecture (Supabase)

### 7.1 Database Schema (6 Migrations, 15 `public` Tables + Storage)
1. `profiles` (1:1 with `auth.users`, auto-created by `handle_new_user()`)
2. `wallets` (public addresses, network, method, `recovery_backed_up`, `is_verified` guarded by trigger)
3. `wallet_challenges` (10-minute expiring nonces for wallet-control signatures)
4. `payment_requests` (exact `NUMERIC(38,18)` + `amount_atomic` strings, unique `share_code`, expiry & status)
5. `payment_agreements` (structured terms, dual-party acceptance, `locked_at` guarded by `trg_prevent_locked_agreement_mutation`)
6. `payment_agreement_versions` (immutable version history of agreement revisions)
7. `transactions` (shared sender/recipient records, `status` & `verified_control` guarded by trigger)
8. `verification_records` (proofs for wallet control, recipient control, and on-chain receipts)
9. `risk_assessments` (`0–100` score, level, and factor breakdown)
10. `disputes` (participant-scoped cases)
11. `evidence` (notes + Storage object metadata & SHA-256)
12. `notifications` (private per-user alerts)
13. `audit_logs` (append-only, `service_role`-only writes)
14. `assistant_sessions` (private AI chat threads)
15. `assistant_messages` (ordered thread messages)
- **Storage**: Private `dispute-evidence` bucket (`public = false`, 10 MB max, strict MIME allowlist, folder-prefix RLS tied to `disputes.id` participants).

### 7.2 Edge Functions (13 Functions + 6 Shared Modules)
Located in `supabase/functions/`, all functions use `_shared/` (`cors.ts`, `auth.ts`, `errors.ts`, `validation.ts`, `logger.ts`, `rateLimit.ts`):
- `profile`, `wallet-challenge`, `payment-requests`, `payment-agreements`, `recipient-verify`, `risk-assessment`, `payment-prepare`, `payment-cancel`, `receipt-verify`, `disputes`, `evidence-auth`, `notifications`, `assistant`.

---

## 8. Security, Privacy & Reliability Engineering

- **Application Security (`securityService.ts`, `apiClient.ts`, `vercel.json`)**:
  - `sanitizeUserText` strips control characters and normalizes whitespace; `isSafeExternalUrl` restricts links to `https:`/`http:` and blocks `javascript:`/`data:`; `redactSensitiveToken` masks tokens/hashes; `validateClientEnvSecurity` ensures no `service_role` or secret keys appear in `VITE_*` env vars.
  - `apiClient.ts` attaches `X-Word-Client` headers, enforces request timeouts, and hides internal stack traces/DB errors on `500` responses.
- **Privacy (`privacyService.ts`)**:
  - `minimizeStoredPersonalInfo` strips unnecessary PII, `redactEmailForDisplay` masks email addresses, and `PRIVACY_DATA_COLLECTION_SPEC` / `NEVER_COLLECTED_DATA` codify transparent data-handling disclosures.
- **Reliability (`reliabilityService.ts`)**:
  - `retryWithBackoff` (exponential backoff for transient network/5xx errors), `executeWithRpcFailover` (cycles through primary + fallback RPC URLs), `classifyBackendFailure`, `createIdempotencyKey`, `parsePaymentQrPayload`, `evaluatePaymentRequestAvailability`, `resolveAiInferenceWithFallback`, and `reconcilePendingTransactions`.

---

## 9. Test Suite Coverage

Running `npm test` (`vitest run`) executes **19 test files / 550 tests** (all 550 passing):
- **Wallet & Blockchain**: `test/wallet and blockchain/walletBlockchain.test.ts` (54 tests), `test/backend and security/walletSecurity.test.ts` (6 tests)
- **Payments, Validation & Processing**: `test/payment requests/paymentRequests.test.ts` (50), `test/payment detail validation/paymentDetailValidation.test.ts` (50), `test/transaction processing/transactionProcessing.test.ts` (48)
- **Verification & Risk**: `test/recipient verification/recipientVerification.test.ts` (60), `test/risk intelligence/riskIntelligence.test.ts` (58)
- **Agreements, Records & Disputes**: `test/agreements and disputes/paymentAgreements.test.ts` (31), `test/agreements and disputes/transactionRecords.test.ts` (11), `test/agreements and disputes/disputeManagement.test.ts` (12)
- **On-Device AI**: `test/on-device ai/qvacAssistant.test.ts` (56)
- **Backend, Security, Privacy & Reliability**: `test/backend and security/backendSecurity.test.ts` (57), `applicationSecurity.test.ts` (12), `reliability.test.ts` (9), `privacy.test.ts` (4)
- **Functional, Integration, Negative & UI/Device**: `test/functional/endToEndFunctional.test.ts` (6), `integrationTesting.test.ts` (7), `negativeTesting.test.ts` (14), `uiAndDeviceTesting.test.ts` (5)

---

## 10. Planned Extensions (Design Spec Only)

- `docs/smart-contracts-implementation.md` specifies a future `contracts/` Foundry workspace with `WordPaymentRouter.sol` (stateless native/ERC-20 payment routing with `PaymentExecuted` events and replay guards) and `WordEscrow.sol` (funded/released/refunded/disputed/resolved escrow state machine). These contracts are **documented as an implementation guide** and have not yet been added to the repository.

