import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { AppState, Platform } from 'react-native';

/**
 * One cache for everything the app loads from Supabase.
 *
 *  - Screens that ask for the same thing (e.g. your friends list on five
 *    screens) share one request and one copy of the data.
 *  - Coming back to a screen shows what's cached straight away and only
 *    refetches if it's stale (realtime marks it stale when the data changes).
 *  - Returning to the app counts as "focus": stale queries refresh.
 *  - Offline, queries pause instead of failing, then resume on reconnect.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Realtime invalidates queries when their tables change, so cached data
      // can be trusted for a while instead of refetching on every visit.
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    },
  },
});

// "Focus" for a phone app means being in the foreground.
focusManager.setEventListener((setFocused) => {
  const sub = AppState.addEventListener('change', (state) => {
    if (Platform.OS !== 'web') setFocused(state === 'active');
  });
  return () => sub.remove();
});

// Pause and resume queries with the network connection.
onlineManager.setEventListener((setOnline) => {
  const sub = Network.addNetworkStateListener((state) => {
    // isConnected can be briefly unknown at startup; only treat a definite "no" as offline.
    setOnline(state.isConnected !== false);
  });
  return () => sub.remove();
});

/** After you change something realtime doesn't cover (e.g. circles), refetch what shows it. */
export function invalidate(...keys: string[]) {
  for (const key of keys) queryClient.invalidateQueries({ queryKey: [key] });
}
