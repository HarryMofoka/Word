import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  History,
  MessageSquare,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { Button } from '../../../components/ui/Button';

type AdvancedSubView =
  | 'chat'
  | 'history'
  | 'summary'
  | 'scam-intel'
  | 'alerts'
  | 'risk-details';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
}

interface ConversationThread {
  id: string;
  title: string;
  date: string;
  preview: string;
  messages: ChatMessage[];
}

const INITIAL_THREADS: ConversationThread[] = [
  {
    id: 'th-1',
    title: '20 USDT to Thabo · Laptop purchase',
    date: 'Today, 09:40',
    preview: 'Verified recipient wallet control and reviewed Testnet fee.',
    messages: [
      {
        id: 'm-1',
        sender: 'user',
        text: 'I want to send 20 USDT to Thabo for a laptop.',
      },
      {
        id: 'm-2',
        sender: 'assistant',
        text: "I can help prepare that payment. Before you approve, let's verify the recipient wallet, payment destination, network and transaction fee. I'll explain anything that needs your attention before you sign.",
      },
    ],
  },
  {
    id: 'th-2',
    title: 'Design retainer · Lerato K.',
    date: 'Yesterday',
    preview: 'Summarised 45.00 USDT agreement terms and confirmation status.',
    messages: [
      {
        id: 'm-3',
        sender: 'user',
        text: 'Can you summarise my payment to Lerato K.?',
      },
      {
        id: 'm-4',
        sender: 'assistant',
        text: 'You sent 45.00 USDT to Lerato K. (0x9a12...3c40) on Testnet for Design retainer. The agreement was accepted and the transaction is marked Confirmed.',
      },
    ],
  },
];

const INITIAL_ALERTS = [
  {
    id: 'al-1',
    severity: 'Caution',
    title: 'Unverified address in recent paste',
    detail:
      'An address without a cryptographic wallet-control signature was flagged during a quick check.',
    time: 'Today',
    acknowledged: false,
  },
  {
    id: 'al-2',
    severity: 'Info',
    title: 'Testnet demonstration mode active',
    detail:
      'All balances, signatures, and AI explanations in this UI preview operate in a demonstration environment.',
    time: 'Today',
    acknowledged: true,
  },
];

const RISK_FACTORS = [
  {
    factor: 'Recipient wallet control',
    status: 'Passed',
    explanation: 'Cryptographic signature matches 0x4b8f...91e2.',
  },
  {
    factor: 'Destination consistency',
    status: 'Passed',
    explanation: 'Address matches the payment request without substitution.',
  },
  {
    factor: 'Network & token match',
    status: 'Passed',
    explanation: '20.00 USDT on Testnet matches your selected network.',
  },
  {
    factor: 'Agreement clarity',
    status: 'Passed',
    explanation: 'Purpose ("Laptop purchase") and terms are recorded.',
  },
];

