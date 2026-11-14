import React, { useState } from 'react';
import { LogOut, Shield, Trash2 } from 'lucide-react';
import type { WalletState } from '../types';
import {
  NETWORK_CONFIGS,
  type SupportedNetworkName,
} from '../../config/blockchain';
import { getPrivacyDisclosureSummary } from '../../services/privacyService';
import { eraseMyIdentityData } from '../../services/identityVerificationService';

interface SettingsViewProps {
  wallet: WalletState;
  balanceHidden: boolean;
  onToggleBalance: () => void;
  onSwitchNetwork: (network: SupportedNetworkName) => Promise<void>;
  onOpenSecurity: () => void;
  onLogout: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  wallet,
  balanceHidden,
  onToggleBalance,
  onSwitchNetwork,
  onOpenSecurity,
  onLogout,
}) => {
  const [txAlerts, setTxAlerts] = useState(true);
  const [riskWarnings, setRiskWarnings] = useState(true);
  const [switchingNetwork, setSwitchingNetwork] = useState(false);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [erasingIdentity, setErasingIdentity] = useState(false);
  const [eraseMessage, setEraseMessage] = useState<string | null>(null);

  const handleEraseIdentity = async () => {
    setErasingIdentity(true);
    setEraseMessage(null);
    try {
      const res = await eraseMyIdentityData();
      setEraseMessage(
        `Erased ${res.revokedCount} stored verification record(s) under POPIA data deletion controls.`
      );
    } catch (err) {
      setEraseMessage(err instanceof Error ? err.message : 'Unable to erase identity data.');
    } finally {
      setErasingIdentity(false);
    }
  };

  const handleNetworkSelect = async (next: SupportedNetworkName) => {
    setSwitchingNetwork(true);
    setNetworkError(null);
    try {
      await onSwitchNetwork(next);
    } catch (err) {
      setNetworkError(
        err instanceof Error ? err.message : 'Unable to switch demonstration network.'
      );
    } finally {
      setSwitchingNetwork(false);
    }
  };

  return (
    <div className="ws-card" style={{ maxWidth: '680px' }}>
      <p className="eyebrow" style={{ marginBottom: '8px' }}>
        SETTINGS
      </p>
      <h1 className="heading-md" style={{ marginBottom: '20px' }}>
        Preferences &amp; security
      </h1>

      <div className="ws-setting-row">
        <div>
          <p style={{ fontSize: '14.5px', fontWeight: 500, color: 'var(--ink)' }}>
            Hide balance on dashboard
          </p>
          <p className="body-sm">Mask your USDT balance by default in the workspace.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={balanceHidden}
          aria-label="Hide balance on dashboard"
          className={`ws-toggle ${balanceHidden ? 'is-on' : ''}`}
          onClick={onToggleBalance}
        >
          <span className="ws-toggle-knob" />
        </button>
      </div>

      <div className="ws-setting-row">
        <div>
          <p style={{ fontSize: '14.5px', fontWeight: 500, color: 'var(--ink)' }}>
            Transaction status alerts
          </p>
          <p className="body-sm">Show notifications for pending, confirmed, and failed payments.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={txAlerts}
          aria-label="Transaction status alerts"
          className={`ws-toggle ${txAlerts ? 'is-on' : ''}`}
          onClick={() => setTxAlerts((prev) => !prev)}
        >
          <span className="ws-toggle-knob" />
        </button>
      </div>

      <div className="ws-setting-row">
        <div>
          <p style={{ fontSize: '14.5px', fontWeight: 500, color: 'var(--ink)' }}>
            Pre-approval risk explanations
          </p>
          <p className="body-sm">Display plain-language checks before signing.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={riskWarnings}
          aria-label="Pre-approval risk explanations"
          className={`ws-toggle ${riskWarnings ? 'is-on' : ''}`}
          onClick={() => setRiskWarnings((prev) => !prev)}
        >
          <span className="ws-toggle-knob" />
        </button>
      </div>

      <div className="ws-setting-row" style={{ flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <p style={{ fontSize: '14.5px', fontWeight: 500, color: 'var(--ink)' }}>
            Demonstration network
          </p>
          <p className="body-sm">
            Active: {NETWORK_CONFIGS[wallet.network]?.label ?? wallet.network} (Chain ID{' '}
            {NETWORK_CONFIGS[wallet.network]?.chainId ?? 11155111})
          </p>
          {networkError && (
            <p className="body-sm" style={{ color: '#fca5a5', marginTop: '4px' }} role="alert">
              {networkError}
            </p>
          )}
        </div>
        <select
          aria-label="Select demonstration network"
          className="field-select"
          style={{ width: 'auto', minWidth: '210px' }}
          value={wallet.network}
          disabled={switchingNetwork}
          onChange={(e) => handleNetworkSelect(e.target.value as SupportedNetworkName)}
        >
          {Object.values(NETWORK_CONFIGS).map((cfg) => (
            <option key={cfg.name} value={cfg.name}>
              {cfg.label}
            </option>
          ))}
        </select>
      </div>

      <div
        style={{
          marginTop: '20px',
          padding: '14px 16px',
          borderRadius: '10px',
          border: '1px solid var(--border-subtle, rgba(255,255,255,0.12))',
          background: 'rgba(255,255,255,0.02)',
        }}
      >
        <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)', marginBottom: '6px' }}>
          Privacy, data retention &amp; AI disclosure
        </p>
        <p className="body-sm" style={{ marginBottom: '10px' }}>
          {getPrivacyDisclosureSummary().aiDataHandling.summary}
        </p>
        <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12.5px', lineHeight: 1.5 }}>
          {getPrivacyDisclosureSummary().collectedCategories.map((item) => (
            <li key={item.category} style={{ marginBottom: '4px' }}>
              <strong>{item.category}:</strong> {item.fields.join(', ')} —{' '}
              <span>Retention: {item.retentionPeriod}</span>
            </li>
          ))}
        </ul>
      </div>

      <div
        style={{
          marginTop: '14px',
          padding: '14px 16px',
          borderRadius: '10px',
          border: '1px solid var(--line)',
          background: 'var(--bg)',
        }}
      >
        <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)', marginBottom: '6px' }}>
          Mutual Trust identity &amp; POPIA biometric privacy
        </p>
        <p className="body-sm" style={{ marginBottom: '10px' }}>
          Raw facial videos, photos, and biometric templates are never stored on Word servers, never
          placed on-chain, and never shared with counterparties. Only signed attestation status
          metadata is kept for up to 30 days unless revoked earlier.
        </p>
        {eraseMessage && (
          <p className="body-sm" style={{ marginBottom: '8px', color: 'var(--ink)' }}>
            {eraseMessage}
          </p>
        )}
        <button
          type="button"
          className="ws-ghost-btn"
          onClick={() => void handleEraseIdentity()}
          disabled={erasingIdentity}
        >
          <Trash2 size={14} />{' '}
          {erasingIdentity ? 'Erasing verification data...' : 'Delete identity verification records'}
        </button>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
          marginTop: '24px',
        }}
      >
        <button type="button" className="ws-ghost-btn" onClick={onOpenSecurity}>
          <Shield size={14} />
          Recovery &amp; security info
        </button>

        <button type="button" className="ws-ghost-btn" onClick={onLogout}>
          <LogOut size={14} />
          Log out
        </button>
      </div>
    </div>
  );
};

