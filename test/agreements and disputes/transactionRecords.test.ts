import { describe, it, expect } from 'vitest';
import {
  appendRecordEvent,
  buildRecordShareLink,
  canPartyAccessRecord,
  exportTransactionRecordAsCsv,
  exportTransactionRecordAsJson,
  generateTransactionRecord,
  type GenerateTransactionRecordInput,
} from '../../src/services/transactionRecordService';

const SENDER_ADDR = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
const RECIPIENT_ADDR = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';
const THIRD_PARTY_ADDR = '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06';
const TX_HASH = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function makeInput(
  overrides: Partial<GenerateTransactionRecordInput> = {}
): GenerateTransactionRecordInput {
  return {
    recordId: 'rec-101',
    senderUserId: 'user-sender',
    recipientUserId: 'user-recipient',
    senderAddress: SENDER_ADDR,
    recipientName: 'Thabo M.',
    recipientAddress: RECIPIENT_ADDR,
    amount: '20',
    tokenSymbol: 'USDT',
    network: 'Testnet',
    txHash: TX_HASH,
    confirmationStatus: 'confirmed',
    confirmationsCount: 3,
    purpose: 'Laptop purchase',
    agreementReference: {
      agreementId: 'agr-1',
      version: 2,
      status: 'accepted',
      acceptedAt: '2026-11-13T10:02:00.000Z',
    },
    verificationResult: {
      status: 'verified',
      verifiedAt: '2026-11-13T10:03:00.000Z',
      identityNote: 'Cryptographic wallet control does not establish real-world identity.',
    },
    riskAssessment: {
      riskScore: 0,
      riskLevel: 'low',
      classificationLabel: 'Low',
      summary: 'Low: No significant issues detected.',
      assessedAt: '2026-11-13T10:04:00.000Z',
    },
    nowIso: '2026-11-13T10:05:00.000Z',
    ...overrides,
  };
}

describe('Phase 9 — Transaction Records', () => {
  describe('Record Generation & Required Fields', () => {
    it('generates a complete transaction record with all required fields', () => {
      const rec = generateTransactionRecord(makeInput());
      expect(rec.recordId).toBe('rec-101');
      expect(rec.senderAddress).toBe(SENDER_ADDR);
      expect(rec.recipientAddress).toBe(RECIPIENT_ADDR);
      expect(rec.recipientName).toBe('Thabo M.');
      expect(rec.amount).toBe('20');
      expect(rec.tokenSymbol).toBe('USDT');
      expect(rec.network).toBe('Testnet');
      expect(rec.txHash).toBe(TX_HASH);
      expect(rec.explorerUrl).toContain(TX_HASH);
      expect(rec.confirmationStatus).toBe('confirmed');
      expect(rec.confirmationsCount).toBe(3);
      expect(rec.purpose).toBe('Laptop purchase');
      expect(rec.agreementReference?.agreementId).toBe('agr-1');
      expect(rec.verificationResult.status).toBe('verified');
      expect(rec.riskAssessment.riskScore).toBe(0);
    });

    it('supports pending records without a txHash yet', () => {
      const rec = generateTransactionRecord(
        makeInput({ txHash: null, confirmationStatus: 'pending', confirmationsCount: 0 })
      );
      expect(rec.txHash).toBeNull();
      expect(rec.explorerUrl).toBeNull();
      expect(rec.confirmationStatus).toBe('pending');
    });

    it('rejects missing recordId, invalid addresses, or non-positive amount', () => {
      expect(() => generateTransactionRecord(makeInput({ recordId: ' ' }))).toThrow(/Record ID/i);
      expect(() => generateTransactionRecord(makeInput({ senderAddress: 'bad' }))).toThrow(
        /sender/i
      );
      expect(() => generateTransactionRecord(makeInput({ recipientAddress: 'bad' }))).toThrow(
        /recipient/i
      );
      expect(() => generateTransactionRecord(makeInput({ amount: '0' }))).toThrow(/positive/i);
    });
  });

  describe('Both-Party Access Control', () => {
    it('allows sender and recipient access by userId', () => {
      const rec = generateTransactionRecord(makeInput());
      expect(canPartyAccessRecord(rec, { userId: 'user-sender' })).toBe(true);
      expect(canPartyAccessRecord(rec, { userId: 'user-recipient' })).toBe(true);
      expect(canPartyAccessRecord(rec, { userId: 'stranger-id' })).toBe(false);
    });

    it('allows sender and recipient access by walletAddress (case-insensitive)', () => {
      const rec = generateTransactionRecord(makeInput());
      expect(canPartyAccessRecord(rec, { walletAddress: SENDER_ADDR.toLowerCase() })).toBe(true);
      expect(canPartyAccessRecord(rec, { walletAddress: RECIPIENT_ADDR.toUpperCase() })).toBe(true);
      expect(canPartyAccessRecord(rec, { walletAddress: THIRD_PARTY_ADDR })).toBe(false);
    });
  });

  describe('Export & Share Functionality', () => {
    it('builds a shareable record link', () => {
      const rec = generateTransactionRecord(makeInput());
      expect(buildRecordShareLink(rec, 'https://word.app/')).toBe('https://word.app/record/rec-101');
    });

    it('exports record as valid round-trip JSON', () => {
      const rec = generateTransactionRecord(makeInput());
      const json = exportTransactionRecordAsJson(rec);
      const parsed = JSON.parse(json);
      expect(parsed.recordId).toBe('rec-101');
      expect(parsed.txHash).toBe(TX_HASH);
      expect(parsed.agreementReference.agreementId).toBe('agr-1');
    });

    it('exports record as CSV and escapes commas/quotes safely', () => {
      const rec = generateTransactionRecord(
        makeInput({ purpose: 'MacBook Pro, 14" M3' })
      );
      const csv = exportTransactionRecordAsCsv(rec);
      const lines = csv.split('\n');
      expect(lines).toHaveLength(2);
      expect(lines[0]).toContain('recordId,senderAddress');
      expect(lines[1]).toContain('"MacBook Pro, 14"" M3"');
    });
  });

  describe('Event History Preservation', () => {
    it('builds a chronologically sorted event history across request, agreement, verification, risk, submission, and settlement', () => {
      const rec = generateTransactionRecord(makeInput());
      const types = rec.eventHistory.map((e) => e.type);
      expect(types).toContain('request_created');
      expect(types).toContain('agreement_accepted');
      expect(types).toContain('recipient_verified');
      expect(types).toContain('risk_assessed');
      expect(types).toContain('tx_submitted');
      expect(types).toContain('tx_confirmed');
    });

    it('records tx_failed when confirmationStatus is failed', () => {
      const rec = generateTransactionRecord(makeInput({ confirmationStatus: 'failed' }));
      expect(rec.eventHistory.some((e) => e.type === 'tx_failed')).toBe(true);
    });

    it('appends new events via appendRecordEvent without mutating original record', () => {
      const rec = generateTransactionRecord(makeInput());
      const updated = appendRecordEvent(rec, {
        id: 'evt-dsp-1',
        type: 'dispute_opened',
        title: 'Dispute opened',
        detail: 'Item not delivered',
        timestamp: '2026-11-13T11:00:00.000Z',
      });

      expect(rec.eventHistory).not.toHaveLength(updated.eventHistory.length);
      expect(updated.eventHistory[updated.eventHistory.length - 1].type).toBe('dispute_opened');
    });
  });
});

