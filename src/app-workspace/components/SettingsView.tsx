import React, { useState } from 'react';
import { LogOut, Shield } from 'lucide-react';
import type { WalletState } from '../types';
import {
  NETWORK_CONFIGS,
  type SupportedNetworkName,
} from '../../config/blockchain';

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

