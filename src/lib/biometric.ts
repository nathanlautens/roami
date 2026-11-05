import * as LocalAuthentication from 'expo-local-authentication';

import { kv } from './storage';

// Face ID / fingerprint unlock. The session stays on the phone after the first email code;
// with unlock on, opening the app (or returning after a while) asks for Face ID, fingerprint or passcode.
const KEY = 'roami.biometricUnlock';
const ASKED_KEY = 'roami.biometricAsked';

export const isUnlockEnabled = () => kv.get(KEY) === 'on';
export const wasAskedAboutUnlock = () => kv.get(ASKED_KEY) === '1';
export function setUnlockEnabled(on: boolean) {
  kv.set(KEY, on ? 'on' : 'off');
  kv.set(ASKED_KEY, '1');
}
export function clearUnlockPrefs() {
  kv.set(KEY, null);
  kv.set(ASKED_KEY, null);
}

/** What this phone can do: 'face', 'fingerprint', 'passcode' (no biometrics enrolled) or null. */
export async function unlockKind(): Promise<'face' | 'fingerprint' | 'passcode' | null> {
  try {
    const level = await LocalAuthentication.getEnrolledLevelAsync();
    if (level === LocalAuthentication.SecurityLevel.NONE) return null;
    if (level === LocalAuthentication.SecurityLevel.SECRET) return 'passcode';
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return 'face';
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return 'fingerprint';
    return 'passcode';
  } catch {
    return null;
  }
}

export function unlockLabel(kind: Awaited<ReturnType<typeof unlockKind>>) {
  return kind === 'face' ? 'Face ID' : kind === 'fingerprint' ? 'fingerprint' : 'your passcode';
}

export async function authenticate(prompt = 'Unlock Roami') {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: prompt,
      cancelLabel: 'Not now',
      fallbackLabel: 'Use passcode',
    });
    return result.success;
  } catch {
    return false;
  }
}
