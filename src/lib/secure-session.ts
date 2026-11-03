import aesjs from 'aes-js';
import { getRandomBytes } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

/**
 * Where Supabase keeps your login on the phone.
 *
 * The session (which includes a long-lived refresh token) is encrypted with a
 * fresh AES-256 key on every save. The key lives in the iOS Keychain /
 * Android Keystore, set to "this device only", so it's never copied into
 * iCloud or Google backups. The encrypted blob lives in normal storage
 * (it's too big for the keychain). A backup or a copy of the app's files on
 * its own can't be used to log in.
 *
 * Sessions saved by older versions of the app (unencrypted) are read once
 * and re-saved encrypted.
 */

const KEYCHAIN = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };
const keyName = (key: string) => `roami.sk.${key.replace(/[^A-Za-z0-9._-]/g, '_')}`;
const blobName = (key: string) => `roami.enc.${key}`;

function encrypt(value: string) {
  const key = getRandomBytes(32);
  const ctr = new aesjs.ModeOfOperation.ctr(key, new aesjs.Counter(1));
  const bytes = ctr.encrypt(aesjs.utils.utf8.toBytes(value));
  return { key: aesjs.utils.hex.fromBytes(key), blob: aesjs.utils.hex.fromBytes(bytes) };
}

function decrypt(keyHex: string, blobHex: string) {
  const ctr = new aesjs.ModeOfOperation.ctr(aesjs.utils.hex.toBytes(keyHex), new aesjs.Counter(1));
  return aesjs.utils.utf8.fromBytes(ctr.decrypt(aesjs.utils.hex.toBytes(blobHex)));
}

export const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    const blob = localStorage.getItem(blobName(key));
    if (blob) {
      const k = await SecureStore.getItemAsync(keyName(key), KEYCHAIN);
      // No key (e.g. the app was restored onto a new phone): the blob is useless, sign in again.
      return k ? decrypt(k, blob) : null;
    }
    // Saved unencrypted by an older version: move it into encrypted storage.
    const legacy = localStorage.getItem(key);
    if (legacy) {
      await secureSessionStorage.setItem(key, legacy);
      localStorage.removeItem(key);
    }
    return legacy;
  },

  async setItem(key: string, value: string): Promise<void> {
    const { key: k, blob } = encrypt(value);
    await SecureStore.setItemAsync(keyName(key), k, KEYCHAIN);
    localStorage.setItem(blobName(key), blob);
  },

  async removeItem(key: string): Promise<void> {
    localStorage.removeItem(blobName(key));
    localStorage.removeItem(key);
    await SecureStore.deleteItemAsync(keyName(key), KEYCHAIN);
  },
};
