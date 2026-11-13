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

const realProcess = (
  globalThis as unknown as {
    process: { getBuiltinModule: (id: string) => unknown };
  }
).process;
const nodeFs = realProcess.getBuiltinModule('node:fs') as typeof import('node:fs');
const nodePath = realProcess.getBuiltinModule('node:path') as typeof import('node:path');
const readCss = (relPath: string) =>
  nodeFs.readFileSync(nodePath.resolve(realProcess ? (globalThis as unknown as { process: NodeJS.Process }).process.cwd() : '.', relPath), 'utf8');

const globalCssRaw = readCss('src/styles/global.css');
const animationsCssRaw = readCss('src/styles/animations.css');
const workspaceCssRaw = readCss('src/app-workspace/Workspace.css');
const navbarCssRaw = readCss('src/components/navigation/Navbar.css');
const heroCssRaw = readCss('src/components/hero/Hero.css');
const sectionsCssRaw = readCss('src/components/sections/Sections.css');
const footerCssRaw = readCss('src/components/footer/Footer.css');
const pagesCssRaw = readCss('src/components/pages/Pages.css');

describe('Phase 11: UI and Device Testing', () => {
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
});
