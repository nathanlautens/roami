import { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { authenticate, clearUnlockPrefs, unlockKind, unlockLabel } from '@/lib/biometric';
import { supabase } from '@/lib/supabase';
import { colors, fonts } from '@/lib/theme';
import { Body, Button, Sticker } from './ui';

/** Shown over the app until you pass Face ID / fingerprint / passcode. */
export function LockScreen({ onUnlocked }: { onUnlocked: () => void }) {
  const [label, setLabel] = useState('Face ID');
  const [trying, setTrying] = useState(false);

  async function tryUnlock() {
    setTrying(true);
    const ok = await authenticate('Unlock Roami');
    setTrying(false);
    if (ok) onUnlocked();
  }

  // Ask straight away when the app opens.
  useEffect(() => {
    let cancelled = false;
    unlockKind().then((k) => !cancelled && setLabel(unlockLabel(k)));
    authenticate('Unlock Roami').then((ok) => {
      if (ok && !cancelled) onUnlocked();
    });
    return () => {
      cancelled = true;
    };
  }, [onUnlocked]);

  function useEmail() {
    Alert.alert('Log in with email instead?', "You'll get a fresh 6-digit code.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Use email',
        onPress: async () => {
          clearUnlockPrefs();
          await supabase.auth.signOut();
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }}>
      <View style={{ flex: 1, paddingHorizontal: 24, justifyContent: 'center', gap: 28 }}>
        <Text style={{ fontFamily: fonts.display, fontSize: 64, letterSpacing: -2.5, color: colors.ink, textAlign: 'center' }}>
          roami<Text style={{ color: colors.pink }}>.</Text>
        </Text>
        <Sticker color={colors.lime} rotate={-2} innerStyle={{ padding: 20, gap: 6, alignItems: 'center' }}>
          <Text style={{ fontFamily: fonts.display, fontSize: 26, color: colors.ink }}>It's you, right?</Text>
          <Body style={{ textAlign: 'center', color: colors.ink }}>Quick {label} and you're in.</Body>
        </Sticker>
      </View>
      <View style={{ paddingHorizontal: 24, paddingBottom: 16, gap: 4 }}>
        <Button label={`Unlock with ${label}`} onPress={tryUnlock} loading={trying} />
        <Button variant="link" label="Log in with email instead" onPress={useEmail} />
      </View>
    </SafeAreaView>
  );
}
