import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { handleCors } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/auth.ts';
import { AppError, errorResponse, jsonResponse } from '../_shared/errors.ts';
import {
  TOKEN_DECIMALS,
  optionalString,
  parseExactAmount,
  parseJsonBody,
  requireAddress,
  requireNetwork,
  requireToken,
  requireUuid,
} from '../_shared/validation.ts';
import { recordAuditLog } from '../_shared/logger.ts';
import { enforceRateLimit } from '../_shared/rateLimit.ts';

type RiskCategory =
  | 'wallet_verification'
  | 'request_integrity'
  | 'duplicate_activity'
  | 'amount_anomaly'
  | 'network_compatibility'
  | 'token_contract'
  | 'behavioral_context';

interface RiskFinding {
  code: string;
  category: RiskCategory;
  label: string;
  weight: number;
  pointsAwarded: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  detail: string;
  whyItMatters: string;
}

const CANONICAL_CONTRACTS: Record<string, Record<string, string>> = {
  Testnet: {
    USDT: '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06',
    USDC: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    WETH: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
  },
  'Base Sepolia': {
    USDC: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  },
  'Polygon Amoy': {
    USDC: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582',
  },
};

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { user, adminClient } = await requireAuth(req);
    await enforceRateLimit(adminClient, user.id, 'risk_assessment', 40, 60);

    if (req.method !== 'POST') {
      throw new AppError(405, 'METHOD_NOT_ALLOWED', 'Use POST for risk-assessment.');
    }

    const body = await parseJsonBody<Record<string, unknown>>(req);
    const recipientAddress = requireAddress(body.recipientAddress, 'recipientAddress');
    const network = requireNetwork(body.network);
    const tokenSymbol = requireToken(body.tokenSymbol ?? 'USDT');
    const decimals = TOKEN_DECIMALS[tokenSymbol] ?? 6;
    const { normalizedDecimal, atomic } = parseExactAmount(body.amount ?? '1', decimals);
    const paymentRequestId = body.paymentRequestId
      ? requireUuid(body.paymentRequestId, 'paymentRequestId')
      : null;
    const purpose = optionalString(body.purpose, 'purpose', 500) ?? '';
    const walletNetwork = optionalString(body.walletNetwork, 'walletNetwork', 50);
    const tokenContractAddress = optionalString(
      body.tokenContractAddress,
      'tokenContractAddress',
      128
    );

    const findings: RiskFinding[] = [];
    const weights: Record<RiskCategory, number> = {
      wallet_verification: 25,
      request_integrity: 20,
      duplicate_activity: 15,
      amount_anomaly: 15,
      network_compatibility: 10,
      token_contract: 10,
      behavioral_context: 5,
    };
    const breakdown: Record<RiskCategory, number> = {
      wallet_verification: 0,
      request_integrity: 0,
      duplicate_activity: 0,
      amount_anomaly: 0,
      network_compatibility: 0,
      token_contract: 0,
      behavioral_context: 0,
    };

    const add = (f: RiskFinding) => {
      findings.push(f);
      breakdown[f.category] = Math.min(weights[f.category], breakdown[f.category] + f.pointsAwarded);
    };

    // 1. Wallet Verification (25)
    const { data: verifiedWallets } = await adminClient
      .from('wallets')
      .select('id, is_verified')
      .eq('address', recipientAddress)
      .eq('is_verified', true)
      .limit(1);

        let hasRecipientProof = Boolean(verifiedWallets && verifiedWallets.length > 0);
        let hasMismatchProof = false;

        if(paymentRequestId) {
          const { data: reqProofs } = await adminClient
            .from('verification_records')
            .select('status')
            .eq('verification_type', 'recipient_wallet_control')
            .contains('proof_metadata', { payment_request_id: paymentRequestId })
            .order('created_at', { ascending: false })
            .limit(1);

          if (reqProofs?.[0]?.status === 'verified') hasRecipientProof = true;
          if (reqProofs?.[0]?.status === 'mismatch') hasMismatchProof = true;
        }

    if (/^0x0{6,}/i.test(recipientAddress) || recipientAddress.toLowerCase().includes('dead')) {
        add({
          code: 'SUSPICIOUS_BURN_ADDRESS',
          category: 'wallet_verification',
          label: 'Burn or null-like address pattern',
          weight: 25,
          pointsAwarded: 25,
          severity: 'critical',
          detail: `Address ${recipientAddress} matches a high-risk null/burn pattern.`,
          whyItMatters: 'Funds sent to a burn or zero-prefixed address are unrecoverable.',
        });
      } else if (hasMismatchProof) {
        add({
          code: 'ADDRESS_MISMATCH',
          category: 'wallet_verification',
          label: 'Mismatched recipient wallet signature',
          weight: 25,
          pointsAwarded: 25,
          severity: 'critical',
          detail: 'Signed wallet-control proof does not match the destination address.',
          whyItMatters: 'Address substitution is a common phishing and interception attack.',
        });
      } else if (hasRecipientProof) {
        add({
          code: 'RECIPIENT_VERIFIED',
          category: 'wallet_verification',
          label: 'Recipient wallet control verified',
          weight: 25,
          pointsAwarded: 0,
          severity: 'low',
          detail: 'Recipient proved cryptographic control of this address.',
          whyItMatters: 'Confirms key control (though not real-world identity).',
        });
      } else {
          add({
            code: 'UNVERIFIED_EXTERNAL_ADDRESS',
            category: 'wallet_verification',
            label: 'External or unverified address',
            weight: 25,
            pointsAwarded: 14,
            severity: 'medium',
            detail: 'No Word wallet-control proof exists for this recipient address.',
            whyItMatters: 'Verify the destination address out-of-band before sending.',
          });
        }

        // 2. Request Integrity (20)
        if (paymentRequestId) {
          const { data: reqRow } = await adminClient
            .from('payment_requests')
            .select('amount_atomic, token_symbol, network, recipient_address, status, expires_at')
            .eq('id', paymentRequestId)
            .maybeSingle();

            if (!reqRow) {
              add({
                code: 'REQUEST_NOT_FOUND',
                category: 'request_integrity',
                label: 'Referenced payment request missing',
                weight: 20,
                pointsAwarded: 20,
                severity: 'critical',
                detail: 'The payment request ID could not be found in Word records.',
                whyItMatters: 'Paying an unverified reference risks sending to a spoofed request.',
              });
            } else {
              const altered =
                String(reqRow.amount_atomic) !== atomic ||
                reqRow.token_symbol !== tokenSymbol ||
                reqRow.network !== network ||
                reqRow.recipient_address.toLowerCase() !== recipientAddress.toLowerCase();

              const expired =
                reqRow.status === 'expired' ||
                Boolean(reqRow.expires_at && new Date(reqRow.expires_at).getTime() <= Date.now());

              if (altered) {
                add({
                  code: 'ALTERED_PAYMENT_REQUEST',
                  category: 'request_integrity',
                  label: 'Altered payment request detected',
                  weight: 20,
                  pointsAwarded: 20,
                  severity: 'critical',
                  detail: 'Payment parameters differ from the authoritative stored payment request.',
                  whyItMatters: 'Tampered links or QR codes can redirect funds or inflate amounts.',
                });
              } else if (expired) {
                add({
                  code: 'EXPIRED_PAYMENT_REQUEST',
                  category: 'request_integrity',
                  label: 'Expired payment request',
                  weight: 20,
                  pointsAwarded: 18,
                  severity: 'high',
                  detail: 'This payment request has passed its expiry time.',
                  whyItMatters: 'Expired requests may reflect stale pricing or terms.',
                });
              }
            }
          }

          // 3. Duplicate Activity (15)
          let isDuplicate = false;
          if (paymentRequestId) {
            const { data: dupReq } = await adminClient
              .from('transactions')
              .select('id, status')
              .eq('payment_request_id', paymentRequestId)
              .in('status', ['pending', 'processing', 'confirmed'])
              .limit(1);
            if (dupReq && dupReq.length > 0) isDuplicate = true;
          } else {
            const recentWindow = new Date(Date.now() - 120 * 1000).toISOString();
            const { data: dupRecent } = await adminClient
              .from('transactions')
              .select('id')
              .eq('sender_id', user.id)
              .eq('recipient_address', recipientAddress)
              .eq('amount_atomic', atomic)
              .eq('token_symbol', tokenSymbol)
              .eq('network', network)
              .in('status', ['pending', 'processing'])
              .gte('created_at', recentWindow)
              .limit(1);
            if (dupRecent && dupRecent.length > 0) isDuplicate = true;
          }

          if (isDuplicate) {
            add({
              code: 'DUPLICATE_PAYMENT_ATTEMPT',
              category: 'duplicate_activity',
              label: 'Duplicate payment attempt detected',
              weight: 15,
              pointsAwarded: 15,
              severity: 'high',
              detail: 'A pending, processing, or confirmed payment already exists for this request.',
              whyItMatters: 'Proceeding could cause an accidental double payment.',
            });
          }

          // 4. Amount Anomaly (15)
          const [wholePart] = normalizedDecimal.split('.');
          const wholeNum = BigInt(wholePart);
              if(wholeNum >= 10000n) {
              add({
                code: 'VERY_HIGH_VALUE_TRANSFER',
                category: 'amount_anomaly',
                label: 'Unusually large transfer amount',
                weight: 15,
                pointsAwarded: 15,
                severity: 'high',
                detail: `Amount (${normalizedDecimal} ${tokenSymbol}) is unusually large for a P2P transfer.`,
                whyItMatters: 'On-chain transfers are irreversible; verify all details twice.',
              });
            } else if (wholeNum >= 1000n) {
              add({
                code: 'HIGH_VALUE_TRANSFER',
                category: 'amount_anomaly',
                label: 'High-value transfer threshold',
                weight: 15,
                pointsAwarded: 8,
                severity: 'medium',
                detail: `Amount (${normalizedDecimal} ${tokenSymbol}) exceeds standard small-payment threshold.`,
                whyItMatters: 'Confirm recipient control and terms for elevated amounts.',
              });
              }

    // 5. Network Compatibility (10)
    if (walletNetwork && walletNetwork !== network) {
                add({
                  code: 'NETWORK_MISMATCH',
                  category: 'network_compatibility',
                  label: 'Wallet and request network mismatch',
                  weight: 10,
                  pointsAwarded: 8,
                  severity: 'medium',
                  detail: `Wallet is on ${walletNetwork}, while request specifies ${network}.`,
                  whyItMatters: 'Ensure your wallet switches to the matching chain before signing.',
                });
              }

                  // 6. Token Contract Verification (10)
                  const expectedContract = CANONICAL_CONTRACTS[network]?.[tokenSymbol];
                  if(
                    tokenContractAddress &&
                  expectedContract &&
                  tokenContractAddress.toLowerCase() !== expectedContract.toLowerCase()
                ) {
                  add({
                    code: 'SUSPICIOUS_TOKEN_CONTRACT',
                    category: 'token_contract',
                    label: 'Suspicious or non-canonical token contract',
                    weight: 10,
                    pointsAwarded: 10,
                    severity: 'critical',
                    detail: `Contract ${tokenContractAddress} does not match canonical ${tokenSymbol} on ${network}.`,
                    whyItMatters: 'Spoofed token contracts can impersonate USDT/USDC.',
                  });
                }

                // 7. Behavioral Context & Suspicious Interactions (5)
                const { count: recipientDisputes } = await adminClient
                  .from('disputes')
                  .select('id', { count: 'exact', head: true })
                  .in('status', ['open', 'evidence_submitted', 'under_review']);

                if ((recipientDisputes ?? 0) > 5) {
                  add({
                    code: 'SUSPICIOUS_WALLET_INTERACTIONS',
                    category: 'behavioral_context',
                    label: 'Elevated dispute activity detected',
                    weight: 5,
                    pointsAwarded: 5,
                    severity: 'medium',
                    detail: 'Active dispute volume in workspace records is elevated.',
                    whyItMatters: 'High dispute rates indicate elevated counterparty caution.',
                  });
                } else if (purpose.length > 0 && purpose.length < 4) {
                  add({
                    code: 'INCONSISTENT_PAYMENT_INFO',
                    category: 'behavioral_context',
                    label: 'Vague payment description',
                    weight: 5,
                    pointsAwarded: 4,
                    severity: 'low',
                    detail: 'Payment purpose is very brief.',
                    whyItMatters: 'Clear purpose notes protect both parties in case of a dispute.',
                  });
                }

                const score = Math.min(
                  100,
                  Object.values(breakdown).reduce((sum, v) => sum + v, 0)
                );
                const riskLevel =
                score >= 75 ? 'critical' : score >= 50 ? 'high' : score >= 25 ? 'medium' : 'low';

                const summary =
                riskLevel === 'critical'
                  ? 'Critical risk indicators detected. Resolve flagged issues before proceeding.'
                  : riskLevel === 'high'
                    ? 'High risk detected. Review every flagged reason carefully before approving.'
                    : riskLevel === 'medium'
                      ? 'Moderate caution advised. Verify recipient control and payment terms before signing.'
                      : 'Low risk detected. Wallet, request integrity, amount, token, and network checks look clean.';

                const assessedAt = new Date().toISOString();
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
                    factors: findings,
                    created_at: assessedAt,
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
                  metadata: { riskScore: score, riskLevel, recipientAddress, categoryBreakdown: breakdown },
                });

                return jsonResponse(
                  { assessment, categoryBreakdown: breakdown, assessedAt },
                  201,
                  req
                );
              } catch (err) {
                return errorResponse(err, req);
              }
            });
