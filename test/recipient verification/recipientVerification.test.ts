import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Wallet } from 'ethers';
import {
  WALLET_CONTROL_IDENTITY_DISCLAIMER,
  buildRecipientChallengeMessage,
  getRecipientVerificationStatus,
  isChallengeExpired,
  isChallengeReplayed,
  issueRecipientChallenge,
  verifyRecipientChallenge,
  verifyRecipientChallengeSignature,
} from '../../src/services/recipientVerificationService';
import { signChallengeMessage } from '../../src/services/wdkWalletService';
import { supabase } from '../../src/lib/supabase';

const REQ_ID = '550e8400-e29b-41d4-a716-446655440000';
const OTHER_REQ_ID = '660e8400-e29b-41d4-a716-446655440001';

describe('Phase 6B: Recipient Verification (Cryptographic Wallet-Control)', () => {
  const signerA = Wallet.createRandom();
  const signerB = Wallet.createRandom();
  const futureIso = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const pastIso = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  it('includes explicit non-identity disclaimer constant', () => {
    expect(WALLET_CONTROL_IDENTITY_DISCLAIMER.toLowerCase()).toContain('does not establish real-world identity');
    expect(WALLET_CONTROL_IDENTITY_DISCLAIMER.toLowerCase()).toContain('wallet address');
  });

  it('builds challenge message containing requestId, shareCode, address, network, nonce, expiry, and notice', () => {
    const msg = buildRecipientChallengeMessage({
      paymentRequestId: REQ_ID,
      shareCode: 'WRD-AABBCCDDEE',
      intendedAddress: signerA.address,
      network: 'Testnet',
      nonce: 'nonce-123',
      expiresAt: futureIso,
    });
    expect(msg).toContain(`Request ID: ${REQ_ID}`);
    expect(msg).toContain('Share Code: WRD-AABBCCDDEE');
    expect(msg).toContain(`Intended Address: ${signerA.address}`);
    expect(msg).toContain('Network: Testnet');
    expect(msg).toContain('Nonce: nonce-123');
    expect(msg).toContain(`Expires: ${futureIso}`);
    expect(msg).toContain('does not establish real-world identity');
  });

  it('verifies a valid ECDSA signature from the intended recipient wallet', async () => {
    const msg = buildRecipientChallengeMessage({
      paymentRequestId: REQ_ID,
      shareCode: 'WRD-1122334455',
      intendedAddress: signerA.address,
      network: 'Testnet',
      nonce: 'n-1',
      expiresAt: futureIso,
    });
    const sig = await signerA.signMessage(msg);
    const res = verifyRecipientChallengeSignature({
      message: msg,
      signature: sig,
      intendedAddress: signerA.address,
      paymentRequestId: REQ_ID,
      expiresAt: futureIso,
    });
    expect(res.verified).toBe(true);
    expect(res.status).toBe('verified');
    expect(res.recoveredAddress?.toLowerCase()).toBe(signerA.address.toLowerCase());
    expect(res.disclaimer).toBe(WALLET_CONTROL_IDENTITY_DISCLAIMER);
  });

  it('verifies regardless of intendedAddress casing (lowercase vs checksummed)', async () => {
    const msg = buildRecipientChallengeMessage({
      paymentRequestId: REQ_ID,
      shareCode: 'WRD-1122334455',
      intendedAddress: signerA.address.toLowerCase(),
      network: 'Base Sepolia',
      nonce: 'n-2',
      expiresAt: futureIso,
    });
    const sig = await signerA.signMessage(msg);
    const res = verifyRecipientChallengeSignature({
      message: msg,
      signature: sig,
      intendedAddress: signerA.address.toLowerCase(),
      paymentRequestId: REQ_ID,
      expiresAt: futureIso,
    });
    expect(res.verified).toBe(true);
    expect(res.status).toBe('verified');
  });

  it('detects address mismatch when a different wallet signs the challenge', async () => {
    const msg = buildRecipientChallengeMessage({
      paymentRequestId: REQ_ID,
      shareCode: 'WRD-1122334455',
      intendedAddress: signerA.address,
      network: 'Testnet',
      nonce: 'n-3',
      expiresAt: futureIso,
    });
    const sigFromB = await signerB.signMessage(msg);
    const res = verifyRecipientChallengeSignature({
      message: msg,
      signature: sigFromB,
      intendedAddress: signerA.address,
      paymentRequestId: REQ_ID,
      expiresAt: futureIso,
    });
    expect(res.verified).toBe(false);
    expect(res.status).toBe('mismatch');
    expect(res.recoveredAddress?.toLowerCase()).toBe(signerB.address.toLowerCase());
    expect(res.reason).toContain('does not match');
  });

  it('rejects signatures when the message is bound to a different paymentRequestId', async () => {
    const msg = buildRecipientChallengeMessage({
      paymentRequestId: OTHER_REQ_ID,
      shareCode: 'WRD-OTHER',
      intendedAddress: signerA.address,
      network: 'Testnet',
      nonce: 'n-4',
      expiresAt: futureIso,
    });
    const sig = await signerA.signMessage(msg);
    const res = verifyRecipientChallengeSignature({
      message: msg,
      signature: sig,
      intendedAddress: signerA.address,
      paymentRequestId: REQ_ID,
      expiresAt: futureIso,
    });
    expect(res.verified).toBe(false);
    expect(res.status).toBe('mismatch');
    expect(res.reason).toContain('not bound');
  });

  it('rejects expired challenges even with a valid signature', async () => {
    const msg = buildRecipientChallengeMessage({
      paymentRequestId: REQ_ID,
      shareCode: 'WRD-EXP',
      intendedAddress: signerA.address,
      network: 'Testnet',
      nonce: 'n-5',
      expiresAt: pastIso,
    });
    const sig = await signerA.signMessage(msg);
    const res = verifyRecipientChallengeSignature({
      message: msg,
      signature: sig,
      intendedAddress: signerA.address,
      paymentRequestId: REQ_ID,
      expiresAt: pastIso,
    });
    expect(res.verified).toBe(false);
    expect(res.status).toBe('unverified');
    expect(res.reason).toContain('expired');
  });

  it('prevents replay attacks when challenge status is already verified', async () => {
    const msg = buildRecipientChallengeMessage({
      paymentRequestId: REQ_ID,
      shareCode: 'WRD-REPLAY',
      intendedAddress: signerA.address,
      network: 'Testnet',
      nonce: 'n-6',
      expiresAt: futureIso,
    });
    const sig = await signerA.signMessage(msg);
    const res = verifyRecipientChallengeSignature({
      message: msg,
      signature: sig,
      intendedAddress: signerA.address,
      paymentRequestId: REQ_ID,
      expiresAt: futureIso,
      status: 'verified',
      existingSignature: sig,
    });
    expect(res.verified).toBe(false);
    expect(res.reason).toContain('Replay');
  });

  it('prevents replay attacks when existingSignature is non-null even if status is pending', async () => {
    const msg = buildRecipientChallengeMessage({
      paymentRequestId: REQ_ID,
      shareCode: 'WRD-REPLAY2',
      intendedAddress: signerA.address,
      network: 'Testnet',
      nonce: 'n-7',
      expiresAt: futureIso,
    });
    const sig = await signerA.signMessage(msg);
    const res = verifyRecipientChallengeSignature({
      message: msg,
      signature: sig,
      intendedAddress: signerA.address,
      paymentRequestId: REQ_ID,
      expiresAt: futureIso,
      status: 'pending',
      existingSignature: '0xdeadbeef',
    });
    expect(res.verified).toBe(false);
    expect(res.reason).toContain('Replay');
  });

  it('rejects tampered message content where signature no longer recovers intended address', async () => {
    const msg = buildRecipientChallengeMessage({
      paymentRequestId: REQ_ID,
      shareCode: 'WRD-TAMPER',
      intendedAddress: signerA.address,
      network: 'Testnet',
      nonce: 'n-8',
      expiresAt: futureIso,
    });
    const sig = await signerA.signMessage(msg);
    const tamperedMsg = msg.replace('Nonce: n-8', 'Nonce: n-999');
    const res = verifyRecipientChallengeSignature({
      message: tamperedMsg,
      signature: sig,
      intendedAddress: signerA.address,
      paymentRequestId: REQ_ID,
      expiresAt: futureIso,
    });
    expect(res.verified).toBe(false);
    expect(res.status).toBe('mismatch');
  });

  const expiryMatrix: Array<[string, number, number, boolean]> = [
    ['pending', 1000, 999, false],
    ['pending', 1000, 1000, true],
    ['pending', 1000, 1001, true],
    ['expired', 5000, 1000, true],
    ['pending', NaN, 1000, true],
  ];

  it.each(expiryMatrix)(
    'isChallengeExpired(status=%s, exp=%s, now=%s) === %s',
    (status, expMs, nowMs, expected) => {
      const expires_at = Number.isFinite(expMs) ? new Date(expMs).toISOString() : 'invalid-date';
      expect(isChallengeExpired({ status, expires_at }, nowMs)).toBe(expected);
    }
  );

  const replayMatrix: Array<[string, string | null, boolean]> = [
    ['pending', null, false],
    ['expired', null, false],
    ['verified', null, true],
    ['verified', '0xabc', true],
    ['pending', '0xabc', true],
    ['pending', '', true],
  ];

  it.each(replayMatrix)(
    'isChallengeReplayed(status=%s, sig=%s) === %s',
    (status, signature, expected) => {
      expect(isChallengeReplayed({ status, signature })).toBe(expected);
    }
  );

  const malformedSignatures = [
    '',
    '0x',
    '0x1234',
    'not-hex-at-all',
    '0x' + '00'.repeat(65),
    '0x' + 'ff'.repeat(64),
    '0x' + 'ab'.repeat(32),
    'null',
    '{}',
    '0xzzzzzzzzzzzzzzzzzzzz',
  ];

  it.each(malformedSignatures)(
    'rejects malformed signature "%s" cleanly without throwing',
    (badSig) => {
      const msg = buildRecipientChallengeMessage({
        paymentRequestId: REQ_ID,
        shareCode: 'WRD-BADSIG',
        intendedAddress: signerA.address,
        network: 'Testnet',
        nonce: 'n-bad',
        expiresAt: futureIso,
      });
      const res = verifyRecipientChallengeSignature({
        message: msg,
        signature: badSig,
        intendedAddress: signerA.address,
        paymentRequestId: REQ_ID,
        expiresAt: futureIso,
      });
      expect(res.verified).toBe(false);
    }
  );

  const networks = ['Testnet', 'Base Sepolia', 'Polygon Amoy'] as const;
  it.each(networks)(
    'signs and verifies challenge consistently across %s network',
    async (network) => {
      const msg = buildRecipientChallengeMessage({
        paymentRequestId: REQ_ID,
        shareCode: 'WRD-NET',
        intendedAddress: signerA.address,
        network,
        nonce: `nonce-${network}`,
        expiresAt: futureIso,
      });
      const sig = await signerA.signMessage(msg);
      const res = verifyRecipientChallengeSignature({
        message: msg,
        signature: sig,
        intendedAddress: signerA.address,
        paymentRequestId: REQ_ID,
        expiresAt: futureIso,
      });
      expect(res.verified).toBe(true);
    }
  );

  const randomSignerIndices = Array.from({ length: 21 }, (_, i) => i + 1);
  it.each(randomSignerIndices)(
    'random signer #%i passes when intended and fails when mismatched',
    async () => {
      const w1 = Wallet.createRandom();
      const w2 = Wallet.createRandom();
      const msg = buildRecipientChallengeMessage({
        paymentRequestId: REQ_ID,
        shareCode: 'WRD-RAND',
        intendedAddress: w1.address,
        network: 'Testnet',
        nonce: crypto.randomUUID(),
        expiresAt: futureIso,
      });
      const sig1 = await w1.signMessage(msg);
      const sig2 = await w2.signMessage(msg);

      expect(
        verifyRecipientChallengeSignature({
          message: msg,
          signature: sig1,
          intendedAddress: w1.address,
          paymentRequestId: REQ_ID,
          expiresAt: futureIso,
        }).verified
      ).toBe(true);

      expect(
        verifyRecipientChallengeSignature({
          message: msg,
          signature: sig2,
          intendedAddress: w1.address,
          paymentRequestId: REQ_ID,
          expiresAt: futureIso,
        }).status
      ).toBe('mismatch');
    }
  );

  it('signChallengeMessage rejects connected wallet when browser provider is missing', async () => {
    await expect(
      signChallengeMessage({
        message: 'hello',
        expectedAddress: signerA.address,
        network: 'Testnet',
        walletMethod: 'connected',
      })
    ).rejects.toThrow(/Browser wallet provider not found/);
  });

  it('signChallengeMessage rejects invalid recovery phrase for local WDK wallet', async () => {
    await expect(
      signChallengeMessage({
        message: 'hello',
        expectedAddress: signerA.address,
        network: 'Testnet',
        walletMethod: 'created',
        signingPhrase: 'bad seed words',
      })
    ).rejects.toThrow(/12 or 24-word/);
  });

  describe('recipient-verify Edge Function client contracts', () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
      vi.stubGlobal('fetch', fetchMock);
      vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
        data: { session: { access_token: 'jwt-token' } as never },
        error: null,
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
      fetchMock.mockReset();
    });

    it('issueRecipientChallenge POSTs action=issue_challenge to recipient-verify', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            challenge: { id: 'ch-1', message: 'msg' },
            disclaimer: WALLET_CONTROL_IDENTITY_DISCLAIMER,
          }),
          { status: 201 }
        )
      );
      const res = await issueRecipientChallenge({
        paymentRequestId: REQ_ID,
        recipientAddress: signerA.address,
        network: 'Testnet',
      });
      expect(res.challenge.id).toBe('ch-1');
      expect(String(fetchMock.mock.calls[0][0])).toContain('/recipient-verify');
    });

    it('verifyRecipientChallenge POSTs action=verify_signature and returns verifiedAt', async () => {
      const now = new Date().toISOString();
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            verified: true,
            status: 'verified',
            intendedAddress: signerA.address,
            recoveredAddress: signerA.address,
            verifiedAt: now,
            disclaimer: WALLET_CONTROL_IDENTITY_DISCLAIMER,
          }),
          { status: 200 }
        )
      );
      const res = await verifyRecipientChallenge({
        challengeId: 'ch-1',
        paymentRequestId: REQ_ID,
        signature: '0x' + 'a'.repeat(130),
      });
      expect(res.verified).toBe(true);
      expect(res.verifiedAt).toBe(now);
    });

    it('getRecipientVerificationStatus GETs ?paymentRequestId=...', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'unverified',
            intendedAddress: signerA.address,
            recoveredAddress: null,
            verifiedAt: null,
            disclaimer: WALLET_CONTROL_IDENTITY_DISCLAIMER,
          }),
          { status: 200 }
        )
      );
      const res = await getRecipientVerificationStatus(REQ_ID);
      expect(res.status).toBe('unverified');
      expect(String(fetchMock.mock.calls[0][0])).toContain(`paymentRequestId=${REQ_ID}`);
    });
  });
});
