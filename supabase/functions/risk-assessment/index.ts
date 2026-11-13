import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { handleCors } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/auth.ts';
import { AppError, errorResponse, jsonResponse } from '../_shared/errors.ts';
import {
  TOKEN_DECIMALS,
  parseExactAmount,
  parseJsonBody,
  requireAddress,
  requireNetwork,
  requireToken,
  requireUuid,
} from '../_shared/validation.ts';
import { recordAuditLog } from '../_shared/logger.ts';
import { enforceRateLimit } from '../_shared/rateLimit.ts';

interface RiskFactor {
  code: string;
  label: string;
  severity: 'low' | 'medium' | 'high';
  detail: string;
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { user, adminClient } = await requireAuth(req);
    await enforceRateLimit(adminClient, user.id, 'risk_assessment', 30, 60);

    if (req.method !== 'POST') {
      throw new AppError(405, 'METHOD_NOT_ALLOWED', 'Use POST for risk-assessment.');
    }

    const body = await parseJsonBody<Record<string, unknown>>(req);
    const recipientAddress = requireAddress(body.recipientAddress, 'recipientAddress');
    const network = requireNetwork(body.network);
    const tokenSymbol = requireToken(body.tokenSymbol ?? 'USDT');
    const decimals = TOKEN_DECIMALS[tokenSymbol] ?? 6;
    const { normalizedDecimal } = parseExactAmount(body.amount ?? '1', decimals);
    const paymentRequestId = body.paymentRequestId
      ? requireUuid(body.paymentRequestId, 'paymentRequestId')
      : null;

    const factors: RiskFactor[] = [];
    let score = 12;

    const { data: verifiedWallets } = await adminClient
      .from('wallets')
      .select('id, is_verified')
      .eq('address', recipientAddress)
      .eq('is_verified', true)
      .limit(1);

    if (verifiedWallets && verifiedWallets.length > 0) {
      factors.push({
        code: 'RECIPIENT_VERIFIED',
        label: 'Recipient wallet control verified',
        severity: 'low',
        detail: 'Recipient address has a verified challenge signature on record.',
      });
    } else {
      score += 24;
      factors.push({
        code: 'UNVERIFIED_EXTERNAL_ADDRESS',
        label: 'External or unverified address',
        severity: 'medium',
        detail: 'No prior Word wallet control proof exists for this address. Double-check the address out-of-band.',
      });
    }

    const { count: priorDisputeCount } = await adminClient
      .from('disputes')
      .select('id', { count: 'exact', head: true })
      .in('status', ['open', 'evidence_submitted', 'under_review']);

    if ((priorDisputeCount ?? 0) > 5) {
      score += 10;
    }

    const [wholePart] = normalizedDecimal.split('.');
    const wholeNum = BigInt(wholePart);
    if (wholeNum >= 1000n) {
      score += 20;
      factors.push({
        code: 'HIGH_VALUE_TRANSFER',
        label: 'High-value transfer threshold',
        severity: 'medium',
        detail: `Amount (${normalizedDecimal} ${tokenSymbol}) exceeds standard small-payment threshold.`,
      });
    } else {
      factors.push({
        code: 'STANDARD_VALUE',
        label: 'Standard transfer amount',
        severity: 'low',
        detail: `Amount (${normalizedDecimal} ${tokenSymbol}) is within normal bounds.`,
      });
    }

    if (/^0x0{6,}/i.test(recipientAddress) || recipientAddress.toLowerCase().includes('dead')) {
      score += 45;
      factors.push({
        code: 'SUSPICIOUS_ADDRESS_PATTERN',
        label: 'Suspicious burn or null-like address',
        severity: 'high',
        detail: 'Address matches a high-risk null/burn pattern.',
      });
    }

    score = Math.min(100, score);
    const riskLevel =
      score >= 70 ? 'critical' : score >= 45 ? 'high' : score >= 25 ? 'medium' : 'low';

    const summary =
      riskLevel === 'low'
        ? 'Low risk detected. Address format and transfer bounds look clean.'
        : riskLevel === 'medium'
        ? 'Moderate caution advised. Verify recipient identity and payment terms before signing.'
        : 'Elevated risk detected. Review all factors carefully before proceeding.';

    const { data: assessment, error } = await adminClient
      .from('risk_assessments')
      .insert({
        user_id: user.id,
        payment_request_id: paymentRequestId,
        recipient_address: recipientAddress,
        network,
        risk_score: score,
        risk_level: riskLevel,
        summary,
        factors,
      })
      .select('*')
      .single();

    if (error) {
      throw new AppError(500, 'RISK_PERSIST_FAILED', error.message);
    }

    await recordAuditLog(adminClient, {
      actorUserId: user.id,
      action: 'risk_assessment.created',
      resourceType: 'risk_assessments',
      resourceId: assessment.id,
      metadata: { riskScore: score, riskLevel, recipientAddress },
    });

    return jsonResponse({ assessment }, 201);
  } catch (err) {
    return errorResponse(err);
  }
});

