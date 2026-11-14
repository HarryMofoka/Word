import { supabase } from '../lib/supabase';
import { callEdgeFunction } from './apiClient';
import type { Database } from '../types/database';
import {
  startIdentityVerification,
  submitFacialLivenessCapture,
  type FrameLivenessTelemetry,
} from './identityVerificationService';

export type ProfileRow = Database['public']['Tables']['profiles']['Row'];

export interface PasswordStrengthAssessment {
  hasMinLength: boolean;
  hasUpperAndLower: boolean;
  hasDigit: boolean;
  hasSymbolOrLongPassphrase: boolean;
  score: 0 | 1 | 2 | 3 | 4;
  label: 'Weak' | 'Fair' | 'Good' | 'Strong';
  isAcceptable: boolean;
}

export interface SignUpValidationInput {
  displayName: string;
  email: string;
  password: string;
  confirmPassword: string;
  ownerAndPopiaAccepted: boolean;
  selfCustodyAccepted: boolean;
  faceScanReady: boolean;
  deferFaceScanToOnboarding: boolean;
}

export interface SignUpValidationResult {
  valid: boolean;
  errors: string[];
  checks: {
    nameValid: boolean;
    emailValid: boolean;
    passwordStrength: PasswordStrengthAssessment;
    passwordsMatch: boolean;
    consentsAccepted: boolean;
    faceScanSatisfied: boolean;
  };
}

export interface PendingOwnerFaceScanPayload {
  challengesCompleted: string[];
  telemetry: FrameLivenessTelemetry;
  capturedAt: string;
}

const PENDING_FACE_SCAN_STORAGE_KEY = 'word_pending_owner_face_scan';

export function evaluatePasswordStrength(password: string): PasswordStrengthAssessment {
  const hasMinLength = password.length >= 8;
  const hasUpperAndLower = /[a-z]/.test(password) && /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSymbolOrLongPassphrase = /[^A-Za-z0-9]/.test(password) || password.length >= 12;

  const rawScore = [
    hasMinLength,
    hasUpperAndLower,
    hasDigit,
    hasSymbolOrLongPassphrase,
  ].filter(Boolean).length as 0 | 1 | 2 | 3 | 4;

  const label: PasswordStrengthAssessment['label'] =
    rawScore <= 1 ? 'Weak' : rawScore === 2 ? 'Fair' : rawScore === 3 ? 'Good' : 'Strong';

  return {
    hasMinLength,
    hasUpperAndLower,
    hasDigit,
    hasSymbolOrLongPassphrase,
    score: rawScore,
    label,
    isAcceptable: hasMinLength && rawScore >= 3,
  };
}

export function validateSignUpRegistration(
  input: SignUpValidationInput
): SignUpValidationResult {
  const errors: string[] = [];
  const trimmedName = input.displayName.trim();
  const trimmedEmail = input.email.trim();

  const nameValid =
    trimmedName.length >= 2 &&
    trimmedName.length <= 80 &&
    !/[<>]/.test(trimmedName) &&
    !/^[\d\s]+$/.test(trimmedName);
  if (!nameValid) {
    errors.push(
      'Please enter a valid account owner display name (2–80 characters, no HTML tags).'
    );
  }

  const emailValid =
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmedEmail) && trimmedEmail.length <= 254;
  if (!emailValid) {
    errors.push('Please enter a valid email address.');
  }

  const passwordStrength = evaluatePasswordStrength(input.password);
  if (!passwordStrength.isAcceptable) {
    errors.push(
      'Password must be at least 8 characters and meet at least 3 security requirements (uppercase/lowercase, number, symbol).'
    );
  }

  const passwordsMatch =
    input.password.length > 0 && input.password === input.confirmPassword;
  if (!passwordsMatch) {
    errors.push('Password confirmation does not match your password.');
  }

  const consentsAccepted = Boolean(
    input.ownerAndPopiaAccepted && input.selfCustodyAccepted
  );
  if (!consentsAccepted) {
    errors.push(
      'Please confirm account ownership, POPIA biometric consent, and self-custody acknowledgement.'
    );
  }

  const faceScanSatisfied = Boolean(
    input.faceScanReady || input.deferFaceScanToOnboarding
  );
  if (!faceScanSatisfied) {
    errors.push(
      'Please complete the Owner Face Scan so your Mutual Trust verification is ready, or select to complete it in onboarding.'
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    checks: {
      nameValid,
      emailValid,
      passwordStrength,
      passwordsMatch,
      consentsAccepted,
      faceScanSatisfied,
    },
  };
}

export function savePendingOwnerFaceScan(payload: PendingOwnerFaceScanPayload): void {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(PENDING_FACE_SCAN_STORAGE_KEY, JSON.stringify(payload));
    }
  } catch {
    // ignore storage errors in restricted environments
  }
}

export function consumePendingOwnerFaceScan(): PendingOwnerFaceScanPayload | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const raw = sessionStorage.getItem(PENDING_FACE_SCAN_STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PENDING_FACE_SCAN_STORAGE_KEY);
    return JSON.parse(raw) as PendingOwnerFaceScanPayload;
  } catch {
    return null;
  }
}

export async function enrollOwnerFaceScan(
  payload: PendingOwnerFaceScanPayload
): Promise<boolean> {
  try {
    const started = await startIdentityVerification({
      popiaConsent: true,
    });
    const challenges =
      started.session.challenges && started.session.challenges.length > 0
        ? started.session.challenges
        : payload.challengesCompleted;
    const result = await submitFacialLivenessCapture({
      providerSessionId: started.session.providerSessionId,
      challengesCompleted: challenges,
      telemetry: payload.telemetry,
    });
    return result.identity.isVerified;
  } catch {
    return false;
  }
}

export async function signUpWithEmail(params: {
  email: string;
  password: string;
  displayName: string;
}) {
  const { data, error } = await supabase.auth.signUp({
    email: params.email,
    password: params.password,
    options: {
      data: {
        display_name: params.displayName,
      },
    },
  });
  if (error) throw error;
  return data;
}

export async function signInWithEmail(params: { email: string; password: string }) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: params.email,
    password: params.password,
  });
  if (error) throw error;
  return data;
}

export async function signOutSession() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function fetchMyProfile(): Promise<ProfileRow> {
  const res = await callEdgeFunction<{ profile: ProfileRow }>('profile', {
    method: 'GET',
  });
  return res.profile;
}

export async function updateMyProfile(updates: {
  displayName?: string;
  defaultNetwork?: string;
  onboardingCompleted?: boolean;
  preferences?: Record<string, unknown>;
}): Promise<ProfileRow> {
  const res = await callEdgeFunction<{ profile: ProfileRow }>('profile', {
    method: 'PATCH',
    body: updates,
  });
  return res.profile;
}

