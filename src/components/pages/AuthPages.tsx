import React, { useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { AppRoute } from '../../types';
import type { UserSession } from '../../app-workspace/types';
import { HeroCanvas } from '../hero/HeroCanvas';
import { DotMatrixHands } from '../hero/DotMatrixHands';
import { WordLogo } from '../ui/WordLogo';
import { Button } from '../ui/Button';
import { signInWithEmail, signUpWithEmail } from '../../services/authService';
import './Pages.css';

interface AuthPageProps {
  mode: 'signin' | 'signup';
  onNavigate: (route: AppRoute) => void;
  onAuthenticated: (session: UserSession) => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({
  mode,
  onNavigate,
  onAuthenticated,
}) => {
  const isSignIn = mode === 'signin';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);
    setLoading(true);

    const derivedName =
      name.trim() ||
      (email.includes('@') ? email.split('@')[0] : 'Word User');

    try {
      if (isSignIn) {
        const res = await signInWithEmail({ email: email.trim(), password });
        if (res.user) {
          onAuthenticated({
            id: res.user.id,
            displayName:
              (res.user.user_metadata?.display_name as string | undefined) || derivedName,
            email: res.user.email ?? email.trim(),
            isNewUser: false,
          });
        }
      } else {
        const res = await signUpWithEmail({
          email: email.trim(),
          password,
          displayName: derivedName,
        });
        if (res.session && res.user) {
          onAuthenticated({
            id: res.user.id,
            displayName: derivedName,
            email: res.user.email ?? email.trim(),
            isNewUser: true,
          });
        } else {
          setInfoMsg(
            'Account created! Please check your email inbox to confirm your address before signing in.'
          );
        }
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Authentication failed. Please check your credentials.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={`auth-screen ${isSignIn ? 'auth-screen--signin' : 'auth-screen--signup'}`}
    >
      {/* Continuous live dot-matrix hands + Three.js background */}
      <div className="auth-bg-layer" aria-hidden="true">
        <HeroCanvas />
        <DotMatrixHands />
      </div>

      {/* Left frosted pane on Sign in, Right frosted pane on Sign up */}
      <main className="auth-frosted-pane">
        <div className="auth-top-bar">
          <button
            type="button"
            className="auth-back-link"
            onClick={() => onNavigate('home')}
          >
            <ArrowLeft size={15} />
            Back to Word
          </button>

          <button
            type="button"
            onClick={() => onNavigate('home')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              background: 'transparent',
              border: 'none',
              color: 'var(--ink)',
              fontWeight: 500,
              fontSize: '14.5px',
              letterSpacing: '-0.02em',
            }}
            aria-label="Word home"
          >
            <WordLogo size={20} />
            <span>Word</span>
          </button>
        </div>

        <div className="auth-form-wrap">
          <p className="eyebrow" style={{ marginBottom: '12px' }}>
            {isSignIn ? 'SIGN IN' : 'CREATE ACCOUNT'}
          </p>
          <h1 className="heading-lg" style={{ marginBottom: '12px' }}>
            {isSignIn ? 'Welcome back to Word.' : 'Start with trust-first payments.'}
          </h1>
          <p className="body-md">
            {isSignIn
              ? 'Sign in to review payment requests, verify recipient wallet control, and check shared transaction records.'
              : 'Create a Word profile to prepare structured payment requests, review risk explanations, and keep clear payment records.'}
          </p>

          <form className="auth-form" onSubmit={handleSubmit}>
            {!isSignIn && (
              <div className="field-group">
                <label className="field-label" htmlFor="auth-name">
                  Display name
                </label>
                <input
                  id="auth-name"
                  type="text"
                  className="field-input"
                  placeholder="e.g. Thabo M."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            )}

            <div className="field-group">
              <label className="field-label" htmlFor="auth-email">
                Email address
              </label>
              <input
                id="auth-email"
                type="email"
                className="field-input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="auth-password">
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                className="field-input"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>

            {errorMsg && (
              <p
                role="alert"
                style={{
                  padding: '10px 14px',
                  borderRadius: '10px',
                  background: 'rgba(220, 38, 38, 0.12)',
                  border: '1px solid rgba(220, 38, 38, 0.35)',
                  color: '#fca5a5',
                  fontSize: '13.5px',
                }}
              >
                {errorMsg}
              </p>
            )}

            {infoMsg && (
              <p
                role="status"
                style={{
                  padding: '10px 14px',
                  borderRadius: '10px',
                  background: 'rgba(16, 185, 129, 0.12)',
                  border: '1px solid rgba(16, 185, 129, 0.35)',
                  color: '#6ee7b7',
                  fontSize: '13.5px',
                }}
              >
                {infoMsg}
              </p>
            )}

            <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '18px', flexWrap: 'wrap' }}>
              <Button type="submit" disabled={loading}>
                {loading
                  ? isSignIn
                    ? 'Signing in...'
                    : 'Creating account...'
                  : isSignIn
                    ? 'Sign in'
                    : 'Create account'}{' '}
                <ArrowRight size={14} />
              </Button>

              <button
                type="button"
                className="text-link"
                style={{ background: 'transparent', border: 'none' }}
                onClick={() => onNavigate(isSignIn ? 'signup' : 'signin')}
              >
                {isSignIn ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
              </button>
            </div>
          </form>
        </div>

        <p className="auth-footer-note">
          Word follows a self-custody model. Private keys remain under your control and every
          transaction requires explicit approval before signing.
        </p>
      </main>
    </div>
  );
};

