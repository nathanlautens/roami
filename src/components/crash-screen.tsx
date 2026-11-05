import type { ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Updates from 'expo-updates';
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';

import { colors } from '@/lib/theme';

/**
 * Shown instead of a blank screen if something crashes while drawing the app.
 * Deliberately plain (system font, no providers): it may render before fonts
 * or sign-in have loaded.
 */
export function CrashScreen({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
    if (__DEV__) console.error(error);
  }, [error]);

  // A full restart clears any bad state (and picks up a fix if an update was downloaded).
  const restart = () => (Updates.isEnabled ? Updates.reloadAsync().catch(() => retry()) : retry());

  return (
    <View style={{ flex: 1, backgroundColor: colors.ground, justifyContent: 'center', padding: 28, gap: 14 }}>
      <Text style={{ fontSize: 32, fontWeight: '800', color: colors.ink }}>Well, that wasn't the plan.</Text>
      <Text style={{ fontSize: 16, lineHeight: 23, color: colors.inkSoft }}>
        Roami tripped over something. Your Roams are safe. Give it another go.
      </Text>
      {__DEV__ ? <Text style={{ fontSize: 13, color: colors.inkSoft }}>{error.message}</Text> : null}
      <Pressable
        accessibilityRole="button"
        onPress={retry}
        style={{ marginTop: 8, minHeight: 56, borderRadius: 18, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 18, fontWeight: '700', color: colors.lime }}>Try again</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={restart} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink, textDecorationLine: 'underline' }}>Restart Roami</Text>
      </Pressable>
    </View>
  );
}
