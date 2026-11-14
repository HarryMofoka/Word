# Word Smart Contracts — Implementation Guide

This guide details how to design, implement, test, deploy, and integrate smart contracts into the **Word** platform (`word-platform`), extending its current direct-transfer + Supabase accountability architecture with verifiable on-chain escrow, payment routing, and agreement/evidence anchoring.

---

## 1. Current Architecture & Why Smart Contracts Fit

Currently, Word handles payments and accountability across two layers:

1. **On-Chain Execution (`src/services/wdkWalletService.ts`)**:
   - Supports EIP-1193 browser wallets (`ethers` `BrowserProvider`) and self-custodial Tether WDK wallets (`@tetherto/wdk`, `@tetherto/wdk-wallet-evm`).
   - Executes direct native transfers (`sendTransaction`) and direct ERC-20 `transfer(to, amount)` calls on the networks configured in `src/config/blockchain.ts`:
     - **Ethereum Sepolia** (`chainId: 11155111`): `USDT`, `USDC`, `ETH`, `WETH`
     - **Base Sepolia** (`chainId: 84532`): `USDC`, `ETH`
     - **Polygon Amoy** (`chainId: 80002`): `USDC`, `ETH` (`POL` native)
2. **Off-Chain Accountability (`supabase/migrations/` & `supabase/functions/`)**:
   - `payment_requests`, `payment_agreements`, `payment_agreement_versions`, `transactions`, `disputes`, `evidence`, and `verification_records`.
   - `supabase/functions/receipt-verify/index.ts` fetches `eth_getTransactionReceipt` via RPC to confirm `status === '0x1'` and prevent `tx_hash` replay.

### Gaps Smart Contracts Solve
- **True Escrow:** Funds for a `payment_agreements` record can be locked on-chain until delivery/acceptance, instead of relying solely on an irreversible direct transfer.
- **Cryptographic Receipt Verification:** Instead of only checking `receipt.status === '0x1'`, `receipt-verify` can decode contract event logs (`PaymentExecuted`, `EscrowFunded`, `EscrowReleased`) to verify the exact `payer`, `payee`, `token`, `amount`, and `requestId`/`agreementId`.
- **Immutable Agreement & Evidence Anchoring:** `keccak256` hashes of locked `payment_agreement_versions` and `evidence.sha256` digests can be anchored on-chain without exposing any PII (names, emails, or terms text).

---

## 2. Recommended Tooling & Repository Layout

Keep the smart contract workspace isolated in `contracts/` at the repository root so Vite (`vite.config.ts`) and TypeScript (`tsconfig.json`) builds for the frontend remain unaffected.