export const AssistantRiskHub: React.FC = () => {
  const [subView, setSubView] = useState<AdvancedSubView>('chat');
  const [threads, setThreads] = useState<ConversationThread[]>(INITIAL_THREADS);
  const [activeThreadId, setActiveThreadId] = useState<string>(INITIAL_THREADS[0].id);
  const [input, setInput] = useState('');
  const [alerts, setAlerts] = useState(INITIAL_ALERTS);

  const activeThread = threads.find((t) => t.id === activeThreadId) || threads[0];

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text: trimmed,
    };
    const replyMsg: ChatMessage = {
      id: `a-${Date.now() + 1}`,
      sender: 'assistant',
      text: 'UI preview response: I have reviewed your question. Remember that Word’s assistant only explains details in plain language—it never accesses private keys, signs transactions, or overrides security checks.',
    };

    setThreads((prev) =>
      prev.map((th) =>
        th.id === activeThread.id
          ? { ...th, messages: [...th.messages, userMsg, replyMsg] }
          : th
      )
    );
    setInput('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Sub-navigation across all 6 advanced screens */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {[
          { id: 'chat' as const, label: 'AI Assistant', Icon: MessageSquare },
          { id: 'history' as const, label: 'Conversation History', Icon: History },
          { id: 'summary' as const, label: 'Payment Summary', Icon: Sparkles },
          { id: 'scam-intel' as const, label: 'Scam Intelligence', Icon: ShieldAlert },
          { id: 'alerts' as const, label: 'Security Alerts', Icon: AlertTriangle },
          { id: 'risk-details' as const, label: 'Risk Details', Icon: CheckCircle2 },
        ].map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={`ws-nav-tab ${subView === id ? 'is-active' : ''}`}
            style={{ border: '1px solid var(--line)' }}
            onClick={() => setSubView(id)}
          >
            <Icon size={14} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* 1. AI PAYMENT ASSISTANT */}
      {subView === 'chat' && (
        <div className="ws-card" style={{ maxWidth: '760px' }}>
          <div className="chat-header">
            <div className="chat-identity">
              <span className="chat-dot-ring" aria-hidden="true">
                <span className="chat-dot-inner" />
              </span>
              <span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--ink)' }}>
                Word Assistant
              </span>
            </div>
            <span className="ws-badge">Advisory UI</span>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              marginBottom: '20px',
            }}
          >
            {activeThread.messages.map((m) => (
              <div
                key={m.id}
                className={
                  m.sender === 'user' ? 'chat-bubble-user' : 'chat-bubble-assistant'
                }
              >
                {m.text}
              </div>
            ))}
          </div>

          <form
            onSubmit={handleSendMessage}
            style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}
          >
            <input
              type="text"
              className="field-input"
              style={{ flex: 1, minWidth: '220px' }}
              placeholder="Ask about recipient verification, fees, or transaction status..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <Button type="submit" compact>
              Ask <ArrowRight size={14} />
            </Button>
          </form>

          <p className="chat-note">
            The AI assistant does not access private keys, sign transactions, or override security
            checks.
          </p>
        </div>
      )}

      {/* 2. ASSISTANT CONVERSATION HISTORY */}
      {subView === 'history' && (
        <div className="ws-card" style={{ maxWidth: '760px' }}>
          <p className="eyebrow" style={{ marginBottom: '8px' }}>
            ASSISTANT CONVERSATION HISTORY
          </p>
          <h1 className="heading-md" style={{ marginBottom: '18px' }}>
            Previous conversations
          </h1>

          <div>
            {threads.map((th) => (
              <button
                key={th.id}
                type="button"
                className="ws-record-item"
                style={{
                  width: '100%',
                  background: 'transparent',
                  borderLeft: 'none',
                  borderRight: 'none',
                  borderTop: 'none',
                  textAlign: 'left',
                }}
                onClick={() => {
                  setActiveThreadId(th.id);
                  setSubView('chat');
                }}
              >
                <div>
                  <p style={{ fontSize: '15px', fontWeight: 500, color: 'var(--ink)' }}>
                    {th.title}
                  </p>
                  <p className="body-sm">{th.preview}</p>
                </div>
                <span className="body-sm" style={{ fontSize: '12px', color: 'var(--mute)' }}>
                  {th.date}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 3. AI-GENERATED PAYMENT SUMMARY */}
      {subView === 'summary' && (
        <div className="ws-card" style={{ maxWidth: '760px' }}>
          <p className="eyebrow" style={{ marginBottom: '8px' }}>
            AI-GENERATED PAYMENT SUMMARY
          </p>
          <h1 className="heading-lg" style={{ marginBottom: '12px' }}>
            Plain-language summary
          </h1>
          <p className="body-md" style={{ marginBottom: '22px' }}>
            You are preparing to send <strong>20.00 USDT</strong> on <strong>Testnet</strong> to{' '}
            <strong>Thabo M.</strong> (<code>0x4b8f...91e2</code>) for a{' '}
            <strong>Laptop purchase</strong>.
          </p>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              marginBottom: '20px',
            }}
          >
            <div className="ws-notice">
              <strong>What is verified:</strong> Cryptographic signature check matches the
              destination wallet in the request.
            </div>
            <div className="ws-notice">
              <strong>What is recorded:</strong> Purpose and handover terms are attached to your
              shared payment record.
            </div>
            <div className="ws-notice">
              <strong>What to remember:</strong> Confirming this transaction on-chain is
              irreversible. Wallet control is not proof of real-world identity.
            </div>
          </div>
        </div>
      )}

      {/* 4. SCAM INTELLIGENCE EXPLANATION */}
      {subView === 'scam-intel' && (
        <div className="ws-card" style={{ maxWidth: '760px' }}>
          <p className="eyebrow" style={{ marginBottom: '8px' }}>
            SCAM INTELLIGENCE EXPLANATION
          </p>
          <h1 className="heading-lg" style={{ marginBottom: '12px' }}>
            How Word explains payment risks.
          </h1>
          <p className="body-md" style={{ marginBottom: '22px' }}>
            Word highlights suspicious indicators before you sign, using plain language instead of
            obscure technical warnings. No system can prevent every scam—always verify details
            directly.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="ws-notice">
              <strong>Address substitution:</strong> Alerts you if a pasted address differs from
              the cryptographically signed request.
            </div>
            <div className="ws-notice">
              <strong>Unverified destination:</strong> Flags requests where the recipient has not
              proved control over the destination wallet.
            </div>
            <div className="ws-notice">
              <strong>Network or token mismatch:</strong> Warns if the requested token or network
              differs from your active selection.
            </div>
          </div>
        </div>
      )}

      {/* 5. SECURITY ALERTS */}
      {subView === 'alerts' && (
        <div className="ws-card" style={{ maxWidth: '760px' }}>
          <p className="eyebrow" style={{ marginBottom: '8px' }}>
            SECURITY ALERTS
          </p>
          <h1 className="heading-md" style={{ marginBottom: '18px' }}>
            Recent alerts
          </h1>

          {alerts.map((al) => (
            <div key={al.id} className="ws-notif-row">
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '14.5px', fontWeight: 500, color: 'var(--ink)' }}>
                    {al.title}
                  </span>
                  <span className="ws-badge">{al.severity}</span>
                </div>
                <p className="body-sm">{al.detail}</p>
              </div>
              <button
                type="button"
                className="ws-ghost-btn"
                onClick={() =>
                  setAlerts((prev) =>
                    prev.map((item) =>
                      item.id === al.id
                        ? { ...item, acknowledged: !item.acknowledged }
                        : item
                    )
                  )
                }
              >
                {al.acknowledged ? 'Acknowledged' : 'Acknowledge'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 6. RISK ASSESSMENT DETAILS */}
      {subView === 'risk-details' && (
        <div className="ws-card" style={{ maxWidth: '760px' }}>
          <p className="eyebrow" style={{ marginBottom: '8px' }}>
            RISK ASSESSMENT DETAILS
          </p>
          <h1 className="heading-lg" style={{ marginBottom: '12px' }}>
            Pre-approval check breakdown
          </h1>
          <p className="body-md" style={{ marginBottom: '20px' }}>
            Detailed breakdown for 20.00 USDT to Thabo M. (UI preview).
          </p>

          <div>
            {RISK_FACTORS.map((rf) => (
              <div key={rf.factor} className="ws-record-item">
                <div>
                  <p style={{ fontSize: '14.5px', fontWeight: 500, color: 'var(--ink)' }}>
                    {rf.factor}
                  </p>
                  <p className="body-sm">{rf.explanation}</p>
                </div>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontSize: '12.5px',
                    fontWeight: 500,
                    color: '#1a8f4d',
                  }}
                >
                  <CheckCircle2 size={13} />
                  {rf.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

