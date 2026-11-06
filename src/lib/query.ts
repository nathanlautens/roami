import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { AppState } from 'react-native';

/**
 * One cache for everything loaded from Supabase: screens share requests and data, cached data
 * shows instantly, stale data refreshes when the app returns to the foreground, and queries pause
 * while offline. Realtime marks data stale when it changes, so it's trusted for 30s otherwise.
 */
export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, gcTime: 10 * 60_000, retry: 2 } },
});

focusManager.setEventListener((setFocused) => {
  const sub = AppState.addEventListener('change', (state) => setFocused(state === 'active'));
  return () => sub.remove();
});
onlineManager.setEventListener((setOnline) => {
  // isConnected can be briefly unknown at startup: only a definite "no" is offline.
  const sub = Network.addNetworkStateListener((state) => setOnline(state.isConnected !== false));
  return () => sub.remove();
});

/** After changing something realtime doesn't report (e.g. circles), refetch what shows it. */
export function invalidate(...keys: string[]) {
  for (const key of keys) queryClient.invalidateQueries({ queryKey: [key] });
}
