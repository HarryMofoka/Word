import { describe, expect, it } from 'vitest';
import {
  assertNoSecretMaterialInPayload,
  validateTransactionForSigning,
  verifyChallengeReplayGuard,
  verifyIndependentReceiptResponse,
} from '../../src/services/walletSecurityService';
import { assertNoSecretMaterial } from '../../supabase/functions/_shared/validation';
import walletChallengeSource from '../../supabase/functions/wallet-challenge/index.ts?raw';
import receiptVerifySource from '../../supabase/functions/receipt-verify/index.ts?raw';
import paymentPayFlowSource from '../../src/app-workspace/components/payments/PaymentPayFlow.tsx?raw';

const MIGRATION_SQL_FILES = import.meta.glob('/supabase/migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const SENDER = '0x1111111111111111111111111111111111111111';
const RECIPIENT = '0x2222222222222222222222222222222222222222';
const VALID_SIG = `0x${'a'.repeat(130)}`;
const VALID_TX_HASH = `0x${'b'.repeat(64)}`;

describe('Phase 10: Wallet Security', () => {
  it('keeps private keys and recovery phrases out of application databases and API payloads', () => {
    const migrations = Object.entries(MIGRATION_SQL_FILES);
    expect(migrations.length).toBeGreaterThanOrEqual(5);

    for (const [file, sql] of migrations) {
      expect(sql.toLowerCase(), `${file} must not define private_key column`).not.toMatch(
        /\bprivate_key\b/
      );
      expect(sql.toLowerCase(), `${file} must not define seed_phrase column`).not.toMatch(
        /\bseed_phrase\b/
      );
      expect(sql.toLowerCase(), `${file} must not define mnemonic column`).not.toMatch(
        /\bmnemonic\b/
      );
    }

    expect(() =>
      assertNoSecretMaterialInPayload({ address: SENDER, privateKey: '0xdeadbeef' })
    ).toThrow(/never be transmitted or stored/i);
    expect(() =>
      assertNoSecretMaterialInPayload({ nested: { recoveryPhrase: 'word1 word2' } })
    ).toThrow(/never be transmitted or stored/i);

    expect(() => assertNoSecretMaterial({ mnemonic: 'abandon abandon' })).toThrow(
      /Private keys and recovery phrases/i
    );
    expect(() => assertNoSecretMaterial({ seed_phrase: 'test' })).toThrow(
      /Private keys and recovery phrases/i
    );
  });

  it('validates transaction parameters and requires explicit user approval before signing', () => {
    expect(() =>
      validateTransactionForSigning({
        fromAddress: SENDER,
        toAddress: RECIPIENT,
        amount: '25.50',
        token: 'USDT',
        network: 'Testnet',
        approvalAcknowledged: false,
      })
    ).toThrow(/Explicit user approval is required/i);

    const preview = validateTransactionForSigning({
      fromAddress: SENDER,
      toAddress: RECIPIENT,
      amount: '25.50',
      token: 'usdt',
      network: 'Testnet',
      approvalAcknowledged: true,
    });

    expect(preview).toEqual({
      fromAddress: SENDER,
      destinationAddress: RECIPIENT,
      amount: '25.50',
      token: 'USDT',
      network: 'Testnet',
      explicitApprovalConfirmed: true,
    });
  });

  it('handles malicious or malformed transaction requests safely', () => {
    expect(() =>
      validateTransactionForSigning({
        fromAddress: SENDER,
        toAddress: '0x0000000000000000000000000000000000000000',
        amount: '10',
        token: 'USDT',
        network: 'Testnet',
        approvalAcknowledged: true,
      })
    ).toThrow(/zero burn address/i);

    expect(() =>
      validateTransactionForSigning({
        fromAddress: SENDER,
        toAddress: SENDER,
        amount: '10',
        token: 'USDT',
        network: 'Testnet',
        approvalAcknowledged: true,
      })
    ).toThrow(/cannot be identical/i);

    expect(() =>
      validateTransactionForSigning({
        fromAddress: SENDER,
        toAddress: RECIPIENT,
        amount: '1.1234567',
        token: 'USDT',
        network: 'Testnet',
        approvalAcknowledged: true,
      })
    ).toThrow(/exceeds 6 decimal places/i);

    expect(() =>
      validateTransactionForSigning({
        fromAddress: SENDER,
        toAddress: RECIPIENT,
        amount: '1',
        token: 'ETH',
        network: 'Testnet',
        approvalAcknowledged: true,
        calldata: '0xdeadbeef',
      })
    ).toThrow(/Unexpected calldata/i);

    expect(() =>
      validateTransactionForSigning({
        fromAddress: SENDER,
        toAddress: RECIPIENT,
        amount: '10',
        token: 'USDT',
        network: 'Testnet',
        approvalAcknowledged: true,
        calldata: '0xbadbadbad',
      })
    ).toThrow(/Malformed or unauthorized ERC-20 transfer calldata/i);
  });

  it('protects against replayed, expired, or malformed verification challenges', () => {
    const now = Date.now();
    const pendingChallenge = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      status: 'pending',
      expires_at: new Date(now + 60_000).toISOString(),
      nonce: 'nonce-12345678',
      address: SENDER,
    };

    expect(verifyChallengeReplayGuard(pendingChallenge, VALID_SIG, now)).toEqual({ valid: true });

    expect(() =>
      verifyChallengeReplayGuard({ ...pendingChallenge, status: 'verified' }, VALID_SIG, now)
    ).toThrow(/Challenge replay blocked/i);

    expect(() =>
      verifyChallengeReplayGuard(
        { ...pendingChallenge, expires_at: new Date(now - 1000).toISOString() },
        VALID_SIG,
        now
      )
    ).toThrow(/expired/i);

    expect(() => verifyChallengeReplayGuard(pendingChallenge, '0x1234', now)).toThrow(
      /Malformed ECDSA signature/i
    );

    expect(walletChallengeSource).toContain("eq('status', 'pending')");
    expect(walletChallengeSource).toContain('CHALLENGE_REPLAY_BLOCKED');
    expect(walletChallengeSource).toContain('assertNoSecretMaterial');
  });

  it('prevents unintended duplicate submissions and validates before signing in PaymentPayFlow', () => {
    expect(paymentPayFlowSource).toContain('submittingRef.current = true');
    expect(paymentPayFlowSource).toContain('validateTransactionForSigning');
    expect(paymentPayFlowSource).toContain('approvalAcknowledged: approvedChecked');
  });

  it('verifies blockchain receipts independently and blocks txHash replay across transactions', () => {
    const confirmed = verifyIndependentReceiptResponse(
      {
        transactionHash: VALID_TX_HASH,
        status: '0x1',
        blockNumber: '0x10a',
        from: SENDER,
      },
      { txHash: VALID_TX_HASH, senderAddress: SENDER }
    );
    expect(confirmed.verified).toBe(true);
    expect(confirmed.status).toBe('confirmed');

    const failed = verifyIndependentReceiptResponse(
      {
        transactionHash: VALID_TX_HASH,
        status: '0x0',
        blockNumber: '0x10a',
        from: SENDER,
      },
      { txHash: VALID_TX_HASH, senderAddress: SENDER }
    );
    expect(failed.verified).toBe(false);
    expect(failed.status).toBe('failed');

    expect(() =>
      verifyIndependentReceiptResponse(
        {
          transactionHash: `0x${'c'.repeat(64)}`,
          status: '0x1',
          blockNumber: '0x10a',
        },
        { txHash: VALID_TX_HASH }
      )
    ).toThrow(/transactionHash mismatch/i);

    expect(receiptVerifySource).toContain('eth_getTransactionReceipt');
    expect(receiptVerifySource).toContain('TX_HASH_REPLAY');
    expect(receiptVerifySource).toContain('independent_rpc');
  });
});

