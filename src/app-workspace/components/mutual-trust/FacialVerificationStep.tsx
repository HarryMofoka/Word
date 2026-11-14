import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock,
  Info,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import type { WalletState } from '../../types';
import {
  analyzeLiveFramesLiveness,
  checkCameraAvailability,
  eraseMyIdentityData,
  getMyIdentityStatus,
  refreshIdentityVerificationSession,
  startIdentityVerification,
  submitAlternativeVerification,
  submitFacialLivenessCapture,
  type CameraAvailabilityResult,
  type IdentityVerificationSummary,
  type PopiaPolicyInfo,
  type StartedIdentitySession,
  type VerificationOutcome,
} from '../../../services/identityVerificationService';
import { signChallengeMessage } from '../../../services/wdkWalletService';

interface FacialVerificationStepProps {
  userId: string;
  wallet: WalletState;
  mutualSessionId?: string | null;
  onVerified: (identity: IdentityVerificationSummary) => void;
  onStatusChanged?: (identity: IdentityVerificationSummary) => void;
  compact?: boolean;
}

type StepPhase =
  | 'overview'
  | 'camera_check'
  | 'live_capture'
  | 'hosted_pending'
  | 'alternative'
  | 'result';

export const FacialVerificationStep: React.FC<FacialVerificationStepProps> = ({
  userId,
  wallet,
  mutualSessionId = null,
  onVerified,
  onStatusChanged,
  compact = false,
}) => {
  const [phase, setPhase] = useState<StepPhase>('overview');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [identity, setIdentity] = useState<IdentityVerificationSummary | null>(null);
  const [providerInfo, setProviderInfo] = useState<{
    providerId: string;
    isSandbox: boolean;
  }>({ providerId: 'word_sandbox', isSandbox: true });
  const [popiaPolicy, setPopiaPolicy] = useState<PopiaPolicyInfo>({
    retentionDays: 30,
    rawMediaStored: false,
    biometricTemplatesSharedWithCounterparty: false,
  });
  const [popiaConsent, setPopiaConsent] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<CameraAvailabilityResult | null>(null);
  const [activeSession, setActiveSession] = useState<StartedIdentitySession | null>(null);
  const [challengeIdx, setChallengeIdx] = useState(0);
  const [completedChallenges, setCompletedChallenges] = useState<string[]>([]);
  const [captureProgress, setCaptureProgress] = useState(0);

  // Alternative fallback state
  const [altReason, setAltReason] = useState('camera_unavailable');
  const [altPhrase, setAltPhrase] = useState('');
  const [altShowPhrase, setAltShowPhrase] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const framesRef = useRef<Array<{ data: Uint8ClampedArray; width: number; height: number }>>([]);
  const captureTimerRef = useRef<number | null>(null);

  const stopCameraStream = () => {
    if (captureTimerRef.current !== null) {
      window.clearInterval(captureTimerRef.current);
      captureTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    framesRef.current = [];
  };

  useEffect(() => {
    return () => {
      stopCameraStream();
    };
  }, []);

  const loadStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getMyIdentityStatus();
      setIdentity(res.identity);
      setProviderInfo(res.providerInfo);
      setPopiaPolicy(res.popiaPolicy);
      if (res.identity.hasRecord) {
        onStatusChanged?.(res.identity);
      }
      if (res.identity.isVerified) {
        onVerified(res.identity);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to check identity status.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStatus();
  }, [userId]);

  const handlePrepareCamera = async () => {
    setError(null);
    setPhase('camera_check');
    const cam = await checkCameraAvailability();
    setCameraStatus(cam);
  };

  const startLiveCameraForSession = async () => {
    setError(null);
    const cam = await checkCameraAvailability();
    setCameraStatus(cam);
    if (!cam.available) {
      setError(
        cam.reason ??
          'Camera unavailable. Please use Open Verification Provider or Alternative Verification below.'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      setCompletedChallenges([]);
      setChallengeIdx(0);
      setCaptureProgress(0);
      framesRef.current = [];
      setPhase('live_capture');

      window.setTimeout(() => {
        if (videoRef.current && streamRef.current) {
          videoRef.current.srcObject = streamRef.current;
          void videoRef.current.play().catch(() => {});
        }
      }, 60);
    } catch (err) {
      stopCameraStream();
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to access camera. Check permissions or use Alternative Verification.'
      );
    }
  };

  const handleStartVerificationSession = async () => {
    if (!popiaConsent) {
      setError('Please accept the POPIA privacy and non-biometric retention notice first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const started = await startIdentityVerification({
        popiaConsent: true,
        mutualSessionId,
      });
      setActiveSession(started.session);
      setIdentity(started.identity);
      onStatusChanged?.(started.identity);

      if (started.session.hostedSessionUrl) {
        setPhase('hosted_pending');
        return;
      }

      await startLiveCameraForSession();
    } catch (err) {
      stopCameraStream();
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to start verification session. Check permissions or use Alternative Verification.'
      );
      setPhase('camera_check');
    } finally {
      setBusy(false);
    }
  };

  const grabCurrentVideoFrame = () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    const width = 160;
    const height = 120;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);
    framesRef.current.push({
      data: imageData.data,
      width,
      height,
    });
  };

  const handleAdvanceChallengeOrSubmit = async (simulatedOutcome?: VerificationOutcome) => {
    if (!activeSession) return;
    setError(null);

    const challenges =
      activeSession.challenges.length > 0
        ? activeSession.challenges
        : ['Center face inside oval and turn slightly'];

    grabCurrentVideoFrame();

    const currentChallenge = challenges[challengeIdx];
    const nextCompleted = completedChallenges.includes(currentChallenge)
      ? completedChallenges
      : [...completedChallenges, currentChallenge];
    setCompletedChallenges(nextCompleted);

    if (!simulatedOutcome && challengeIdx + 1 < challenges.length) {
      const nextIdx = challengeIdx + 1;
      setChallengeIdx(nextIdx);
      setCaptureProgress(Math.round(((nextIdx) / challenges.length) * 100));
      return;
    }

    // Grab final live frame so inter-frame delta captures genuine head/blink motion
    grabCurrentVideoFrame();
    window.setTimeout(async () => {
      grabCurrentVideoFrame();
      const captured = framesRef.current;
      const telemetry = analyzeLiveFramesLiveness(captured);
      stopCameraStream();
      setCaptureProgress(100);
      setBusy(true);
      try {
        const res = await submitFacialLivenessCapture({
          providerSessionId: activeSession.providerSessionId,
          challengesCompleted: nextCompleted,
          telemetry,
          sandboxSimulatedOutcome: simulatedOutcome,
        });
        setIdentity(res.identity);
        onStatusChanged?.(res.identity);
        setPhase('result');
        if (res.identity.isVerified) {
          onVerified(res.identity);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Unable to complete verification check.'
        );
        setPhase('result');
      } finally {
        framesRef.current = [];
        setBusy(false);
      }
    }, 180);
  };

  const handleRefreshHostedSession = async () => {
    if (!activeSession) return;
    setBusy(true);
    setError(null);
    try {
      const res = await refreshIdentityVerificationSession(activeSession.providerSessionId);
      setIdentity(res.identity);
      onStatusChanged?.(res.identity);
      if (res.identity.verificationOutcome !== 'pending') {
        setPhase('result');
      }
      if (res.identity.isVerified) {
        onVerified(res.identity);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to refresh verification outcome.');
    } finally {
      setBusy(false);
    }
  };

  const handleAlternativeVerify = async () => {
    if (!popiaConsent) {
      setError('Please accept the POPIA privacy consent notice first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let signature: string | undefined;
      let declarationStatement: string | undefined;

      if (wallet.address) {
        const ts = new Date().toISOString();
        declarationStatement = `I confirm camera-based facial verification is unavailable (${altReason}) and request Word alternative verification attestation for account ${userId} at ${ts}.`;
        if (wallet.method === 'connected' || altPhrase.trim().length > 0) {
          signature = await signChallengeMessage({
            message: declarationStatement,
            expectedAddress: wallet.address,
            network: wallet.network,
            walletMethod: wallet.method,
            signingPhrase: altPhrase,
          });
        }
      }

      const res = await submitAlternativeVerification({
        popiaConsent: true,
        reason: altReason,
        walletAddress: signature ? wallet.address : undefined,
        signature,
        declarationStatement: signature ? declarationStatement : undefined,
      });
      setAltPhrase('');
      setIdentity(res.identity);
      onStatusChanged?.(res.identity);
      setPhase('result');
      if (res.identity.isVerified) {
        onVerified(res.identity);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Alternative verification failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleEraseIdentityData = async () => {
    setBusy(true);
    setError(null);
    try {
      await eraseMyIdentityData();
      setActiveSession(null);
      setPhase('overview');
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to erase identity records.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="ws-card" style={{ padding: compact ? 18 : 24 }}>
        <div className="ws-processing-dot" />
        <p style={{ textAlign: 'center', fontSize: 13.5, color: 'var(--sub)' }}>
          Checking identity verification attestation...
        </p>
      </div>
    );
  }

  const outcome = identity?.verificationOutcome ?? 'pending';

  return (
    <div className="ws-card" style={{ padding: compact ? 20 : 28 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="ws-option-icon">
            <UserCheck size={18} />
          </div>
          <div>
            <div style={{ fontSize: 15.5, fontWeight: 600, color: 'var(--ink)' }}>
              Identity &amp; Liveness Verification
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--sub)' }}>
              Provider: {identity?.provider ?? providerInfo.providerId} •{' '}
              {providerInfo.isSandbox || identity?.isSandbox
                ? 'Sandbox Development Adapter'
                : 'Production KYC Provider'}
            </div>
          </div>
        </div>

        <span
          className="ws-badge"
          style={{
            backgroundColor: identity?.isVerified
              ? 'rgba(17, 17, 17, 0.08)'
              : outcome === 'failed' || outcome === 'liveness_failed' || outcome === 'expired'
                ? 'rgba(180, 35, 24, 0.08)'
                : 'var(--soft)',
            color: identity?.isVerified
              ? 'var(--ink)'
              : outcome === 'failed' || outcome === 'liveness_failed' || outcome === 'expired'
                ? '#b42318'
                : 'var(--sub)',
          }}
        >
          {identity?.isVerified
            ? 'Verified'
            : outcome === 'liveness_failed'
              ? 'Liveness Failed'
              : outcome === 'manual_review'
                ? 'Manual Review'
                : outcome === 'expired'
                  ? 'Expired'
                  : outcome === 'failed'
                    ? 'Failed'
                    : outcome === 'unavailable'
                      ? 'Unavailable'
                      : 'Required'}
        </span>
      </div>

      {(providerInfo.isSandbox || identity?.isSandbox) && (
        <div
          className="ws-notice"
          style={{
            marginBottom: 16,
            borderColor: '#d97706',
            backgroundColor: 'rgba(217, 119, 6, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <AlertTriangle size={16} style={{ color: '#b45309', flexShrink: 0, marginTop: 2 }} />
            <div>
              <strong>Sandbox Identity Adapter Active (Development / Demo Only):</strong> No external
              Veriff API credentials are configured in this environment. Real camera frames are checked
              locally for motion &amp; liveness in browser memory only, and attestations carry{' '}
              <code>sandbox_demo</code> assurance — never represented as genuine government KYC.
            </div>
          </div>
        </div>
      )}

      {error && (
        <div
          className="ws-notice"
          style={{
            marginBottom: 16,
            borderColor: '#b42318',
            backgroundColor: 'rgba(180, 35, 24, 0.06)',
            color: '#912018',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <XCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Existing Valid Verified Summary */}
      {phase === 'overview' && identity?.isVerified && (
        <div>
          <div
            className="ws-notice"
            style={{ marginBottom: 16, backgroundColor: 'var(--bg)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <ShieldCheck size={16} style={{ color: 'var(--ink)' }} />
              <strong>Your identity attestation is valid</strong>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>
              <div>Method: {identity.verificationMethod === 'alternative_fallback' ? 'Alternative attestation' : 'Facial liveness check'}</div>
              <div>Assurance level: <code>{identity.assuranceLevel}</code></div>
              <div>Liveness: <code>{identity.livenessOutcome}</code></div>
              {identity.verifiedAt && (
                <div>Verified at: {new Date(identity.verifiedAt).toLocaleString()}</div>
              )}
              {identity.expiresAt && (
                <div>Valid until: {new Date(identity.expiresAt).toLocaleString()}</div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="ws-ghost-btn"
              onClick={() => {
                setPhase('camera_check');
              }}
            >
              <RefreshCw size={14} /> Re-verify face
            </button>
            <button
              type="button"
              className="ws-ghost-btn"
              onClick={() => void handleEraseIdentityData()}
              disabled={busy}
            >
              <Trash2 size={14} /> Erase my verification data (POPIA)
            </button>
          </div>
        </div>
      )}

      {/* Unverified or Need Re-verification Start */}
      {((phase === 'overview' && !identity?.isVerified) || phase === 'result') && (
        <div>
          {identity?.hasRecord && !identity.isVerified && (
            <div
              className="ws-notice"
              style={{
                marginBottom: 16,
                borderColor: '#b42318',
                backgroundColor: 'rgba(180, 35, 24, 0.06)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <ShieldAlert size={16} style={{ color: '#b42318' }} />
                <strong>
                  Verification {identity.verificationOutcome.replace('_', ' ')}
                </strong>
              </div>
              <p style={{ margin: 0, fontSize: 13 }}>
                {identity.failureReason ||
                  'Your verification could not be completed. Retry with steady lighting and visible head movement, or use the alternative verification path.'}
              </p>
            </div>
          )}

          {(!identity?.isVerified || phase === 'result') && !identity?.isVerified && (
            <>
              <div className="ws-notice" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <Info size={15} />
                  <strong>POPIA Biometric &amp; Privacy Protection</strong>
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
                  <li>
                    <strong>Zero raw facial videos or photos saved:</strong> Camera frames are inspected
                    only momentarily in memory and never uploaded or placed on-chain.
                  </li>
                  <li>
                    <strong>Sanitized counterparty disclosure:</strong> The other party receives only your
                    verification status, liveness check outcome, timestamp, provider, and assurance level.
                  </li>
                  <li>
                    <strong>Retention limit:</strong> Attestation metadata automatically expires after{' '}
                    {popiaPolicy.retentionDays} days and can be erased anytime.
                  </li>
                </ul>
              </div>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  fontSize: 13.5,
                  marginBottom: 18,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={popiaConsent}
                  onChange={(e) => setPopiaConsent(e.target.checked)}
                  style={{ marginTop: 3 }}
                />
                <span>
                  I consent to POPIA-compliant identity verification processing and sharing my sanitized
                  verification report (never raw images or biometrics) with my transaction counterparty.
                </span>
              </label>

              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <Button onClick={() => void handlePrepareCamera()} disabled={busy || !popiaConsent}>
                  <Camera size={16} /> Begin Facial Verification
                </Button>
                <button
                  type="button"
                  className="ws-ghost-btn"
                  onClick={() => {
                    setError(null);
                    setPhase('alternative');
                  }}
                >
                  Cannot use camera? Alternative Verification
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Step B: Camera Check & Positioning */}
      {phase === 'camera_check' && (
        <div>
          <p style={{ fontSize: 14, color: 'var(--ink)', marginBottom: 12 }}>
            <strong>Camera &amp; Environment Check</strong>
          </p>
          <div className="ws-notice" style={{ marginBottom: 16 }}>
            <div>1. Ensure you are in even lighting with no bright backlight behind you.</div>
            <div>2. Remove sunglasses or face coverings.</div>
            <div>
              3. Follow the short live movement prompts inside the oval guide (static photos fail
              liveness checks).
            </div>
            {cameraStatus && (
              <div style={{ marginTop: 8 }}>
                Camera status:{' '}
                <strong>
                  {cameraStatus.available
                    ? 'Camera hardware ready'
                    : cameraStatus.reason ?? 'Unavailable'}
                </strong>
              </div>
            )}
          </div>

          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              fontSize: 13,
              marginBottom: 16,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={popiaConsent}
              onChange={(e) => setPopiaConsent(e.target.checked)}
              style={{ marginTop: 2 }}
            />
            <span>Confirm POPIA processing consent for this verification session.</span>
          </label>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Button
              onClick={() => void handleStartVerificationSession()}
              disabled={busy || !popiaConsent}
            >
              <Camera size={16} /> {busy ? 'Starting camera...' : 'Allow Camera & Start'}
            </Button>
            <button
              type="button"
              className="ws-ghost-btn"
              onClick={() => setPhase('alternative')}
            >
              Switch to Alternative Route
            </button>
            <button
              type="button"
              className="ws-ghost-btn"
              onClick={() => setPhase('overview')}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Step C: Live Guided Facial Capture & Liveness */}
      {phase === 'live_capture' && activeSession && (
        <div>
          <div
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: 420,
              aspectRatio: '4 / 3',
              margin: '0 auto 16px',
              borderRadius: 16,
              overflow: 'hidden',
              backgroundColor: '#111111',
              border: '1px solid var(--line)',
            }}
          >
            <video
              ref={videoRef}
              muted
              playsInline
              autoPlay
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: 'scaleX(-1)',
              }}
            />
            {/* Guided oval overlay */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
              }}
            >
              <div
                style={{
                  width: '54%',
                  height: '76%',
                  borderRadius: '50%',
                  border: '2.5px dashed rgba(255, 255, 255, 0.92)',
                  boxShadow: '0 0 0 999px rgba(17, 17, 17, 0.38)',
                }}
              />
            </div>
          </div>

          <div className="ws-notice" style={{ marginBottom: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--sub)', marginBottom: 4 }}>
              Liveness Prompt {challengeIdx + 1} of{' '}
              {Math.max(activeSession.challenges.length, 1)} ({captureProgress}%)
            </div>
            <strong style={{ fontSize: 15 }}>
              {activeSession.challenges[challengeIdx] ??
                'Hold face inside oval guide and nod slightly'}
            </strong>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button
              onClick={() => void handleAdvanceChallengeOrSubmit()}
              disabled={busy}
            >
              <CheckCircle2 size={16} />{' '}
              {busy
                ? 'Evaluating liveness...'
                : challengeIdx + 1 < activeSession.challenges.length
                  ? 'Prompt Completed — Next'
                  : 'Complete Capture & Verify'}
            </Button>
            <button
              type="button"
              className="ws-ghost-btn"
              onClick={() => {
                stopCameraStream();
                setPhase('overview');
              }}
            >
              Stop Camera
            </button>
          </div>

          {activeSession.isSandbox && (
            <div
              style={{
                marginTop: 16,
                paddingTop: 12,
                borderTop: '1px dashed var(--line)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              <span style={{ fontSize: 12, color: 'var(--sub)' }}>Sandbox QA simulations:</span>
              <button
                type="button"
                className="ws-ghost-btn"
                onClick={() => void handleAdvanceChallengeOrSubmit('liveness_failed')}
                disabled={busy}
              >
                Simulate Liveness Fail
              </button>
              <button
                type="button"
                className="ws-ghost-btn"
                onClick={() => void handleAdvanceChallengeOrSubmit('manual_review')}
                disabled={busy}
              >
                Simulate Manual Review
              </button>
            </div>
          )}
        </div>
      )}

      {/* Hosted Provider Pending (e.g. Veriff) */}
      {phase === 'hosted_pending' && activeSession?.hostedSessionUrl && (
        <div>
          <div className="ws-notice" style={{ marginBottom: 16 }}>
            <Clock size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            Your live <strong>{activeSession.provider}</strong> verification session (
            <code>{activeSession.providerSessionId.slice(0, 8)}...</code>) is ready. You can
            complete verification in the hosted Veriff window and click{' '}
            <strong>Check Provider Outcome</strong>, or complete the guided camera liveness check
            directly in-app below.
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <a
              href={activeSession.hostedSessionUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="pill-btn"
            >
              Open Veriff Verification
            </a>
            <button
              type="button"
              className="ws-ghost-btn"
              onClick={() => void startLiveCameraForSession()}
              disabled={busy}
            >
              <Camera size={14} /> Use In-App Guided Camera Liveness
            </button>
            <button
              type="button"
              className="ws-ghost-btn"
              onClick={() => void handleRefreshHostedSession()}
              disabled={busy}
            >
              <RefreshCw size={14} /> {busy ? 'Checking...' : 'Check Provider Outcome'}
            </button>
          </div>
        </div>
      )}

      {/* Alternative Accessibility Verification Route */}
      {phase === 'alternative' && (
        <div>
          <div className="ws-notice" style={{ marginBottom: 14 }}>
            <strong>Accessible Alternative Verification Route</strong>
            <p style={{ margin: '6px 0 0', fontSize: 13 }}>
              If your device lacks a camera or you require an accessibility accommodation, you may
              verify using an authenticated Word declaration (signed with your wallet if connected/entered).
              Your counterparty report will clearly display{' '}
              <code>assuranceLevel: alternative_fallback</code> so they can make an informed decision.
            </p>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
              Reason for non-facial route
            </label>
            <select
              value={altReason}
              onChange={(e) => setAltReason(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid var(--line)',
                background: 'var(--white)',
                fontSize: 14,
              }}
            >
              <option value="camera_unavailable">No working camera on device</option>
              <option value="permission_blocked">Browser/OS blocked camera permissions</option>
              <option value="accessibility_accommodation">Accessibility accommodation required</option>
              <option value="lighting_hardware_issue">Camera hardware/lighting incompatible</option>
            </select>
          </div>

          {wallet.method !== 'connected' && wallet.address && (
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
                Optional WDK recovery phrase to cryptographically co-sign declaration
              </label>
              <input
                type={altShowPhrase ? 'text' : 'password'}
                value={altPhrase}
                onChange={(e) => setAltPhrase(e.target.value)}
                placeholder="12 or 24-word seed phrase (optional; wiped immediately)"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid var(--line)',
                  background: 'var(--white)',
                  fontSize: 13.5,
                }}
              />
              <button
                type="button"
                className="ws-ghost-btn"
                style={{ marginTop: 6 }}
                onClick={() => setAltShowPhrase((s) => !s)}
              >
                {altShowPhrase ? 'Hide phrase' : 'Reveal phrase'}
              </button>
            </div>
          )}

          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              fontSize: 13,
              marginBottom: 16,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={popiaConsent}
              onChange={(e) => setPopiaConsent(e.target.checked)}
              style={{ marginTop: 2 }}
            />
            <span>I accept POPIA processing terms and alternative fallback disclosure.</span>
          </label>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Button
              onClick={() => void handleAlternativeVerify()}
              disabled={busy || !popiaConsent}
            >
              <ShieldCheck size={16} />{' '}
              {busy ? 'Issuing attestation...' : 'Issue Alternative Attestation'}
            </Button>
            <button
              type="button"
              className="ws-ghost-btn"
              onClick={() => setPhase('overview')}
            >
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