- **Framework:** [Foundry](https://book.getfoundry.sh/) (`forge`, `cast`, `anvil`) — fast Solidity compilation, built-in fuzzing, and deterministic deployment scripts. *(Hardhat v2 is an acceptable alternative if your team prefers JS/TS tests.)*
- **Solidity Version:** `^0.8.24`
- **Dependencies:** `openzeppelin-contracts` v5.x (`ReentrancyGuard`, `SafeERC20`, `Ownable2Step`, `Pausable`, `EIP712`).

```text
Word/
├── contracts/
│   ├── foundry.toml
│   ├── lib/
│   │   └── openzeppelin-contracts/
│   ├── src/
│   │   ├── WordPaymentRouter.sol
│   │   ├── WordEscrow.sol
│   │   └── interfaces/
│   │       └── IWordEscrow.sol
│   ├── script/
│   │   └── DeployWord.s.sol
│   └── test/
│       ├── WordPaymentRouter.t.sol
│       └── WordEscrow.t.sol
├── src/
│   ├── config/
│   │   ├── blockchain.ts          # Add contract addresses per network
│   │   └── contracts.ts           # ABIs + deterministic ID/hash helpers
│   └── services/
│       └── wdkWalletService.ts    # Add router & escrow contract calls
└── supabase/
    ├── functions/receipt-verify/  # Decode contract event logs
    └── migrations/                # Add onchain_agreement_id, terms_hash, contract_address
```

---

## 3. Contract Specifications

### 3.1 `WordPaymentRouter.sol` (Instant Verified Payments)

Use this contract for standard `PaymentPayFlow` payments where funds go directly to the recipient (no escrow lock), but Word needs an on-chain event binding the transfer to a `payment_requests.id` and optional `termsHash`.

#### Key Design
- **Stateless & Non-Custodial:** Never holds user funds between transactions.
- **Native + ERC-20 Support:**
  - `payNative(bytes32 requestId, address payee, bytes32 termsHash) external payable`
  - `payToken(bytes32 requestId, address token, address payee, uint256 amount, bytes32 termsHash) external`
- **Token Allowlist (Optional/Recommended):** Restrict or flag tokens, and always use `SafeERC20.safeTransferFrom` + balance-delta checks (`balanceAfter - balanceBefore == amount`) to reject fee-on-transfer tokens.
- **Replay Guard:** Track `mapping(bytes32 requestId => bool) public executedRequests;` if each `payment_requests.id` should only settle once on-chain.

#### Canonical Event
```solidity
event PaymentExecuted(
    bytes32 indexed requestId,
    address indexed payer,
    address indexed payee,
    address token,        // address(0) for native ETH/POL
    uint256 amount,       // atomic units (6 decimals for USDT/USDC, 18 for ETH/WETH)
    bytes32 termsHash
);
```

---

### 3.2 `WordEscrow.sol` (Agreement Escrow & Dispute Resolution)

Use this contract for `payment_agreements` that require escrowed funds, mutual release, deadline protection, and dispute resolution.

#### State Machine
```text
None ──(createAndFund)──▶ Funded ──(release)──────────────▶ Released
                            │
                            ├──(refundByPayee / timeout)──▶ Refunded
                            │
                            └──(openDispute)──▶ Disputed ──(resolveDispute)──▶ Resolved
```

#### Data Structure
```solidity
enum EscrowStatus {
    None,
    Funded,
    Released,
    Refunded,
    Disputed,
    Resolved
}

struct Escrow {
    address payer;
    address payee;
    address token;          // address(0) for native currency
    uint256 amount;
    bytes32 termsHash;      // keccak256 of canonical payment_agreement_versions payload
    uint64 createdAt;
    uint64 deadline;        // Unix timestamp after which payer can reclaim if not disputed/released
    EscrowStatus status;
}
```

#### Core Functions
1. **`createAndFund(bytes32 agreementId, address payee, address token, uint256 amount, bytes32 termsHash, uint64 deadline)`** (`payable`, `nonReentrant`, `whenNotPaused`)
   - Validates `escrows[agreementId].status == EscrowStatus.None`, `payee != address(0)`, `payee != msg.sender`, `amount > 0`, and `deadline > block.timestamp`.
   - If `token == address(0)`: requires `msg.value == amount`.
   - If `token != address(0)`: requires `msg.value == 0` and pulls `amount` via `IERC20(token).safeTransferFrom(msg.sender, address(this), amount)` (verifying exact balance delta).
   - Emits `EscrowFunded(agreementId, msg.sender, payee, token, amount, termsHash, deadline)`.

2. **`release(bytes32 agreementId)`** (`nonReentrant`)
   - Callable only by `payer` while `status == EscrowStatus.Funded`.
   - Sets `status = EscrowStatus.Released` before transferring funds to `payee`.
   - Emits `EscrowReleased(agreementId, payee, amount)`.

3. **`refundByPayee(bytes32 agreementId)`** (`nonReentrant`)
   - Callable only by `payee` while `status == EscrowStatus.Funded` (voluntary cancellation/refund).
   - Sets `status = EscrowStatus.Refunded` and transfers `amount` back to `payer`.
   - Emits `EscrowRefunded(agreementId, payer, amount)`.

4. **`claimTimeoutRefund(bytes32 agreementId)`** (`nonReentrant`)
   - Callable only by `payer` when `status == EscrowStatus.Funded` and `block.timestamp > deadline`.
   - Sets `status = EscrowStatus.Refunded` and returns `amount` to `payer`.
   - Emits `EscrowRefunded(agreementId, payer, amount)`.

5. **`openDispute(bytes32 agreementId, bytes32 evidenceHash)`** (`nonReentrant`)
   - Callable by `payer` or `payee` while `status == EscrowStatus.Funded` (and before `deadline` or within a configured dispute window).
   - Sets `status = EscrowStatus.Disputed`.
   - Anchors the initial `evidenceHash` (`sha256` or `keccak256` digest matching the `evidence` table) in an event:
   - Emits `DisputeOpened(agreementId, msg.sender, evidenceHash)`.

6. **`anchorEvidence(bytes32 agreementId, bytes32 evidenceHash)`**
   - Callable by `payer` or `payee` while `status == EscrowStatus.Disputed`.
   - Emits `EvidenceAnchored(agreementId, msg.sender, evidenceHash)` so additional `evidence` uploads in Supabase can be timestamped on-chain.

7. **`resolveDispute(bytes32 agreementId, uint16 payerBps, bytes32 resolutionHash)`** (`nonReentrant`)
   - Callable only by the designated `arbitrator` (ideally a multisig or governance-controlled resolver address) while `status == EscrowStatus.Disputed`.
   - Validates `payerBps <= 10_000`.
   - Computes `payerAmount = (amount * payerBps) / 10_000` and `payeeAmount = amount - payerAmount`.
   - Sets `status = EscrowStatus.Resolved`, transfers respective shares, and emits `DisputeResolved(agreementId, payerAmount, payeeAmount, resolutionHash)`.

---

## 4. Security & Privacy Requirements

1. **Tether (`USDT`) Non-Standard ERC-20 Handling:**
   - Mainnet/Sepolia `USDT` does not return a `bool` on `transfer`, `transferFrom`, or `approve`, and requires resetting allowance to `0` before changing a non-zero allowance.
   - **Solidity:** Always use OpenZeppelin `SafeERC20` (`safeTransfer`, `safeTransferFrom`).
   - **Frontend (`wdkWalletService.ts`):** When approving `WordEscrow` or `WordPaymentRouter`, check current `allowance(owner, spender)` first; if non-zero and `< amount`, reset to `0` before approving `amount` (or use `forceApprove` semantics).
2. **Checks-Effects-Interactions + `ReentrancyGuard`:**
   - Always update `escrow.status` *before* calling `safeTransfer` or `payable(recipient).call{value: ...}("")`.
   - Never use `.transfer()` or `.send()` for ETH (2300 gas limit breaks smart contract wallets); use `(bool ok, ) = to.call{value: amount}("")` with `nonReentrant`.
3. **No PII On-Chain:**
   - Consistent with `src/services/privacyService.ts`, never pass `recipient_name`, `description`, `terms_text`, or `email` into contract storage or events.
   - Only pass deterministic `bytes32` identifiers (`agreementId`, `requestId`) and hashes (`termsHash`, `evidenceHash`).
4. **Deterministic Off-Chain ↔ On-Chain IDs:**
   Compute `agreementId` and `termsHash` identically in TypeScript (`ethers` v6) and verify in `receipt-verify`:
   ```ts
   import { keccak256, solidityPacked, toUtf8Bytes } from 'ethers';

   export function toBytes32Uuid(uuid: string): string {
     // Strips hyphens from UUIDv4 and left-pads or hashes to bytes32
     return keccak256(toUtf8Bytes(uuid));
   }

   export function computeTermsHash(params: {
     agreementId: string;
     versionNumber: number;
     amountAtomic: string;
     tokenSymbol: string;
     network: string;
     recipientAddress: string;
     termsText: string;
   }): string {
     return keccak256(
       solidityPacked(
         ['string', 'uint256', 'string', 'string', 'string', 'address', 'string'],
         [
           params.agreementId,
           params.versionNumber,
           params.amountAtomic,
           params.tokenSymbol,
           params.network,
           params.recipientAddress,
           params.termsText,
         ]
       )
     );
   }
   ```

---

## 5. Step-by-Step Implementation Plan

### Step 1: Initialize Foundry Workspace
```powershell
mkdir contracts
cd contracts
forge init --no-commit
forge install OpenZeppelin/openzeppelin-contracts --no-commit
```
Configure `contracts/foundry.toml`:
```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
solc = "0.8.24"
optimizer = true
optimizer_runs = 200
```

### Step 2: Implement & Test Contracts
1. Write `contracts/src/WordPaymentRouter.sol` and `contracts/src/WordEscrow.sol`.
2. Write comprehensive tests in `contracts/test/`:
   - Happy paths (native ETH + 6-decimal ERC-20 mock USDT/USDC).
   - Non-standard ERC-20 mock (no `bool` return on `transfer`/`transferFrom`).
   - Unauthorized caller checks (e.g., payee cannot call `release`, payer cannot call `refundByPayee`).
   - Timeout refund before vs. after `deadline`.
   - Dispute opening, evidence anchoring, and `payerBps` split math (including `0`, `5000`, `10000`, and `> 10000` revert).
   - Fuzz tests for `amount` and `payerBps` (`testFuzz_ResolveDispute`).
3. Run tests:
   ```powershell
   forge test -vvv
   ```

### Step 3: Deploy to Word Testnets
Deploy to the three networks defined in `src/config/blockchain.ts` using `DeployWord.s.sol`:
- **Ethereum Sepolia** (`11155111`)
- **Base Sepolia** (`84532`)
- **Polygon Amoy** (`80002`)

```powershell
forge script script/DeployWord.s.sol:DeployWord \
  --rpc-url $SEPOLIA_RPC_URL \
  --broadcast --verify -vvvv
```
Record the deployed `WordPaymentRouter` and `WordEscrow` addresses in `src/config/blockchain.ts` (and `.env.local` / Supabase Edge Function secrets).

### Step 4: Integrate with Frontend (`wdkWalletService.ts`)
1. Export minimal JSON ABIs into `src/config/contracts.ts`.
2. For **connected EIP-1193 wallets**, use `new Contract(routerOrEscrowAddress, abi, signer)` to call `approve` (if ERC-20) and `payToken` / `createAndFund`.
3. For **Tether WDK (`created` / `imported`) wallets**, encode calldata with `ethers.Interface.encodeFunctionData(...)` and submit via `account.sendTransaction({ to: contractAddress, data, value })`:
   - First transaction (if ERC-20): `approve(spender, amountAtomic)` (after checking existing allowance).
   - Second transaction: `payToken(...)` or `createAndFund(...)`.
4. Keep `wdk.dispose()` in `finally` blocks and never persist or log the signing phrase.

### Step 5: Upgrade `receipt-verify` & Database Schema
1. **New Supabase Migration:** Add nullable columns to `payment_agreements` and `transactions`:
   - `contract_address TEXT`
   - `onchain_agreement_id TEXT` (hex `bytes32`)
   - `terms_hash TEXT` (hex `bytes32`)
   - `escrow_status TEXT` (`none` | `funded` | `released` | `refunded` | `disputed` | `resolved`)
2. **`supabase/functions/receipt-verify/index.ts`:**
   - After `eth_getTransactionReceipt`, inspect `receipt.logs` emitted by the configured `WordPaymentRouter` or `WordEscrow` address for the transaction's `network`.
   - Verify the `PaymentExecuted` or `EscrowFunded` event topic0, `requestId`/`agreementId`, `payee`, and `amount` match the database record before marking `verified_control = true` and `status = 'confirmed'`.


---

## 6. Mutual Trust EIP-712 Co-Signature Contracts (Current Repo Status)

As part of the **Mutual Trust Verification** feature (`feature/facial-verification`), bilateral EIP-712 reference contracts have been authored under `contracts/`:

- `contracts/foundry.toml`
- `contracts/src/interfaces/IWordMutualTrust.sol`
- `contracts/src/WordMutualTrustRouter.sol` — verifies BOTH `senderSignature` and `recipientSignature` over the canonical EIP-712 `MutualTrustApproval` struct and `canonicalHash` before settling ETH/POL or ERC-20 tokens, guarding against replay via `consumedCanonicalHashes` and `consumedNonces`.
- `contracts/src/WordEscrow.sol` — agreement escrow holding funds against `canonicalHash` with release and timeout refund controls.

**Deployment Status & Boundary Disclosure:**
- `WordMutualTrustRouter.sol` and `WordEscrow.sol` are **authored in-repo but NOT yet compiled (`forge` CLI not installed in this environment) and NOT yet deployed** on Sepolia, Base Sepolia, or Polygon Amoy.
- Until deployed and wired into `src/config/blockchain.ts` and `wdkWalletService.ts`, on-chain settlement continues using direct EOA / ERC-20 transfers gated authoritatively by Word's Supabase backend (`mutual-trust`, `payment-prepare`, `receipt-verify`) and Postgres triggers. Direct wallet RPC broadcasts outside Word cannot yet be trustlessly blocked on-chain until `WordMutualTrustRouter.sol` is deployed.
