import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  RISK_CATEGORY_WEIGHTS,
  evaluatePaymentRisk,
  type RiskCategory,
  type RiskIntelligenceInput,
} from '../../src/services/riskIntelligenceService';
import { listRiskAssessments, runRiskAssessment } from '../../src/services/paymentsService';
import { supabase } from '../../src/lib/supabase';

const VALID_RECIPIENT = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';
const SEPOLIA_USDT = '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06';
const SEPOLIA_USDC = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
const BASE_SEPOLIA_USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

function makeSafeInput(overrides: Partial<RiskIntelligenceInput> = {}): RiskIntelligenceInput {
  return {
    recipientAddress: VALID_RECIPIENT,
    recipientName: 'Acme Studio',
    amount: '25',
    tokenSymbol: 'USDT',
    network: 'Testnet',
    walletNetwork: 'Testnet',
    tokenContractAddress: SEPOLIA_USDT,
    purpose: 'Design retainer milestone 1',
    walletControlStatus: 'verified',
    isAlteredRequest: false,
    isExpiredRequest: false,
    isDuplicateAttempt: false,
    hasSuspiciousInteractions: false,
    priorDisputeCount: 0,
    historicalAverageAmount: 20,
    ...overrides,
  };
}

describe('Phase 7 — Risk Intelligence Engine', () => {
  describe('Weighted Risk Model & Category Definitions', () => {
    it('defines all 7 required risk categories', () => {
      const categories = Object.keys(RISK_CATEGORY_WEIGHTS) as RiskCategory[];
      expect(categories).toEqual([
        'wallet_verification',
        'request_integrity',
        'duplicate_activity',
        'amount_anomaly',
        'network_compatibility',
        'token_contract',
        'behavioral_context',
      ]);
    });

    it('weights across all 7 categories sum to exactly 100', () => {
      const total = Object.values(RISK_CATEGORY_WEIGHTS).reduce((acc, w) => acc + w, 0);
      expect(total).toBe(100);
    });

    it('assigns riskScore 0 and low riskLevel for a fully clean verified request', () => {
      const report = evaluatePaymentRisk(makeSafeInput());
      expect(report.riskScore).toBe(0);
      expect(report.riskLevel).toBe('low');
      expect(report.classificationLabel).toBe('Low');
      expect(report.classificationMeaning).toBe('No significant issues detected');
      expect(report.summary).toContain('Low: No significant issues detected');
    });

    it('caps total riskScore at 100 even when all categories are maximally triggered', () => {
      const report = evaluatePaymentRisk(
        makeSafeInput({
          recipientAddress: 'invalid-addr',
          isAlteredRequest: true,
          isDuplicateAttempt: true,
          amount: '50000',
          network: 'UnknownChain',
          tokenSymbol: 'FAKE',
          hasSuspiciousInteractions: true,
          priorDisputeCount: 4,
        })
      );
      expect(report.riskScore).toBe(100);
      expect(report.riskLevel).toBe('critical');
    });

    it('classifies score 24 as low and score 25+ as medium', () => {
      // Unverified (14) + network mismatch (8) + missing purpose (4) = 26 -> medium
      const med = evaluatePaymentRisk(
        makeSafeInput({
          walletControlStatus: 'unverified',
          walletNetwork: 'Polygon Amoy',
          purpose: '',
        })
      );
      expect(med.riskScore).toBe(26);
      expect(med.riskLevel).toBe('medium');

      // Unverified (14) + dust (6) + missing purpose (4) = 24 -> low
      const low = evaluatePaymentRisk(
        makeSafeInput({
          walletControlStatus: 'unverified',
          amount: '0.001',
          purpose: '',
        })
      );
      expect(low.riskScore).toBe(24);
      expect(low.riskLevel).toBe('low');
    });

    it('classifies score 50..74 as high', () => {
      // Invalid address (25) + expired (18) + dust (6) + missing purpose (4) = 53 -> high
      const report = evaluatePaymentRisk(
        makeSafeInput({
          recipientAddress: '0x123',
          isExpiredRequest: true,
          amount: '0.001',
          purpose: '',
        })
      );
      expect(report.riskScore).toBe(53);
      expect(report.riskLevel).toBe('high');
    });

    it('classifies score >= 75 as critical', () => {
      // Mismatch (25) + altered (20) + duplicate (15) + very high (15) = 75 -> critical
      const report = evaluatePaymentRisk(
        makeSafeInput({
          walletControlStatus: 'mismatch',
          isAlteredRequest: true,
          isDuplicateAttempt: true,
          amount: '15000',
        })
      );
      expect(report.riskScore).toBe(75);
      expect(report.riskLevel).toBe('critical');
    });
  });

  describe('Recipient Wallet Validation & Mismatch Detection', () => {
    it('flags malformed EVM address as INVALID_RECIPIENT_ADDRESS (25 pts, critical)', () => {
      const report = evaluatePaymentRisk(makeSafeInput({ recipientAddress: 'not-an-address' }));
      const finding = report.findings.find((f) => f.code === 'INVALID_RECIPIENT_ADDRESS');
      expect(finding).toBeDefined();
      expect(finding?.pointsAwarded).toBe(25);
      expect(finding?.severity).toBe('critical');
      expect(report.categoryBreakdown.wallet_verification).toBe(25);
    });

    it('flags empty recipient address as INVALID_RECIPIENT_ADDRESS', () => {
      const report = evaluatePaymentRisk(makeSafeInput({ recipientAddress: '   ' }));
      expect(report.findings.some((f) => f.code === 'INVALID_RECIPIENT_ADDRESS')).toBe(true);
    });

    it('accepts recipient address with leading/trailing whitespace when valid', () => {
      const report = evaluatePaymentRisk(
        makeSafeInput({ recipientAddress: `  ${VALID_RECIPIENT}  ` })
      );
      expect(report.findings.some((f) => f.code === 'RECIPIENT_VERIFIED')).toBe(true);
    });

    it('flags zero-prefixed burn address as SUSPICIOUS_BURN_ADDRESS', () => {
      const report = evaluatePaymentRisk(
        makeSafeInput({ recipientAddress: '0x0000000000000000000000000000000000000000' })
      );
      const finding = report.findings.find((f) => f.code === 'SUSPICIOUS_BURN_ADDRESS');
      expect(finding).toBeDefined();
      expect(finding?.pointsAwarded).toBe(25);
      expect(finding?.severity).toBe('critical');
    });

    it('flags 0x...dEaD burn address pattern as SUSPICIOUS_BURN_ADDRESS', () => {
      const report = evaluatePaymentRisk(
        makeSafeInput({ recipientAddress: '0x000000000000000000000000000000000000dEaD' })
      );
      expect(report.findings.some((f) => f.code === 'SUSPICIOUS_BURN_ADDRESS')).toBe(true);
    });

    it('flags walletControlStatus="mismatch" as ADDRESS_MISMATCH (25 pts, critical)', () => {
      const report = evaluatePaymentRisk(makeSafeInput({ walletControlStatus: 'mismatch' }));
      const finding = report.findings.find((f) => f.code === 'ADDRESS_MISMATCH');
      expect(finding).toBeDefined();
      expect(finding?.pointsAwarded).toBe(25);
      expect(finding?.severity).toBe('critical');
    });

    it('flags walletControlStatus="unverified" as UNVERIFIED_EXTERNAL_ADDRESS (14 pts, medium)', () => {
      const report = evaluatePaymentRisk(makeSafeInput({ walletControlStatus: 'unverified' }));
      const finding = report.findings.find((f) => f.code === 'UNVERIFIED_EXTERNAL_ADDRESS');
      expect(finding).toBeDefined();
      expect(finding?.pointsAwarded).toBe(14);
      expect(finding?.severity).toBe('medium');
    });

    it('defaults omitted walletControlStatus to unverified', () => {
      const report = evaluatePaymentRisk(makeSafeInput({ walletControlStatus: undefined }));
      expect(report.findings.some((f) => f.code === 'UNVERIFIED_EXTERNAL_ADDRESS')).toBe(true);
    });

    it('records RECIPIENT_VERIFIED with 0 penalty points and explains non-identity limitation', () => {
      const report = evaluatePaymentRisk(makeSafeInput({ walletControlStatus: 'verified' }));
      const finding = report.findings.find((f) => f.code === 'RECIPIENT_VERIFIED');
      expect(finding).toBeDefined();
      expect(finding?.pointsAwarded).toBe(0);
      expect(finding?.whyItMatters.toLowerCase()).toContain('not real-world identity');
    });
  });

  describe('Request Integrity, Tampering, Expiry & Duplicates', () => {
    it('flags altered payment request as ALTERED_PAYMENT_REQUEST (20 pts, critical)', () => {
      const report = evaluatePaymentRisk(makeSafeInput({ isAlteredRequest: true }));
      const finding = report.findings.find((f) => f.code === 'ALTERED_PAYMENT_REQUEST');
      expect(finding).toBeDefined();
      expect(finding?.pointsAwarded).toBe(20);
      expect(finding?.severity).toBe('critical');
    });

    it('flags expired payment request as EXPIRED_PAYMENT_REQUEST (18 pts, high)', () => {
      const report = evaluatePaymentRisk(makeSafeInput({ isExpiredRequest: true }));
      const finding = report.findings.find((f) => f.code === 'EXPIRED_PAYMENT_REQUEST');
      expect(finding).toBeDefined();
      expect(finding?.pointsAwarded).toBe(18);
      expect(finding?.severity).toBe('high');
    });

    it('prioritizes ALTERED_PAYMENT_REQUEST over EXPIRED_PAYMENT_REQUEST when both are true', () => {
      const report = evaluatePaymentRisk(
        makeSafeInput({ isAlteredRequest: true, isExpiredRequest: true })
      );
      expect(report.findings.some((f) => f.code === 'ALTERED_PAYMENT_REQUEST')).toBe(true);
      expect(report.findings.some((f) => f.code === 'EXPIRED_PAYMENT_REQUEST')).toBe(false);
    });

    it('records REQUEST_INTEGRITY_INTACT with 0 points when valid and unexpired', () => {
      const report = evaluatePaymentRisk(makeSafeInput());
      const finding = report.findings.find((f) => f.code === 'REQUEST_INTEGRITY_INTACT');
      expect(finding).toBeDefined();
      expect(finding?.pointsAwarded).toBe(0);
    });

    it('flags duplicate payment attempt as DUPLICATE_PAYMENT_ATTEMPT (15 pts, high)', () => {
      const report = evaluatePaymentRisk(makeSafeInput({ isDuplicateAttempt: true }));
      const finding = report.findings.find((f) => f.code === 'DUPLICATE_PAYMENT_ATTEMPT');
      expect(finding).toBeDefined();
      expect(finding?.pointsAwarded).toBe(15);
      expect(finding?.severity).toBe('high');
      expect(report.categoryBreakdown.duplicate_activity).toBe(15);
    });
  });

  describe('Amount Anomaly Detection', () => {
    it('flags non-numeric amount as INVALID_AMOUNT_VALUE (15 pts)', () => {
      const report = evaluatePaymentRisk(makeSafeInput({ amount: 'abc' }));
      expect(report.findings.some((f) => f.code === 'INVALID_AMOUNT_VALUE')).toBe(true);
      expect(report.categoryBreakdown.amount_anomaly).toBe(15);
    });

    it('flags zero amount as INVALID_AMOUNT_VALUE', () => {
      const report = evaluatePaymentRisk(makeSafeInput({ amount: '0' }));
      expect(report.findings.some((f) => f.code === 'INVALID_AMOUNT_VALUE')).toBe(true);
    });

    it('flags negative amount as INVALID_AMOUNT_VALUE', () => {
      const report = evaluatePaymentRisk(makeSafeInput({ amount: '-25' }));
      expect(report.findings.some((f) => f.code === 'INVALID_AMOUNT_VALUE')).toBe(true);
    });

    it('flags Infinity as INVALID_AMOUNT_VALUE', () => {
      const report = evaluatePaymentRisk(makeSafeInput({ amount: 'Infinity' }));
      expect(report.findings.some((f) => f.code === 'INVALID_AMOUNT_VALUE')).toBe(true);
    });

    it('flags amount >= 10000 as VERY_HIGH_VALUE_TRANSFER (15 pts, high)', () => {
      const report = evaluatePaymentRisk(makeSafeInput({ amount: '10000' }));
      const finding = report.findings.find((f) => f.code === 'VERY_HIGH_VALUE_TRANSFER');
      expect(finding).toBeDefined();
      expect(finding?.pointsAwarded).toBe(15);
      expect(finding?.severity).toBe('high');
    });

    it('flags amount >= 5x historicalAverageAmount as OUTLIER_TRANSFER_AMOUNT (12 pts, medium)', () => {
      const report = evaluatePaymentRisk(
        makeSafeInput({ amount: '500', historicalAverageAmount: 100 })
      );
      const finding = report.findings.find((f) => f.code === 'OUTLIER_TRANSFER_AMOUNT');
      expect(finding).toBeDefined();
      expect(finding?.pointsAwarded).toBe(12);
      expect(finding?.severity).toBe('medium');
    });

    it('does not flag OUTLIER_TRANSFER_AMOUNT when amount is below 5x historicalAverageAmount', () => {
      const report = evaluatePaymentRisk(
        makeSafeInput({ amount: '499', historicalAverageAmount: 100 })
      );
      expect(report.findings.some((f) => f.code === 'OUTLIER_TRANSFER_AMOUNT')).toBe(false);
      expect(report.categoryBreakdown.amount_anomaly).toBe(0);
    });

    it('flags amount >= 1000 (below 10000) as HIGH_VALUE_TRANSFER (8 pts, medium)', () => {
      const report = evaluatePaymentRisk(
        makeSafeInput({ amount: '1000', historicalAverageAmount: null })
      );
      const finding = report.findings.find((f) => f.code === 'HIGH_VALUE_TRANSFER');
      expect(finding).toBeDefined();
      expect(finding?.pointsAwarded).toBe(8);
    });

    it('does not flag 999.99 as HIGH_VALUE_TRANSFER', () => {
      const report = evaluatePaymentRisk(
        makeSafeInput({ amount: '999.99', historicalAverageAmount: null })
      );
      expect(report.findings.some((f) => f.code === 'HIGH_VALUE_TRANSFER')).toBe(false);
    });

    it('flags amount < 0.01 as DUST_TRANSFER_AMOUNT (6 pts, low)', () => {
      const report = evaluatePaymentRisk(makeSafeInput({ amount: '0.005' }));
      const finding = report.findings.find((f) => f.code === 'DUST_TRANSFER_AMOUNT');
      expect(finding).toBeDefined();
      expect(finding?.pointsAwarded).toBe(6);
      expect(finding?.severity).toBe('low');
    });

    it('treats boundary amount 0.01 as normal (no dust warning)', () => {
      const report = evaluatePaymentRisk(makeSafeInput({ amount: '0.01' }));
      expect(report.findings.some((f) => f.code === 'DUST_TRANSFER_AMOUNT')).toBe(false);
    });
  });

  describe('Network Compatibility & Token Contract Verification', () => {
    it('flags unsupported network as UNSUPPORTED_NETWORK (10 pts, high)', () => {
      const report = evaluatePaymentRisk(makeSafeInput({ network: 'ArbitrumMainnet' }));
      const finding = report.findings.find((f) => f.code === 'UNSUPPORTED_NETWORK');
      expect(finding).toBeDefined();
      expect(finding?.pointsAwarded).toBe(10);
      expect(finding?.severity).toBe('high');
    });

    it('normalizes "Testnet (Sepolia)" alias to "Testnet"', () => {
      const report = evaluatePaymentRisk(
        makeSafeInput({ network: 'Testnet (Sepolia)', walletNetwork: 'Testnet' })
      );
      expect(report.findings.some((f) => f.code === 'UNSUPPORTED_NETWORK')).toBe(false);
      expect(report.findings.some((f) => f.code === 'NETWORK_MISMATCH')).toBe(false);
    });

    it('flags walletNetwork != request network as NETWORK_MISMATCH (8 pts, medium)', () => {
      const report = evaluatePaymentRisk(
        makeSafeInput({ network: 'Testnet', walletNetwork: 'Base Sepolia' })
      );
      const finding = report.findings.find((f) => f.code === 'NETWORK_MISMATCH');
      expect(finding).toBeDefined();
      expect(finding?.pointsAwarded).toBe(8);
      expect(finding?.severity).toBe('medium');
    });

    it('flags unsupported token on a valid network as UNSUPPORTED_TOKEN_ON_NETWORK (10 pts)', () => {
      const report = evaluatePaymentRisk(
        makeSafeInput({ network: 'Base Sepolia', walletNetwork: 'Base Sepolia', tokenSymbol: 'USDT' })
      );
      const finding = report.findings.find((f) => f.code === 'UNSUPPORTED_TOKEN_ON_NETWORK');
      expect(finding).toBeDefined();
      expect(finding?.pointsAwarded).toBe(10);
    });

    it('flags non-canonical tokenContractAddress as SUSPICIOUS_TOKEN_CONTRACT (10 pts, critical)', () => {
      const report = evaluatePaymentRisk(
        makeSafeInput({
          network: 'Testnet',
          tokenSymbol: 'USDT',
          tokenContractAddress: '0x1111111111111111111111111111111111111111',
        })
      );
      const finding = report.findings.find((f) => f.code === 'SUSPICIOUS_TOKEN_CONTRACT');
      expect(finding).toBeDefined();
      expect(finding?.pointsAwarded).toBe(10);
      expect(finding?.severity).toBe('critical');
    });

    it('accepts canonical Sepolia USDC contract case-insensitively', () => {
      const report = evaluatePaymentRisk(
        makeSafeInput({
          network: 'Testnet',
          tokenSymbol: 'USDC',
          tokenContractAddress: SEPOLIA_USDC.toLowerCase(),
        })
      );
      expect(report.findings.some((f) => f.code === 'SUSPICIOUS_TOKEN_CONTRACT')).toBe(false);
      expect(report.categoryBreakdown.token_contract).toBe(0);
    });

    it('accepts canonical Base Sepolia USDC contract', () => {
      const report = evaluatePaymentRisk(
        makeSafeInput({
          network: 'Base Sepolia',
          walletNetwork: 'Base Sepolia',
          tokenSymbol: 'USDC',
          tokenContractAddress: BASE_SEPOLIA_USDC,
        })
      );
      expect(report.findings.some((f) => f.code === 'SUSPICIOUS_TOKEN_CONTRACT')).toBe(false);
    });
  });

  describe('Behavioral Context, Disputes & Inconsistent Info', () => {
    it('flags suspicious interactions with medium severity when disputes < 3', () => {
      const report = evaluatePaymentRisk(
        makeSafeInput({ hasSuspiciousInteractions: true, priorDisputeCount: 1 })
      );
      const finding = report.findings.find((f) => f.code === 'SUSPICIOUS_WALLET_INTERACTIONS');
      expect(finding).toBeDefined();
      expect(finding?.pointsAwarded).toBe(5);
      expect(finding?.severity).toBe('medium');
    });

    it('escalates suspicious interactions to high severity when priorDisputeCount >= 3', () => {
      const report = evaluatePaymentRisk(
        makeSafeInput({ hasSuspiciousInteractions: false, priorDisputeCount: 3 })
      );
      const finding = report.findings.find((f) => f.code === 'SUSPICIOUS_WALLET_INTERACTIONS');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('high');
    });

    it('flags missing payment purpose as INCONSISTENT_PAYMENT_INFO (4 pts, low)', () => {
      const report = evaluatePaymentRisk(makeSafeInput({ purpose: '' }));
      const finding = report.findings.find((f) => f.code === 'INCONSISTENT_PAYMENT_INFO');
      expect(finding).toBeDefined();
      expect(finding?.pointsAwarded).toBe(4);
      expect(finding?.severity).toBe('low');
    });

    it('flags overly brief (<4 chars) payment purpose as INCONSISTENT_PAYMENT_INFO', () => {
      const report = evaluatePaymentRisk(makeSafeInput({ purpose: 'pay' }));
      expect(report.findings.some((f) => f.code === 'INCONSISTENT_PAYMENT_INFO')).toBe(true);
    });

    it('accepts descriptive payment purpose (>=4 chars) with 0 behavioral penalty', () => {
      const report = evaluatePaymentRisk(makeSafeInput({ purpose: 'Logo design' }));
      expect(report.findings.some((f) => f.code === 'INCONSISTENT_PAYMENT_INFO')).toBe(false);
      expect(report.categoryBreakdown.behavioral_context).toBe(0);
    });
  });

  describe('Explainability, Timestamps & Reassessment', () => {
    it('includes non-empty detail ("what Word found") and whyItMatters on every finding', () => {
      const report = evaluatePaymentRisk(
        makeSafeInput({
          walletControlStatus: 'unverified',
          isExpiredRequest: true,
          isDuplicateAttempt: true,
          amount: '2500',
          walletNetwork: 'Base Sepolia',
          purpose: 'ok',
        })
      );
      expect(report.findings.length).toBeGreaterThanOrEqual(5);
      for (const finding of report.findings) {
        expect(finding.detail.trim().length).toBeGreaterThan(10);
        expect(finding.whyItMatters.trim().length).toBeGreaterThan(10);
      }
    });

    it('generates a valid ISO 8601 assessedAt timestamp', () => {
      const report = evaluatePaymentRisk(makeSafeInput());
      const parsed = Date.parse(report.assessedAt);
      expect(Number.isNaN(parsed)).toBe(false);
      expect(new Date(parsed).toISOString()).toBe(report.assessedAt);
    });

    it('recalculates score and findings immediately when payment details change', () => {
      const initial = evaluatePaymentRisk(makeSafeInput({ amount: '50' }));
      expect(initial.riskScore).toBe(0);

      const updatedAmount = evaluatePaymentRisk(makeSafeInput({ amount: '15000' }));
      expect(updatedAmount.riskScore).toBe(15);
      expect(updatedAmount.findings.some((f) => f.code === 'VERY_HIGH_VALUE_TRANSFER')).toBe(true);

      const updatedContract = evaluatePaymentRisk(
        makeSafeInput({
          amount: '15000',
          tokenContractAddress: '0x2222222222222222222222222222222222222222',
        })
      );
      expect(updatedContract.riskScore).toBe(25);
      expect(updatedContract.riskLevel).toBe('medium');
    });

    it('produces distinct categoryBreakdown values matching finding points', () => {
      const report = evaluatePaymentRisk(
        makeSafeInput({
          walletControlStatus: 'mismatch', // 25
          isDuplicateAttempt: true, // 15
          amount: '1200', // 8
          historicalAverageAmount: null,
        })
      );
      expect(report.categoryBreakdown.wallet_verification).toBe(25);
      expect(report.categoryBreakdown.duplicate_activity).toBe(15);
      expect(report.categoryBreakdown.amount_anomaly).toBe(8);
      expect(report.riskScore).toBe(48);
    });
  });

  describe('Edge Function Persistence Contract (runRiskAssessment)', () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
      vi.restoreAllMocks();
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('sends enriched risk parameters to the risk-assessment Edge Function and returns stored assessment', async () => {
      vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
        data: { session: { access_token: 'test-jwt' } as never },
        error: null,
      });

      const mockAssessment = {
        id: 'ra-123',
        user_id: 'user-1',
        payment_request_id: 'req-1',
        transaction_id: null,
        recipient_address: VALID_RECIPIENT,
        network: 'Testnet',
        risk_score: 14,
        risk_level: 'medium',
        summary: 'Moderate caution advised.',
        factors: [],
        created_at: '2026-11-13T10:00:00.000Z',
      };

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ assessment: mockAssessment }),
      });
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const result = await runRiskAssessment({
        recipientAddress: VALID_RECIPIENT,
        network: 'Testnet',
        tokenSymbol: 'USDT',
        amount: '50',
        paymentRequestId: 'req-1',
        purpose: 'Invoice #42',
        walletNetwork: 'Testnet',
        tokenContractAddress: SEPOLIA_USDT,
      });

      expect(result.id).toBe('ra-123');
      expect(result.created_at).toBe('2026-11-13T10:00:00.000Z');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, init] = fetchMock.mock.calls[0];
      const parsedBody = JSON.parse(init.body);
      expect(parsedBody).toMatchObject({
        recipientAddress: VALID_RECIPIENT,
        network: 'Testnet',
        tokenSymbol: 'USDT',
        amount: '50',
        paymentRequestId: 'req-1',
        purpose: 'Invoice #42',
        walletNetwork: 'Testnet',
        tokenContractAddress: SEPOLIA_USDT,
      });
    });

    it('throws when the risk-assessment Edge Function returns an HTTP error', async () => {
      vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
        data: { session: { access_token: 'test-jwt' } as never },
        error: null,
      });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: { code: 'VALIDATION_ERROR', message: 'Invalid recipient address' } }),
      }) as unknown as typeof fetch;

      await expect(
        runRiskAssessment({
          recipientAddress: 'bad',
          network: 'Testnet',
          tokenSymbol: 'USDT',
          amount: '10',
        })
      ).rejects.toThrow('Invalid recipient address');
    });

    it('throws when user session is missing before invoking Edge Function', async () => {
      vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
        data: { session: null },
        error: null,
      });

      await expect(
        runRiskAssessment({
          recipientAddress: VALID_RECIPIENT,
          network: 'Testnet',
          tokenSymbol: 'USDT',
          amount: '10',
        })
      ).rejects.toThrow();
    });
  });

  describe('Risk Classification & Explainable Scam Intelligence', () => {
    it('maps Low, Moderate, High, and Critical classifications to their exact meanings', () => {
      const low = evaluatePaymentRisk(makeSafeInput());
      expect(low.classificationLabel).toBe('Low');
      expect(low.classificationMeaning).toBe('No significant issues detected');

      const moderate = evaluatePaymentRisk(
        makeSafeInput({ walletControlStatus: 'unverified', walletNetwork: 'Base Sepolia', purpose: '' })
      );
      expect(moderate.classificationLabel).toBe('Moderate');
      expect(moderate.classificationMeaning).toBe('Some details require attention');

      const high = evaluatePaymentRisk(
        makeSafeInput({ recipientAddress: '0x123', isExpiredRequest: true, amount: '0.001', purpose: '' })
      );
      expect(high.classificationLabel).toBe('High');
      expect(high.classificationMeaning).toBe('Significant warning signs detected');

      const critical = evaluatePaymentRisk(
        makeSafeInput({
          walletControlStatus: 'mismatch',
          isAlteredRequest: true,
          isDuplicateAttempt: true,
          amount: '15000',
        })
      );
      expect(critical.classificationLabel).toBe('Critical');
      expect(critical.classificationMeaning).toBe('A serious issue requires stopping and investigating');
    });

    it('identifies which payment detail triggered every finding and provides a recommended action', () => {
      const report = evaluatePaymentRisk(
        makeSafeInput({
          walletControlStatus: 'unverified',
          isExpiredRequest: true,
          isDuplicateAttempt: true,
          amount: '12000',
          walletNetwork: 'Polygon Amoy',
          tokenContractAddress: '0x3333333333333333333333333333333333333333',
          purpose: 'no',
        })
      );

      for (const finding of report.findings) {
        expect(finding.triggeredBy).toBeTruthy();
        expect(finding.detail.trim().length).toBeGreaterThan(10);
        expect(finding.whyItMatters.trim().length).toBeGreaterThan(10);
        expect(finding.recommendedAction.trim().length).toBeGreaterThan(10);
      }

      expect(report.findings.find((f) => f.code === 'VERY_HIGH_VALUE_TRANSFER')?.triggeredBy).toBe('amount');
      expect(report.findings.find((f) => f.code === 'NETWORK_MISMATCH')?.triggeredBy).toBe('network');
      expect(report.findings.find((f) => f.code === 'SUSPICIOUS_TOKEN_CONTRACT')?.triggeredBy).toBe('token_contract');
      expect(report.findings.find((f) => f.code === 'INCONSISTENT_PAYMENT_INFO')?.triggeredBy).toBe('payment_purpose');
    });

    it('distinguishes confirmed mismatches from suspicious indicators and verified signals', () => {
      const report = evaluatePaymentRisk(
        makeSafeInput({
          walletControlStatus: 'mismatch',
          isAlteredRequest: true,
          amount: '15000',
          hasSuspiciousInteractions: true,
        })
      );

      expect(report.findings.find((f) => f.code === 'ADDRESS_MISMATCH')?.indicatorType).toBe('confirmed_mismatch');
      expect(report.findings.find((f) => f.code === 'ALTERED_PAYMENT_REQUEST')?.indicatorType).toBe('confirmed_mismatch');
      expect(report.findings.find((f) => f.code === 'VERY_HIGH_VALUE_TRANSFER')?.indicatorType).toBe('suspicious_indicator');
      expect(report.findings.find((f) => f.code === 'SUSPICIOUS_WALLET_INTERACTIONS')?.indicatorType).toBe('suspicious_indicator');

      const clean = evaluatePaymentRisk(makeSafeInput());
      expect(clean.findings.find((f) => f.code === 'RECIPIENT_VERIFIED')?.indicatorType).toBe('verified_signal');
      expect(clean.findings.find((f) => f.code === 'REQUEST_INTEGRITY_INTACT')?.indicatorType).toBe('verified_signal');
    });

    it('never labels unknown or unverified wallets as scammers', () => {
      const report = evaluatePaymentRisk(makeSafeInput({ walletControlStatus: 'unverified' }));
      const fullText = [
        report.summary,
        report.safetyDisclaimer,
        ...report.findings.flatMap((f) => [f.label, f.detail, f.whyItMatters, f.recommendedAction]),
      ]
        .join(' ')
        .toLowerCase();

      expect(fullText).not.toContain('scammer');
      expect(fullText).not.toContain('fraudster');
      expect(fullText).toContain('not proof of malicious intent');
    });

    it('does not treat wallet age or transaction volume as proof of legitimacy or lower risk scores', () => {
      const baseline = evaluatePaymentRisk(
        makeSafeInput({ walletControlStatus: 'unverified', purpose: '' })
      );
      const agedHighVolume = evaluatePaymentRisk(
        makeSafeInput({
          walletControlStatus: 'unverified',
          purpose: '',
          walletAgeDays: 1825,
          walletTransactionCount: 50000,
        })
      );

      expect(agedHighVolume.riskScore).toBe(baseline.riskScore);
      expect(agedHighVolume.riskLevel).toBe(baseline.riskLevel);
      expect(agedHighVolume.safetyDisclaimer.toLowerCase()).toContain('wallet age');
      expect(agedHighVolume.safetyDisclaimer.toLowerCase()).toContain('transaction volume');
    });

    it('never guarantees that a low-risk transaction is safe', () => {
      const clean = evaluatePaymentRisk(makeSafeInput());
      expect(clean.riskLevel).toBe('low');
      expect(clean.summary.toLowerCase()).toContain('does not guarantee safety');
      expect(clean.safetyDisclaimer.toLowerCase()).toContain('does not guarantee a transaction is safe');
    });

    it('retrieves the persisted risk assessment audit trail via listRiskAssessments', async () => {
      const rows = [
        {
          id: 'ra-2',
          user_id: 'user-1',
          payment_request_id: 'req-1',
          transaction_id: null,
          recipient_address: VALID_RECIPIENT,
          network: 'Testnet',
          risk_score: 0,
          risk_level: 'low',
          summary: 'Low: No significant issues detected.',
          factors: [],
          created_at: '2026-11-13T12:05:00.000Z',
        },
        {
          id: 'ra-1',
          user_id: 'user-1',
          payment_request_id: 'req-1',
          transaction_id: null,
          recipient_address: VALID_RECIPIENT,
          network: 'Testnet',
          risk_score: 14,
          risk_level: 'medium',
          summary: 'Moderate: Some details require attention.',
          factors: [],
          created_at: '2026-11-13T12:00:00.000Z',
        },
      ];

      const eqMock = vi.fn().mockResolvedValue({ data: rows, error: null });
      const limitMock = vi.fn(() => ({ eq: eqMock }));
      const orderMock = vi.fn(() => ({ limit: limitMock }));
      const selectMock = vi.fn(() => ({ order: orderMock }));
      vi.spyOn(supabase, 'from').mockReturnValue({ select: selectMock } as never);

      const history = await listRiskAssessments('req-1');
      expect(history).toHaveLength(2);
      expect(history[0].id).toBe('ra-2');
      expect(eqMock).toHaveBeenCalledWith('payment_request_id', 'req-1');
    });
  });
});
