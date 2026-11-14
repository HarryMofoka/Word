# Word Mobile (`mobile/`) — React Native + Expo 58

This directory contains the full **Word Mobile** application built with **React Native** and **Expo 58**, featuring 100% capability parity with the Word web platform and smooth **iPhone Duo Fade-In / Fade-Out** animations.

## Core Features Included

1. **iPhone Duo Fade-In / Fade-Out Animation System (`src/components/DuoAnimations.tsx`)**
   - `DuoFadeView`: Smooth cubic fade-in / fade-out, vertical slide, and scale transitions across all screens, cards, and balance privacy toggles.
   - `IPhoneDuoShowcase`: Two synchronized floating iPhones (*Device A · Sender* and *Device B · Recipient*) that crossfade through the 4 bilateral Mutual Trust stages (*Owner Liveness* → *Bilateral Report Exchange* → *EIP-712 Dual Co-Signing* → *On-Chain Settlement & Receipt*).

2. **Enhanced Sign-Up Security Checks & Owner Face Scan Pre-Enrollment (`src/screens/AuthScreen.tsx`)**
   - Live owner name & email validation.
   - 4-point password strength meter (`8+ chars`, `Upper & lowercase`, `Number`, `Symbol / 12+ chars`) + Confirm Password match check.
   - Mandatory POPIA biometric consent & self-custody attestations.
   - **In-Signup Owner Face Scan**: Capture live facial liveness challenges right during registration so the owner's biometric attestation is verified and ready immediately on account creation.

3. **Self-Custodial Multi-Chain Wallet (`src/screens/OnboardingScreen.tsx`, `src/services/mobileServices.ts`)**
   - Create a 12-word BIP-39 wallet or import an existing recovery phrase.
   - Supports **Ethereum Sepolia** (`11155111`), **Base Sepolia** (`84532`), and **Polygon Amoy** (`80002`).

4. **10-Step Bilateral Mutual Trust Verification (`src/screens/PaymentsAndMutualTrustScreen.tsx`)**
   - Initiate or join bilateral Mutual Trust sessions by 8-character invitation code.
   - Bind & exchange Owner Facial Liveness reports (powered by Veriff Station API & live camera telemetry).
   - Co-sign canonical EIP-712 `MutualTrustApproval` payloads (`WordMutualTrust` v1).
   - Execute on-chain transfers and generate permanent Mutual Trust Receipts.

5. **Smart QR Payment Requests, Explainable Risk Intelligence, Disputes & QVAC On-Device AI (`src/screens/RecordsAndAssistantScreen.tsx`)**
   - Tamper-evident QR payment requests with 24-hour expiry.
   - Real-time explainable payment risk scoring.
   - Shared transaction records, versioned agreements, and dispute/evidence filing.
   - QVAC On-Device AI natural-language payment interpreter.
   - POPIA Right-to-Erasure (`Erase Biometric Data`) in Profile & Settings.

## Getting Started

```bash
cd mobile
npm install
npx expo start
```

