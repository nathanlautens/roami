import {
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
} from '@expo-google-fonts/bricolage-grotesque';
import { DMSans_400Regular, DMSans_500Medium, DMSans_700Bold, useFonts } from '@expo-google-fonts/dm-sans';
import { QueryClientProvider } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CrashScreen } from '@/components/crash-screen';
import { LockScreen } from '@/components/lock-screen';
import { AuthProvider, useAuth } from '@/lib/auth';
import { isUnlockEnabled } from '@/lib/biometric';
import { setAppLocked } from '@/lib/signals';
import { listenForPushTaps } from '@/lib/push';
import { queryClient } from '@/lib/query';
import { useRealtimeSync } from '@/lib/realtime';
import { colors } from '@/lib/theme';
import { useUpdateChecks } from '@/lib/updates';

SplashScreen.preventAutoHideAsync();

// A crash while drawing any screen shows a recovery screen instead of a blank app.
export const ErrorBoundary = CrashScreen;

// Coming back to the app after this long asks for Face ID / fingerprint again.
const RELOCK_AFTER_MS = 5 * 60_000;

function Routes() {
  const { ready, session, needsProfile, userId } = useAuth();
  // Locked on launch if unlock is turned on; unlocked once you pass the check.
  const [locked, setLocked] = useState(() => isUnlockEnabled());
  const backgroundedAt = useRef<number | null>(null);
  const unlock = useCallback(() => setLocked(false), []);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  // One live connection for the whole app, only once you're past onboarding.
  useRealtimeSync(ready && !needsProfile ? userId : null);

  // Signed out: forget everything cached for that account.
  useEffect(() => {
    if (ready && !userId) queryClient.clear();
  }, [ready, userId]);

  // Tapping a push notification opens the Roam (or screen) it's about.
  const canOpenLinks = ready && !!session && !needsProfile;
  useEffect(() => {
    if (!canOpenLinks) return;
    return listenForPushTaps((url) => router.push(url as never));
  }, [canOpenLinks]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') backgroundedAt.current = Date.now();
      if (state === 'active' && backgroundedAt.current && Date.now() - backgroundedAt.current > RELOCK_AFTER_MS) {
        if (isUnlockEnabled()) setLocked(true);
      }
      if (state === 'active') backgroundedAt.current = null;
    });
    return () => sub.remove();
  }, []);

  const showLock = ready && !!session && locked && isUnlockEnabled();
  useEffect(() => {
    setAppLocked(showLock);
  }, [showLock]);

  // Don't evaluate the guards until we know whether someone's signed in.
  if (!ready) return null;

  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ground } }}>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={!!session && needsProfile}>
          <Stack.Screen name="(onboarding)" />
        </Stack.Protected>
        <Stack.Protected guard={!!session && !needsProfile}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
      </Stack>
      {/* A cover, not a replacement: whatever you were doing is still there after unlocking. */}
      {showLock ? (
        <View style={StyleSheet.absoluteFill}>
          <LockScreen onUnlocked={unlock} />
        </View>
      ) : null}
    </View>
  );
}

export default function RootLayout() {
  useUpdateChecks();
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
  });

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <StatusBar style="dark" />
            <Routes />
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
