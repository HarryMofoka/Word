import { callEdgeFunction } from './apiClient';

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

export interface IdentityVerificationSummary {
  id?: string;
  hasRecord: boolean;
  isVerified: boolean;
  provider: string;
  providerSessionId?: string;
  isSandbox: boolean;
  verificationMethod: 'facial_liveness' | 'alternative_fallback';
  verificationOutcome: VerificationOutcome;
  livenessOutcome: LivenessOutcome;
  assuranceLevel: AssuranceLevel;
  securityWarnings: string[];
  failureReason: string | null;
  verifiedAt: string | null;
  expiresAt: string | null;
  retentionExpiresAt: string | null;
  popiaConsentAt: string | null;
  attestationHash: string | null;
  attestationSignature?: string | null;
}

export interface StartedIdentitySession {
  identityResultId: string;
  provider: string;
  providerSessionId: string;
  isSandbox: boolean;
  hostedSessionUrl: string | null;
  challenges: string[];
  expiresAt: string;
}

export interface PopiaPolicyInfo {
  retentionDays: number;
  rawMediaStored: boolean;
  biometricTemplatesSharedWithCounterparty: boolean;
}

export interface CameraAvailabilityResult {
  available: boolean;
  hasVideoInput: boolean;
  permissionState: 'granted' | 'denied' | 'prompt' | 'unknown';
  reason?: string;
}

export interface FrameLivenessTelemetry {
  frameCount: number;
  motionDeltaScore: number;
  averageLuminance: number;
  faceBoxDetected: boolean;
}

/**
 * Checks browser camera hardware & permission state without opening a persistent stream.
 */
export async function checkCameraAvailability(): Promise<CameraAvailabilityResult> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return {
      available: false,
      hasVideoInput: false,
      permissionState: 'unknown',
      reason: 'Browser camera APIs are not available in this environment.',
    };
  }

  let permissionState: CameraAvailabilityResult['permissionState'] = 'unknown';
  try {
    if (navigator.permissions?.query) {
      const status = await navigator.permissions.query({
        name: 'camera' as PermissionName,
      });
      if (
        status.state === 'granted' ||
        status.state === 'denied' ||
        status.state === 'prompt'
      ) {
        permissionState = status.state;
      }
    }
  } catch {
    // Permissions API for camera may throw in Safari/Firefox; ignore cleanly.
  }

  if (permissionState === 'denied') {
    return {
      available: false,
      hasVideoInput: true,
      permissionState: 'denied',
      reason: 'Camera permission was denied in browser settings.',
    };
  }

  try {
    const devices = navigator.mediaDevices.enumerateDevices
      ? await navigator.mediaDevices.enumerateDevices()
      : [];
    const videoDevices = devices.filter((d) => d.kind === 'videoinput');
    if (devices.length > 0 && videoDevices.length === 0) {
      return {
        available: false,
        hasVideoInput: false,
        permissionState,
        reason: 'No video camera input device detected.',
      };
    }
    return {
      available: true,
      hasVideoInput: true,
      permissionState,
    };
  } catch {
    return {
      available: true,
      hasVideoInput: true,
      permissionState,
    };
  }
}

/**
 * Extracts luminance + central-oval contrast statistics strictly in RAM across short-lived
 * downsampled canvas buffers. Zero images or biometric vectors are retained or uploaded.
 */
