import React, { useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { AppRoute } from '../../types';
import { HeroCanvas } from '../hero/HeroCanvas';
import { DotMatrixHands } from '../hero/DotMatrixHands';
import { WordLogo } from '../ui/WordLogo';
import { Button } from '../ui/Button';
import './Pages.css';

interface AuthPageProps {
  mode: 'signin' | 'signup';
  onNavigate: (route: AppRoute) => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({ mode, onNavigate }) => {
  const isSignIn = mode === 'signin';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
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
                  onChange={(e) => {
                    setName(e.target.value);
                    setSubmitted(false);
                  }}
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
                onChange={(e) => {
                  setEmail(e.target.value);
                  setSubmitted(false);
                }}
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
                onChange={(e) => {
                  setPassword(e.target.value);
                  setSubmitted(false);
                }}
                required
                minLength={6}
              />
            </div>

            <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '18px', flexWrap: 'wrap' }}>
              <Button type="submit">
                {isSignIn ? 'Sign in' : 'Create account'} <ArrowRight size={14} />
              </Button>

              <button
                type="button"
                className="text-link"
                style={{ background: 'transparent', border: 'none' }}
                onClick={() => {
                  setSubmitted(false);
                  onNavigate(isSignIn ? 'signup' : 'signin');
                }}
              >
                {isSignIn ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
              </button>
            </div>
          </form>

          {submitted && (
            <div className="auth-status-banner" role="status">
              <strong>Demonstration preview:</strong> No live authentication backend or wallet
              session is connected in this static frontend build. Your details were not transmitted.
            </div>
          )}
        </div>

        <p className="auth-footer-note">
          Word follows a self-custody model. Private keys remain under your control and every
          transaction requires explicit approval before signing.
        </p>
      </main>
    </div>
  );
};

