import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DISPUTE_CATEGORIES,
  DISPUTE_LIMITATIONS_NOTICE,
  addDisputeEvidence,
  buildCoherentAccountabilityBundle,
  createDisputeCase,
  updateDisputeStatus,
} from '../../src/services/disputeService';
import {
  createDispute,
  listDisputes,
  submitDisputeEvidence,
} from '../../src/services/accountabilityService';
import { supabase } from '../../src/lib/supabase';

describe('Phase 9 — Dispute Management', () => {
  describe('Dispute Creation, Categories, Acknowledgement & Limitations', () => {
    it('creates a dispute case linked to a payment and agreement with ISO timestamps', () => {
      const dsp = createDisputeCase({
        id: 'dsp-1001',
        paymentId: 'tx-99',
        agreementId: 'agr-1',
        category: 'Item or service not delivered',
        explanation: 'Laptop was not delivered at the agreed handover time.',
        nowIso: '2026-11-13T14:00:00.000Z',
      });

      expect(dsp.id).toBe('dsp-1001');
      expect(dsp.paymentId).toBe('tx-99');
      expect(dsp.agreementId).toBe('agr-1');
      expect(dsp.category).toBe('Item or service not delivered');
      expect(dsp.status).toBe('Open');
      expect(dsp.createdAt).toBe('2026-11-13T14:00:00.000Z');
      expect(dsp.acknowledgement.referenceId).toContain('ACK-');
      expect(dsp.acknowledgement.acknowledgedAt).toBe('2026-11-13T14:00:00.000Z');
      expect(dsp.limitationsNotice).toBe(DISPUTE_LIMITATIONS_NOTICE);
    });

    it('explains that dispute reporting does not reverse blockchain payments or guarantee recovery', () => {
      expect(DISPUTE_LIMITATIONS_NOTICE.toLowerCase()).toContain('does not automatically reverse');
      expect(DISPUTE_LIMITATIONS_NOTICE.toLowerCase()).toContain('guarantee recovery');
    });

    it('supports all defined DISPUTE_CATEGORIES', () => {
      expect(DISPUTE_CATEGORIES.length).toBeGreaterThanOrEqual(4);
      for (const category of DISPUTE_CATEGORIES) {
        const dsp = createDisputeCase({
          paymentId: 'tx-1',
          category,
          explanation: 'Detailed explanation of the issue.',
        });
        expect(dsp.category).toBe(category);
      }
    });

    it('rejects missing paymentId, unsupported category, or overly brief explanation', () => {
      expect(() =>
        createDisputeCase({
          paymentId: ' ',
          category: 'Item or service not delivered',
          explanation: 'Detailed explanation',
        })
      ).toThrow(/linked to a payment/i);

      expect(() =>
        createDisputeCase({
          paymentId: 'tx-1',
          category: 'Made up category' as never,
          explanation: 'Detailed explanation',
        })
      ).toThrow(/Unsupported dispute category/i);

      expect(() =>
        createDisputeCase({
          paymentId: 'tx-1',
          category: 'Item or service not delivered',
          explanation: 'bad',
        })
      ).toThrow(/at least 5 characters/i);
    });

    it('attaches initial supporting evidence on creation and sets status to Evidence Submitted', () => {
      const dsp = createDisputeCase({
        paymentId: 'tx-2',
        category: 'Item did not match agreed description',
        explanation: 'Screen had dead pixels not disclosed in agreement.',
        initialEvidence: {
          label: 'Photo of screen defect',
          note: 'Taken immediately after unboxing',
          fileName: 'defect.jpg',
          mimeType: 'image/jpeg',
          byteSize: 204800,
        },
        nowIso: '2026-11-13T14:10:00.000Z',
      });

      expect(dsp.status).toBe('Evidence Submitted');
      expect(dsp.evidence).toHaveLength(1);
      expect(dsp.evidence[0].fileName).toBe('defect.jpg');
      expect(dsp.eventHistory.some((e) => e.type === 'evidence_attached')).toBe(true);
    });
  });

  describe('Additional Evidence, Status Transitions & Event History', () => {
    it('allows adding additional timestamped evidence without mutating prior state', () => {
      const initial = createDisputeCase({
        paymentId: 'tx-3',
        category: 'Item or service not delivered',
        explanation: 'Courier tracking shows no pickup.',
        nowIso: '2026-11-13T14:00:00.000Z',
      });

      const withEvidence = addDisputeEvidence(initial, {
        label: 'Chat screenshot',
        note: 'Seller confirmed delay in chat.',
        nowIso: '2026-11-13T14:20:00.000Z',
      });

      expect(initial.evidence).toHaveLength(0);
      expect(withEvidence.evidence).toHaveLength(1);
      expect(withEvidence.evidence[0].addedAt).toBe('2026-11-13T14:20:00.000Z');
      expect(withEvidence.status).toBe('Evidence Submitted');
      expect(withEvidence.eventHistory).toHaveLength(3);
    });

    it('rejects additional evidence with empty label or note', () => {
      const initial = createDisputeCase({
        paymentId: 'tx-3',
        category: 'Item or service not delivered',
        explanation: 'Courier tracking shows no pickup.',
      });

      expect(() => addDisputeEvidence(initial, { label: ' ', note: 'Valid note' })).toThrow(
        /label is required/i
      );
      expect(() => addDisputeEvidence(initial, { label: 'Receipt', note: ' ' })).toThrow(
        /note is required/i
      );
    });

    it('preserves Under Review status when adding more evidence', () => {
      const initial = createDisputeCase({
        paymentId: 'tx-4',
        category: 'Destination or payment request mismatch',
        explanation: 'Destination address differed from invoice.',
      });
      const reviewing = updateDisputeStatus(initial, 'Under Review', 'Assigned for review');
      const moreEvidence = addDisputeEvidence(reviewing, {
        label: 'Original PDF invoice',
        note: 'Shows original 0x address',
      });

      expect(moreEvidence.status).toBe('Under Review');
      expect(moreEvidence.eventHistory.some((e) => e.type === 'status_updated')).toBe(true);
    });

    it('builds a coherent accountability bundle across requested, agreed, paid, and reported', () => {
      const dsp = createDisputeCase({
        paymentId: 'tx-5',
        agreementId: 'agr-5',
        category: 'Item or service not delivered',
        explanation: 'No handover occurred.',
      });

      const bundle = buildCoherentAccountabilityBundle({
        requested: {
          amount: '20',
          token: 'USDT',
          network: 'Testnet',
          recipient: 'Thabo',
          purpose: 'Laptop purchase',
        },
        agreed: {
          agreementId: 'agr-5',
          status: 'accepted',
          terms: 'In-person handover',
        },
        paid: {
          paymentId: 'tx-5',
          txHash: '0xabc',
          confirmationStatus: 'confirmed',
        },
        reported: dsp,
      });

      expect(bundle.requested.amount).toBe('20');
      expect(bundle.agreed.agreementId).toBe('agr-5');
      expect(bundle.paid.txHash).toBe('0xabc');
      expect(bundle.reported?.id).toBe(dsp.id);
    });
  });

  describe('Edge Function Client Contract (disputes & evidence)', () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
      vi.restoreAllMocks();
      vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
        data: { session: { access_token: 'test-jwt' } as never },
        error: null,
      });
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('creates a dispute via POST /disputes', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          dispute: { id: 'dsp-uuid-1', status: 'open', evidence: [] },
        }),
      });
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const res = await createDispute({
        transactionId: 'tx-uuid-1',
        reason: 'Item or service not delivered',
        summary: 'Seller did not show up for handover.',
      });

      expect(res.id).toBe('dsp-uuid-1');
      expect(res.status).toBe('open');
    });

    it('lists disputes via GET /disputes', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ disputes: [{ id: 'dsp-1', evidence: [] }] }),
      }) as unknown as typeof fetch;

      const list = await listDisputes();
      expect(list).toHaveLength(1);
    });

    it('submits metadata-only evidence via evidence-auth Edge Function', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          evidence: { id: 'ev-1', label: 'Receipt', note: 'Uploaded PDF' },
        }),
      });
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const ev = await submitDisputeEvidence({
        disputeId: 'dsp-uuid-1',
        label: 'Receipt',
        note: 'Uploaded PDF',
      });

      expect(ev.id).toBe('ev-1');
    });
  });
});

