# Word — Edge Function API Contracts

Base URL: `https://jbfefrxzawzbeixjbtmo.supabase.co/functions/v1`  
All endpoints require `Authorization: Bearer <supabase_access_token>` (`verify_jwt = true`) and return standardized JSON errors:
`{ "error": { "code": "ERROR_CODE", "message": "Human readable message" } }`.

---

| Function | Methods | Purpose & Key Payloads |
| :--- | :--- | :--- |
| `/profile` | `GET`, `PATCH` | Fetch or update `displayName`, `defaultNetwork`, `onboardingCompleted`, `preferences`. |
| `/wallet-challenge` | `POST` | `action: "register_and_challenge"` (`address`, `network`, `method`, `recoveryBackedUp`) -> returns `{ wallet, challenge }`; `action: "verify_challenge"` (`challengeId`, `signature`) -> marks wallet verified. |
| `/payment-requests` | `GET`, `POST` | `GET` lists creator requests or looks up `?shareCode=` / `?id=`. `POST` validates exact amount (`amount`, `tokenSymbol`, `network`, `recipientName`, `recipientAddress`, `description`, `terms`) and creates request + optional agreement. |
| `/payment-agreements` | `GET`, `POST` | `GET` lists participant agreements. `POST` supports `action: "create"` and `action: "accept"`. |
| `/risk-assessment` | `POST` | Evaluates `recipientAddress`, `network`, `tokenSymbol`, `amount` and persists `risk_assessments` row. |
| `/payment-prepare` | `POST` | Validates inputs and creates a `pending` `transactions` row + notification + audit log. |
| `/payment-cancel` | `POST` | Cancels an open `paymentRequestId` or pending/processing `transactionId` owned by caller. |
| `/receipt-verify` | `POST` | Verifies `transactionId` + `txHash` (`0x...`), updates transaction status (`confirmed`/`failed`), completes linked request, writes `verification_records`. |
| `/disputes` | `GET`, `POST` | Lists participant disputes with nested `evidence`, or creates a new dispute on a transaction. |
| `/evidence-auth` | `POST` | `create_upload_url`, `create_download_url`, and `commit_evidence` / `add_note` for dispute participants. |
| `/notifications` | `GET`, `PATCH` | Lists private user notifications or marks `notificationId` / `markAllRead: true`. |
| `/assistant` | `GET`, `POST` | Lists `assistant_sessions` / `assistant_messages`, or saves a prompt and generates a contextual reply. |

