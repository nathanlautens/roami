import * as Updates from 'expo-updates';
import { useEffect } from 'react';
import { AppState } from 'react-native';

/**
 * EAS Update: builds check on cold launch (app.json), but people rarely cold-launch, so also check
 * when the app returns to the foreground (at most every 30 minutes). A new update downloads in the
 * background and is used on the next start, so nobody is interrupted.
 */
export function useUpdateChecks() {
  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;
    let lastCheck = Date.now(); // the launch itself just checked
    const sub = AppState.addEventListener('change', async (state) => {
      if (state !== 'active' || Date.now() - lastCheck < 30 * 60_000) return;
      lastCheck = Date.now();
      try {
        if ((await Updates.checkForUpdateAsync()).isAvailable) await Updates.fetchUpdateAsync();
      } catch {
        // offline: try again later
      }
    });
    return () => sub.remove();
  }, []);
}
