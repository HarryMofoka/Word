import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { verifyMessage } from 'npm:ethers@6.13.4';
import { handleCors } from '../_shared/cors.ts';
import { getAdminClient, requireAuth } from '../_shared/auth.ts';
import { AppError, errorResponse, jsonResponse } from '../_shared/errors.ts';
import { recordAuditLog } from '../_shared/logger.ts';
import { enforceRateLimit } from '../_shared/rateLimit.ts';
import {
  assertNoDangerousHtml,
  optionalString,
  parseJsonBody,
  requireSafeUrl,
  requireString,
  requireUuid,
} from '../_shared/validation.ts';
import {
  SandboxIdentityProvider,
  VeriffProviderAdapter,
  generateSignedAttestationForOutcome,
  resolveIdentityProvider,
  sha256Hex,
  type ProviderOutcome,
  type VerificationOutcome,
} from '../_shared/identityProvider.ts';
import {
  fetchLatestValidOrRecentIdentity,
  insertNotification,
  isIdentityRowValid,
  syncUserIdentityToOpenSessions,
} from '../_shared/mutualTrustServer.ts';

const FORBIDDEN_BIOMETRIC_KEYS = [
  'image',
  'photo',
  'video',
  'framedata',
  'framebytes',
  'base64',
  'dataurl',
  'biometrictemplate',
  'facelandmarks',
  'embedding',
  'rawvideo',
  'selfie',
];

function assertZeroRawBiometricMedia(body: Record<string, unknown>): void {
  for (const key of Object.keys(body)) {
    const lower = key.toLowerCase();
    if (FORBIDDEN_BIOMETRIC_KEYS.some((forbidden) => lower.includes(forbidden))) {
      throw new AppError(
        400,
        'BIOMETRIC_MEDIA_REJECTED',
        `Forbidden field "${key}": Word strictly prohibits uploading raw facial images, video streams, or biometric templates.`
      );
    }
  }
}

function toPublicIdentitySummary(row: Record<string, unknown> | null, provider = resolveIdentityProvider()) {
  if (!row) {
    return {
      hasRecord: false,
      isVerified: false,
      verificationOutcome: 'pending',
      livenessOutcome: 'pending',
      verificationMethod: 'facial_liveness',
      provider: provider.providerId,
      isSandbox: provider.isSandbox,
      assuranceLevel: 'none',
      securityWarnings: [],
      failureReason: null,
      verifiedAt: null,
      expiresAt: null,
      retentionExpiresAt: null,
      popiaConsentAt: null,
      attestationHash: null,
    };
  }

  const expiresAt = row.expires_at ? String(row.expires_at) : null;
  const revokedAt = row.revoked_at ? String(row.revoked_at) : null;
  const expired = Boolean(expiresAt && new Date(expiresAt).getTime() <= Date.now());
  const effectiveOutcome = revokedAt
    ? 'failed'
    : expired && row.verification_outcome === 'verified'
      ? 'expired'
      : String(row.verification_outcome);

  return {
    id: row.id,
    hasRecord: true,
    isVerified:
      !revokedAt &&
      effectiveOutcome === 'verified' &&
      isIdentityRowValid({
        verification_outcome: effectiveOutcome,
        liveness_outcome: String(row.liveness_outcome),
        verification_method: String(row.verification_method),
        expires_at: expiresAt,
        revoked_at: revokedAt,
      }),
    provider: row.provider,
    providerSessionId: row.provider_session_id,
    isSandbox: Boolean(row.is_sandbox),
    verificationMethod: row.verification_method,
    verificationOutcome: effectiveOutcome,
    livenessOutcome: row.liveness_outcome,
    assuranceLevel: row.assurance_level,
    securityWarnings: Array.isArray(row.security_warnings) ? row.security_warnings : [],
    failureReason: row.failure_reason ?? null,
    verifiedAt: row.verified_at ?? null,
    expiresAt,
    retentionExpiresAt: row.retention_expires_at ?? null,
    popiaConsentAt: row.popia_consent_at ?? null,
    attestationHash: row.attestation_hash ?? null,
    attestationSignature: row.attestation_signature ?? null,
  };
}

