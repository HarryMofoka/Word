import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import indexHtmlRaw from '../../index.html?raw';
import wordAppSource from '../../src/app-workspace/WordApp.tsx?raw';
import dashboardViewSource from '../../src/app-workspace/components/DashboardView.tsx?raw';
import accountabilityHubSource from '../../src/app-workspace/components/accountability/AccountabilityHub.tsx?raw';
import settingsViewSource from '../../src/app-workspace/components/SettingsView.tsx?raw';
import paymentPayFlowSource from '../../src/app-workspace/components/payments/PaymentPayFlow.tsx?raw';
import { callEdgeFunction } from '../../src/services/apiClient';
import { supabase } from '../../src/lib/supabase';
import { checkOnDeviceAiCompatibility } from '../../src/services/qvacAssistantService';
import {
  createSimulatedProfileWallet,
  deductSimulatedUsdtBalance,
  ensureSimulatedWalletBalance,
  getAdaptiveFrictionPolicy,
  lookupRecipientByAddressOrQuery,
  searchRecipients,
  verifySenderPasskey,
} from '../../src/services/recipientDirectoryService';

const realProcess = (
  globalThis as unknown as {
    process: { getBuiltinModule: (id: string) => unknown };
  }
).process;
const nodeFs = realProcess.getBuiltinModule('node:fs') as typeof import('node:fs');
const nodePath = realProcess.getBuiltinModule('node:path') as typeof import('node:path');
const readCss = (relPath: string) =>
  nodeFs.readFileSync(
    nodePath.resolve(
      realProcess ? (globalThis as unknown as { process: NodeJS.Process }).process.cwd() : '.',
      relPath
    ),
    'utf8'
  );

const globalCssRaw = readCss('src/styles/global.css');
const animationsCssRaw = readCss('src/styles/animations.css');
const workspaceCssRaw = readCss('src/app-workspace/Workspace.css');
const navbarCssRaw = readCss('src/components/navigation/Navbar.css');
const heroCssRaw = readCss('src/components/hero/Hero.css');
const sectionsCssRaw = readCss('src/components/sections/Sections.css');
const footerCssRaw = readCss('src/components/footer/Footer.css');
const pagesCssRaw = readCss('src/components/pages/Pages.css');

