import { hmacSha256Hex, timingSafeEqualHex } from './mutualTrustCrypto.ts';

export type VerificationOutcome =
  | 'pending'
  | 'verified'
  | 'failed'
  | 'liveness_failed'
  | 'expired'
  | 'unavailable'
  | 'manual_review';

export type LivenessOutcome =
  | 'pending'
  | 'passed'
  | 'failed'
  | 'not_applicable'
  | 'unavailable';

export type AssuranceLevel =
  | 'none'
  | 'sandbox_demo'
  | 'alternative_fallback'
  | 'biometric_liveness_l2'
  | 'document_plus_biometric_l3';

export type ProviderId =
  | 'word_sandbox'
  | 'veriff'
  | 'smile_id'
  | 'persona'
  | 'sumsub'
  | 'alternative_attestation';

export interface StartVerificationSessionInput {
  userId: string;
  sessionId?: string | null;
  callbackUrl?: string;
  popiaConsentAt: string;
}

export interface StartedVerificationSession {
  provider: ProviderId;
  providerSessionId: string;
  isSandbox: boolean;
  hostedSessionUrl?: string | null;
  sessionToken?: string | null;
  challenges: string[];
  expiresAt: string;
}

export interface CaptureEvaluationInput {
  providerSessionId: string;
  userId: string;
  challengesCompleted: string[];
  expectedChallenges: string[];
  frameCount: number;
  motionDeltaScore: number;
  averageLuminance: number;
  faceBoxDetected: boolean;
  faceCommitmentSaltInput: string;
  existingEnrolledCommitment?: string | null;
  sandboxSimulatedOutcome?: VerificationOutcome;
}

export interface ProviderOutcome {
  provider: ProviderId;
  providerSessionId: string;
  isSandbox: boolean;
  verificationMethod: 'facial_liveness' | 'alternative_fallback';
  verificationOutcome: VerificationOutcome;
  livenessOutcome: LivenessOutcome;
  assuranceLevel: AssuranceLevel;
  enrolledCommitmentHash: string | null;
  securityWarnings: string[];
  failureReason: string | null;
  verifiedAt: string | null;
  expiresAt: string | null;
}

export interface SignedVerificationAttestation {
  attestationHash: string;
  attestationSignature: string;
  issuedAt: string;
}

export interface WebhookValidationResult {
  valid: boolean;
  eventId: string;
  providerSessionId: string;
  outcome: ProviderOutcome;
  rawSummary: Record<string, unknown>;
}

export interface IdentityVerificationProvider {
  readonly providerId: ProviderId;
  readonly isSandbox: boolean;
  startSession(input: StartVerificationSessionInput): Promise<StartedVerificationSession>;
  getSession(providerSessionId: string): Promise<ProviderOutcome>;
  validateWebhook(headers: Headers, rawBody: string): Promise<WebhookValidationResult>;
  getOutcome(providerSessionId: string): Promise<ProviderOutcome>;
  validateLiveness(outcome: ProviderOutcome): { passed: boolean; reason?: string };
  generateSignedAttestation(params: {
    userId: string;
    outcome: ProviderOutcome;
  }): Promise<SignedVerificationAttestation>;
}

function getEnv(name: string): string | undefined {
  try {
    return typeof Deno !== 'undefined' ? Deno.env.get(name) : undefined;
  } catch {
    return undefined;
  }
}

function getAttestationSecret(): string {
  // Uses dedicated attestation secret if configured, else falls back to service role key
  // (never exposed to frontend; strictly inside Edge Functions).
  return (
    getEnv('MUTUAL_TRUST_ATTESTATION_SECRET') ||
    getEnv('SUPABASE_SERVICE_ROLE_KEY') ||
    'word-local-test-attestation-secret'
  );
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function generateSignedAttestationForOutcome(params: {
  userId: string;
  outcome: ProviderOutcome;
}): Promise<SignedVerificationAttestation> {
  const issuedAt = new Date().toISOString();
  const payload = JSON.stringify({
    v: 1,
    userId: params.userId,
    provider: params.outcome.provider,
    providerSessionId: params.outcome.providerSessionId,
    isSandbox: params.outcome.isSandbox,
    verificationMethod: params.outcome.verificationMethod,
    verificationOutcome: params.outcome.verificationOutcome,
    livenessOutcome: params.outcome.livenessOutcome,
    assuranceLevel: params.outcome.assuranceLevel,
    verifiedAt: params.outcome.verifiedAt,
    expiresAt: params.outcome.expiresAt,
    issuedAt,
  });
  const attestationHash = await sha256Hex(payload);
  const attestationSignature = await hmacSha256Hex(getAttestationSecret(), attestationHash);
  return { attestationHash, attestationSignature, issuedAt };
}

const LIVENESS_PROMPT_POOL = [
  'Center your face inside the oval guide and look straight ahead',
  'Slowly turn your head slightly to the left, then return center',
  'Slowly turn your head slightly to the right, then return center',
  'Blink twice naturally while keeping your face well lit',
];

export function selectRandomLivenessChallenges(count = 2): string[] {
  const pool = [...LIVENESS_PROMPT_POOL.slice(1)];
  const selected: string[] = [LIVENESS_PROMPT_POOL[0]];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const rand = new Uint32Array(1);
    crypto.getRandomValues(rand);
    const idx = rand[0] % pool.length;
    selected.push(pool.splice(idx, 1)[0]);
  }
  return selected;
}

