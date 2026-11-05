import * as Updates from 'expo-updates';
import { useEffect } from 'react';
import { AppState } from 'react-native';

/**
 * Over-the-air updates (EAS Update).
 *
 * Builds already check for an update on each cold launch (app.json
 * `updates.checkAutomatically`). People rarely cold-launch a social app, so
 * this also checks when the app comes back to the foreground, at most every
 * 30 minutes. A new update downloads in the background and is used the next
 * time the app starts, so nobody is interrupted mid-Roam.
 */
const CHECK_EVERY_MS = 30 * 60_000;
let lastCheck = 0;

async function checkAndFetch() {
  if (Date.now() - lastCheck < CHECK_EVERY_MS) return;
  lastCheck = Date.now();
  try {
    const { isAvailable } = await Updates.checkForUpdateAsync();
    if (isAvailable) await Updates.fetchUpdateAsync();
  } catch {
    // Offline or no update server: try again later.
  }
}

export function useUpdateChecks() {
  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;
    lastCheck = Date.now(); // the launch itself just checked
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkAndFetch();
    });
    return () => sub.remove();
  }, []);
}