describe('Phase 11: UI, Device, and Adaptive Recipient Verification Testing', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
      data: { session: { access_token: 'ui-test-jwt' } as never },
      error: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('1-3. supports desktop, tablet, and mobile layouts across screen sizes', () => {
    expect(indexHtmlRaw).toContain('name="viewport"');
    expect(indexHtmlRaw).toContain('width=device-width, initial-scale=1.0');

    // Tablet & desktop breakpoints
    expect(workspaceCssRaw).toContain('@media (max-width: 960px)');
    expect(workspaceCssRaw).toContain('@media (max-width: 860px)');
    expect(pagesCssRaw).toContain('@media (max-width: 900px)');
    expect(sectionsCssRaw).toContain('@media (max-width: 960px)');
    expect(footerCssRaw).toContain('@media (max-width: 820px)');

    // Mobile breakpoints
    expect(workspaceCssRaw).toContain('@media (max-width: 640px)');
    expect(workspaceCssRaw).toContain('@media (max-width: 600px)');
    expect(navbarCssRaw).toContain('@media (max-width: 760px)');
    expect(heroCssRaw).toContain('@media (max-width: 760px)');
    expect(sectionsCssRaw).toContain('@media (max-width: 540px)');
    expect(footerCssRaw).toContain('@media (max-width: 540px)');
  });

  it('4. handles slow connections with request timeout and clean NETWORK_INTERRUPTED error', async () => {
    fetchMock.mockImplementationOnce(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const abortErr = new Error('The operation was aborted.');
            abortErr.name = 'AbortError';
            reject(abortErr);
          });
        })
    );

    await expect(
      callEdgeFunction('payment-prepare', {
        method: 'POST',
        body: { amount: '10' },
        timeoutMs: 15,
      })
    ).rejects.toMatchObject({
      code: 'NETWORK_INTERRUPTED',
      status: 503,
    });
  });

  it('5-7. provides application loading, empty, and error states across workspace views', () => {
    // Loading states
    expect(wordAppSource).toMatch(/loading|hydrating|isLoading/i);
    expect(dashboardViewSource).toMatch(/loading|Loading/i);

    // Empty states
    expect(dashboardViewSource).toMatch(/No activity yet|No transactions|empty/i);
    expect(accountabilityHubSource).toContain('No transactions match this filter.');

    // Accessible error states
    expect(settingsViewSource).toContain('role="alert"');
    expect(paymentPayFlowSource).toContain('role="alert"');
    expect(wordAppSource).toContain('role="alert"');
  });

  it('8-9. supports accessibility, reduced motion, and keyboard navigation', () => {
    expect(globalCssRaw).toContain(':focus-visible');
    expect(workspaceCssRaw).toContain('prefers-reduced-motion: reduce');
    expect(animationsCssRaw).toContain('prefers-reduced-motion: reduce');

    expect(settingsViewSource).toContain('role="switch"');
    expect(settingsViewSource).toContain('aria-checked=');
    expect(settingsViewSource).toContain('aria-label=');
  });

  it('10. handles browser compatibility gracefully across desktop and mobile devices', () => {
    const modernChrome = checkOnDeviceAiCompatibility({
      hasWebGpu: true,
      hasWasm: true,
      hasQvacWorker: true,
      memoryGb: 8,
      logicalCores: 8,
      platform: 'Linux x86_64',
    });
    expect(modernChrome.supportedForLlm).toBe(true);
    expect(modernChrome.status).toBe('ready');

    const lowRamMobile = checkOnDeviceAiCompatibility({
      hasWebGpu: false,
      hasWasm: true,
      hasQvacWorker: false,
      memoryGb: 1,
      logicalCores: 4,
      platform: 'iPhone',
    });
    expect(lowRamMobile.supportedForLlm).toBe(false);
    expect(lowRamMobile.runtime).toBe('local-deterministic');
  });

  it('11. implements Duo Fade-In / Fade-Out card animations on Web Dashboard without the removed iPhone Duo card', () => {
    expect(dashboardViewSource).not.toContain('IPHONE DUO · BILATERAL MUTUAL TRUST');
    expect(dashboardViewSource).toContain('ws-duo-card');
    expect(dashboardViewSource).toContain('ws-duo-fade-swap');
    expect(workspaceCssRaw).toContain('@keyframes wsDuoCardFadeIn');
    expect(workspaceCssRaw).toContain('minmax(0, 1.15fr) minmax(0, 0.85fr)');
  });

  it('12. creates a profile-linked simulated wallet with mock USDT balance and deducts sent stablecoin in real time', () => {
    const sim = createSimulatedProfileWallet({
      displayName: 'Karabo Mofokeng',
      email: 'karabo@word.fi',
      network: 'Testnet',
      initialUsdt: 2500.0,
    });

    expect(sim.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(sim.linkedProfileName).toBe('Karabo Mofokeng');
    expect(sim.linkedProfileEmail).toBe('karabo@word.fi');
    expect(sim.initialUsdtBalance).toBe('2500.00');
    expect(sim.seedWords.length).toBe(12);

    const ensured = ensureSimulatedWalletBalance(sim.address);
    expect(ensured.usdtBalance).toBe('2500.00');

    const recipientAddress = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';
    const recipientBefore = ensureSimulatedWalletBalance(recipientAddress);
    const afterSend = deductSimulatedUsdtBalance(sim.address, 125.0, recipientAddress);
    expect(afterSend.usdtBalance).toBe('2375.00');
    expect(afterSend.recipientUsdtBalance).toBe(
      (Number(recipientBefore.usdtBalance) + 125.0).toFixed(2)
    );
    const recipientAfter = ensureSimulatedWalletBalance(recipientAddress);
    expect(recipientAfter.usdtBalance).toBe(
      (Number(recipientBefore.usdtBalance) + 125.0).toFixed(2)
    );
  });

  it('13. searches recipients and displays receiver Name, Surname, Profile Image, and Adaptive Friction steps based on track record', async () => {
    // Search by name/surname
    const vusiResults = searchRecipients('Sithole');
    expect(vusiResults.length).toBe(1);
    const vusi = vusiResults[0];
    expect(vusi.firstName).toBe('Vusi');
    expect(vusi.lastName).toBe('Sithole');
    expect(vusi.avatarUrl).toContain('data:image/svg+xml');
    expect(vusi.disputesRaisedCount).toBeGreaterThanOrEqual(4);

    // Lookup by wallet address
    const thabo = lookupRecipientByAddressOrQuery('0x742d35Cc6634C0532925a3b844Bc454e4438f44e');
    expect(thabo).not.toBeNull();
    expect(thabo!.firstName).toBe('Thabo');
    expect(thabo!.lastName).toBe('Mokoena');

    // Low risk policy (1 step: Confirm Receiver Info)
    const lowPolicy = getAdaptiveFrictionPolicy(thabo!);
    expect(lowPolicy.frictionLevel).toBe('standard');
    expect(lowPolicy.requiredStepsCount).toBe(1);
    expect(lowPolicy.requiresPasskeyVerification).toBe(false);
    expect(lowPolicy.extraWaitSeconds).toBe(0);

    // High risk / bad track record policy (5 steps: Confirm Info, Dispute Walkthrough, Are You Sure, Passkey, Extra Wait Timer)
    const highPolicy = getAdaptiveFrictionPolicy(vusi);
    expect(highPolicy.frictionLevel).toBe('maximum');
    expect(highPolicy.requiredStepsCount).toBe(5);
    expect(highPolicy.requiresIdentityConfirmation).toBe(true);
    expect(highPolicy.requiresDisputeWalkthrough).toBe(true);
    expect(highPolicy.requiresAreYouSurePrompt).toBe(true);
    expect(highPolicy.requiresPasskeyVerification).toBe(true);
    expect(highPolicy.extraWaitSeconds).toBeGreaterThanOrEqual(8);

    // Verify passkey check
    const receipt = await verifySenderPasskey({
      passkeyPin: 'WORD-2026',
      userEmail: 'karabo@word.fi',
    });
    expect(receipt.verified).toBe(true);
    expect(receipt.credentialId).toMatch(/^pk-/i);

    // Verify mofokaharry@gmail.com has 400.00 USDT and a clean record
    const harryBalance = ensureSimulatedWalletBalance(
      '0x3B5082b903A3ddC2A19d9aa660d6dE1715ed415e',
      { displayName: 'Harry Mofoka', email: 'mofokaharry@gmail.com' }
    );
    expect(harryBalance.usdtBalance).toBe('400.00');

    const harryProfile = lookupRecipientByAddressOrQuery('mofokaharry@gmail.com');
    expect(harryProfile).not.toBeNull();
    expect(harryProfile!.firstName).toBe('Harry');
    expect(harryProfile!.lastName).toBe('Mofoka');
    expect(harryProfile!.riskTier).toBe('low');
    expect(harryProfile!.disputesRaisedCount).toBe(0);
    expect(getAdaptiveFrictionPolicy(harryProfile!).requiredStepsCount).toBe(1);
  });
});
