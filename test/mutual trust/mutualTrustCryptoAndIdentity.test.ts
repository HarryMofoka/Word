import { Wallet } from 'ethers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MUTUAL_TRUST_EIP712_TYPES,
  RECIPIENT_APPROVAL_STATEMENT,
  SENDER_APPROVAL_STATEMENT,
  buildApprovalTypedData,
  buildCanonicalTransactionPayload,
  computeCanonicalTransactionHash,
  verifyApprovalTypedDataSignature,
} from '../../src/services/mutualTrustCrypto';
import {
  analyzeLiveFramesLiveness,
  eraseMyIdentityData,
  startIdentityVerification,
  submitAlternativeVerification,
  submitFacialLivenessCapture,
} from '../../src/services/identityVerificationService';
import { supabase } from '../../src/lib/supabase';
import identityProviderSource from '../../supabase/functions/_shared/identityProvider.ts?raw';
import identityFunctionSource from '../../supabase/functions/identity-verification/index.ts?raw';
import mutualCryptoServerSource from '../../supabase/functions/_shared/mutualTrustCrypto.ts?raw';

function makeSyntheticFrame(params: {
  width: number;
  height: number;
  centerLum: number;
  edgeLum: number;
}) {
  const data = new Uint8ClampedArray(params.width * params.height * 4);
  const minX = Math.floor(params.width * 0.28);
  const maxX = Math.floor(params.width * 0.72);
  const minY = Math.floor(params.height * 0.18);
  const maxY = Math.floor(params.height * 0.82);

  for (let y = 0; y < params.height; y++) {
    for (let x = 0; x < params.width; x++) {
      const idx = (y * params.width + x) * 4;
      const inCenter = x >= minX && x <= maxX && y >= minY && y <= maxY;
      const v = inCenter ? params.centerLum : params.edgeLum;
      data[idx] = v;
      data[idx + 1] = v;
      data[idx + 2] = v;
      data[idx + 3] = 255;
    }
  }
  return { data, width: params.width, height: params.height };
}

