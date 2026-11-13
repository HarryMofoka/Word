import { isAddress } from 'ethers';
import { isSupportedNetworkName, validateTokenCompatibility } from '../config/blockchain';
import { evaluatePaymentRisk, type RiskIntelligenceReport } from './riskIntelligenceService';

export type OnDeviceRuntimeKind = 'qvac-native' | 'browser-webgpu' | 'local-deterministic';
export type OnDeviceModelStatus = 'ready' | 'model_unavailable' | 'unsupported_device' | 'error';

export interface OnDeviceModelSpec {
  id: string;
  qvacConstant: string;
  label: string;
  quantization: string;
  approxSizeMb: number;
  minRamGb: number;
  recommendedFor: string;
}

export const ON_DEVICE_MODELS: OnDeviceModelSpec[] = [
  {
    id: 'llama-3.2-1b-instruct-q4_0',
    qvacConstant: 'LLAMA_3_2_1B_INST_Q4_0',
    label: 'Llama 3.2 1B Instruct (Q4_0)',
    quantization: 'Q4_0 GGUF',
    approxSizeMb: 770,
    minRamGb: 4,
    recommendedFor: 'Desktop & modern mobile devices running QVAC Bare/Node runtime',
  },
  {
    id: 'qwen-2.5-0.5b-instruct-q4_0',
    qvacConstant: 'QWEN_2_5_0_5B_INST_Q4_0',
    label: 'Qwen 2.5 0.5B Instruct (Q4_0)',
    quantization: 'Q4_0 GGUF',
    approxSizeMb: 400,
    minRamGb: 2,
    recommendedFor: 'Memory-constrained devices (2–4 GB RAM)',
  },
  {
    id: 'word-local-deterministic-v1',
    qvacConstant: 'LOCAL_DETERMINISTIC_PARSER',
    label: 'Word Local Deterministic Parser',
    quantization: 'Zero-weight TS',
    approxSizeMb: 0,
    minRamGb: 0.5,
    recommendedFor: 'Unsupported devices, offline browsers, or unavailable QVAC model weights',
  },
];

export interface DeviceEnvironmentProbe {
  platform?: string;
  memoryGb?: number | null;
  logicalCores?: number | null;
  hasWebGpu?: boolean;
  hasWasm?: boolean;
  hasQvacWorker?: boolean;
  qvacFitVerdict?: 'likely-fits' | 'unlikely-fits' | 'unknown';
  modelAvailable?: boolean;
}

export interface DeviceCompatibilityReport {
  supportedForLlm: boolean;
  status: OnDeviceModelStatus;
  runtime: OnDeviceRuntimeKind;
  recommendedModel: OnDeviceModelSpec;
  reason: string;
  deviceSummary: {
    platform: string;
    memoryGb: number | null;
    logicalCores: number | null;
    hasWebGpu: boolean;
    hasWasm: boolean;
    hasQvacWorker: boolean;
  };
}

export interface OnDevicePerformanceMetrics {
  modelId: string;
  modelLoadTimeMs: number;
  inferenceLatencyMs: number;
  tokensGenerated: number;
  tokensPerSecond: number;
  memoryBeforeBytes: number;
  memoryAfterLoadBytes: number;
  peakMemoryDeltaBytes: number;
}

export const ASSISTANT_PERMISSIONS = Object.freeze({
  canSignTransactions: false,
  canSubmitTransactions: false,
  canOverrideRiskWarnings: false,
  requiresExplicitUserConfirmation: true,
} as const);

export type RestrictedAssistantAction =
  | 'sign_transaction'
  | 'submit_transaction'
  | 'override_risk_warning';

export function assertAssistantActionAllowed(action: RestrictedAssistantAction | 'draft_proposal'): void {
  if (action === 'sign_transaction') {
    throw new Error('Assistant safety policy: the AI assistant cannot sign transactions.');
  }
  if (action === 'submit_transaction') {
    throw new Error('Assistant safety policy: the AI assistant cannot independently submit transactions.');
  }
  if (action === 'override_risk_warning') {
    throw new Error('Assistant safety policy: the AI assistant cannot override risk warnings.');
  }
}