function mapOutcomeToVerificationRecordStatus(
  outcome: string
): 'pending' | 'verified' | 'failed' | 'expired' {
  if (outcome === 'verified') return 'verified';
  if (outcome === 'expired') return 'expired';
  if (outcome === 'pending' || outcome === 'manual_review') return 'pending';
  return 'failed';
}

async function handleProviderWebhook(req: Request): Promise<Response> {
  const adminClient = getAdminClient();
  const provider = resolveIdentityProvider();
  const rawBody = await req.text();

  let validation;
  try {
    validation = await provider.validateWebhook(req.headers, rawBody);
  } catch (err) {
    throw new AppError(
      401,
      'INVALID_WEBHOOK_SIGNATURE',
      err instanceof Error ? err.message : 'Invalid provider webhook signature.'
    );
  }

  await enforceRateLimit(adminClient, validation.providerSessionId, 'identity_webhook', 40, 60);

  const { data: existingEvent } = await adminClient
    .from('provider_webhook_events')
    .select('id')
    .eq('provider', provider.providerId)
    .eq('event_id', validation.eventId)
    .maybeSingle();

  if (existingEvent) {
    return jsonResponse({ received: true, duplicate: true }, 200, req);
  }

  await adminClient.from('provider_webhook_events').insert({
    provider: provider.providerId,
    event_id: validation.eventId,
    provider_session_id: validation.providerSessionId,
    signature_valid: true,
    payload_summary: validation.rawSummary,
  });

  const { data: identityRow } = await adminClient
    .from('identity_verification_results')
    .select('*')
    .eq('provider', provider.providerId)
    .eq('provider_session_id', validation.providerSessionId)
    .is('revoked_at', null)
    .maybeSingle();

  if (!identityRow) {
    return jsonResponse({ received: true, matched: false }, 202, req);
  }

  const signed = await provider.generateSignedAttestation({
    userId: identityRow.user_id,
    outcome: validation.outcome,
  });

  const { data: updated } = await adminClient
    .from('identity_verification_results')
    .update({
      verification_outcome: validation.outcome.verificationOutcome,
      liveness_outcome: validation.outcome.livenessOutcome,
      assurance_level: validation.outcome.assuranceLevel,
      security_warnings: validation.outcome.securityWarnings,
      failure_reason: validation.outcome.failureReason,
      verified_at: validation.outcome.verifiedAt,
      expires_at: validation.outcome.expiresAt,
      attestation_hash: signed.attestationHash,
      attestation_signature: signed.attestationSignature,
    })
    .eq('id', identityRow.id)
    .select('*')
    .single();

  if (updated) {
    await syncUserIdentityToOpenSessions(adminClient, identityRow.user_id, updated);
    await insertNotification(adminClient, {
      userId: identityRow.user_id,
      category: 'Verification',
      title:
        validation.outcome.verificationOutcome === 'verified'
          ? 'Identity verification approved'
          : 'Identity verification update',
      detail:
        validation.outcome.verificationOutcome === 'verified'
          ? 'Your identity check passed via provider webhook.'
          : validation.outcome.failureReason ?? `Outcome: ${validation.outcome.verificationOutcome}`,
      metadata: { identityResultId: updated.id },
    });
    await recordAuditLog(adminClient, {
      actorUserId: identityRow.user_id,
      action: 'identity_webhook_processed',
      resourceType: 'identity_verification_result',
      resourceId: updated.id,
      metadata: {
        provider: provider.providerId,
        outcome: validation.outcome.verificationOutcome,
      },
    });
  }

  return jsonResponse({ received: true, matched: true }, 200, req);
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const hasAuthHeader = Boolean(req.headers.get('Authorization')?.startsWith('Bearer '));
    const hasWebhookHeader = Boolean(
      req.headers.get('x-hmac-signature') || req.headers.get('x-word-webhook-signature')
    );

    if (req.method === 'POST' && hasWebhookHeader && !hasAuthHeader) {
      return await handleProviderWebhook(req);
    }

    const { user, adminClient } = await requireAuth(req);
    await enforceRateLimit(adminClient, user.id, 'identity_verification', 30, 60);

    const provider = resolveIdentityProvider();

    if (req.method === 'GET') {
      const latest = await fetchLatestValidOrRecentIdentity(adminClient, user.id);

      if (
        latest &&
        latest.verification_outcome === 'verified' &&
        latest.expires_at &&
        new Date(latest.expires_at).getTime() <= Date.now()
      ) {
        const { data: expiredRow } = await adminClient
          .from('identity_verification_results')
          .update({ verification_outcome: 'expired' })
          .eq('id', latest.id)
          .select('*')
          .single();
        if (expiredRow) {
          await syncUserIdentityToOpenSessions(adminClient, user.id, expiredRow);
          return jsonResponse(
            {
              identity: toPublicIdentitySummary(expiredRow, provider),
              providerInfo: {
                providerId: provider.providerId,
                isSandbox: provider.isSandbox,
              },
              popiaPolicy: {
                retentionDays: 30,
                rawMediaStored: false,
                biometricTemplatesSharedWithCounterparty: false,
              },
            },
            200,
            req
          );
        }
      }

      return jsonResponse(
        {
          identity: toPublicIdentitySummary(latest, provider),
          providerInfo: {
            providerId: provider.providerId,
            isSandbox: provider.isSandbox,
          },
          popiaPolicy: {
            retentionDays: 30,
            rawMediaStored: false,
            biometricTemplatesSharedWithCounterparty: false,
          },
        },
        200,
        req
      );
    }

    if (req.method === 'DELETE') {
      const nowIso = new Date().toISOString();
      const { data: revokedRows, error: revokeErr } = await adminClient
        .from('identity_verification_results')
        .update({
          revoked_at: nowIso,
          enrolled_commitment_hash: null,
          failure_reason: 'Erased by user under POPIA data deletion right.',
        })
        .eq('user_id', user.id)
        .is('revoked_at', null)
        .select('id');

      if (revokeErr) {
        throw new AppError(500, 'IDENTITY_DELETE_FAILED', revokeErr.message);
      }

      await syncUserIdentityToOpenSessions(adminClient, user.id, null);

      await recordAuditLog(adminClient, {
        actorUserId: user.id,
        action: 'identity_verification_erased',
        resourceType: 'identity_verification_result',
        resourceId: user.id,
        metadata: { revokedCount: (revokedRows ?? []).length },
      });

      return jsonResponse(
        {
          deleted: true,
          revokedCount: (revokedRows ?? []).length,
          revokedAt: nowIso,
        },
        200,
        req
      );
    }

    if (req.method === 'POST') {
      const body = await parseJsonBody<Record<string, unknown>>(req);
      assertZeroRawBiometricMedia(body);

      const action = requireString(body.action, 'action', 3, 40);
      const nowIso = new Date().toISOString();

      if (action === 'start_session') {
        if (body.popiaConsent !== true) {
          throw new AppError(
            400,
            'POPIA_CONSENT_REQUIRED',
            'Explicit POPIA processing consent is required before starting identity verification.'
          );
        }

        const mutualSessionId = body.mutualSessionId
          ? requireUuid(body.mutualSessionId, 'mutualSessionId')
          : null;
        const callbackUrl = body.callbackUrl
          ? requireSafeUrl(body.callbackUrl, 'callbackUrl')
          : undefined;

        const started = await provider.startSession({
          userId: user.id,
          sessionId: mutualSessionId,
          callbackUrl,
          popiaConsentAt: nowIso,
        });

        const pendingOutcome: ProviderOutcome = {
          provider: started.provider,
          providerSessionId: started.providerSessionId,
          isSandbox: started.isSandbox,
          verificationMethod: 'facial_liveness',
          verificationOutcome: 'pending',
          livenessOutcome: 'pending',
          assuranceLevel: 'none',
          enrolledCommitmentHash: null,
          securityWarnings: started.isSandbox
            ? ['SANDBOX ADAPTER: Development facial liveness session active — not genuine KYC.']
            : [],
          failureReason: null,
          verifiedAt: null,
          expiresAt: started.expiresAt,
        };

        const initialAttestation = await provider.generateSignedAttestation({
          userId: user.id,
          outcome: pendingOutcome,
        });

        const retentionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString();

        const { data: created, error: insertErr } = await adminClient
          .from('identity_verification_results')
          .insert({
            user_id: user.id,
            provider: started.provider,
            provider_session_id: started.providerSessionId,
            is_sandbox: started.isSandbox,
            verification_method: 'facial_liveness',
            verification_outcome: 'pending',
            liveness_outcome: 'pending',
            assurance_level: 'none',
            attestation_hash: initialAttestation.attestationHash,
            attestation_signature: initialAttestation.attestationSignature,
            security_warnings: pendingOutcome.securityWarnings,
            popia_consent_at: nowIso,
            retention_expires_at: retentionExpiresAt,
            expires_at: started.expiresAt,
          })
          .select('*')
          .single();

        if (insertErr || !created) {
          throw new AppError(500, 'START_SESSION_FAILED', insertErr?.message ?? 'Could not store session.');
        }

        await adminClient.from('verification_records').insert({
          user_id: user.id,
          verification_type: 'mutual_identity_attestation',
          status: 'pending',
          proof_metadata: {
            identityResultId: created.id,
            provider: started.provider,
            providerSessionId: started.providerSessionId,
            isSandbox: started.isSandbox,
            expectedChallenges: started.challenges,
          },
        });

        await syncUserIdentityToOpenSessions(adminClient, user.id, created);

        await recordAuditLog(adminClient, {
          actorUserId: user.id,
          action: 'identity_verification_started',
          resourceType: 'identity_verification_result',
          resourceId: created.id,
          metadata: {
            provider: started.provider,
            isSandbox: started.isSandbox,
            mutualSessionId,
          },
        });

        return jsonResponse(
          {
            identity: toPublicIdentitySummary(created, provider),
            session: {
              identityResultId: created.id,
              provider: started.provider,
              providerSessionId: started.providerSessionId,
              isSandbox: started.isSandbox,
              hostedSessionUrl: started.hostedSessionUrl ?? null,
              challenges: started.challenges,
              expiresAt: started.expiresAt,
            },
          },
          201,
          req
        );
      }

      if (action === 'submit_capture') {
        const providerSessionId = requireString(body.providerSessionId, 'providerSessionId', 4, 160);

        const { data: identityRow, error: lookupErr } = await adminClient
          .from('identity_verification_results')
          .select('*')
          .eq('user_id', user.id)
          .eq('provider_session_id', providerSessionId)
          .is('revoked_at', null)
          .maybeSingle();

        if (lookupErr || !identityRow) {
          throw new AppError(404, 'IDENTITY_SESSION_NOT_FOUND', 'Verification session not found.');
        }

        let outcome: ProviderOutcome;

        if (identityRow.provider === 'word_sandbox' || identityRow.provider === 'veriff') {
          const { data: pendingRecord } = await adminClient
            .from('verification_records')
            .select('proof_metadata')
            .eq('user_id', user.id)
            .eq('verification_type', 'mutual_identity_attestation')
            .order('created_at', { ascending: false })
            .limit(10);

          const matchingRecord = (pendingRecord ?? []).find((rec) => {
            const meta = rec.proof_metadata as Record<string, unknown> | null;
            return meta?.providerSessionId === providerSessionId;
          });
          const expectedChallenges = Array.isArray(
            (matchingRecord?.proof_metadata as Record<string, unknown> | null)?.expectedChallenges
          )
            ? ((matchingRecord?.proof_metadata as Record<string, unknown>).expectedChallenges as string[])
            : [];

          const challengesCompleted = Array.isArray(body.challengesCompleted)
            ? body.challengesCompleted.filter((c): c is string => typeof c === 'string')
            : [];
          const frameCount = Number(body.frameCount ?? 0);
          const motionDeltaScore = Number(body.motionDeltaScore ?? 0);
          const averageLuminance = Number(body.averageLuminance ?? 0);
          const faceBoxDetected = body.faceBoxDetected === true;
          const ephemeralSalt =
            optionalString(body.ephemeralCaptureNonce, 'ephemeralCaptureNonce', 128) ??
            crypto.randomUUID();
          const simulatedOutcome = (
            identityRow.expires_at && new Date(identityRow.expires_at).getTime() <= Date.now()
              ? 'expired'
              : optionalString(body.sandboxSimulatedOutcome, 'sandboxSimulatedOutcome', 40)
          ) as VerificationOutcome | undefined;

          const latestPrior = await fetchLatestValidOrRecentIdentity(adminClient, user.id);

          if (identityRow.provider === 'veriff') {
            const veriffDecision = await provider.getOutcome(providerSessionId);
            if (veriffDecision.verificationOutcome !== 'pending' || frameCount === 0) {
              outcome = veriffDecision;
            } else if (provider instanceof VeriffProviderAdapter) {
              outcome = await provider.evaluateInAppLiveCapture({
                providerSessionId,
                userId: user.id,
                challengesCompleted,
                expectedChallenges,
                frameCount,
                motionDeltaScore,
                averageLuminance,
                faceBoxDetected,
                faceCommitmentSaltInput: ephemeralSalt,
                existingEnrolledCommitment: latestPrior?.enrolled_commitment_hash ?? null,
              });
            } else {
              outcome = veriffDecision;
            }
          } else {
            const sandboxAdapter = new SandboxIdentityProvider();
            outcome = await sandboxAdapter.evaluateSandboxCapture({
              providerSessionId,
              userId: user.id,
              challengesCompleted,
              expectedChallenges,
              frameCount,
              motionDeltaScore,
              averageLuminance,
              faceBoxDetected,
              faceCommitmentSaltInput: ephemeralSalt,
              existingEnrolledCommitment: latestPrior?.enrolled_commitment_hash ?? null,
              sandboxSimulatedOutcome: simulatedOutcome,
            });
          }
        } else {
          outcome = await provider.getOutcome(providerSessionId);
        }

        const livenessCheck = provider.validateLiveness(outcome);
        if (outcome.verificationOutcome === 'verified' && !livenessCheck.passed) {
          outcome = {
            ...outcome,
            verificationOutcome: 'liveness_failed',
            livenessOutcome: 'failed',
            assuranceLevel: 'none',
            failureReason: livenessCheck.reason ?? 'Liveness check validation failed.',
            verifiedAt: null,
            expiresAt: null,
          };
        }

        const signed = await provider.generateSignedAttestation({
          userId: user.id,
          outcome,
        });

        const { data: updated, error: updErr } = await adminClient
          .from('identity_verification_results')
          .update({
            verification_outcome: outcome.verificationOutcome,
            liveness_outcome: outcome.livenessOutcome,
            assurance_level: outcome.assuranceLevel,
            enrolled_commitment_hash: outcome.enrolledCommitmentHash,
            security_warnings: outcome.securityWarnings,
            failure_reason: outcome.failureReason,
            verified_at: outcome.verifiedAt,
            expires_at: outcome.expiresAt,
            attestation_hash: signed.attestationHash,
            attestation_signature: signed.attestationSignature,
          })
          .eq('id', identityRow.id)
          .select('*')
          .single();

        if (updErr || !updated) {
          throw new AppError(500, 'CAPTURE_SAVE_FAILED', updErr?.message ?? 'Failed to save verification result.');
        }

        await adminClient.from('verification_records').insert({
          user_id: user.id,
          verification_type: 'mutual_identity_attestation',
          status: mapOutcomeToVerificationRecordStatus(outcome.verificationOutcome),
          verified_at: outcome.verifiedAt,
          proof_metadata: {
            identityResultId: updated.id,
            provider: outcome.provider,
            providerSessionId,
            isSandbox: outcome.isSandbox,
            livenessOutcome: outcome.livenessOutcome,
            assuranceLevel: outcome.assuranceLevel,
            attestationHash: signed.attestationHash,
          },
        });

        await syncUserIdentityToOpenSessions(adminClient, user.id, updated);

        await recordAuditLog(adminClient, {
          actorUserId: user.id,
          action: 'identity_verification_evaluated',
          resourceType: 'identity_verification_result',
          resourceId: updated.id,
          metadata: {
            provider: outcome.provider,
            isSandbox: outcome.isSandbox,
            outcome: outcome.verificationOutcome,
            livenessOutcome: outcome.livenessOutcome,
          },
        });

        return jsonResponse(
          {
            identity: toPublicIdentitySummary(updated, provider),
            signedAttestation: signed,
          },
          200,
          req
        );
      }

      if (action === 'refresh_session') {
        const providerSessionId = requireString(body.providerSessionId, 'providerSessionId', 4, 160);
        const { data: identityRow } = await adminClient
          .from('identity_verification_results')
          .select('*')
          .eq('user_id', user.id)
          .eq('provider_session_id', providerSessionId)
          .is('revoked_at', null)
          .maybeSingle();

        if (!identityRow) {
          throw new AppError(404, 'IDENTITY_SESSION_NOT_FOUND', 'Verification session not found.');
        }

        const outcome =
          identityRow.provider === 'veriff'
            ? await provider.getOutcome(providerSessionId)
            : ({
                provider: identityRow.provider,
                providerSessionId: identityRow.provider_session_id,
                isSandbox: Boolean(identityRow.is_sandbox),
                verificationMethod: identityRow.verification_method,
                verificationOutcome: identityRow.verification_outcome,
                livenessOutcome: identityRow.liveness_outcome,
                assuranceLevel: identityRow.assurance_level,
                enrolledCommitmentHash: identityRow.enrolled_commitment_hash,
                securityWarnings: Array.isArray(identityRow.security_warnings)
                  ? identityRow.security_warnings
                  : [],
                failureReason: identityRow.failure_reason,
                verifiedAt: identityRow.verified_at,
                expiresAt: identityRow.expires_at,
              } as ProviderOutcome);

        const signed = await provider.generateSignedAttestation({ userId: user.id, outcome });
        const { data: updated } = await adminClient
          .from('identity_verification_results')
          .update({
            verification_outcome: outcome.verificationOutcome,
            liveness_outcome: outcome.livenessOutcome,
            assurance_level: outcome.assuranceLevel,
            security_warnings: outcome.securityWarnings,
            failure_reason: outcome.failureReason,
            verified_at: outcome.verifiedAt,
            expires_at: outcome.expiresAt,
            attestation_hash: signed.attestationHash,
            attestation_signature: signed.attestationSignature,
          })
          .eq('id', identityRow.id)
          .select('*')
          .single();

        if (updated) {
          await syncUserIdentityToOpenSessions(adminClient, user.id, updated);
        }

        return jsonResponse(
          {
            identity: toPublicIdentitySummary(updated ?? identityRow, provider),
            signedAttestation: signed,
          },
          200,
          req
        );
      }

      if (action === 'alternative_verify') {
        if (body.popiaConsent !== true) {
          throw new AppError(400, 'POPIA_CONSENT_REQUIRED', 'POPIA processing consent is required.');
        }
        const reason = assertNoDangerousHtml(
          requireString(body.reason, 'reason', 3, 240),
          'reason'
        );

        let walletVerifiedProof = false;
        const walletAddress = optionalString(body.walletAddress, 'walletAddress', 128);
        const signature = optionalString(body.signature, 'signature', 260);
        const declarationStatement = optionalString(
          body.declarationStatement,
          'declarationStatement',
          500
        );

        if (walletAddress && signature && declarationStatement) {
          let recovered = '';
          try {
            recovered = verifyMessage(declarationStatement, signature);
          } catch {
            throw new AppError(400, 'INVALID_FALLBACK_SIGNATURE', 'Invalid declaration signature.');
          }
          if (recovered.toLowerCase() !== walletAddress.toLowerCase()) {
            throw new AppError(
              403,
              'FALLBACK_SIGNER_MISMATCH',
              'Fallback declaration signer does not match wallet address.'
            );
          }
          const { data: ownedWallet } = await adminClient
            .from('wallets')
            .select('id, is_verified')
            .eq('user_id', user.id)
            .ilike('address', walletAddress)
            .maybeSingle();
          if (!ownedWallet) {
            throw new AppError(
              403,
              'WALLET_NOT_REGISTERED',
              'Wallet address is not registered to your authenticated Word account.'
            );
          }
          walletVerifiedProof = Boolean(ownedWallet.is_verified);
        }

        const providerSessionId = `alt_${crypto.randomUUID()}`;
        const expiresAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
        const warnings = [
          'Alternative non-facial verification route used (camera unavailable / accessibility fallback). Counterparty must inspect assurance level.',
          ...(walletVerifiedProof
            ? []
            : ['Authenticated account email confirmed without biometric camera capture.']),
        ];

        const outcome: ProviderOutcome = {
          provider: 'alternative_attestation',
          providerSessionId,
          isSandbox: provider.isSandbox,
          verificationMethod: 'alternative_fallback',
          verificationOutcome: 'verified',
          livenessOutcome: 'not_applicable',
          assuranceLevel: 'alternative_fallback',
          enrolledCommitmentHash: await sha256Hex(`alt:${user.id}:${reason}:${nowIso}`),
          securityWarnings: warnings,
          failureReason: null,
          verifiedAt: nowIso,
          expiresAt,
        };

        const signed = await generateSignedAttestationForOutcome({
          userId: user.id,
          outcome,
        });

        const retentionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString();

        const { data: created, error: altErr } = await adminClient
          .from('identity_verification_results')
          .insert({
            user_id: user.id,
            provider: 'alternative_attestation',
            provider_session_id: providerSessionId,
            is_sandbox: provider.isSandbox,
            verification_method: 'alternative_fallback',
            verification_outcome: 'verified',
            liveness_outcome: 'not_applicable',
            assurance_level: 'alternative_fallback',
            enrolled_commitment_hash: outcome.enrolledCommitmentHash,
            attestation_hash: signed.attestationHash,
            attestation_signature: signed.attestationSignature,
            security_warnings: warnings,
            popia_consent_at: nowIso,
            retention_expires_at: retentionExpiresAt,
            verified_at: nowIso,
            expires_at: expiresAt,
          })
          .select('*')
          .single();

        if (altErr || !created) {
          throw new AppError(500, 'ALT_VERIFY_FAILED', altErr?.message ?? 'Alternative verification failed.');
        }

        await adminClient.from('verification_records').insert({
          user_id: user.id,
          verification_type: 'mutual_identity_attestation',
          status: 'verified',
          verified_at: nowIso,
          proof_metadata: {
            identityResultId: created.id,
            provider: 'alternative_attestation',
            reason,
            walletVerifiedProof,
            attestationHash: signed.attestationHash,
          },
        });

        await syncUserIdentityToOpenSessions(adminClient, user.id, created);

        await recordAuditLog(adminClient, {
          actorUserId: user.id,
          action: 'identity_alternative_verified',
          resourceType: 'identity_verification_result',
          resourceId: created.id,
          metadata: { reason, walletVerifiedProof },
        });

        return jsonResponse(
          {
            identity: toPublicIdentitySummary(created, provider),
            signedAttestation: signed,
          },
          201,
          req
        );
      }

      throw new AppError(400, 'INVALID_ACTION', `Unsupported action: ${action}`);
    }

    throw new AppError(405, 'METHOD_NOT_ALLOWED', 'Unsupported HTTP method.');
  } catch (err) {
    return errorResponse(err, req);
  }
});
