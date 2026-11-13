import { describe, expect, it } from 'vitest';
import {
  AI_DATA_HANDLING_DISCLOSURE,
  DISPUTE_EVIDENCE_PROTECTION,
  getPrivacyDisclosureSummary,
  minimizeStoredPersonalInfo,
  NEVER_COLLECTED_DATA,
  PRIVACY_DATA_COLLECTION_SPEC,
  redactEmailForDisplay,
} from '../../src/services/privacyService';
import { QVAC_DATA_BOUNDARY_SPEC } from '../../src/services/qvacAssistantService';
import settingsViewSource from '../../src/app-workspace/components/SettingsView.tsx?raw';
import evidenceAuthSource from '../../supabase/functions/evidence-auth/index.ts?raw';

describe('Phase 10: Privacy & Data Protection', () => {
  it('defines collected personal data categories and explicit retention periods', () => {
    expect(PRIVACY_DATA_COLLECTION_SPEC.length).toBeGreaterThanOrEqual(5);

    for (const item of PRIVACY_DATA_COLLECTION_SPEC) {
      expect(item.category.trim().length).toBeGreaterThan(2);
      expect(item.fields.length).toBeGreaterThan(0);
      expect(item.purpose.trim().length).toBeGreaterThan(10);
      expect(item.retentionPeriod.trim().length).toBeGreaterThan(5);
    }

    expect(NEVER_COLLECTED_DATA.some((d) => /recovery phrases|seed phrases/i.test(d))).toBe(true);
    expect(NEVER_COLLECTED_DATA.some((d) => /private keys/i.test(d))).toBe(true);
  });

  it('limits stored personal information and redacts sensitive display identifiers', () => {
    const longName = 'A'.repeat(120);
    const longNotes = 'B'.repeat(900);

    const minimized = minimizeStoredPersonalInfo({
      displayName: `  ${longName}  `,
      defaultNetwork: '  Testnet  ',
      notes: longNotes,
    });

    expect(minimized.displayName?.length).toBe(60);
    expect(minimized.defaultNetwork).toBe('Testnet');
    expect(minimized.notes?.length).toBe(500);

    expect(redactEmailForDisplay('thabo.mokoena@example.com')).toBe('th***@example.com');
    expect(redactEmailForDisplay('')).toBe('[hidden]');
  });

  it('protects dispute evidence via private storage and short-lived signed URLs', () => {
    expect(DISPUTE_EVIDENCE_PROTECTION.storageVisibility).toBe('private');
    expect(evidenceAuthSource).toContain("from('dispute-evidence')");
    expect(evidenceAuthSource).toContain('createSignedUrl(storagePath, 300)');
    expect(evidenceAuthSource).toContain('assertSafeStoragePath');
  });

  it('accurately discloses AI data handling and exposes privacy information in SettingsView', () => {
    expect(AI_DATA_HANDLING_DISCLOSURE.staysOnDevice).toEqual(QVAC_DATA_BOUNDARY_SPEC.staysOnDevice);
    expect(AI_DATA_HANDLING_DISCLOSURE.neverTransmitted).toEqual(
      QVAC_DATA_BOUNDARY_SPEC.neverTransmitted
    );
    expect(AI_DATA_HANDLING_DISCLOSURE.neverTransmitted).toContain('rawPrompt');
    expect(AI_DATA_HANDLING_DISCLOSURE.neverTransmitted).toContain('seedPhrase');
    expect(AI_DATA_HANDLING_DISCLOSURE.neverTransmitted).toContain('privateKey');

    const summary = getPrivacyDisclosureSummary();
    expect(summary.collectedCategories.length).toBe(PRIVACY_DATA_COLLECTION_SPEC.length);
    expect(summary.neverCollected.length).toBe(NEVER_COLLECTED_DATA.length);
    expect(settingsViewSource).toContain('getPrivacyDisclosureSummary');
    expect(settingsViewSource).toContain('Privacy, data retention &amp; AI disclosure');
  });
});