export function analyzeLiveFramesLiveness(
  frames: Array<{ data: Uint8ClampedArray; width: number; height: number }>
): FrameLivenessTelemetry {
  if (frames.length === 0) {
    return {
      frameCount: 0,
      motionDeltaScore: 0,
      averageLuminance: 0,
      faceBoxDetected: false,
    };
  }

  let totalLuminance = 0;
  let totalPixels = 0;
  let totalDelta = 0;
  let comparisons = 0;
  let maxCentralContrast = 0;

  const sampleLuminanceAt = (
    buf: Uint8ClampedArray,
    width: number,
    height: number
  ): { meanLum: number; centerMean: number; edgeMean: number } => {
    let sum = 0;
    let centerSum = 0;
    let centerCount = 0;
    let edgeSum = 0;
    let edgeCount = 0;

    const minX = Math.floor(width * 0.28);
    const maxX = Math.floor(width * 0.72);
    const minY = Math.floor(height * 0.18);
    const maxY = Math.floor(height * 0.82);

    // Step by 4 pixels for fast zero-jank UI sampling
    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        const idx = (y * width + x) * 4;
        const lum = 0.2126 * buf[idx] + 0.7152 * buf[idx + 1] + 0.0722 * buf[idx + 2];
        sum += lum;
        if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
          centerSum += lum;
          centerCount += 1;
        } else {
          edgeSum += lum;
          edgeCount += 1;
        }
      }
    }

    const sampled = centerCount + edgeCount;
    return {
      meanLum: sampled > 0 ? sum / sampled : 0,
      centerMean: centerCount > 0 ? centerSum / centerCount : 0,
      edgeMean: edgeCount > 0 ? edgeSum / edgeCount : 0,
    };
  };

  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const stats = sampleLuminanceAt(f.data, f.width, f.height);
    totalLuminance += stats.meanLum;
    totalPixels += 1;
    maxCentralContrast = Math.max(
      maxCentralContrast,
      Math.abs(stats.centerMean - stats.edgeMean)
    );

    if (i > 0) {
      const prev = frames[i - 1];
      const len = Math.min(f.data.length, prev.data.length);
      let diffSum = 0;
      let diffSamples = 0;
      for (let p = 0; p < len; p += 16) {
        diffSum += Math.abs(f.data[p] - prev.data[p]);
        diffSamples += 1;
      }
      if (diffSamples > 0) {
        totalDelta += diffSum / diffSamples;
        comparisons += 1;
      }
    }
  }

  const avgLum = totalPixels > 0 ? totalLuminance / totalPixels : 0;
  const motionDeltaScore =
    comparisons > 0 ? Number((totalDelta / comparisons).toFixed(2)) : 0;
  const faceBoxDetected =
    frames.length >= 2 && avgLum >= 20 && avgLum <= 246 && maxCentralContrast >= 2.0;

  return {
    frameCount: frames.length,
    motionDeltaScore,
    averageLuminance: Number(avgLum.toFixed(1)),
    faceBoxDetected,
  };
}

export async function getMyIdentityStatus(): Promise<{
  identity: IdentityVerificationSummary;
  providerInfo: { providerId: string; isSandbox: boolean };
  popiaPolicy: PopiaPolicyInfo;
}> {
  return callEdgeFunction('identity-verification', { method: 'GET' });
}

export async function startIdentityVerification(params: {
  popiaConsent: boolean;
  mutualSessionId?: string | null;
  callbackUrl?: string;
}): Promise<{
  identity: IdentityVerificationSummary;
  session: StartedIdentitySession;
}> {
  return callEdgeFunction('identity-verification', {
    method: 'POST',
    body: {
      action: 'start_session',
      popiaConsent: params.popiaConsent,
      mutualSessionId: params.mutualSessionId ?? undefined,
      callbackUrl: params.callbackUrl,
    },
  });
}

export async function submitFacialLivenessCapture(params: {
  providerSessionId: string;
  challengesCompleted: string[];
  telemetry: FrameLivenessTelemetry;
  sandboxSimulatedOutcome?: VerificationOutcome;
}): Promise<{
  identity: IdentityVerificationSummary;
  signedAttestation: {
    attestationHash: string;
    attestationSignature: string;
    issuedAt: string;
  };
}> {
  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);
  const ephemeralCaptureNonce = Array.from(randomBytes, (b) =>
    b.toString(16).padStart(2, '0')
  ).join('');

  return callEdgeFunction('identity-verification', {
    method: 'POST',
    body: {
      action: 'submit_capture',
      providerSessionId: params.providerSessionId,
      challengesCompleted: params.challengesCompleted,
      frameCount: params.telemetry.frameCount,
      motionDeltaScore: params.telemetry.motionDeltaScore,
      averageLuminance: params.telemetry.averageLuminance,
      faceBoxDetected: params.telemetry.faceBoxDetected,
      ephemeralCaptureNonce,
      sandboxSimulatedOutcome: params.sandboxSimulatedOutcome,
    },
  });
}

export async function refreshIdentityVerificationSession(providerSessionId: string): Promise<{
  identity: IdentityVerificationSummary;
  signedAttestation: {
    attestationHash: string;
    attestationSignature: string;
    issuedAt: string;
  };
}> {
  return callEdgeFunction('identity-verification', {
    method: 'POST',
    body: {
      action: 'refresh_session',
      providerSessionId,
    },
  });
}

export async function submitAlternativeVerification(params: {
  popiaConsent: boolean;
  reason: string;
  walletAddress?: string;
  signature?: string;
  declarationStatement?: string;
}): Promise<{
  identity: IdentityVerificationSummary;
  signedAttestation: {
    attestationHash: string;
    attestationSignature: string;
    issuedAt: string;
  };
}> {
  return callEdgeFunction('identity-verification', {
    method: 'POST',
    body: {
      action: 'alternative_verify',
      ...params,
    },
  });
}

export async function eraseMyIdentityData(): Promise<{
  deleted: boolean;
  revokedCount: number;
  revokedAt: string;
}> {
  return callEdgeFunction('identity-verification', {
    method: 'DELETE',
  });
}

