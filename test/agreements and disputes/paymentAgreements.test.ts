import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AgreementLockedError,
  acceptAgreementByParty,
  createAgreementRecord,
  getAgreementStatusSummary,
  reviseAgreementRecord,
  type CreateAgreementInput,
} from '../../src/services/agreementService';
import {
  acceptPaymentAgreement,
  createPaymentAgreement,
  listPaymentAgreements,
  revisePaymentAgreement,
} from '../../src/services/accountabilityService';
import { supabase } from '../../src/lib/supabase';

const VALID_ADDR = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';
const OTHER_ADDR = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';

function makeInput(overrides: Partial<CreateAgreementInput> = {}): CreateAgreementInput {
  return {
    id: 'agr-1',
    paymentRequestId: 'req-123',
    title: 'Laptop handover agreement',
    purpose: 'Purchase of MacBook Pro',
    agreedAmount: '20',
    tokenSymbol: 'USDT',
    network: 'Testnet',
    recipientName: 'Thabo M.',
    recipientAddress: VALID_ADDR,
    termsText: 'In-person handover after serial number inspection.',
    creatorId: 'user-creator',
    counterpartyId: 'user-recipient',
    nowIso: '2026-11-13T10:00:00.000Z',
    ...overrides,
  };
}

describe('Phase 9 — Payment Agreements', () => {
  describe('Creation & Field Recording', () => {
    it('creates an agreement linked to a payment request with v1 snapshot', () => {
      const agr = createAgreementRecord(makeInput());
      expect(agr.paymentRequestId).toBe('req-123');
      expect(agr.purpose).toBe('Purchase of MacBook Pro');
      expect(agr.agreedAmount).toBe('20');
      expect(agr.tokenSymbol).toBe('USDT');
      expect(agr.network).toBe('Testnet');
      expect(agr.recipientName).toBe('Thabo M.');
      expect(agr.recipientAddress).toBe(VALID_ADDR);
      expect(agr.termsText).toBe('In-person handover after serial number inspection.');
      expect(agr.currentVersion).toBe(1);
      expect(agr.versions).toHaveLength(1);
      expect(agr.versions[0].versionNumber).toBe(1);
      expect(agr.versions[0].changeNote).toBe('Initial agreement proposal');
    });

    it('normalizes tokenSymbol to uppercase and trims whitespace', () => {
      const agr = createAgreementRecord(
        makeInput({ tokenSymbol: ' usdt ', purpose: '  Design sprint  ' })
      );
      expect(agr.tokenSymbol).toBe('USDT');
      expect(agr.purpose).toBe('Design sprint');
    });

    it('records creator acceptance timestamp by default on creation', () => {
      const agr = createAgreementRecord(makeInput());
      expect(agr.creatorAcceptedAt).toBe('2026-11-13T10:00:00.000Z');
      expect(agr.counterpartyAcceptedAt).toBeNull();
      expect(agr.lockedAt).toBeNull();
      expect(agr.status).toBe('pending_acceptance');
    });

    it('supports creating an unaccepted draft when creatorAcceptsOnCreate is false', () => {
      const agr = createAgreementRecord(makeInput({ creatorAcceptsOnCreate: false }));
      expect(agr.creatorAcceptedAt).toBeNull();
      expect(agr.status).toBe('proposed');
    });

    it('rejects missing paymentRequestId', () => {
      expect(() => createAgreementRecord(makeInput({ paymentRequestId: '   ' }))).toThrow(
        /linked to a payment request/i
      );
    });

    it('rejects short title (< 2 chars)', () => {
      expect(() => createAgreementRecord(makeInput({ title: 'A' }))).toThrow(/title/i);
    });

    it('rejects short purpose (< 3 chars)', () => {
      expect(() => createAgreementRecord(makeInput({ purpose: 'ab' }))).toThrow(/purpose/i);
    });

    it('rejects zero, negative, or non-numeric agreedAmount', () => {
      expect(() => createAgreementRecord(makeInput({ agreedAmount: '0' }))).toThrow(/positive/i);
      expect(() => createAgreementRecord(makeInput({ agreedAmount: '-5' }))).toThrow(/positive/i);
      expect(() => createAgreementRecord(makeInput({ agreedAmount: 'abc' }))).toThrow(/positive/i);
    });

    it('rejects unsupported network', () => {
      expect(() => createAgreementRecord(makeInput({ network: 'UnknownNet' }))).toThrow(
        /Unsupported agreement network/i
      );
    });

    it('rejects incompatible token/network combination (USDT on Base Sepolia)', () => {
      expect(() =>
        createAgreementRecord(makeInput({ network: 'Base Sepolia', tokenSymbol: 'USDT' }))
      ).toThrow(/not configured/i);
    });

    it('rejects missing recipientName or invalid recipientAddress', () => {
      expect(() => createAgreementRecord(makeInput({ recipientName: ' ' }))).toThrow(
        /Recipient name/i
      );
      expect(() => createAgreementRecord(makeInput({ recipientAddress: '0x123' }))).toThrow(
        /invalid/i
      );
    });

    it('rejects overly short termsText (< 4 chars)', () => {
      expect(() => createAgreementRecord(makeInput({ termsText: 'ok' }))).toThrow(/terms/i);
    });
  });

  describe('Both-Party Review, Acceptance & Timestamps', () => {
    it('allows counterparty to accept and locks agreement with timestamps', () => {
      const agr = createAgreementRecord(makeInput());
      const accepted = acceptAgreementByParty(agr, 'counterparty', {
        actorUserId: 'user-recipient',
        nowIso: '2026-11-13T10:05:00.000Z',
      });

      expect(accepted.creatorAcceptedAt).toBe('2026-11-13T10:00:00.000Z');
      expect(accepted.counterpartyAcceptedAt).toBe('2026-11-13T10:05:00.000Z');
      expect(accepted.lockedAt).toBe('2026-11-13T10:05:00.000Z');
      expect(accepted.status).toBe('accepted');
      expect(accepted.counterpartyId).toBe('user-recipient');
    });

    it('allows counterparty to accept first when creatorAcceptsOnCreate is false, then creator second', () => {
      const draft = createAgreementRecord(makeInput({ creatorAcceptsOnCreate: false }));
      const step1 = acceptAgreementByParty(draft, 'counterparty', {
        nowIso: '2026-11-13T10:01:00.000Z',
      });
      expect(step1.status).toBe('pending_acceptance');
      expect(step1.lockedAt).toBeNull();

      const step2 = acceptAgreementByParty(step1, 'creator', {
        nowIso: '2026-11-13T10:02:00.000Z',
      });
      expect(step2.status).toBe('accepted');
      expect(step2.lockedAt).toBe('2026-11-13T10:02:00.000Z');
    });

    it('preserves original acceptance timestamp when the same party accepts again', () => {
      const agr = createAgreementRecord(makeInput());
      const reAccepted = acceptAgreementByParty(agr, 'creator', {
        nowIso: '2026-11-13T12:00:00.000Z',
      });
      expect(reAccepted.creatorAcceptedAt).toBe('2026-11-13T10:00:00.000Z');
    });
  });

  describe('Preventing Silent Modification & Maintaining Version History', () => {
    it('prevents any modification once both parties have accepted (throws AgreementLockedError)', () => {
      const agr = createAgreementRecord(makeInput());
      const locked = acceptAgreementByParty(agr, 'counterparty', {
        nowIso: '2026-11-13T10:05:00.000Z',
      });

      expect(() =>
        reviseAgreementRecord(
          locked,
          { agreedAmount: '25' },
          { editedBy: 'creator', changeNote: 'Sneakily raise price' }
        )
      ).toThrow(AgreementLockedError);
    });

    it('allows revision before both-party acceptance and increments currentVersion', () => {
      const agr = createAgreementRecord(makeInput());
      const v2 = reviseAgreementRecord(
        agr,
        { agreedAmount: '22', termsText: 'Includes USB-C charger and sleeve.' },
        {
          editedBy: 'creator',
          changeNote: 'Added charger to scope',
          nowIso: '2026-11-13T10:03:00.000Z',
        }
      );

      expect(v2.currentVersion).toBe(2);
      expect(v2.agreedAmount).toBe('22');
      expect(v2.termsText).toBe('Includes USB-C charger and sleeve.');
      expect(v2.versions).toHaveLength(2);
      expect(v2.versions[1].versionNumber).toBe(2);
      expect(v2.versions[1].changeNote).toBe('Added charger to scope');
      expect(v2.versions[0].agreedAmount).toBe('20'); // v1 snapshot preserved immutably
    });

    it('resets the other party acceptance on revision so terms cannot change silently', () => {
      const draft = createAgreementRecord(makeInput({ creatorAcceptsOnCreate: false }));
      const counterpartyAccepted = acceptAgreementByParty(draft, 'counterparty', {
        nowIso: '2026-11-13T10:01:00.000Z',
      });
      expect(counterpartyAccepted.counterpartyAcceptedAt).not.toBeNull();

      const revisedByCreator = reviseAgreementRecord(
        counterpartyAccepted,
        { agreedAmount: '25' },
        { editedBy: 'creator', changeNote: 'Adjusted price', nowIso: '2026-11-13T10:02:00.000Z' }
      );

      expect(revisedByCreator.creatorAcceptedAt).toBe('2026-11-13T10:02:00.000Z');
      expect(revisedByCreator.counterpartyAcceptedAt).toBeNull();
      expect(revisedByCreator.status).toBe('pending_acceptance');
    });

    it('requires a non-empty changeNote when revising an agreement', () => {
      const agr = createAgreementRecord(makeInput());
      expect(() =>
        reviseAgreementRecord(agr, { agreedAmount: '21' }, { editedBy: 'creator', changeNote: '  ' })
      ).toThrow(/change note is required/i);
    });

    it('validates revised fields (rejects invalid address or negative amount on revision)', () => {
      const agr = createAgreementRecord(makeInput());
      expect(() =>
        reviseAgreementRecord(
          agr,
          { recipientAddress: 'bad-addr' },
          { editedBy: 'creator', changeNote: 'Update address' }
        )
      ).toThrow(/invalid/i);
      expect(() =>
        reviseAgreementRecord(
          agr,
          { agreedAmount: '-1' },
          { editedBy: 'creator', changeNote: 'Bad amount' }
        )
      ).toThrow(/positive/i);
    });

    it('tracks multiple sequential revisions accurately in versions history', () => {
      let agr = createAgreementRecord(makeInput());
      agr = reviseAgreementRecord(
        agr,
        { agreedAmount: '21' },
        { editedBy: 'creator', changeNote: 'v2 price', nowIso: '2026-11-13T10:01:00.000Z' }
      );
      agr = reviseAgreementRecord(
        agr,
        { recipientAddress: OTHER_ADDR, termsText: 'Deliver at office reception.' },
        { editedBy: 'counterparty', changeNote: 'v3 wallet & location', nowIso: '2026-11-13T10:02:00.000Z' }
      );

      expect(agr.currentVersion).toBe(3);
      expect(agr.versions.map((v) => v.versionNumber)).toEqual([1, 2, 3]);
      expect(agr.versions[2].editedBy).toBe('counterparty');
      expect(agr.versions[2].recipientAddress).toBe(OTHER_ADDR);
    });
  });

  describe('Agreement Status Display', () => {
    it('displays Proposed when neither party has accepted', () => {
      const draft = createAgreementRecord(makeInput({ creatorAcceptsOnCreate: false }));
      const s = getAgreementStatusSummary(draft);
      expect(s.label).toBe('Proposed (awaiting both parties)');
      expect(s.isLocked).toBe(false);
    });

    it('displays Awaiting counterparty acceptance when only creator accepted', () => {
      const agr = createAgreementRecord(makeInput());
      const s = getAgreementStatusSummary(agr);
      expect(s.label).toBe('Awaiting counterparty acceptance');
      expect(s.creatorAccepted).toBe(true);
      expect(s.counterpartyAccepted).toBe(false);
    });

    it('displays Awaiting creator acceptance when only counterparty accepted', () => {
      const draft = createAgreementRecord(makeInput({ creatorAcceptsOnCreate: false }));
      const cp = acceptAgreementByParty(draft, 'counterparty');
      const s = getAgreementStatusSummary(cp);
      expect(s.label).toBe('Awaiting creator acceptance');
      expect(s.creatorAccepted).toBe(false);
      expect(s.counterpartyAccepted).toBe(true);
    });

    it('displays Accepted & Locked when both parties have accepted', () => {
      const agr = acceptAgreementByParty(createAgreementRecord(makeInput()), 'counterparty');
      const s = getAgreementStatusSummary(agr);
      expect(s.label).toBe('Accepted & Locked');
      expect(s.isLocked).toBe(true);
    });

    it('displays Disputed and locked when status is disputed', () => {
      const agr = { ...createAgreementRecord(makeInput()), status: 'disputed' as const };
      const s = getAgreementStatusSummary(agr);
      expect(s.label).toBe('Disputed');
      expect(s.isLocked).toBe(true);
    });
  });

  describe('Edge Function Client Contract (accountabilityService)', () => {
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

    it('creates an agreement via payment-agreements Edge Function', async () => {
      const mockRow = { id: 'agr-uuid-1', status: 'pending_acceptance' };
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ agreement: mockRow }),
      });
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const res = await createPaymentAgreement({
        paymentRequestId: 'req-uuid-1',
        title: 'Laptop',
        purpose: 'Laptop purchase',
        amount: '20',
        tokenSymbol: 'USDT',
        network: 'Testnet',
        recipientName: 'Thabo',
        recipientAddress: VALID_ADDR,
        termsText: 'Handover in person',
      });

      expect(res.id).toBe('agr-uuid-1');
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.action).toBe('create');
      expect(body.paymentRequestId).toBe('req-uuid-1');
    });

    it('revises an agreement via payment-agreements Edge Function', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ agreement: { id: 'agr-uuid-1', status: 'pending_acceptance' } }),
      });
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      await revisePaymentAgreement({
        agreementId: 'agr-uuid-1',
        changeNote: 'Updated amount',
        amount: '25',
      });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.action).toBe('revise');
      expect(body.changeNote).toBe('Updated amount');
    });

    it('accepts an agreement via payment-agreements Edge Function', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ agreement: { id: 'agr-uuid-1', status: 'accepted' } }),
      });
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const res = await acceptPaymentAgreement('agr-uuid-1');
      expect(res.status).toBe('accepted');
    });

    it('lists agreements via GET payment-agreements Edge Function', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ agreements: [{ id: 'agr-1' }, { id: 'agr-2' }] }),
      });
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const list = await listPaymentAgreements();
      expect(list).toHaveLength(2);
    });

    it('surfaces 409 AGREEMENT_LOCKED error from Edge Function when revising a locked agreement', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          error: {
            code: 'AGREEMENT_LOCKED',
            message: 'Accepted payment agreements are locked and cannot be silently modified.',
          },
        }),
      }) as unknown as typeof fetch;

      await expect(
        revisePaymentAgreement({
          agreementId: 'agr-uuid-1',
          changeNote: 'Attempt silent edit',
          amount: '999',
        })
      ).rejects.toThrow(/locked/i);
    });
  });
});