/**
 * Production Veriff Adapter (active when VERIFF_API_KEY + VERIFF_SHARED_SECRET are configured).
 * Selected for strong POPIA / global coverage, 3D liveness & presentation-attack detection,
 * and standard HMAC-SHA256 webhook signatures.
 */
export class VeriffProviderAdapter implements IdentityVerificationProvider {
  readonly providerId: ProviderId = 'veriff';
  readonly isSandbox = false;
  private readonly apiKey: string;
  private readonly sharedSecret: string;
  private readonly baseUrl: string;

  constructor(apiKey: string, sharedSecret: string, baseUrl = 'https://stationapi.veriff.com') {
    this.apiKey = apiKey;
    this.sharedSecret = sharedSecret;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async startSession(input: StartVerificationSessionInput): Promise<StartedVerificationSession> {
    const res = await fetch(`${this.baseUrl}/v1/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AUTH-CLIENT': this.apiKey,
      },
      body: JSON.stringify({
        verification: {
          callback: input.callbackUrl,
          vendorData: input.userId,
          timestamp: new Date().toISOString(),
        },
      }),
    });
    if (!res.ok) {
      throw new Error(`Veriff session creation failed (${res.status}).`);
    }
    const json = (await res.json()) as {
      verification?: { id?: string; url?: string; sessionToken?: string };
    };
    const sessionId = json.verification?.id;
    if (!sessionId) {
      throw new Error('Veriff response missing verification session ID.');
    }
    return {
      provider: 'veriff',
      providerSessionId: sessionId,
      isSandbox: false,
      hostedSessionUrl: json.verification?.url ?? null,
      sessionToken: json.verification?.sessionToken ?? null,
      challenges: selectRandomLivenessChallenges(2),
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    };
  }

  async evaluateInAppLiveCapture(input: CaptureEvaluationInput): Promise<ProviderOutcome> {
    const nowIso = new Date().toISOString();
    const allChallengesDone =
      input.expectedChallenges.length > 0 &&
      input.expectedChallenges.every((ch) => input.challengesCompleted.includes(ch));

    if (!input.faceBoxDetected || input.frameCount < 3) {
      return {
        provider: 'veriff',
        providerSessionId: input.providerSessionId,
        isSandbox: false,
        verificationMethod: 'facial_liveness',
        verificationOutcome: 'liveness_failed',
        livenessOutcome: 'failed',
        assuranceLevel: 'none',
        enrolledCommitmentHash: null,
        securityWarnings: ['Insufficient live camera frames or face positioning detected.'],
        failureReason: 'Face positioning or minimum live frame capture requirement not met.',
        verifiedAt: null,
        expiresAt: null,
      };
    }

    if (!allChallengesDone || input.motionDeltaScore < 1.5) {
      return {
        provider: 'veriff',
        providerSessionId: input.providerSessionId,
        isSandbox: false,
        verificationMethod: 'facial_liveness',
        verificationOutcome: 'liveness_failed',
        livenessOutcome: 'failed',
        assuranceLevel: 'none',
        enrolledCommitmentHash: null,
        securityWarnings: ['Static or unmoving image detected — active liveness motion threshold not met.'],
        failureReason: 'Liveness failed: active facial movement across challenges is required.',
        verifiedAt: null,
        expiresAt: null,
      };
    }

    if (input.averageLuminance < 22 || input.averageLuminance > 245) {
      return {
        provider: 'veriff',
        providerSessionId: input.providerSessionId,
        isSandbox: false,
        verificationMethod: 'facial_liveness',
        verificationOutcome: 'liveness_failed',
        livenessOutcome: 'failed',
        assuranceLevel: 'none',
        enrolledCommitmentHash: null,
        securityWarnings: ['Lighting out of acceptable range for liveness inspection.'],
        failureReason: 'Camera lighting was too dark or overexposed to confirm liveness.',
        verifiedAt: null,
        expiresAt: null,
      };
    }

    const commitment = await sha256Hex(
      `word-face-commit-v1:${input.userId}:${input.faceCommitmentSaltInput}`
    );

    return {
      provider: 'veriff',
      providerSessionId: input.providerSessionId,
      isSandbox: false,
      verificationMethod: 'facial_liveness',
      verificationOutcome: 'verified',
      livenessOutcome: 'passed',
      assuranceLevel: 'biometric_liveness_l2',
      enrolledCommitmentHash: input.existingEnrolledCommitment ?? commitment,
      securityWarnings: [],
      failureReason: null,
      verifiedAt: nowIso,
      expiresAt: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
    };
  }

  async getSession(providerSessionId: string): Promise<ProviderOutcome> {
    const signature = await hmacSha256Hex(this.sharedSecret, providerSessionId);
    const res = await fetch(`${this.baseUrl}/v1/sessions/${encodeURIComponent(providerSessionId)}/decision`, {
      method: 'GET',
      headers: {
        'X-AUTH-CLIENT': this.apiKey,
        'X-HMAC-SIGNATURE': signature,
      },
    });
    if (res.status === 404 || res.status === 202) {
      return {
        provider: 'veriff',
        providerSessionId,
        isSandbox: false,
        verificationMethod: 'facial_liveness',
        verificationOutcome: 'pending',
        livenessOutcome: 'pending',
        assuranceLevel: 'none',
        enrolledCommitmentHash: null,
        securityWarnings: [],
        failureReason: null,
        verifiedAt: null,
        expiresAt: null,
      };
    }
    if (!res.ok) {
      return {
        provider: 'veriff',
        providerSessionId,
        isSandbox: false,
        verificationMethod: 'facial_liveness',
        verificationOutcome: 'unavailable',
        livenessOutcome: 'unavailable',
        assuranceLevel: 'none',
        enrolledCommitmentHash: null,
        securityWarnings: ['Identity provider status check temporarily unavailable.'],
        failureReason: `Provider returned HTTP ${res.status}`,
        verifiedAt: null,
        expiresAt: null,
      };
    }
    const data = (await res.json()) as {
      verification?: { status?: string; code?: number; reason?: string };
    };
    return this.mapVeriffStatus(
      providerSessionId,
      data.verification?.status ?? 'pending',
      data.verification?.reason ?? null
    );
  }

  private mapVeriffStatus(
    providerSessionId: string,
    status: string,
    reason: string | null
  ): ProviderOutcome {
    const nowIso = new Date().toISOString();
    const normalized = status.toLowerCase();
    if (normalized === 'approved') {
      return {
        provider: 'veriff',
        providerSessionId,
        isSandbox: false,
        verificationMethod: 'facial_liveness',
        verificationOutcome: 'verified',
        livenessOutcome: 'passed',
        assuranceLevel: 'document_plus_biometric_l3',
        enrolledCommitmentHash: null,
        securityWarnings: [],
        failureReason: null,
        verifiedAt: nowIso,
        expiresAt: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
      };
    }
    if (normalized === 'resubmission_requested' || normalized === 'review') {
      return {
        provider: 'veriff',
        providerSessionId,
        isSandbox: false,
        verificationMethod: 'facial_liveness',
        verificationOutcome: 'manual_review',
        livenessOutcome: 'pending',
        assuranceLevel: 'none',
        enrolledCommitmentHash: null,
        securityWarnings: ['Provider requested resubmission or manual review.'],
        failureReason: reason,
        verifiedAt: null,
        expiresAt: null,
      };
    }
    if (normalized === 'expired' || normalized === 'abandoned') {
      return {
        provider: 'veriff',
        providerSessionId,
        isSandbox: false,
        verificationMethod: 'facial_liveness',
        verificationOutcome: 'expired',
        livenessOutcome: 'failed',
        assuranceLevel: 'none',
        enrolledCommitmentHash: null,
        securityWarnings: ['Verification session expired before completion.'],
        failureReason: reason ?? 'Session expired',
        verifiedAt: null,
        expiresAt: null,
      };
    }
    if (normalized === 'declined') {
      const isLiveness = Boolean(reason && /liveness|spoof|presentation|mask|screen/i.test(reason));
      return {
        provider: 'veriff',
        providerSessionId,
        isSandbox: false,
        verificationMethod: 'facial_liveness',
        verificationOutcome: isLiveness ? 'liveness_failed' : 'failed',
        livenessOutcome: isLiveness ? 'failed' : 'passed',
        assuranceLevel: 'none',
        enrolledCommitmentHash: null,
        securityWarnings: [reason ?? 'Provider declined verification attempt.'],
        failureReason: reason ?? 'Verification declined by provider.',
        verifiedAt: null,
        expiresAt: null,
      };
    }
    return {
      provider: 'veriff',
      providerSessionId,
      isSandbox: false,
      verificationMethod: 'facial_liveness',
      verificationOutcome: 'pending',
      livenessOutcome: 'pending',
      assuranceLevel: 'none',
      enrolledCommitmentHash: null,
      securityWarnings: [],
      failureReason: null,
      verifiedAt: null,
      expiresAt: null,
    };
  }

  async validateWebhook(headers: Headers, rawBody: string): Promise<WebhookValidationResult> {
    const providedSig =
      headers.get('x-hmac-signature') ??
      headers.get('X-HMAC-SIGNATURE') ??
      '';
    const expectedSig = await hmacSha256Hex(this.sharedSecret, rawBody);
    if (!timingSafeEqualHex(providedSig, expectedSig)) {
      throw new Error('Invalid Veriff webhook HMAC signature.');
    }

    const parsed = JSON.parse(rawBody) as {
      id?: string;
      verification?: { id?: string; status?: string; reason?: string };
    };
    const providerSessionId = parsed.verification?.id ?? '';
    const eventId = parsed.id ?? `${providerSessionId}:${parsed.verification?.status ?? 'event'}`;
    if (!providerSessionId) {
      throw new Error('Webhook payload missing verification session ID.');
    }

    const outcome = this.mapVeriffStatus(
      providerSessionId,
      parsed.verification?.status ?? 'pending',
      parsed.verification?.reason ?? null
    );
    return {
      valid: true,
      eventId,
      providerSessionId,
      outcome,
      rawSummary: {
        status: parsed.verification?.status ?? null,
        hasReason: Boolean(parsed.verification?.reason),
      },
    };
  }

  async getOutcome(providerSessionId: string): Promise<ProviderOutcome> {
    return this.getSession(providerSessionId);
  }

  validateLiveness(outcome: ProviderOutcome): { passed: boolean; reason?: string } {
    if (outcome.livenessOutcome === 'passed' && outcome.verificationOutcome === 'verified') {
      return { passed: true };
    }
    return {
      passed: false,
      reason: outcome.failureReason ?? `Liveness status is ${outcome.livenessOutcome}.`,
    };
  }

  generateSignedAttestation(params: {
    userId: string;
    outcome: ProviderOutcome;
  }): Promise<SignedVerificationAttestation> {
    return generateSignedAttestationForOutcome(params);
  }
}

/**
 * Clearly-labelled Sandbox Identity Provider Adapter for development & hackathon demonstrations
 * when external Veriff/SmileID/Persona credentials are not configured.
 *
 * IMPORTANT: Always sets isSandbox = true and assuranceLevel = 'sandbox_demo'.
 * Sandbox verification NEVER represents genuine biometric identity verification.
 */
export class SandboxIdentityProvider implements IdentityVerificationProvider {
  readonly providerId: ProviderId = 'word_sandbox';
  readonly isSandbox = true;

  async startSession(_input: StartVerificationSessionInput): Promise<StartedVerificationSession> {
    const providerSessionId = `sbx_${crypto.randomUUID()}`;
    return {
      provider: 'word_sandbox',
      providerSessionId,
      isSandbox: true,
      hostedSessionUrl: null,
      sessionToken: null,
      challenges: selectRandomLivenessChallenges(2),
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    };
  }

  async evaluateSandboxCapture(input: CaptureEvaluationInput): Promise<ProviderOutcome> {
    const nowIso = new Date().toISOString();
    const warnings = [
      'SANDBOX ADAPTER: Development verification only — does not constitute genuine government ID or production biometric KYC.',
    ];

    if (input.sandboxSimulatedOutcome === 'liveness_failed') {
      return {
        provider: 'word_sandbox',
        providerSessionId: input.providerSessionId,
        isSandbox: true,
        verificationMethod: 'facial_liveness',
        verificationOutcome: 'liveness_failed',
        livenessOutcome: 'failed',
        assuranceLevel: 'none',
        enrolledCommitmentHash: null,
        securityWarnings: [...warnings, 'Presentation-attack / liveness check failed (sandbox simulation).'],
        failureReason: 'Liveness detection failed: live movement challenge did not pass.',
        verifiedAt: null,
        expiresAt: null,
      };
    }

    if (input.sandboxSimulatedOutcome === 'failed') {
      return {
        provider: 'word_sandbox',
        providerSessionId: input.providerSessionId,
        isSandbox: true,
        verificationMethod: 'facial_liveness',
        verificationOutcome: 'failed',
        livenessOutcome: 'passed',
        assuranceLevel: 'none',
        enrolledCommitmentHash: null,
        securityWarnings: [...warnings, 'Facial identity check failed (sandbox simulation).'],
        failureReason: 'Facial identity check did not match enrolled account commitment.',
        verifiedAt: null,
        expiresAt: null,
      };
    }

    if (input.sandboxSimulatedOutcome === 'manual_review') {
      return {
        provider: 'word_sandbox',
        providerSessionId: input.providerSessionId,
        isSandbox: true,
        verificationMethod: 'facial_liveness',
        verificationOutcome: 'manual_review',
        livenessOutcome: 'pending',
        assuranceLevel: 'none',
        enrolledCommitmentHash: null,
        securityWarnings: [...warnings, 'Manual review requested (sandbox simulation).'],
        failureReason: 'Verification flagged for manual review.',
        verifiedAt: null,
        expiresAt: null,
      };
    }

    if (input.sandboxSimulatedOutcome === 'expired') {
      return {
        provider: 'word_sandbox',
        providerSessionId: input.providerSessionId,
        isSandbox: true,
        verificationMethod: 'facial_liveness',
        verificationOutcome: 'expired',
        livenessOutcome: 'failed',
        assuranceLevel: 'none',
        enrolledCommitmentHash: null,
        securityWarnings: [...warnings, 'Verification session expired before completion.'],
        failureReason: 'Verification session expired.',
        verifiedAt: null,
        expiresAt: null,
      };
    }

    // Real liveness telemetry checks even in sandbox mode:
    // Reject static photos (zero frame motion delta), insufficient frames, dark camera, or missing face detection.
    const allChallengesDone =
      input.expectedChallenges.length > 0 &&
      input.expectedChallenges.every((ch) => input.challengesCompleted.includes(ch));

    if (!input.faceBoxDetected || input.frameCount < 3) {
      return {
        provider: 'word_sandbox',
        providerSessionId: input.providerSessionId,
        isSandbox: true,
        verificationMethod: 'facial_liveness',
        verificationOutcome: 'liveness_failed',
        livenessOutcome: 'failed',
        assuranceLevel: 'none',
        enrolledCommitmentHash: null,
        securityWarnings: [...warnings, 'Insufficient live camera frames or face positioning detected.'],
        failureReason: 'Face positioning or minimum live frame capture requirement not met.',
        verifiedAt: null,
        expiresAt: null,
      };
    }

    if (!allChallengesDone || input.motionDeltaScore < 1.5) {
      return {
        provider: 'word_sandbox',
        providerSessionId: input.providerSessionId,
        isSandbox: true,
        verificationMethod: 'facial_liveness',
        verificationOutcome: 'liveness_failed',
        livenessOutcome: 'failed',
        assuranceLevel: 'none',
        enrolledCommitmentHash: null,
        securityWarnings: [
          ...warnings,
          'Static or unmoving image detected — active liveness motion threshold not met.',
        ],
        failureReason: 'Liveness failed: active facial movement across challenges is required.',
        verifiedAt: null,
        expiresAt: null,
      };
    }

    if (input.averageLuminance < 22 || input.averageLuminance > 245) {
      return {
        provider: 'word_sandbox',
        providerSessionId: input.providerSessionId,
        isSandbox: true,
        verificationMethod: 'facial_liveness',
        verificationOutcome: 'liveness_failed',
        livenessOutcome: 'failed',
        assuranceLevel: 'none',
        enrolledCommitmentHash: null,
        securityWarnings: [...warnings, 'Lighting out of acceptable range for liveness inspection.'],
        failureReason: 'Camera lighting was too dark or overexposed to confirm liveness.',
        verifiedAt: null,
        expiresAt: null,
      };
    }

    const commitment = await sha256Hex(
      `word-face-commit-v1:${input.userId}:${input.faceCommitmentSaltInput}`
    );

    return {
      provider: 'word_sandbox',
      providerSessionId: input.providerSessionId,
      isSandbox: true,
      verificationMethod: 'facial_liveness',
      verificationOutcome: 'verified',
      livenessOutcome: 'passed',
      assuranceLevel: 'sandbox_demo',
      enrolledCommitmentHash: input.existingEnrolledCommitment ?? commitment,
      securityWarnings: warnings,
      failureReason: null,
      verifiedAt: nowIso,
      expiresAt: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
    };
  }

  async getSession(providerSessionId: string): Promise<ProviderOutcome> {
    return {
      provider: 'word_sandbox',
      providerSessionId,
      isSandbox: true,
      verificationMethod: 'facial_liveness',
      verificationOutcome: 'pending',
      livenessOutcome: 'pending',
      assuranceLevel: 'none',
      enrolledCommitmentHash: null,
      securityWarnings: ['Sandbox session awaiting live capture submission.'],
      failureReason: null,
      verifiedAt: null,
      expiresAt: null,
    };
  }

  async validateWebhook(headers: Headers, rawBody: string): Promise<WebhookValidationResult> {
    const secret = getEnv('WORD_SANDBOX_WEBHOOK_SECRET') || getAttestationSecret();
    const sig = headers.get('x-word-webhook-signature') ?? '';
    const expected = await hmacSha256Hex(secret, rawBody);
    if (!timingSafeEqualHex(sig, expected)) {
      throw new Error('Invalid sandbox webhook HMAC signature.');
    }
    const parsed = JSON.parse(rawBody) as {
      eventId?: string;
      providerSessionId?: string;
      verificationOutcome?: VerificationOutcome;
      livenessOutcome?: LivenessOutcome;
      failureReason?: string;
    };
    const providerSessionId = parsed.providerSessionId ?? '';
    const eventId = parsed.eventId ?? '';
    if (!providerSessionId || !eventId) {
      throw new Error('Webhook payload missing eventId or providerSessionId.');
    }
    const verificationOutcome = parsed.verificationOutcome ?? 'failed';
    const livenessOutcome = parsed.livenessOutcome ?? (verificationOutcome === 'verified' ? 'passed' : 'failed');
    const nowIso = new Date().toISOString();
    const isVerified = verificationOutcome === 'verified' && livenessOutcome === 'passed';

    return {
      valid: true,
      eventId,
      providerSessionId,
      outcome: {
        provider: 'word_sandbox',
        providerSessionId,
        isSandbox: true,
        verificationMethod: 'facial_liveness',
        verificationOutcome,
        livenessOutcome,
        assuranceLevel: isVerified ? 'sandbox_demo' : 'none',
        enrolledCommitmentHash: null,
        securityWarnings: [
          'SANDBOX ADAPTER: Webhook processed in sandbox mode — not genuine biometric KYC.',
        ],
        failureReason: isVerified ? null : parsed.failureReason ?? 'Verification failed via webhook.',
        verifiedAt: isVerified ? nowIso : null,
        expiresAt: isVerified ? new Date(Date.now() + 24 * 60 * 60_000).toISOString() : null,
      },
      rawSummary: { verificationOutcome, livenessOutcome },
    };
  }

  async getOutcome(providerSessionId: string): Promise<ProviderOutcome> {
    return this.getSession(providerSessionId);
  }

  validateLiveness(outcome: ProviderOutcome): { passed: boolean; reason?: string } {
    if (outcome.livenessOutcome === 'passed' && outcome.verificationOutcome === 'verified') {
      return { passed: true };
    }
    return {
      passed: false,
      reason: outcome.failureReason ?? `Liveness check did not pass (${outcome.livenessOutcome}).`,
    };
  }

  generateSignedAttestation(params: {
    userId: string;
    outcome: ProviderOutcome;
  }): Promise<SignedVerificationAttestation> {
    return generateSignedAttestationForOutcome(params);
  }
}

export function resolveIdentityProvider(): IdentityVerificationProvider {
  const veriffKey = getEnv('VERIFF_API_KEY');
  const veriffSecret = getEnv('VERIFF_SHARED_SECRET');
  if (veriffKey && veriffSecret) {
    return new VeriffProviderAdapter(
      veriffKey,
      veriffSecret,
      getEnv('VERIFF_BASE_URL') || 'https://stationapi.veriff.com'
    );
  }
  return new SandboxIdentityProvider();
}

export interface SanitizedCounterpartyReport {
  subjectRole: 'sender' | 'recipient';
  displayName: string;
  walletAddress: string;
  walletVerified: boolean;
  verificationOutcome: VerificationOutcome;
  livenessOutcome: LivenessOutcome;
  verificationMethod: 'facial_liveness' | 'alternative_fallback';
  verificationProvider: ProviderId;
  isSandbox: boolean;
  assuranceLevel: AssuranceLevel;
  verifiedAt: string | null;
  expiresAt: string | null;
  validity: 'valid' | 'expired' | 'invalid' | 'pending';
  accountStatus: 'active' | 'revoked';
  securityWarnings: string[];
  attestationHash: string | null;
}

/**
 * Strictly projects only trust-relevant verification metadata for the counterparty.
 * NEVER exposes biometric templates, face images, commitment hashes, emails, or provider secrets.
 */
export function toSanitizedCounterpartyReport(params: {
  subjectRole: 'sender' | 'recipient';
  displayName: string;
  walletAddress: string;
  walletVerified: boolean;
  identityRow: {
    provider: string;
    is_sandbox: boolean;
    verification_method: string;
    verification_outcome: string;
    liveness_outcome: string;
    assurance_level: string;
    verified_at: string | null;
    expires_at: string | null;
    revoked_at: string | null;
    security_warnings: unknown;
    attestation_hash: string;
  } | null;
}): SanitizedCounterpartyReport {
  const row = params.identityRow;
  if (!row) {
    return {
      subjectRole: params.subjectRole,
      displayName: params.displayName,
      walletAddress: params.walletAddress,
      walletVerified: params.walletVerified,
      verificationOutcome: 'pending',
      livenessOutcome: 'pending',
      verificationMethod: 'facial_liveness',
      verificationProvider: 'word_sandbox',
      isSandbox: false,
      assuranceLevel: 'none',
      verifiedAt: null,
      expiresAt: null,
      validity: 'pending',
      accountStatus: 'active',
      securityWarnings: ['Participant has not completed identity verification yet.'],
      attestationHash: null,
    };
  }

  const nowMs = Date.now();
  const isExpired = Boolean(row.expires_at && new Date(row.expires_at).getTime() <= nowMs);
  const isRevoked = Boolean(row.revoked_at);
  const warnings = Array.isArray(row.security_warnings)
    ? row.security_warnings.filter((w): w is string => typeof w === 'string')
    : [];

  let validity: SanitizedCounterpartyReport['validity'] = 'invalid';
  if (isRevoked) {
    validity = 'invalid';
    warnings.push('Verification attestation was revoked by user.');
  } else if (isExpired) {
    validity = 'expired';
    warnings.push('Identity verification has expired and must be renewed.');
  } else if (row.verification_outcome === 'verified') {
    validity = 'valid';
  } else if (row.verification_outcome === 'pending' || row.verification_outcome === 'manual_review') {
    validity = 'pending';
  }

  return {
    subjectRole: params.subjectRole,
    displayName: params.displayName,
    walletAddress: params.walletAddress,
    walletVerified: params.walletVerified,
    verificationOutcome: (isExpired ? 'expired' : row.verification_outcome) as VerificationOutcome,
    livenessOutcome: row.liveness_outcome as LivenessOutcome,
    verificationMethod: (row.verification_method === 'alternative_fallback'
      ? 'alternative_fallback'
      : 'facial_liveness') as 'facial_liveness' | 'alternative_fallback',
    verificationProvider: row.provider as ProviderId,
    isSandbox: Boolean(row.is_sandbox),
    assuranceLevel: row.assurance_level as AssuranceLevel,
    verifiedAt: row.verified_at,
    expiresAt: row.expires_at,
    validity,
    accountStatus: isRevoked ? 'revoked' : 'active',
    securityWarnings: Array.from(new Set(warnings)),
    attestationHash: row.attestation_hash,
  };
}

