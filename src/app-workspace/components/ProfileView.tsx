import React, { useState } from 'react';
import { Button } from '../../components/ui/Button';
import type { UserSession, WalletState } from '../types';

interface ProfileViewProps {
  session: UserSession;
  wallet: WalletState;
  onUpdateSession: (session: UserSession) => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  session,
  wallet,
  onUpdateSession,
}) => {
  const [displayName, setDisplayName] = useState(session.displayName);
  const [email, setEmail] = useState(session.email);
  const [saved, setSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateSession({
      ...session,
      displayName: displayName.trim() || session.displayName,
      email: email.trim() || session.email,
    });
    setSaved(true);
  };

  return (
    <div className="ws-card" style={{ maxWidth: '680px' }}>
      <p className="eyebrow" style={{ marginBottom: '8px' }}>
        USER PROFILE
      </p>
      <h1 className="heading-md" style={{ marginBottom: '8px' }}>
        Profile details
      </h1>
      <p className="body-sm" style={{ marginBottom: '24px' }}>
        Manage your local Word profile details. Profile display names do not constitute verified
        real-world identity.
      </p>

      <form
        onSubmit={handleSave}
        style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
      >
        <div className="field-group">
          <label className="field-label" htmlFor="profile-name">
            Display name
          </label>
          <input
            id="profile-name"
            type="text"
            className="field-input"
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              setSaved(false);
            }}
            required
          />
        </div>

        <div className="field-group">
          <label className="field-label" htmlFor="profile-email">
            Email address
          </label>
          <input
            id="profile-email"
            type="email"
            className="field-input"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setSaved(false);
            }}
            required
          />
        </div>

        <div className="field-group">
          <span className="field-label">Linked wallet ({wallet.network})</span>
          <div
            style={{
              padding: '12px 14px',
              borderRadius: '12px',
              backgroundColor: 'var(--bg)',
              border: '1px solid var(--line)',
              fontSize: '13.5px',
              color: 'var(--sub)',
              wordBreak: 'break-all',
            }}
          >
            {wallet.address}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '6px' }}>
          <Button type="submit" compact>
            Save profile (UI)
          </Button>
          {saved && (
            <span className="body-sm" style={{ color: '#1a8f4d' }} role="status">
              Profile updated locally.
            </span>
          )}
        </div>
      </form>
    </div>
  );
};

