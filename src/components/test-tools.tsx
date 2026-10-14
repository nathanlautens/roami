import { useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { supabase } from '@/lib/supabase';
import { colors, fonts } from '@/lib/theme';
import { Button, Sticker } from './ui';

/**
 * Test-only shortcuts. Only shown in development (e.g. Expo Go), never in a
 * real build. Needs supabase/migrations/20261014230000_mock_friends.sql.
 */
export function TestTools({ onChange }: { onChange?: () => void }) {
  const [busy, setBusy] = useState(false);
  if (!__DEV__) return null;

  async function load() {
    setBusy(true);
    const { data, error } = await supabase.rpc('seed_mock_friends');
    setBusy(false);
    if (error) {
      Alert.alert(
        "Couldn't load test friends",
        error.message.includes('already_seeded')
          ? "You've already got test friends. Remove them first to start fresh."
          : error.message.includes('seed_mock_friends')
            ? 'Run the mock friends SQL in Supabase first (supabase/migrations/20261014230000_mock_friends.sql).'
            : error.message,
      );
      return;
    }
    Alert.alert(
      `${data} test friends loaded`,
      "They're split across 2 circles (Uni lot and Work wives), and 2 of them have sent you Roams. They'll answer any Roam you send them.",
    );
    onChange?.();
  }

  function clear() {
    Alert.alert('Remove test friends?', 'They and their Roams disappear. Your circles stay.', [
      { text: 'Keep them', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          const { data, error } = await supabase.rpc('clear_mock_friends');
          setBusy(false);
          if (error) Alert.alert('Hmm', error.message);
          else Alert.alert(`Removed ${data} test friends`);
          onChange?.();
        },
      },
    ]);
  }

  return (
    <Sticker shadow={null} color={colors.muteFill} innerStyle={{ padding: 14, gap: 10 }}>
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13, letterSpacing: 1, color: colors.ink }}>
        TEST MODE · ONLY YOU SEE THIS
      </Text>
      <View style={{ gap: 4 }}>
        <Button variant="dashed" label={busy ? 'One sec…' : 'Load test friends'} onPress={load} />
        <Button variant="link" label="Remove test friends" onPress={clear} />
      </View>
    </Sticker>
  );
}
