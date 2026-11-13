import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  QrCode,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import type { PaymentRecord, PaymentRequestData } from '../../types';

type PayStep =
  | 'scan'
  | 'received'
  | 'verify'
  | 'risk'
  | 'review'
  | 'approve'
  | 'processing'
  | 'success'
  | 'pending'
  | 'failure';

interface PaymentPayFlowProps {
  initialRequest?: PaymentRequestData | null;
  onBack: () => void;
  onRecordAdded: (rec: PaymentRecord) => void;
  onDoneToDashboard: () => void;
}

const SAMPLE_REQUEST: PaymentRequestData = {
  id: 'req-thabo-20',
  amount: '20.00',
  token: 'USDT',
  network: 'Testnet (Sepolia)',
  recipientName: 'Thabo M.',
  recipientAddress: '0x4b8f92c10a7d44e19c3f8b2a91e2',
  description: 'Laptop purchase',
  terms: 'Handover confirmed upon on-chain Testnet settlement.',
  shareUrl: 'https://word.app/pay/req-thabo-20',
};

export const PaymentPayFlow: React.FC<PaymentPayFlowProps> = ({
  initialRequest,
  onBack,
  onRecordAdded,
  onDoneToDashboard,
}) => {
  const [step, setStep] = useState<PayStep>(initialRequest ? 'received' : 'scan');
  const [request, setRequest] = useState<PaymentRequestData>(initialRequest || SAMPLE_REQUEST);
  const [scanInput, setScanInput] = useState('');
  const [verificationState, setVerificationState] = useState<
    'verified' | 'mismatch' | 'unverified'
  >('verified');
  const [approvedChecked, setApprovedChecked] = useState(false);

  // Auto-advance processing screen after 1.6s unless user chooses outcome manually
  useEffect(() => {
    if (step !== 'processing') return;
    const timer = setTimeout(() => {
      onRecordAdded({
        id: `rec-${Date.now()}`,
        recipient: request.recipientName,
        address: `${request.recipientAddress.slice(0, 6)}...${request.recipientAddress.slice(-4)}`,
        amount: `${request.amount} ${request.token}`,
        purpose: request.description,
        network: request.network,
        status: 'Confirmed',
        verifiedControl: verificationState === 'verified',
        timestamp: 'Just now',
      });
      setStep('success');
    }, 1800);
    return () => clearTimeout(timer);
  }, [step, request, verificationState, onRecordAdded]);

  const finishWithStatus = (outcome: 'success' | 'pending' | 'failure') => {
    if (outcome === 'success' || outcome === 'pending') {
      onRecordAdded({
        id: `rec-${Date.now()}`,
        recipient: request.recipientName,
        address: `${request.recipientAddress.slice(0, 6)}...${request.recipientAddress.slice(-4)}`,
        amount: `${request.amount} ${request.token}`,
        purpose: request.description,
        network: request.network,
        status: outcome === 'success' ? 'Confirmed' : 'Pending',
        verifiedControl: verificationState === 'verified',
        timestamp: 'Just now',
      });
    }
    setStep(outcome);
  };

  // 1. SCAN QR CODE
  if (step === 'scan') {
    return (
      <div className="ws-card" style={{ maxWidth: '640px' }}>
        <div style={{ marginBottom: '18px' }}>
          <button type="button" className="auth-back-link" onClick={onBack}>
            <ArrowLeft size={15} /> Back to Payments
          </button>
        </div>

        <p className="eyebrow" style={{ marginBottom: '8px' }}>
          SCAN QR CODE
        </p>
        <h1 className="heading-lg" style={{ marginBottom: '10px' }}>
          Scan or paste a payment request.
        </h1>
        <p className="body-md" style={{ marginBottom: '22px' }}>
          Point your camera at a Word payment QR code, or load a sample request below to preview the
          full verification and approval flow.
        </p>

        <div
          style={{
            height: '210px',
            borderRadius: '14px',
            border: '1px dashed #b8b8b2',
            backgroundColor: 'var(--bg)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            marginBottom: '20px',
            color: 'var(--sub)',
          }}
        >
          <QrCode size={42} strokeWidth={1.4} />
          <span className="body-sm">Camera scanner frame (UI preview)</span>
          <Button
            compact
            onClick={() => {
              setRequest(SAMPLE_REQUEST);
              setStep('received');
            }}
          >
            Simulate QR scan (Thabo · 20 USDT)
          </Button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setRequest({
              ...SAMPLE_REQUEST,
              shareUrl: scanInput.trim() || SAMPLE_REQUEST.shareUrl,
            });
            setStep('received');
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
        >
          <div className="field-group">
            <label className="field-label" htmlFor="scan-link">
              Or paste payment request link
            </label>
            <input
              id="scan-link"
              type="text"
              className="field-input"
              placeholder="https://word.app/pay/req-thabo-20"
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
            />
          </div>
          <div>
            <Button type="submit" compact>
              Open request <ArrowRight size={14} />
            </Button>
          </div>
        </form>
      </div>
    );
  }

  // 2. REVIEW RECEIVED PAYMENT REQUEST
  if (step === 'received') {
    return (
      <div className="ws-card" style={{ maxWidth: '640px' }}>
        <p className="eyebrow" style={{ marginBottom: '8px' }}>
          RECEIVED PAYMENT REQUEST
        </p>
        <h1 className="heading-lg" style={{ marginBottom: '10px' }}>
          {request.amount} {request.token}
        </h1>
        <p className="body-md" style={{ marginBottom: '22px' }}>
          Review the requested payment details before running recipient and risk checks.
        </p>

        <div
          style={{
            border: '1px solid var(--line)',
            borderRadius: '14px',
            padding: '18px 20px',
            marginBottom: '22px',
          }}
        >
          <div className="record-row">
            <span className="record-key">From / Recipient</span>
            <span className="record-val">{request.recipientName}</span>
          </div>
          <div className="record-row">
            <span className="record-key">Destination wallet</span>
            <span className="record-val">{request.recipientAddress}</span>
          </div>
          <div className="record-row">
            <span className="record-key">Network</span>
            <span className="record-val">{request.network}</span>
          </div>
          <div className="record-row">
            <span className="record-key">Description</span>
            <span className="record-val">{request.description}</span>
          </div>
          {request.terms && (
            <div className="record-row">
              <span className="record-key">Payment terms</span>
              <span className="record-val" style={{ maxWidth: '60%', textAlign: 'right' }}>
                {request.terms}
              </span>
            </div>
          )}
        </div>

        <div className="ws-actions-row">
          <button type="button" className="auth-back-link" onClick={() => setStep('scan')}>
            <ArrowLeft size={15} /> Back
          </button>
          <Button onClick={() => setStep('verify')}>
            Verify recipient <ArrowRight size={14} />
          </Button>
        </div>
      </div>
    );
  }

  // 3. RECIPIENT VERIFICATION SCREEN
  if (step === 'verify') {
    return (
      <div className="ws-card" style={{ maxWidth: '640px' }}>
        <p className="eyebrow" style={{ marginBottom: '8px' }}>
          RECIPIENT VERIFICATION
        </p>
        <h1 className="heading-lg" style={{ marginBottom: '10px' }}>
          Check wallet control.
        </h1>
        <p className="body-md" style={{ marginBottom: '18px' }}>
          Word checks whether the recipient has cryptographically signed control of the destination
          address.
        </p>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '18px' }}>
          {(['verified', 'mismatch', 'unverified'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`ws-nav-tab ${verificationState === mode ? 'is-active' : ''}`}
              style={{ border: '1px solid var(--line)', textTransform: 'capitalize' }}
              onClick={() => setVerificationState(mode)}
            >
              {mode}
            </button>
          ))}
        </div>

        <div
          style={{
            padding: '18px 20px',
            borderRadius: '14px',
            border: '1px solid var(--line)',
            backgroundColor: 'var(--bg)',
            marginBottom: '18px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <ShieldCheck
              size={18}
              style={{
                color:
                  verificationState === 'verified'
                    ? '#1a8f4d'
                    : verificationState === 'mismatch'
                      ? '#b42318'
                      : '#b54708',
              }}
            />
            <strong style={{ fontSize: '15px' }}>
              {verificationState === 'verified'
                ? 'Wallet control verified'
                : verificationState === 'mismatch'
                  ? 'Destination address mismatch detected'
                  : 'Wallet control unverified'}
            </strong>
          </div>
          <p className="body-sm">
            {verificationState === 'verified'
              ? `Signature matches ${request.recipientAddress}.`
              : verificationState === 'mismatch'
                ? 'The address in this request does not match the previously signed wallet.'
                : 'No cryptographic signature was provided for this address.'}
          </p>
        </div>

        <div className="ws-notice">
          <strong>Important:</strong> Wallet-control verification confirms control of a wallet
          address—it is not proof of real-world identity.
        </div>

        <div className="ws-actions-row">
          <button type="button" className="auth-back-link" onClick={() => setStep('received')}>
            <ArrowLeft size={15} /> Back
          </button>
          <Button onClick={() => setStep('risk')}>
            Continue to risk check <ArrowRight size={14} />
          </Button>
        </div>
      </div>
    );
  }

  // 4. PAYMENT RISK ASSESSMENT SCREEN
  if (step === 'risk') {
    const isHighRisk = verificationState === 'mismatch';
    const isMediumRisk = verificationState === 'unverified';

    return (
      <div className="ws-card" style={{ maxWidth: '640px' }}>
        <p className="eyebrow" style={{ marginBottom: '8px' }}>
          PAYMENT RISK ASSESSMENT
        </p>
        <h1 className="heading-lg" style={{ marginBottom: '10px' }}>
          {isHighRisk
            ? 'Elevated risk detected.'
            : isMediumRisk
              ? 'Proceed with caution.'
              : 'Low risk indicators.'}
        </h1>
        <p className="body-md" style={{ marginBottom: '20px' }}>
          Explainable pre-approval indicators based on the current request details.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
          <div className="ws-notice">
            <strong>Destination check:</strong>{' '}
            {isHighRisk
              ? 'Address mismatch warning — verify directly with the recipient.'
              : isMediumRisk
                ? 'Unverified address — confirm out-of-band before sending.'
                : 'Recipient wallet control signature matches the request.'}
          </div>
          <div className="ws-notice">
            <strong>Amount &amp; network clarity:</strong> {request.amount} {request.token} on{' '}
            {request.network} is clearly specified.
          </div>
          <div className="ws-notice">
            <strong>Purpose recorded:</strong> &ldquo;{request.description}&rdquo;
          </div>
        </div>

        <div className="ws-actions-row">
          <button type="button" className="auth-back-link" onClick={() => setStep('verify')}>
            <ArrowLeft size={15} /> Back
          </button>
          <Button onClick={() => setStep('review')}>
            Review transaction <ArrowRight size={14} />
          </Button>
        </div>
      </div>
    );
  }

  // 5. TRANSACTION REVIEW SCREEN
  if (step === 'review') {
    return (
      <div className="ws-card" style={{ maxWidth: '640px' }}>
        <p className="eyebrow" style={{ marginBottom: '8px' }}>
          TRANSACTION REVIEW
        </p>
        <h1 className="heading-lg" style={{ marginBottom: '10px' }}>
          Review every detail.
        </h1>
        <p className="body-md" style={{ marginBottom: '20px' }}>
          Confirm the recipient, amount, network, and estimated fee before authorising.
        </p>

        <div
          style={{
            border: '1px solid var(--line)',
            borderRadius: '14px',
            padding: '18px 20px',
            marginBottom: '22px',
          }}
        >
          <div className="record-row">
            <span className="record-key">Recipient</span>
            <span className="record-val">{request.recipientName}</span>
          </div>
          <div className="record-row">
            <span className="record-key">Address</span>
            <span className="record-val">{request.recipientAddress}</span>
          </div>
          <div className="record-row">
            <span className="record-key">Amount</span>
            <span className="record-val">
              {request.amount} {request.token}
            </span>
          </div>
          <div className="record-row">
            <span className="record-key">Network</span>
            <span className="record-val">{request.network}</span>
          </div>
          <div className="record-row">
            <span className="record-key">Estimated fee</span>
            <span className="record-val">~0.001 Testnet ETH (UI)</span>
          </div>
          <div className="record-row">
            <span className="record-key">Purpose</span>
            <span className="record-val">{request.description}</span>
          </div>
        </div>

        <div className="ws-actions-row">
          <button type="button" className="auth-back-link" onClick={() => setStep('risk')}>
            <ArrowLeft size={15} /> Back
          </button>
          <Button onClick={() => setStep('approve')}>
            Proceed to approval <ArrowRight size={14} />
          </Button>
        </div>
      </div>
    );
  }

  // 6. TRANSACTION APPROVAL SCREEN
  if (step === 'approve') {
    return (
      <div className="ws-card" style={{ maxWidth: '640px' }}>
        <p className="eyebrow" style={{ marginBottom: '8px' }}>
          TRANSACTION APPROVAL
        </p>
        <h1 className="heading-lg" style={{ marginBottom: '10px' }}>
          Authorise {request.amount} {request.token}
        </h1>
        <p className="body-md" style={{ marginBottom: '20px' }}>
          Word never submits payments without your explicit approval. Once confirmed on-chain,
          blockchain transfers cannot be reversed.
        </p>

        <label
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            padding: '16px',
            borderRadius: '12px',
            backgroundColor: 'var(--bg)',
            border: '1px solid var(--line)',
            fontSize: '14px',
            cursor: 'pointer',
            marginBottom: '22px',
          }}
        >
          <input
            type="checkbox"
            checked={approvedChecked}
            onChange={(e) => setApprovedChecked(e.target.checked)}
            style={{ marginTop: '3px', width: '16px', height: '16px' }}
          />
          <span>
            I have verified the recipient ({request.recipientName}), amount ({request.amount}{' '}
            {request.token}), and network ({request.network}).
          </span>
        </label>

        <div className="ws-actions-row">
          <button type="button" className="auth-back-link" onClick={() => setStep('review')}>
            <ArrowLeft size={15} /> Back to review
          </button>
          <Button
            disabled={!approvedChecked}
            style={!approvedChecked ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
            onClick={() => setStep('processing')}
          >
            Approve &amp; submit (UI) <ArrowRight size={14} />
          </Button>
        </div>
      </div>
    );
  }

  // 7. TRANSACTION PROCESSING SCREEN
  if (step === 'processing') {
    return (
      <div className="ws-card ws-view-enter" style={{ maxWidth: '640px', textAlign: 'center' }}>
        <div className="ws-processing-dot" aria-hidden="true" />
        <p className="eyebrow" style={{ marginBottom: '12px' }}>
          TRANSACTION PROCESSING
        </p>
        <h1 className="heading-lg" style={{ marginBottom: '12px' }}>
          Submitting payment...
        </h1>
        <p className="body-md" style={{ marginBottom: '24px' }}>
          Broadcasting {request.amount} {request.token} to {request.network} (UI simulation).
        </p>

        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '10px',
            flexWrap: 'wrap',
            paddingTop: '18px',
            borderTop: '1px solid var(--line)',
          }}
        >
          <button
            type="button"
            className="ws-ghost-btn"
            onClick={() => finishWithStatus('success')}
          >
            Preview Success
          </button>
          <button
            type="button"
            className="ws-ghost-btn"
            onClick={() => finishWithStatus('pending')}
          >
            Preview Pending
          </button>
          <button
            type="button"
            className="ws-ghost-btn"
            onClick={() => finishWithStatus('failure')}
          >
            Preview Failure
          </button>
        </div>
      </div>
    );
  }

  // 8. PAYMENT SUCCESS SCREEN
  if (step === 'success') {
    return (
      <div className="ws-card" style={{ maxWidth: '640px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <CheckCircle2 size={22} style={{ color: '#1a8f4d' }} />
          <span className="eyebrow" style={{ color: '#1a8f4d' }}>
            PAYMENT CONFIRMED
          </span>
        </div>
        <h1 className="heading-lg" style={{ marginBottom: '10px' }}>
          {request.amount} {request.token} confirmed.
        </h1>
        <p className="body-md" style={{ marginBottom: '22px' }}>
          Your payment record for {request.recipientName} ({request.description}) has been saved to
          your workspace history.
        </p>

        <div className="ws-notice" style={{ marginBottom: '22px' }}>
          <strong>Simulated Tx Hash:</strong> 0x9f2a...84c1 · {request.network}
        </div>

        <div className="ws-actions-row">
          <button type="button" className="ws-ghost-btn" onClick={() => setStep('pending')}>
            View Pending state
          </button>
          <Button onClick={onDoneToDashboard}>
            Return to Dashboard <ArrowRight size={14} />
          </Button>
        </div>
      </div>
    );
  }

  // 9. PENDING TRANSACTION SCREEN
  if (step === 'pending') {
    return (
      <div className="ws-card" style={{ maxWidth: '640px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <Clock size={22} style={{ color: '#b54708' }} />
          <span className="eyebrow" style={{ color: '#b54708' }}>
            TRANSACTION PENDING
          </span>
        </div>
        <h1 className="heading-lg" style={{ marginBottom: '10px' }}>
          Awaiting network confirmation.
        </h1>
        <p className="body-md" style={{ marginBottom: '22px' }}>
          Your transaction has been submitted to {request.network}, but is not yet confirmed. Word
          clearly distinguishes pending submissions from settled payments.
        </p>

        <div className="ws-actions-row">
          <button type="button" className="ws-ghost-btn" onClick={() => setStep('failure')}>
            View Failure state
          </button>
          <Button onClick={onDoneToDashboard}>
            Return to Dashboard <ArrowRight size={14} />
          </Button>
        </div>
      </div>
    );
  }

  // 10. PAYMENT FAILURE SCREEN
  return (
    <div className="ws-card" style={{ maxWidth: '640px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
        {verificationState === 'mismatch' ? (
          <AlertTriangle size={22} style={{ color: '#b42318' }} />
        ) : (
          <XCircle size={22} style={{ color: '#b42318' }} />
        )}
        <span className="eyebrow" style={{ color: '#b42318' }}>
          PAYMENT FAILED
        </span>
      </div>
      <h1 className="heading-lg" style={{ marginBottom: '10px' }}>
        Transaction could not be completed.
      </h1>
      <p className="body-md" style={{ marginBottom: '22px' }}>
        No funds were transferred. Review your network selection, gas balance, and recipient details
        before retrying.
      </p>

      <div className="ws-actions-row">
        <button type="button" className="ws-ghost-btn" onClick={onDoneToDashboard}>
          Return to Dashboard
        </button>
        <Button onClick={() => setStep('review')}>
          Review &amp; retry <ArrowRight size={14} />
        </Button>
      </div>
    </div>
  );
};