describe('Mutual Trust Identity, Cryptography & Privacy Controls', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
      data: { session: { access_token: 'mt-test-jwt' } as never },
      error: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('computes identical deterministic canonical hashes and flips hash on any parameter mutation', () => {
    const alice = Wallet.createRandom().address;
    const bob = Wallet.createRandom().address;
    const baseInput = {
      sessionId: '11111111-1111-4111-8111-111111111111',
      paymentRequestId: '22222222-2222-4222-8222-222222222222',
      agreementId: '33333333-3333-4333-8333-333333333333',
      agreementVersion: 1,
      agreementTerms: 'Deliver verified digital milestone.',
      senderUserId: 'user-alice',
      senderWallet: alice,
      recipientUserId: 'user-bob',
      recipientWallet: bob,
      amountAtomic: '25000000',
      tokenAddress: '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06',
      tokenSymbol: 'USDT',
      chainId: 11155111,
      nonce: '0x' + 'ab'.repeat(32),
      expiresAtUnix: Math.floor(Date.now() / 1000) + 1800,
    };

    const payloadA = buildCanonicalTransactionPayload(baseInput);
    const payloadB = buildCanonicalTransactionPayload(baseInput);
    const hashA = computeCanonicalTransactionHash(payloadA);
    const hashB = computeCanonicalTransactionHash(payloadB);
    expect(hashA).toBe(hashB);
    expect(hashA).toMatch(/^0x[a-f0-9]{64}$/);

    // Any modification (amount, agreement version, terms, recipient, chainId) MUST produce a distinct hash
    const modifiedAmountHash = computeCanonicalTransactionHash(
      buildCanonicalTransactionPayload({ ...baseInput, amountAtomic: '26000000' })
    );
    const modifiedTermsHash = computeCanonicalTransactionHash(
      buildCanonicalTransactionPayload({ ...baseInput, agreementTerms: 'Modified milestone terms.' })
    );
    const modifiedVersionHash = computeCanonicalTransactionHash(
      buildCanonicalTransactionPayload({ ...baseInput, agreementVersion: 2 })
    );

    expect(modifiedAmountHash).not.toBe(hashA);
    expect(modifiedTermsHash).not.toBe(hashA);
    expect(modifiedVersionHash).not.toBe(hashA);
  });

  it('verifies real dual-party EIP-712 signatures and rejects tampering, wrong signer, swapped statement, or expiry', async () => {
    const alice = Wallet.createRandom();
    const bob = Wallet.createRandom();
    const attacker = Wallet.createRandom();
    const nowUnix = Math.floor(Date.now() / 1000);

    const payload = buildCanonicalTransactionPayload({
      sessionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      paymentRequestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      senderUserId: 'alice-id',
      senderWallet: alice.address,
      recipientUserId: 'bob-id',
      recipientWallet: bob.address,
      amountAtomic: '10000000',
      tokenSymbol: 'USDT',
      chainId: 11155111,
      nonce: '0x' + '11'.repeat(32),
      expiresAtUnix: nowUnix + 1200,
    });
    const canonicalHash = computeCanonicalTransactionHash(payload);

    const aliceTyped = buildApprovalTypedData({ payload, canonicalHash, role: 'sender' });
    const bobTyped = buildApprovalTypedData({ payload, canonicalHash, role: 'recipient' });
    expect(aliceTyped.message.statement).toBe(SENDER_APPROVAL_STATEMENT);
    expect(bobTyped.message.statement).toBe(RECIPIENT_APPROVAL_STATEMENT);

    const aliceSig = await alice.signTypedData(
      aliceTyped.domain,
      MUTUAL_TRUST_EIP712_TYPES,
      aliceTyped.message
    );
    const bobSig = await bob.signTypedData(
      bobTyped.domain,
      MUTUAL_TRUST_EIP712_TYPES,
      bobTyped.message
    );

    const senderCheck = verifyApprovalTypedDataSignature({
      payload,
      canonicalHash,
      role: 'sender',
      expectedWalletAddress: alice.address,
      signature: aliceSig,
      nowUnix,
    });
    expect(senderCheck).toEqual({ valid: true, recoveredAddress: alice.address });

    const recipientCheck = verifyApprovalTypedDataSignature({
      payload,
      canonicalHash,
      role: 'recipient',
      expectedWalletAddress: bob.address,
      signature: bobSig,
      nowUnix,
    });
    expect(recipientCheck).toEqual({ valid: true, recoveredAddress: bob.address });

    // 1. Tampered amount fails verification even re-using Alice's signature
    const tamperedPayload = buildCanonicalTransactionPayload({
      ...payload,
      amountAtomic: '999000000',
    });
    const tamperedCheck = verifyApprovalTypedDataSignature({
      payload: tamperedPayload,
      canonicalHash,
      role: 'sender',
      expectedWalletAddress: alice.address,
      signature: aliceSig,
      nowUnix,
    });
    expect(tamperedCheck.valid).toBe(false);

    // 2. Role/statement mismatch fails (Alice signature tested as recipient role)
    const swappedRoleCheck = verifyApprovalTypedDataSignature({
      payload,
      canonicalHash,
      role: 'recipient',
      expectedWalletAddress: bob.address,
      signature: aliceSig,
      nowUnix,
    });
    expect(swappedRoleCheck.valid).toBe(false);

    // 3. Wrong private key (attacker) fails even with valid structure
    const attackerSig = await attacker.signTypedData(
      aliceTyped.domain,
      MUTUAL_TRUST_EIP712_TYPES,
      aliceTyped.message
    );
    const attackerCheck = verifyApprovalTypedDataSignature({
      payload,
      canonicalHash,
      role: 'sender',
      expectedWalletAddress: alice.address,
      signature: attackerSig,
      nowUnix,
    });
    expect(attackerCheck.valid).toBe(false);

    // 4. Expired window fails
    const expiredCheck = verifyApprovalTypedDataSignature({
      payload,
      canonicalHash,
      role: 'sender',
      expectedWalletAddress: alice.address,
      signature: aliceSig,
      nowUnix: nowUnix + 5000,
    });
    expect(expiredCheck.valid).toBe(false);
  });

  it('rejects static photo frames (zero motion delta) and accepts dynamic illuminated frames in memory', () => {
    const staticFrame = makeSyntheticFrame({
      width: 40,
      height: 30,
      centerLum: 145,
      edgeLum: 95,
    });
    const staticTelemetry = analyzeLiveFramesLiveness([staticFrame, staticFrame, staticFrame]);
    expect(staticTelemetry.motionDeltaScore).toBe(0);

    const frame1 = makeSyntheticFrame({ width: 40, height: 30, centerLum: 130, edgeLum: 80 });
    const frame2 = makeSyntheticFrame({ width: 40, height: 30, centerLum: 155, edgeLum: 90 });
    const frame3 = makeSyntheticFrame({ width: 40, height: 30, centerLum: 140, edgeLum: 105 });
    const liveTelemetry = analyzeLiveFramesLiveness([frame1, frame2, frame3]);
    expect(liveTelemetry.frameCount).toBe(3);
    expect(liveTelemetry.motionDeltaScore).toBeGreaterThanOrEqual(1.5);
    expect(liveTelemetry.faceBoxDetected).toBe(true);
    expect(liveTelemetry.averageLuminance).toBeGreaterThan(22);
  });

  it('keeps client and backend canonical type tags, EIP-712 domains, and statements aligned', () => {
    expect(mutualCryptoServerSource).toContain('WORD_MUTUAL_TRUST_TX_V1');
    expect(mutualCryptoServerSource).toContain(SENDER_APPROVAL_STATEMENT);
    expect(mutualCryptoServerSource).toContain(RECIPIENT_APPROVAL_STATEMENT);
    expect(mutualCryptoServerSource).toContain("name: 'WordMutualTrust'");
  });

  it('enforces sandbox transparency, POPIA media rejection, webhook HMAC, and non-biometric sanitization', async () => {
    // Source-level guarantees on IdentityProvider & Edge Function
    expect(identityProviderSource).toContain('class VeriffProviderAdapter');
    expect(identityProviderSource).toContain('class SandboxIdentityProvider');
    expect(identityProviderSource).toContain('isSandbox = true');
    expect(identityProviderSource).toContain("assuranceLevel: 'sandbox_demo'");
    expect(identityProviderSource).toContain('x-hmac-signature');
    expect(identityProviderSource).toContain('toSanitizedCounterpartyReport');

    expect(identityFunctionSource).toContain('BIOMETRIC_MEDIA_REJECTED');
    expect(identityFunctionSource).toContain('POPIA_CONSENT_REQUIRED');
    expect(identityFunctionSource).toContain('INVALID_WEBHOOK_SIGNATURE');
    expect(identityFunctionSource).toContain('provider_webhook_events');
    expect(identityFunctionSource).toContain('identity_verification_erased');
    expect(identityFunctionSource).toContain('alternative_verify');

    // Verify client API wrappers send ONLY telemetry (zero raw photo/video)
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            identity: { hasRecord: true, isVerified: false, isSandbox: true },
            session: {
              identityResultId: 'id-1',
              provider: 'word_sandbox',
              providerSessionId: 'sbx_123',
              isSandbox: true,
              hostedSessionUrl: null,
              challenges: ['Look straight', 'Turn left'],
              expiresAt: new Date(Date.now() + 60000).toISOString(),
            },
          }),
          { status: 201 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            identity: {
              hasRecord: true,
              isVerified: true,
              isSandbox: true,
              provider: 'word_sandbox',
              verificationMethod: 'facial_liveness',
              verificationOutcome: 'verified',
              livenessOutcome: 'passed',
              assuranceLevel: 'sandbox_demo',
              securityWarnings: ['SANDBOX ADAPTER'],
              failureReason: null,
              verifiedAt: new Date().toISOString(),
              expiresAt: new Date(Date.now() + 86400000).toISOString(),
              retentionExpiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
              popiaConsentAt: new Date().toISOString(),
              attestationHash: 'abc123',
            },
            signedAttestation: { attestationHash: 'abc123', attestationSignature: 'sig', issuedAt: new Date().toISOString() },
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            identity: {
              hasRecord: true,
              isVerified: true,
              isSandbox: true,
              provider: 'alternative_attestation',
              verificationMethod: 'alternative_fallback',
              verificationOutcome: 'verified',
              livenessOutcome: 'not_applicable',
              assuranceLevel: 'alternative_fallback',
            },
            signedAttestation: { attestationHash: 'alt123', attestationSignature: 'sig2', issuedAt: new Date().toISOString() },
          }),
          { status: 201 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ deleted: true, revokedCount: 2, revokedAt: new Date().toISOString() }),
          { status: 200 }
        )
      );

    await startIdentityVerification({ popiaConsent: true });
    await submitFacialLivenessCapture({
      providerSessionId: 'sbx_123',
      challengesCompleted: ['Look straight', 'Turn left'],
      telemetry: {
        frameCount: 4,
        motionDeltaScore: 8.5,
        averageLuminance: 132,
        faceBoxDetected: true,
      },
    });

    const captureCallBody = JSON.parse(String(fetchMock.mock.calls[1][1].body));
    expect(captureCallBody.action).toBe('submit_capture');
    expect(captureCallBody.image).toBeUndefined();
    expect(captureCallBody.video).toBeUndefined();
    expect(captureCallBody.biometricTemplate).toBeUndefined();
    expect(captureCallBody.frameCount).toBe(4);

    const alt = await submitAlternativeVerification({
      popiaConsent: true,
      reason: 'camera_unavailable',
    });
    expect(alt.identity.verificationMethod).toBe('alternative_fallback');
    expect(alt.identity.assuranceLevel).toBe('alternative_fallback');

    const deleted = await eraseMyIdentityData();
    expect(deleted.deleted).toBe(true);
    expect(deleted.revokedCount).toBe(2);
  });
});

