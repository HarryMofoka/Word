import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Ban,
  CheckCircle2,
  Clock,
  Lock,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  Users,
  XCircle,
} from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import type { WalletState } from '../../types';
import {
  RECIPIENT_APPROVAL_STATEMENT,
  SENDER_APPROVAL_STATEMENT,
  type MutualApprovalRole,
} from '../../../services/mutualTrustCrypto';
import {
  acknowledgeCounterpartyReport,
  createOrJoinMutualTrustSession,
  declineMutualTrustSession,
  getMutualTrustSession,
  signAndSubmitMutualApproval,
  subscribeToMutualTrustSession,
  syncMutualSessionIdentity,
  type HydratedMutualSession,
  type SanitizedCounterpartyReport,
} from '../../../services/mutualTrustService';
import { FacialVerificationStep } from './FacialVerificationStep';
import { MutualTrustReceiptView } from './MutualTrustReceiptView';

interface MutualTrustFlowProps {
  userId: string;
  wallet: WalletState;
  sessionId?: string | null;
  initialSession?: HydratedMutualSession | null;
  paymentRequestId?: string | null;
  shareCode?: string | null;
  onBack: () => void;
  onReadyToExecute?: (hydrated: HydratedMutualSession) => void;
}

function renderReportCard(
  report: SanitizedCounterpartyReport,
  isSelf: boolean
): React.ReactNode {
  const isValid = report.validity === 'valid' && report.verificationOutcome === 'verified';

  return (
    <div
      key={`${report.subjectRole}-${report.walletAddress}`}
      style={{
        backgroundColor: 'var(--bg)',
        border: `1px solid ${isValid ? 'var(--ink)' : 'var(--line)'}`,
        borderRadius: 14,
        padding: 16,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 10,
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>
          {report.subjectRole === 'sender' ? 'Sender' : 'Recipient'}: {report.displayName}
          {isSelf ? ' (You)' : ' (Counterparty)'}
        </div>
        <span
          className="ws-badge"
          style={{
            backgroundColor: isValid ? 'rgba(17,17,17,0.08)' : 'var(--soft)',
            color:
              report.validity === 'invalid' || report.validity === 'expired'
                ? '#b42318'
                : 'var(--ink)',
          }}
        >
          {report.validity.toUpperCase()}
        </span>
      </div>

      <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--sub)' }}>
        <div>
          Wallet: <code style={{ wordBreak: 'break-all' }}>{report.walletAddress}</code>{' '}
          {report.walletVerified ? '• Verified ownership' : '• Unverified wallet'}
        </div>
        <div>
          Identity Status: <strong style={{ color: 'var(--ink)' }}>{report.verificationOutcome}</strong>
        </div>
        <div>
          Liveness Detection: <strong style={{ color: 'var(--ink)' }}>{report.livenessOutcome}</strong>
        </div>
        <div>
          Provider: {report.verificationProvider}
          {report.isSandbox ? ' (Sandbox Adapter — Dev Only)' : ''}
        </div>
        <div>
          Assurance Level: <code>{report.assuranceLevel}</code>
        </div>
        <div>
          Account Status: <strong>{report.accountStatus}</strong>
        </div>
        <div>
          Verified At:{' '}
          {report.verifiedAt ? new Date(report.verifiedAt).toLocaleString() : 'Not yet verified'}
        </div>
        {report.expiresAt && (
          <div>Valid Until: {new Date(report.expiresAt).toLocaleString()}</div>
        )}
      </div>

      {report.securityWarnings.length > 0 && (
        <div
          style={{
            marginTop: 10,
            padding: '8px 10px',
            borderRadius: 10,
            backgroundColor: 'rgba(217, 119, 6, 0.08)',
            border: '1px solid rgba(217, 119, 6, 0.35)',
            fontSize: 12,
            color: '#92400e',
          }}
        >
          {report.securityWarnings.map((w) => (
            <div key={w}>• {w}</div>
          ))}
        </div>
      )}
    </div>
  );
}

export const MutualTrustFlow: React.FC<MutualTrustFlowProps> = ({
  userId,
  wallet,
  sessionId = null,
  initialSession = null,
  paymentRequestId = null,
  shareCode = null,
  onBack,
  onReadyToExecute,
}) => {
  const [hydrated, setHydrated] = useState<HydratedMutualSession | null>(initialSession);
  const [loading, setLoading] = useState(!initialSession);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<'connecting' | 'live' | 'reconnecting'>('connecting');

  // Review & Signature states
  const [reportReviewed, setReportReviewed] = useState(false);
  const [statementChecked, setStatementChecked] = useState(false);
  const [signingPhrase, setSigningPhrase] = useState('');
  const [showPhrase, setShowPhrase] = useState(false);
  const [showDeclineBox, setShowDeclineBox] = useState(false);
  const [declineReason, setDeclineReason] = useState('');

  // Optional direct initiation state when launched without an existing session
  const [inviteAddress, setInviteAddress] = useState('');
  const [inviteAmount, setInviteAmount] = useState('15.00');
  const [inviteToken, setInviteToken] = useState('USDT');
  const [inviteNetwork, setInviteNetwork] = useState('Testnet');
  const [invitePurpose, setInvitePurpose] = useState('');

  const loadSession = useCallback(async () => {
    const targetId = hydrated?.session.id ?? sessionId;
    if (!targetId && !paymentRequestId && !shareCode) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await getMutualTrustSession({
        sessionId: targetId ?? undefined,
        paymentRequestId: !targetId ? paymentRequestId ?? undefined : undefined,
        shareCode: !targetId && !paymentRequestId ? shareCode ?? undefined : undefined,
      });
      if (next) {
        setHydrated(next);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load Mutual Trust session.');
    } finally {
      setLoading(false);
    }
  }, [hydrated?.session.id, paymentRequestId, sessionId, shareCode]);

  useEffect(() => {
    if (!initialSession) {
      void loadSession();
    }
  }, [initialSession, loadSession]);

  const activeSessionId = hydrated?.session.id ?? sessionId;

  useEffect(() => {
    if (!activeSessionId) return;
    const unsubscribe = subscribeToMutualTrustSession(activeSessionId, {
      onUpdated: (latest) => {
        setHydrated(latest);
      },
      onConnectionState: setLiveStatus,
    });
    return unsubscribe;
  }, [activeSessionId]);

  const handleCreateDirectInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await createOrJoinMutualTrustSession({
        recipientAddress: inviteAddress.trim(),
        senderWalletAddress: wallet.address,
        amount: inviteAmount.trim(),
        tokenSymbol: inviteToken,
        network: inviteNetwork,
        purpose: invitePurpose.trim() || 'Mutual Trust Bilateral Payment',
      });
      setHydrated(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create Mutual Trust invitation.');
    } finally {
      setBusy(false);
    }
  };

  const handleIdentityVerifiedOrChanged = async () => {
    if (!hydrated?.session.id) return;
    try {
      const updated = await syncMutualSessionIdentity(hydrated.session.id);
      setHydrated(updated);
    } catch {
      void loadSession();
    }
  };

  const handleAcknowledgeReport = async () => {
    if (!hydrated) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await acknowledgeCounterpartyReport(hydrated.session.id);
      setHydrated(updated);
      setReportReviewed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not acknowledge counterparty report.');
    } finally {
      setBusy(false);
    }
  };

  const handleSignApproval = async () => {
    if (!hydrated) return;
    if (!statementChecked) {
      setError('You must confirm the exact Mutual Trust verification statement before signing.');
      return;
    }

    const isSender = hydrated.session.sender_id === userId;
    const role: MutualApprovalRole = isSender ? 'sender' : 'recipient';
    const expectedWallet = isSender
      ? hydrated.session.sender_wallet_address
      : hydrated.session.recipient_wallet_address;

    setBusy(true);
    setError(null);
    try {
      const updated = await signAndSubmitMutualApproval({
        session: hydrated.session,
        role,
        signerAddress: expectedWallet,
        walletMethod: wallet.method,
        signingPhrase,
      });
      setSigningPhrase('');
      setHydrated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit EIP-712 approval.');
    } finally {
      setBusy(false);
    }
  };

  const handleDecline = async () => {
    if (!hydrated) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await declineMutualTrustSession({
        sessionId: hydrated.session.id,
        reason: declineReason.trim() || 'Declined during bilateral review.',
      });
      setShowDeclineBox(false);
      setHydrated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to decline transaction.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="ws-card" style={{ padding: 36, textAlign: 'center' }}>
        <div className="ws-processing-dot" />
        <p style={{ color: 'var(--sub)', fontSize: 14 }}>Loading Mutual Trust Verification session...</p>
      </div>
    );
  }

  // Screen A-0: Create Direct Bilateral Invitation when opened standalone from Hub
  if (!hydrated) {
    return (
      <div className="ws-card" style={{ padding: 28, maxWidth: 680 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <button type="button" className="ws-ghost-btn" onClick={onBack}>
            <ArrowLeft size={14} /> Back
          </button>
          <span className="ws-badge">Mutual Trust Verification</span>
        </div>

        <h2 style={{ fontSize: 22, fontWeight: 500, letterSpacing: '-0.02em', marginBottom: 8 }}>
          Start Mutual Trust Payment
        </h2>
        <p style={{ fontSize: 13.5, color: 'var(--sub)', lineHeight: 1.55, marginBottom: 20 }}>
          Both sender and recipient must independently complete facial liveness verification, review
          each other&apos;s sanitized trust reports, and co-sign the identical canonical transaction
          before execution unlocks.
        </p>

        {error && (
          <div
            className="ws-notice"
            style={{ marginBottom: 16, borderColor: '#b42318', color: '#912018' }}
          >
            {error}
          </div>
        )}

        <form onSubmit={(e) => void handleCreateDirectInvitation(e)} style={{ display: 'grid', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 5 }}>
              Recipient Word Wallet Address (0x...)
            </label>
            <input
              type="text"
              required
              value={inviteAddress}
              onChange={(e) => setInviteAddress(e.target.value)}
              placeholder="0x..."
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid var(--line)',
                fontSize: 13.5,
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 1fr', gap: 10 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 5 }}>
                Amount
              </label>
              <input
                type="text"
                required
                value={inviteAmount}
                onChange={(e) => setInviteAmount(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid var(--line)',
                  fontSize: 13.5,
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 5 }}>
                Token
              </label>
              <select
                value={inviteToken}
                onChange={(e) => setInviteToken(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid var(--line)',
                  fontSize: 13.5,
                  background: 'var(--white)',
                }}
              >
                <option value="USDT">USDT</option>
                <option value="USDC">USDC</option>
                <option value="ETH">ETH</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 5 }}>
                Network
              </label>
              <select
                value={inviteNetwork}
                onChange={(e) => setInviteNetwork(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid var(--line)',
                  fontSize: 13.5,
                  background: 'var(--white)',
                }}
              >
                <option value="Testnet">Ethereum Sepolia</option>
                <option value="Base Sepolia">Base Sepolia</option>
                <option value="Polygon Amoy">Polygon Amoy</option>
              </select>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 5 }}>
              Purpose / Agreement Summary
            </label>
            <input
              type="text"
              required
              value={invitePurpose}
              onChange={(e) => setInvitePurpose(e.target.value)}
              placeholder="e.g. Verified milestone disbursement"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid var(--line)',
                fontSize: 13.5,
              }}
            />
          </div>

          <div style={{ marginTop: 6 }}>
            <Button type="submit" disabled={busy || !wallet.address}>
              <Users size={16} />{' '}
              {busy ? 'Creating Bilateral Session...' : 'Invite Counterparty & Verify'}
            </Button>
          </div>
        </form>
      </div>
    );
  }

  const { session, senderReport, recipientReport, agreement, approvals, receipt } = hydrated;
  const isSender = session.sender_id === userId;
  const myRole: MutualApprovalRole = isSender ? 'sender' : 'recipient';
  const myVerificationStatus = isSender
    ? session.sender_verification_status
    : session.recipient_verification_status;
  const counterpartyVerificationStatus = isSender
    ? session.recipient_verification_status
    : session.sender_verification_status;
  const myReport = isSender ? senderReport : recipientReport;
  const counterpartyReport = isSender ? recipientReport : senderReport;
  const myApproval = isSender ? approvals.sender : approvals.recipient;
  const counterpartyApproval = isSender ? approvals.recipient : approvals.sender;
  const bothIdentitiesVerified =
    session.sender_verification_status === 'verified' &&
    session.recipient_verification_status === 'verified';
  const myReportViewedAt = isSender
    ? session.sender_report_viewed_at
    : session.recipient_report_viewed_at;

  const exactStatement = isSender ? SENDER_APPROVAL_STATEMENT : RECIPIENT_APPROVAL_STATEMENT;

  const stageIdx =
    receipt && (session.session_state === 'completed' || session.session_state === 'executing')
      ? 3
      : session.session_state === 'authorized'
        ? 3
        : bothIdentitiesVerified && (myReportViewedAt || reportReviewed)
          ? 2
          : bothIdentitiesVerified
            ? 1
            : 0;

  return (
    <div style={{ display: 'grid', gap: 18, maxWidth: 920 }}>
      {/* Top Bar & Live Realtime Indicator */}
      <div
        className="ws-card"
        style={{
          padding: '16px 22px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="ws-ghost-btn" onClick={onBack}>
            <ArrowLeft size={14} /> Back
          </button>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>
              Mutual Trust Verification • {session.amount_numeric} {session.token_symbol}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--sub)' }}>
              You are acting as <strong>{isSender ? 'Sender (Payer)' : 'Recipient (Payee)'}</strong> •{' '}
              {session.network} (Chain {session.chain_id})
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="ws-badge">
            <span
              className="ws-dot-live"
              style={{
                backgroundColor: liveStatus === 'live' ? '#16a34a' : '#d97706',
                marginRight: 6,
              }}
            />
            {liveStatus === 'live' ? 'Realtime Live' : 'Syncing'}
          </span>
          <span className="ws-badge" style={{ textTransform: 'uppercase' }}>
            {session.session_state.replace('_', ' ')}
          </span>
          <button
            type="button"
            className="ws-ghost-btn"
            onClick={() => void loadSession()}
            title="Refresh authoritative session state"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Stepper */}
      <div className="ws-stepper">
        {[
          '1. Dual Identity Check',
          '2. Reports Exchange',
          '3. Canonical Review & EIP-712',
          '4. Execution & Receipt',
        ].map((label, idx) => (
          <div
            key={label}
            className={`ws-step-pill ${
              idx === stageIdx ? 'is-active' : idx < stageIdx ? 'is-done' : ''
            }`}
          >
            {label}
          </div>
        ))}
      </div>

      {error && (
        <div
          className="ws-notice"
          style={{
            borderColor: '#b42318',
            backgroundColor: 'rgba(180, 35, 24, 0.06)',
            color: '#912018',
          }}
        >
          <XCircle size={15} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          {error}
        </div>
      )}

      {/* Terminal Declined / Expired States (Screen E) */}
      {(session.session_state === 'declined' || session.session_state === 'expired') && (
        <div className="ws-card" style={{ padding: 28, borderColor: '#b42318' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <Ban size={20} style={{ color: '#b42318' }} />
            <h3 style={{ margin: 0, fontSize: 18 }}>
              {session.session_state === 'declined'
                ? 'Transaction Declined'
                : 'Mutual Trust Session Expired'}
            </h3>
          </div>
          <p style={{ fontSize: 14, color: 'var(--sub)', marginBottom: 16 }}>
            {session.session_state === 'declined'
              ? `Reason: ${session.decline_reason || 'Declined by participant.'} All prior approvals were invalidated and payment execution is permanently blocked.`
              : 'The verification/review window expired before both participants approved. Create a fresh Mutual Trust invitation to restart.'}
          </p>
          <Button onClick={onBack}>Return to Payments</Button>
        </div>
      )}

      {/* Stage 1 (Screens A-E): Independent Facial Identity Verification + Waiting */}
      {session.session_state !== 'declined' &&
        session.session_state !== 'expired' &&
        !bothIdentitiesVerified && (
          <div style={{ display: 'grid', gap: 16 }}>
            <div className="ws-card" style={{ padding: 22 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: 12,
                }}
              >
                <div className="ws-notice" style={{ backgroundColor: 'var(--bg)' }}>
                  <div style={{ fontSize: 12, color: 'var(--sub)' }}>Your Verification ({myRole})</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', marginTop: 4 }}>
                    {myVerificationStatus === 'verified' ? (
                      <>
                        <CheckCircle2 size={15} style={{ verticalAlign: 'middle', marginRight: 5 }} />
                        Verified ({myReport.assuranceLevel})
                      </>
                    ) : (
                      `Status: ${myVerificationStatus.replace('_', ' ')}`
                    )}
                  </div>
                </div>

                <div className="ws-notice" style={{ backgroundColor: 'var(--bg)' }}>
                  <div style={{ fontSize: 12, color: 'var(--sub)' }}>
                    Counterparty Verification ({counterpartyReport.displayName})
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', marginTop: 4 }}>
                    {counterpartyVerificationStatus === 'verified' ? (
                      <>
                        <CheckCircle2 size={15} style={{ verticalAlign: 'middle', marginRight: 5 }} />
                        Verified — ready to exchange
                      </>
                    ) : (
                      <>
                        <Clock size={15} style={{ verticalAlign: 'middle', marginRight: 5 }} />
                        Awaiting counterparty ({counterpartyVerificationStatus.replace('_', ' ')})
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {myVerificationStatus === 'verified' ? (
              <div className="ws-card" style={{ padding: 28, textAlign: 'center' }}>
                <UserCheck size={28} style={{ marginBottom: 10 }} />
                <h3 style={{ margin: '0 0 8px', fontSize: 18 }}>
                  Your verification is complete — waiting for {counterpartyReport.displayName}
                </h3>
                <p style={{ fontSize: 13.5, color: 'var(--sub)', maxWidth: 520, margin: '0 auto 16px' }}>
                  One participant passing does not unlock the transaction. As soon as{' '}
                  {counterpartyReport.displayName} finishes independent facial liveness verification,
                  sanitized verification reports will exchange automatically over Realtime.
                </p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                  <button
                    type="button"
                    className="ws-ghost-btn"
                    onClick={() => void handleIdentityVerifiedOrChanged()}
                  >
                    <RefreshCw size={14} /> Check Counterparty Status
                  </button>
                </div>
              </div>
            ) : (
              <FacialVerificationStep
                userId={userId}
                wallet={wallet}
                mutualSessionId={session.id}
                onVerified={() => void handleIdentityVerifiedOrChanged()}
                onStatusChanged={() => void handleIdentityVerifiedOrChanged()}
              />
            )}
          </div>
        )}

      {/* Stage 2 (Screen F): Exchanged Sanitized Verification Reports Dashboard */}
      {session.session_state !== 'declined' &&
        session.session_state !== 'expired' &&
        bothIdentitiesVerified &&
        !myReportViewedAt &&
        !reportReviewed &&
        !receipt && (
          <div className="ws-card" style={{ padding: 26 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <ShieldCheck size={20} />
              <h3 style={{ margin: 0, fontSize: 18 }}>
                Verification Reports Exchanged
              </h3>
            </div>
            <p style={{ fontSize: 13.5, color: 'var(--sub)', marginBottom: 16 }}>
              Both participants independently verified. Inspect {counterpartyReport.displayName}&apos;s
              sanitized trust report below (no photos, videos, or identity documents are disclosed)
              before proceeding to canonical transaction review.
            </p>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 14,
                marginBottom: 20,
              }}
            >
              {renderReportCard(senderReport, isSender)}
              {renderReportCard(recipientReport, !isSender)}
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Button onClick={() => void handleAcknowledgeReport()} disabled={busy}>
                {busy ? 'Recording acknowledgment...' : 'Confirm Report Reviewed & Continue'}{' '}
                <ArrowRight size={16} />
              </Button>
              <button
                type="button"
                className="ws-ghost-btn"
                onClick={() => setShowDeclineBox(true)}
              >
                Decline Transaction
              </button>
            </div>
          </div>
        )}

      {/* Stage 3 (Screens G, H, I): Canonical Review & Dual-Party EIP-712 Authorization */}
      {session.session_state !== 'declined' &&
        session.session_state !== 'expired' &&
        bothIdentitiesVerified &&
        (myReportViewedAt || reportReviewed) &&
        session.session_state !== 'authorized' &&
        session.session_state !== 'executing' &&
        session.session_state !== 'completed' && (
          <div style={{ display: 'grid', gap: 16 }}>
            {/* Canonical Locked Details (Screen G) */}
            <div className="ws-card" style={{ padding: 26 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 10,
                  flexWrap: 'wrap',
                  marginBottom: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Lock size={17} />
                  <h3 style={{ margin: 0, fontSize: 17 }}>Canonical Transaction Review</h3>
                </div>
                <span className="ws-badge">
                  Expires {new Date(session.expires_at).toLocaleTimeString()}
                </span>
              </div>

              <div className="ws-notice" style={{ marginBottom: 16, backgroundColor: 'var(--bg)' }}>
                <div style={{ display: 'grid', gap: 8, fontSize: 13.5 }}>
                  <div>
                    <strong>Sender:</strong> {senderReport.displayName} (
                    <code>{session.sender_wallet_address}</code>)
                  </div>
                  <div>
                    <strong>Recipient:</strong> {recipientReport.displayName} (
                    <code>{session.recipient_wallet_address}</code>)
                  </div>
                  <div>
                    <strong>Amount &amp; Asset:</strong> {session.amount_numeric}{' '}
                    {session.token_symbol} (Atomic: <code>{session.amount_atomic}</code>)
                  </div>
                  <div>
                    <strong>Network:</strong> {session.network} (Chain ID {session.chain_id})
                  </div>
                  <div>
                    <strong>Purpose:</strong> {session.purpose}
                  </div>
                  {agreement && (
                    <div>
                      <strong>Linked Payment Agreement:</strong> {agreement.title} (v
                      {agreement.version}, {agreement.status})
                      <div
                        style={{
                          marginTop: 4,
                          padding: 10,
                          borderRadius: 8,
                          backgroundColor: 'var(--white)',
                          border: '1px solid var(--line)',
                          fontSize: 12.5,
                        }}
                      >
                        {agreement.termsText}
                      </div>
                    </div>
                  )}
                  <div>
                    <strong>Canonical Hash (EIP-712 Bound):</strong>{' '}
                    <code style={{ wordBreak: 'break-all' }}>{session.canonical_tx_hash}</code>
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                  gap: 12,
                }}
              >
                {renderReportCard(senderReport, isSender)}
                {renderReportCard(recipientReport, !isSender)}
              </div>
            </div>

            {/* Dual Approval Status & Signing Card (Screens H & I) */}
            <div className="ws-card" style={{ padding: 26 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 17 }}>Dual-Party Authorization</h3>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: 12,
                  marginBottom: 18,
                }}
              >
                <div className="ws-notice" style={{ backgroundColor: 'var(--bg)' }}>
                  <div style={{ fontSize: 12, color: 'var(--sub)' }}>Sender Signature</div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginTop: 4 }}>
                    {approvals.sender ? (
                      <>
                        <CheckCircle2 size={15} style={{ verticalAlign: 'middle', marginRight: 5 }} />
                        Signed ({new Date(approvals.sender.approved_at || '').toLocaleTimeString()})
                      </>
                    ) : (
                      'Pending sender EIP-712 signature'
                    )}
                  </div>
                </div>

                <div className="ws-notice" style={{ backgroundColor: 'var(--bg)' }}>
                  <div style={{ fontSize: 12, color: 'var(--sub)' }}>Recipient Signature</div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginTop: 4 }}>
                    {approvals.recipient ? (
                      <>
                        <CheckCircle2 size={15} style={{ verticalAlign: 'middle', marginRight: 5 }} />
                        Signed (
                        {new Date(approvals.recipient.approved_at || '').toLocaleTimeString()})
                      </>
                    ) : (
                      'Pending recipient EIP-712 signature'
                    )}
                  </div>
                </div>
              </div>

              {myApproval ? (
                <div className="ws-notice" style={{ backgroundColor: 'rgba(17,17,17,0.04)' }}>
                  <CheckCircle2 size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                  <strong>Your EIP-712 signature is recorded.</strong>{' '}
                  {counterpartyApproval
                    ? 'Both approvals verified.'
                    : `Waiting for ${counterpartyReport.displayName} to sign the exact same canonical transaction.`}
                </div>
              ) : (
                <div>
                  <div
                    className="ws-notice"
                    style={{
                      marginBottom: 14,
                      backgroundColor: 'var(--white)',
                      borderColor: 'var(--ink)',
                    }}
                  >
                    <div style={{ fontSize: 12, color: 'var(--sub)', marginBottom: 4 }}>
                      Required Confirmation Statement ({myRole}):
                    </div>
                    <strong style={{ fontSize: 14 }}>&ldquo;{exactStatement}&rdquo;</strong>
                  </div>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      fontSize: 13.5,
                      marginBottom: 14,
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={statementChecked}
                      onChange={(e) => setStatementChecked(e.target.checked)}
                      style={{ marginTop: 3 }}
                    />
                    <span>{exactStatement}</span>
                  </label>

                  {wallet.method !== 'connected' && (
                    <div style={{ marginBottom: 14 }}>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 5 }}>
                        Enter your WDK 12/24-word recovery phrase to sign EIP-712 approval
                      </label>
                      <input
                        type={showPhrase ? 'text' : 'password'}
                        value={signingPhrase}
                        onChange={(e) => setSigningPhrase(e.target.value)}
                        placeholder="word1 word2 ... (clears immediately after signing)"
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: 10,
                          border: '1px solid var(--line)',
                          fontSize: 13.5,
                        }}
                      />
                      <button
                        type="button"
                        className="ws-ghost-btn"
                        style={{ marginTop: 6 }}
                        onClick={() => setShowPhrase((s) => !s)}
                      >
                        {showPhrase ? 'Hide phrase' : 'Reveal phrase'}
                      </button>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <Button
                      onClick={() => void handleSignApproval()}
                      disabled={busy || !statementChecked}
                    >
                      <ShieldCheck size={16} />{' '}
                      {busy ? 'Signing EIP-712 Approval...' : 'Sign & Approve Transaction'}
                    </Button>
                    <button
                      type="button"
                      className="ws-ghost-btn"
                      onClick={() => setShowDeclineBox(true)}
                      disabled={busy}
                    >
                      Decline Transaction
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      {/* Decline Modal / Box */}
      {showDeclineBox && (
        <div className="ws-card" style={{ padding: 22, borderColor: '#b42318' }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Decline Mutual Trust Transaction</div>
          <input
            type="text"
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value)}
            placeholder="Reason for declining (optional, visible to counterparty)"
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid var(--line)',
              marginBottom: 12,
            }}
          />
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              className="ws-ghost-btn"
              style={{ borderColor: '#b42318', color: '#b42318' }}
              onClick={() => void handleDecline()}
              disabled={busy}
            >
              Confirm Decline
            </button>
            <button
              type="button"
              className="ws-ghost-btn"
              onClick={() => setShowDeclineBox(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Stage 4 (Screens J & K): Authorized Execution Ready / Mutual Trust Receipt */}
      {(session.session_state === 'authorized' ||
        session.session_state === 'executing' ||
        session.session_state === 'completed') && (
        <div style={{ display: 'grid', gap: 16 }}>
          {receipt ? (
            <MutualTrustReceiptView
              receipt={receipt}
              agreementTitle={agreement?.title ?? null}
            />
          ) : (
            <div className="ws-card" style={{ padding: 28 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <ShieldCheck size={22} />
                <h3 style={{ margin: 0, fontSize: 19 }}>
                  {session.session_state === 'authorized'
                    ? 'Both Parties Authorized — Ready for Execution'
                    : 'Settlement Execution in Progress'}
                </h3>
              </div>
              <p style={{ fontSize: 13.5, color: 'var(--sub)', marginBottom: 18 }}>
                {isSender
                  ? 'Both identity checks passed and both EIP-712 transaction approvals match the identical canonical hash. You can now unlock and broadcast the payment settlement.'
                  : `Both signatures are locked in for ${session.amount_numeric} ${session.token_symbol}. Your Mutual Trust Receipt will appear automatically once the sender broadcasts and verifies the on-chain transfer.`}
              </p>

              {isSender && session.session_state === 'authorized' && onReadyToExecute && (
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <Button onClick={() => onReadyToExecute(hydrated)}>
                    Unlock &amp; Execute Settlement <ArrowRight size={16} />
                  </Button>
                  <button
                    type="button"
                    className="ws-ghost-btn"
                    onClick={() => setShowDeclineBox(true)}
                  >
                    Abort Before Execution
                  </button>
                </div>
              )}

              {!isSender && (
                <div className="ws-notice">
                  <AlertTriangle size={15} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                  Note: Because this build executes direct wallet transfers rather than a deployed escrow
                  contract, Word&apos;s backend gate ensures the sender cannot obtain payment preparation or
                  receipt verification without both EIP-712 signatures.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
