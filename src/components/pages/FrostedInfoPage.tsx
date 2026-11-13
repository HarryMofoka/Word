import React, { useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { AppRoute } from '../../types';
import { Container } from '../layout/Container';
import { HeroCanvas } from '../hero/HeroCanvas';
import { DotMatrixHands } from '../hero/DotMatrixHands';
import { Button } from '../ui/Button';
import './Pages.css';

interface FrostedInfoPageProps {
  route: Exclude<AppRoute, 'home' | 'signin' | 'signup'>;
  onNavigate: (route: AppRoute) => void;
}

interface PageContent {
  eyebrow: string;
  title: string;
  subtitle: string;
  photos?: { src: string; alt: string; caption: string }[];
  blocks: { heading: string; body: string }[];
}

const PAGE_DATA: Record<Exclude<AppRoute, 'home' | 'signin' | 'signup'>, PageContent> = {
  about: {
    eyebrow: 'ABOUT WORD',
    title: 'Trust-first peer-to-peer payments.',
    subtitle:
      'Word was created around a simple idea: sending money should not mean trusting blindly. We add verification, payment clarity, risk intelligence, and shared accountability around everyday digital payments.',
    photos: [
      {
        src: 'https://images.pexels.com/photos/3184418/pexels-photo-3184418.jpeg?auto=compress&cs=tinysrgb&w=1200',
        alt: 'Hands joined together over a wooden table with a notebook and laptop',
        caption: 'Designed around human connection, clear agreements, and shared records.',
      },
      {
        src: 'https://images.pexels.com/photos/4050315/pexels-photo-4050315.jpeg?auto=compress&cs=tinysrgb&w=1200',
        alt: 'Person working calmly on a laptop at a white minimalist table',
        caption: 'Plain-language payment review before you approve any transaction.',
      },
    ],
    blocks: [
      {
        heading: 'Why Word exists',
        body: 'Traditional wallet interfaces show an address string and a send button. Word adds context: who controls the recipient wallet, what the payment is for, what risks appear, and what both parties agreed.',
      },
      {
        heading: 'Built in the W3Node BuilderBase Hackathon',
        body: 'Word is being developed within the W3Node BuilderBase Hackathon ecosystem to explore practical ways of making peer-to-peer digital payments more transparent and accountable.',
      },
      {
        heading: 'Self-custody by design',
        body: 'Word does not hold user funds or override wallet security. Private keys stay under user control, and every payment requires explicit authorisation.',
      },
      {
        heading: 'Honest boundaries',
        body: 'Wallet-control verification confirms signature control over an address—not real-world identity. Word helps users make informed decisions, without claiming to prevent every scam or reverse on-chain transfers.',
      },
    ],
  },
  docs: {
    eyebrow: 'DOCUMENTATION',
    title: 'How verification, clarity, and records work.',
    subtitle:
      'An overview of Word’s core payment workflow—from structured payment requests and cryptographic address checks to verifiable transaction records.',
    photos: [
      {
        src: 'https://images.pexels.com/photos/6694543/pexels-photo-6694543.jpeg?auto=compress&cs=tinysrgb&w=1200',
        alt: 'Laptop, smartphone, and structured financial records on a desk',
        caption: 'Structured payment requests keep amount, network, and purpose together.',
      },
      {
        src: 'https://images.pexels.com/photos/3183150/pexels-photo-3183150.jpeg?auto=compress&cs=tinysrgb&w=1200',
        alt: 'People collaborating around a wooden table with laptops and notebooks',
        caption: 'Shared records help both parties track what was agreed and confirmed.',
      },
    ],
    blocks: [
      {
        heading: '1. Structured payment requests',
        body: 'Each request carries the recipient address, amount, token, network, and stated purpose so both sender and recipient review the exact same terms.',
      },
      {
        heading: '2. Cryptographic wallet-control checks',
        body: 'Recipient verification uses cryptographic signatures to verify control of a destination wallet and flag mismatches before you sign.',
      },
      {
        heading: '3. Pending, confirmed, and failed states',
        body: 'A transaction hash alone is not treated as final settlement. Word distinguishes pending submissions from confirmed or failed blockchain states.',
      },
      {
        heading: '4. Dispute records and evidence',
        body: 'If a disagreement arises, Word organises the original agreement, transaction details, and supporting evidence. Dispute reporting does not reverse on-chain transfers.',
      },
    ],
  },
  contact: {
    eyebrow: 'CONTACT',
    title: 'Get in touch with the Word team.',
    subtitle:
      'Have questions about Word’s trust-first payment model, hackathon demonstration, or documentation? Send a note below.',
    photos: [
      {
        src: 'https://images.pexels.com/photos/4968630/pexels-photo-4968630.jpeg?auto=compress&cs=tinysrgb&w=1200',
        alt: 'Small business counter with payment terminal and written notes',
        caption: 'Built for buyers, sellers, freelancers, small businesses, and communities.',
      },
      {
        src: 'https://images.pexels.com/photos/4050315/pexels-photo-4050315.jpeg?auto=compress&cs=tinysrgb&w=1200',
        alt: 'Minimal desk with laptop and notebook',
        caption: 'We welcome feedback on clarity, usability, and payment safety.',
      },
    ],
    blocks: [
      {
        heading: 'Hackathon demonstration',
        body: 'Word is currently presented as a testnet payment technology demonstration within the W3Node BuilderBase Hackathon ecosystem.',
      },
      {
        heading: 'Feedback & inquiries',
        body: 'Use the inquiry form on this page to draft a message. Because this is a static frontend preview, submissions are handled locally without a backend mail server.',
      },
    ],
  },
  privacy: {
    eyebrow: 'PRIVACY POLICY',
    title: 'How Word approaches privacy.',
    subtitle:
      'Word is designed around self-custody and minimal data exposure. Private keys never leave your control.',
    blocks: [
      {
        heading: 'Keys and signing',
        body: 'Word does not collect, store, or access private keys or seed phrases. Transaction signing remains under your explicit control.',
      },
      {
        heading: 'AI assistant boundaries',
        body: 'The AI payment assistant explains payment details and risk indicators in plain language. It does not access private keys, sign transactions, or override security checks.',
      },
      {
        heading: 'Public blockchain data',
        body: 'Confirmed blockchain transactions are recorded on public ledgers. Keep sensitive personal details out of public on-chain metadata.',
      },
      {
        heading: 'Demonstration environment',
        body: 'This static website preview does not transmit form inputs or personal data to external servers.',
      },
    ],
  },
  terms: {
    eyebrow: 'TERMS OF SERVICE',
    title: 'Demonstration terms and boundaries.',
    subtitle:
      'Please review these important boundaries before interacting with the Word demonstration.',
    blocks: [
      {
        heading: 'No custody or financial guarantees',
        body: 'Word does not hold funds, reverse confirmed blockchain transactions, guarantee delivery of goods, or recover lost funds.',
      },
      {
        heading: 'Verification scope',
        body: 'Cryptographic wallet-control verification checks address control—it does not constitute proof of a recipient’s real-world identity.',
      },
      {
        heading: 'User responsibility',
        body: 'Always verify the recipient address, amount, token, network, and transaction fee before approving any blockchain payment.',
      },
      {
        heading: 'Testnet demonstration',
        body: 'Word is presented as a payment technology demonstration operating in a testnet environment.',
      },
    ],
  },
};

export const FrostedInfoPage: React.FC<FrostedInfoPageProps> = ({ route, onNavigate }) => {
  const content = PAGE_DATA[route];
  const [contactSent, setContactSent] = useState(false);

  return (
    <div className="frosted-page">
      {/* Live running background */}
      <div className="frosted-page-bg" aria-hidden="true">
        <HeroCanvas />
        <DotMatrixHands />
      </div>

      <Container>
        <div className="frosted-surface">
          <div style={{ marginBottom: '28px' }}>
            <button
              type="button"
              className="auth-back-link"
              onClick={() => onNavigate('home')}
            >
              <ArrowLeft size={15} />
              Back to home
            </button>
          </div>

          <header className="frosted-header">
            <p className="eyebrow" style={{ marginBottom: '12px' }}>
              {content.eyebrow}
            </p>
            <h1 className="heading-lg" style={{ marginBottom: '16px' }}>
              {content.title}
            </h1>
            <p className="body-lg">{content.subtitle}</p>
          </header>

          {content.photos && (
            <div className="frosted-media-grid">
              {content.photos.map((photo) => (
                <figure key={photo.src} className="frosted-photo-card">
                  <img src={photo.src} alt={photo.alt} loading="lazy" />
                  <figcaption className="frosted-photo-caption">{photo.caption}</figcaption>
                </figure>
              ))}
            </div>
          )}

          <div className="frosted-blocks">
            {content.blocks.map((block) => (
              <div key={block.heading} className="frosted-block">
                <h2 className="heading-sm">{block.heading}</h2>
                <p className="body-md">{block.body}</p>
              </div>
            ))}
          </div>

          {route === 'contact' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setContactSent(true);
              }}
              style={{
                marginTop: '36px',
                paddingTop: '32px',
                borderTop: '1px solid var(--line)',
                maxWidth: '520px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              }}
            >
              <h2 className="heading-sm">Send a message</h2>
              <div className="field-group">
                <label className="field-label" htmlFor="contact-email">
                  Email address
                </label>
                <input
                  id="contact-email"
                  type="email"
                  className="field-input"
                  placeholder="you@example.com"
                  required
                />
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="contact-message">
                  Message
                </label>
                <textarea
                  id="contact-message"
                  className="field-textarea"
                  placeholder="Tell us about your question or feedback..."
                  required
                />
              </div>
              <div>
                <Button type="submit">
                  Send message <ArrowRight size={14} />
                </Button>
              </div>
              {contactSent && (
                <div className="auth-status-banner" role="status">
                  <strong>Preview note:</strong> This static frontend does not connect to a mail
                  server, so your message was not sent externally.
                </div>
              )}
            </form>
          )}
        </div>
      </Container>
    </div>
  );
};