export interface PromptInjectionCheck {
  detected: boolean;
  matchedPatterns: string[];
}

const INJECTION_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  { label: 'instruction_override', regex: /\b(ignore|disregard|forget)\s+(all\s+)?(previous|prior|system)\s+instructions\b/i },
  { label: 'auto_sign_request', regex: /\b(auto[- ]?sign|sign\s+automatically|sign\s+without\s+(asking|approval|confirmation))\b/i },
  { label: 'bypass_confirmation', regex: /\b(bypass|skip|disable)\s+(user\s+)?(approval|confirmation|verification|risk)\b/i },
  { label: 'override_risk', regex: /\b(override|suppress|hide)\s+(risk|warning|warnings|alert)\b/i },
  { label: 'executable_markup', regex: /(<script\b|javascript:|eval\s*\(|new\s+Function\s*\()/i },
];

export function detectPromptInjection(text: string): PromptInjectionCheck {
  const matchedPatterns = INJECTION_PATTERNS.filter((p) => p.regex.test(text)).map((p) => p.label);
  return {
    detected: matchedPatterns.length > 0,
    matchedPatterns,
  };
}

export function sanitizeUntrustedPaymentDescription(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/javascript:/gi, '')
    .replace(/\b(eval|Function)\s*\([^)]*\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface StructuredPaymentProposal {
  recipientName: string;
  recipientAddress: string;
  amount: string;
  tokenSymbol: string;
  network: string;
  purpose: string;
  requiresExplicitApproval: true;
}

export interface ProposalValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface AssistantActionConfirmation {
  did: string[];
  didNot: string[];
}

export interface AssistantPaymentHandoff {
  id: string;
  amount: string;
  token: string;
  network: string;
  recipientName: string;
  recipientAddress: string;
  description: string;
  status: 'open';
  preparedByAssistant: true;
  requiresExplicitApproval: true;
  actionConfirmation: AssistantActionConfirmation;
}

export interface LocalPaymentInterpretation {
  amount: string | null;
  token: string | null;
  network: string | null;
  recipientAddress: string | null;
  recipientName: string | null;
  purpose: string | null;
  intentSummary: string;
  missingFields: string[];
  clarifyingQuestions: string[];
  proposal: StructuredPaymentProposal | null;
  proposalValidation: ProposalValidationResult;
  riskExplanation: RiskIntelligenceReport;
  actionConfirmation: AssistantActionConfirmation;
  confidence: 'high' | 'medium' | 'low';
  uncertaintyReason: string | null;
  securityWarnings: string[];
  permissions: typeof ASSISTANT_PERMISSIONS;
  requiresExplicitApproval: true;
  approvalPrompt: string;
  processedLocally: true;
  runtimeUsed: OnDeviceRuntimeKind;
  status: OnDeviceModelStatus;
  fallbackNotice?: string;
  nonAiFallbackAvailable: true;
  dataLeftDevice: string[];
  metrics: OnDevicePerformanceMetrics;
}

export const QVAC_DATA_BOUNDARY_SPEC = {
  staysOnDevice: [
    'Wallet 12/24-word recovery phrases and derived private keys',
    'Raw natural-language prompts and local QVAC chat context',
    'On-device model weights (GGUF) and KV cache in local RAM/VRAM',
    'Device hardware capability probes (CPU cores, RAM, GPU driver info)',
  ],
  neverTransmitted: ['seedPhrase', 'mnemonic', 'privateKey', 'rawPrompt', 'localContext'],
  leavesDeviceOnlyOnExplicitAction: [
    {
      action: 'Creating or fetching a payment request',
      destination: 'Word Supabase Edge Functions',
      fields: ['amount', 'tokenSymbol', 'network', 'recipientAddress', 'recipientName', 'description'],
    },
    {
      action: 'Saving a risk assessment audit record',
      destination: 'Word Supabase risk_assessments table',
      fields: ['recipient_address', 'network', 'risk_score', 'risk_level', 'summary', 'factors'],
    },
    {
      action: 'Approving and broadcasting an on-chain payment',
      destination: 'Configured testnet RPC node',
      fields: ['signedTransactionHex'],
    },
  ],
} as const;

export function detectBrowserEnvironment(): DeviceEnvironmentProbe {
  const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { deviceMemory?: number; gpu?: unknown }) : undefined;
  return {
    platform: nav?.platform ?? (typeof process !== 'undefined' ? process.platform : 'unknown'),
    memoryGb: typeof nav?.deviceMemory === 'number' ? nav.deviceMemory : null,
    logicalCores: typeof nav?.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : null,
    hasWebGpu: Boolean(nav?.gpu),
    hasWasm: typeof WebAssembly === 'object',
    hasQvacWorker: false,
    modelAvailable: false,
  };
}

export function checkOnDeviceAiCompatibility(
  probe: DeviceEnvironmentProbe = detectBrowserEnvironment()
): DeviceCompatibilityReport {
  const memoryGb = probe.memoryGb ?? null;
  const logicalCores = probe.logicalCores ?? null;
  const hasWebGpu = Boolean(probe.hasWebGpu);
  const hasWasm = probe.hasWasm ?? true;
  const hasQvacWorker = Boolean(probe.hasQvacWorker);
  const modelAvailable = probe.modelAvailable ?? true;

  const deviceSummary = {
    platform: probe.platform ?? 'unknown',
    memoryGb,
    logicalCores,
    hasWebGpu,
    hasWasm,
    hasQvacWorker,
  };

  if (!modelAvailable && hasQvacWorker) {
    return {
      supportedForLlm: false,
      status: 'model_unavailable',
      runtime: 'local-deterministic',
      recommendedModel: ON_DEVICE_MODELS[2],
      reason:
        'Configured QVAC model weights are not cached or reachable locally; falling back to deterministic on-device parsing.',
      deviceSummary,
    };
  }

  if (probe.qvacFitVerdict === 'unlikely-fits' || (memoryGb !== null && memoryGb < 2)) {
    return {
      supportedForLlm: false,
      status: 'unsupported_device',
      runtime: 'local-deterministic',
      recommendedModel: ON_DEVICE_MODELS[2],
      reason:
        'Available device memory is below the 2 GB minimum required for quantized LLM weights; using zero-footprint local parser.',
      deviceSummary,
    };
  }

  if (hasQvacWorker) {
    const chosen =
      memoryGb !== null && memoryGb < 4 ? ON_DEVICE_MODELS[1] : ON_DEVICE_MODELS[0];
    return {
      supportedForLlm: true,
      status: 'ready',
      runtime: 'qvac-native',
      recommendedModel: chosen,
      reason: `QVAC native runtime available; ${chosen.label} fits within local device memory.`,
      deviceSummary,
    };
  }

  if (hasWebGpu && (memoryGb === null || memoryGb >= 4)) {
    return {
      supportedForLlm: true,
      status: 'ready',
      runtime: 'browser-webgpu',
      recommendedModel: ON_DEVICE_MODELS[1],
      reason: 'Browser WebGPU detected; lightweight quantized local execution supported.',
      deviceSummary,
    };
  }

  if (!hasWasm && !hasWebGpu) {
    return {
      supportedForLlm: false,
      status: 'unsupported_device',
      runtime: 'local-deterministic',
      recommendedModel: ON_DEVICE_MODELS[2],
      reason:
        'Neither QVAC native runtime, WebGPU, nor WebAssembly is available on this device; using deterministic local parser.',
      deviceSummary,
    };
  }

  return {
    supportedForLlm: false,
    status: 'model_unavailable',
    runtime: 'local-deterministic',
    recommendedModel: ON_DEVICE_MODELS[2],
    reason:
      'Browser sandbox does not expose the native QVAC Bare worker; using local deterministic payment interpreter with zero cloud LLM calls.',
    deviceSummary,
  };
}

export function createPerformanceMetrics(params: {
  modelId: string;
  modelLoadTimeMs: number;
  inferenceLatencyMs: number;
  tokensGenerated: number;
  memoryBeforeBytes: number;
  memoryAfterLoadBytes: number;
}): OnDevicePerformanceMetrics {
  const safeLatencySec = Math.max(params.inferenceLatencyMs / 1000, 0.001);
  return {
    modelId: params.modelId,
    modelLoadTimeMs: Math.max(0, Math.round(params.modelLoadTimeMs)),
    inferenceLatencyMs: Math.max(0, Math.round(params.inferenceLatencyMs)),
    tokensGenerated: Math.max(0, Math.round(params.tokensGenerated)),
    tokensPerSecond: Number((Math.max(0, params.tokensGenerated) / safeLatencySec).toFixed(2)),
    memoryBeforeBytes: Math.max(0, params.memoryBeforeBytes),
    memoryAfterLoadBytes: Math.max(0, params.memoryAfterLoadBytes),
    peakMemoryDeltaBytes: Math.max(0, params.memoryAfterLoadBytes - params.memoryBeforeBytes),
  };
}

function normalizeParsedNetwork(rawText: string): string | null {
  const lower = rawText.toLowerCase();
  if (lower.includes('base sepolia')) return 'Base Sepolia';
  if (lower.includes('polygon amoy') || lower.includes('amoy')) return 'Polygon Amoy';
  if (lower.includes('sepolia') || lower.includes('testnet')) return 'Testnet';
  return null;
}

export function validateStructuredPaymentProposal(
  proposal: Partial<StructuredPaymentProposal> | null
): ProposalValidationResult {
  if (!proposal) {
    return {
      valid: false,
      errors: ['Payment proposal is incomplete and cannot be submitted yet.'],
      warnings: [],
    };
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  if (!proposal.recipientAddress || !isAddress(proposal.recipientAddress)) {
    errors.push('Recipient address is missing or not a valid EVM address.');
  } else if (/^0x0{6,}/i.test(proposal.recipientAddress) || proposal.recipientAddress.toLowerCase().includes('dead')) {
    warnings.push('Recipient address matches a burn or null-like address pattern.');
  }

  const numericAmount = Number(proposal.amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    errors.push('Payment amount must be a valid positive number.');
  }

  if (!proposal.network || !isSupportedNetworkName(proposal.network)) {
    errors.push(`Network "${proposal.network ?? ''}" is not supported.`);
  }

  if (!proposal.tokenSymbol) {
    errors.push('Token symbol is required.');
  } else if (proposal.network && isSupportedNetworkName(proposal.network)) {
    const compat = validateTokenCompatibility(proposal.tokenSymbol, proposal.network);
    if (!compat.compatible) {
      errors.push(compat.reason ?? `${proposal.tokenSymbol} is not supported on ${proposal.network}.`);
    }
  }

  if (!proposal.purpose || proposal.purpose.trim().length < 3) {
    errors.push('Payment purpose must be at least 3 characters.');
  }

  if (proposal.requiresExplicitApproval !== true) {
    errors.push('Proposal must require explicit user approval before execution.');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function interpretPaymentRequestLocally(
  rawInput: string,
  probe?: DeviceEnvironmentProbe,
  previousDraft?: Partial<LocalPaymentInterpretation> | null
): LocalPaymentInterpretation {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const compatibility = checkOnDeviceAiCompatibility(probe);
  const text = rawInput.trim();
  const injection = detectPromptInjection(text);
  const securityWarnings: string[] = [];
  if (injection.detected) {
    securityWarnings.push(
      `Prompt injection or unsafe instruction pattern detected (${injection.matchedPatterns.join(', ')}). Assistant permissions remain locked: signing, auto-submission, and risk overrides are disabled.`
    );
  }

  const allAmounts = Array.from(
    text.matchAll(/(?:^|\s)(-?\d+(?:\.\d+)?)\s*(usdt|usdc|eth|weth|matic)\b/gi)
  );
  const amountTokenMatch = allAmounts[0] ?? null;
  const amount = (amountTokenMatch ? amountTokenMatch[1] : null) ?? previousDraft?.amount ?? null;
  const token =
    (amountTokenMatch ? amountTokenMatch[2].toUpperCase() : null) ?? previousDraft?.token ?? null;

  const allAddresses = text.match(/0x[a-fA-F0-9]{40}/g) ?? [];
  const addressMatch = allAddresses[0] ?? null;
  const recipientAddress =
    (addressMatch && isAddress(addressMatch) ? addressMatch : null) ??
    previousDraft?.recipientAddress ??
    null;

  const network = normalizeParsedNetwork(text) ?? previousDraft?.network ?? null;

  const toNameMatch = text.match(
    /\bto\s+([A-Z][a-zA-Z0-9._-]*(?:\s+[A-Z][a-zA-Z0-9._-]*)?)(?=\s*\(|\s+on\b|\s+for\b|$)/
  );
  const payNameMatch = text.match(
    /^(?:pay|send|transfer)\s+([A-Z][a-zA-Z0-9._-]*(?:\s+[A-Z][a-zA-Z0-9._-]*)?)\s+(?=\d)/i
  );
  const rawName = toNameMatch?.[1] ?? payNameMatch?.[1] ?? null;
  const recipientName =
    (rawName && !rawName.startsWith('0x') ? sanitizeUntrustedPaymentDescription(rawName) : null) ??
    previousDraft?.recipientName ??
    null;

  const purposeMatch = text.match(/\bfor\s+([^.!?\n]+?)(?=\s*$|[.!?])/i);
  const purpose =
    (purposeMatch ? sanitizeUntrustedPaymentDescription(purposeMatch[1]) : null) ??
    previousDraft?.purpose ??
    null;

  const missingFields: string[] = [];
  const clarifyingQuestions: string[] = [];

  if (!amount) {
    missingFields.push('amount');
    clarifyingQuestions.push('How much would you like to send?');
  }
  if (!token) {
    missingFields.push('token');
    clarifyingQuestions.push('Which token should be sent (for example, USDT, USDC, or ETH)?');
  }
  if (!recipientAddress) {
    missingFields.push('recipientAddress');
    clarifyingQuestions.push(
      recipientName
        ? `What is the 0x wallet address for ${recipientName}?`
        : "What is the recipient's 0x wallet address?"
    );
  }
  if (!network) {
    missingFields.push('network');
    clarifyingQuestions.push(
      'Which network should this payment use (Testnet / Sepolia, Base Sepolia, or Polygon Amoy)?'
    );
  }
  if (!purpose) {
    missingFields.push('purpose');
    clarifyingQuestions.push(
      'What is the purpose of this payment (for example, "Laptop purchase" or "Invoice #42")?'
    );
  }

  const proposal: StructuredPaymentProposal | null =
    missingFields.length === 0 && amount && token && recipientAddress && network && purpose
      ? {
          recipientName: recipientName ?? 'Recipient',
          recipientAddress,
          amount,
          tokenSymbol: token,
          network,
          purpose,
          requiresExplicitApproval: true,
        }
      : null;

  const proposalValidation = validateStructuredPaymentProposal(proposal);

  const riskExplanation = evaluatePaymentRisk({
    recipientAddress: recipientAddress ?? '',
    recipientName: recipientName ?? undefined,
    amount: amount ?? '0',
    tokenSymbol: token ?? 'USDT',
    network: network ?? 'Testnet',
    purpose: purpose ?? '',
    walletControlStatus: 'unverified',
  });

  const intentSummary = `Intent: Send ${amount ?? '?'} ${token ?? '?'} to ${
    recipientName ?? recipientAddress ?? 'unspecified recipient'
  }${network ? ` on ${network}` : ''}${purpose ? ` for "${purpose}"` : ''}.`;

  const actionConfirmation: AssistantActionConfirmation = {
    did: [
      'Parsed your payment instruction locally on-device',
      'Identified missing details and risk indicators',
      proposal && proposalValidation.valid
        ? 'Prepared a validated structured payment proposal for your review'
        : 'Flagged incomplete or invalid fields before payment preparation',
    ],
    didNot: [
      'Did NOT sign any transaction',
      'Did NOT submit or broadcast any payment',
      'Did NOT access your private keys or recovery phrase',
      'Did NOT override any risk warning',
    ],
  };

  const hasMultipleCandidates = allAmounts.length > 1 || allAddresses.length > 1;
  let confidence: 'high' | 'medium' | 'low' = 'high';
  let uncertaintyReason: string | null = null;

  if (missingFields.length > 0 || !proposalValidation.valid) {
    confidence = 'low';
    uncertaintyReason =
      missingFields.length > 0
        ? `Model is uncertain because required payment details are missing (${missingFields.join(', ')}). Confirm these details manually or use the standard non-AI payment form.`
        : `Model parsed a proposal, but deterministic validation failed (${proposalValidation.errors.join(' ')}).`;
  } else if (hasMultipleCandidates || injection.detected) {
    confidence = 'medium';
    uncertaintyReason = hasMultipleCandidates
      ? 'Multiple amounts or wallet addresses were detected in your prompt; verify that the extracted values match your intent.'
      : 'Unsafe or injection-like phrasing was neutralized; review the extracted fields carefully before confirming.';
  }

  const approvalPrompt =
    proposal && proposalValidation.valid
      ? `Prepared local payment draft: ${amount} ${token} to ${recipientName ?? recipientAddress} (${recipientAddress}) on ${network} for "${purpose}". Explicit approval is required before signing.`
      : proposal && !proposalValidation.valid
        ? `Parsed payment proposal has validation issues: ${proposalValidation.errors.join(' ')}`
        : `Parsed partial request locally (${amount ?? '?'} ${token ?? '?'}). Clarifying questions: ${clarifyingQuestions.join(' ')}`;

  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const approxTokens = approvalPrompt.split(/\s+/).length;

  return {
    amount,
    token,
    network,
    recipientAddress,
    recipientName,
    purpose,
    intentSummary,
    missingFields,
    clarifyingQuestions,
    proposal,
    proposalValidation,
    riskExplanation,
    actionConfirmation,
    confidence,
    uncertaintyReason,
    securityWarnings,
    permissions: ASSISTANT_PERMISSIONS,
    requiresExplicitApproval: true,
    approvalPrompt,
    processedLocally: true,
    runtimeUsed: compatibility.runtime,
    status: compatibility.status,
    fallbackNotice: compatibility.supportedForLlm ? undefined : compatibility.reason,
    nonAiFallbackAvailable: true,
    dataLeftDevice: [],
    metrics: createPerformanceMetrics({
      modelId: compatibility.recommendedModel.id,
      modelLoadTimeMs: 0,
      inferenceLatencyMs: Math.max(1, t1 - t0),
      tokensGenerated: approxTokens,
      memoryBeforeBytes: 0,
      memoryAfterLoadBytes: 0,
    }),
  };
}

export function prepareAssistantPaymentHandoff(
  interpretation: LocalPaymentInterpretation
): AssistantPaymentHandoff {
  assertAssistantActionAllowed('draft_proposal');
  if (!interpretation.proposal || !interpretation.proposalValidation.valid) {
    throw new Error(
      `Cannot hand off incomplete or invalid payment proposal: ${interpretation.proposalValidation.errors.join(' ')}`
    );
  }
  return {
    id: `assistant-draft-${Date.now()}`,
    amount: interpretation.proposal.amount,
    token: interpretation.proposal.tokenSymbol,
    network: interpretation.proposal.network,
    recipientName: interpretation.proposal.recipientName,
    recipientAddress: interpretation.proposal.recipientAddress,
    description: interpretation.proposal.purpose,
    status: 'open',
    preparedByAssistant: true,
    requiresExplicitApproval: true,
    actionConfirmation: interpretation.actionConfirmation,
  };
}

export async function validateProposalWithBackend(
  proposal: StructuredPaymentProposal,
  backendValidator: (p: StructuredPaymentProposal) => Promise<unknown>
): Promise<{ valid: boolean; errors: string[] }> {
  const deterministic = validateStructuredPaymentProposal(proposal);
  if (!deterministic.valid) {
    return { valid: false, errors: deterministic.errors };
  }
  await backendValidator(proposal);
  return { valid: true, errors: [] };
}

export function sanitizeForOutboundSync<T extends Record<string, unknown>>(payload: T): Partial<T> {
  const blocked = new Set<string>(QVAC_DATA_BOUNDARY_SPEC.neverTransmitted);
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!blocked.has(key)) {
      clean[key] = value;
    }
  }
  return clean as Partial<T>;
}

