import {
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
} from '@expo-google-fonts/bricolage-grotesque';
import { DMSans_400Regular, DMSans_500Medium, DMSans_700Bold, useFonts } from '@expo-google-fonts/dm-sans';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LockScreen } from '@/components/lock-screen';
import { AuthProvider, useAuth } from '@/lib/auth';
import { isUnlockEnabled } from '@/lib/biometric';
import { colors } from '@/lib/theme';

SplashScreen.preventAutoHideAsync();

// Coming back to the app after this long asks for Face ID / fingerprint again.
const RELOCK_AFTER_MS = 5 * 60_000;

function Routes() {
  const { ready, session, needsProfile } = useAuth();
  // Locked on launch if unlock is turned on; unlocked once you pass the check.
  const [locked, setLocked] = useState(() => isUnlockEnabled());
  const backgroundedAt = useRef<number | null>(null);
  const unlock = useCallback(() => setLocked(false), []);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

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

  // Don't evaluate the guards until we know whether someone's signed in.
  if (!ready) return null;
  if (session && locked && isUnlockEnabled()) return <LockScreen onUnlocked={unlock} />;

  return (
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
  );
}

export default function RootLayout() {
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
        <AuthProvider>
          <StatusBar style="dark" />
          <Routes />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
