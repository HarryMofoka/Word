import React from 'react';
import { Container } from '../layout/Container';
import { Section } from '../layout/Section';
import { SectionHeading } from '../ui/SectionHeading';
import { Accordion } from '../ui/Accordion';
import type { FAQItemData } from '../../types';

const FAQ_ITEMS: FAQItemData[] = [
  {
    id: 'what-is-word',
    question: 'What is Word?',
    answer:
      'Word is a trust-first peer-to-peer payment platform designed to add recipient verification, structured payment clarity, risk intelligence, and shared transaction records around digital payments.',
  },
  {
    id: 'hold-funds',
    question: 'Does Word hold my funds?',
    answer:
      'No. Word follows a self-custody model where private keys remain under the user’s control and transactions require explicit user approval before signing.',
  },
  {
    id: 'recipient-verification',
    question: 'How does recipient verification work?',
    answer:
      'Recipient verification uses cryptographic signatures to check control over a wallet address and help spot destination mismatches. Wallet-control verification confirms address control, not real-world identity.',
  },
  {
    id: 'prevent-scams',
    question: 'Can Word prevent all scams?',
    answer:
      'No platform can prevent every scam. Word surfaces available risk indicators, destination checks, and plain-language explanations so users can make more informed decisions before approving a payment.',
  },
  {
    id: 'wrong-address',
    question: 'What happens if I send money to the wrong address?',
    answer:
      'Blockchain transfers sent to an incorrect address cannot be undone by Word. Always verify the recipient wallet, amount, and network during the review step before approving.',
  },
  {
    id: 'reverse-transaction',
    question: 'Can I reverse a blockchain transaction?',
    answer:
      'No. Once a blockchain transaction is confirmed, it is irreversible. Word’s dispute reporting organises agreements, transaction details, and evidence, but does not reverse on-chain transfers.',
  },
  {
    id: 'pending-payment',
    question: 'What happens when a payment is pending?',
    answer:
      'Word clearly distinguishes between pending, confirmed, and failed transaction states. A pending payment is still awaiting network confirmation and is not treated as settled until confirmed.',
  },
  {
    id: 'support-usdt',
    question: 'Does Word support USDT?',
    answer:
      'Yes, Word’s payment request and record flows are demonstrated with USDT on a testnet environment.',
  },
  {
    id: 'ai-assistant',
    question: 'How does the AI assistant work?',
    answer:
      'The AI payment assistant translates transaction details, fee information, and potential risk warnings into plain language. It is strictly advisory and cannot access private keys or sign transactions.',
  },
  {
    id: 'free-to-use',
    question: 'Is Word free to use?',
    answer:
      'Word is currently presented as a hackathon technology demonstration. Standard blockchain network transaction fees apply when submitting transactions on a network.',
  },
];

export const FAQ: React.FC = () => {
  return (
    <Section id="faq">
      <Container>
        <div style={{ maxWidth: '820px' }}>
          <SectionHeading eyebrow="FAQ" title="Questions worth asking." />
          <Accordion items={FAQ_ITEMS} />
        </div>
      </Container>
    </Section>
  );
};

