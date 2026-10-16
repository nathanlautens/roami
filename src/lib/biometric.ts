import * as LocalAuthentication from 'expo-local-authentication';

/**
 * Face ID / fingerprint unlock.
 *
 * Your Supabase session stays saved on the phone, so after the first email
 * code you're never asked for email again on this device. When unlock is on,
 * opening the app (or coming back after a while) asks for Face ID,
 * fingerprint, or the phone's passcode as a fallback.
 */

const KEY = 'roami.biometricUnlock';
const ASKED_KEY = 'roami.biometricAsked';

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // best effort
  }
}

export function isUnlockEnabled() {
  return read(KEY) === 'on';
}
export function setUnlockEnabled(on: boolean) {
  write(KEY, on ? 'on' : 'off');
  write(ASKED_KEY, '1');
}
export function wasAskedAboutUnlock() {
  return read(ASKED_KEY) === '1';
}
export function clearUnlockPrefs() {
  write(KEY, null);
  write(ASKED_KEY, null);
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
