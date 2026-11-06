import { useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { supabase } from '@/lib/supabase';
import { colors, fonts } from '@/lib/theme';
import { Button, Sticker } from './ui';

/** Test-only shortcuts, shown in development only. Needs the mock friends and open Roams SQL. */
export function TestTools({ onChange }: { onChange?: () => void }) {
  const [busy, setBusy] = useState(false);
  if (!__DEV__) return null;

  /** Calls `fn`; on error shows the first matching hint (or the raw message), else `success(data)`. */
  async function run(fn: string, failTitle: string, hints: Record<string, string>, success: (data: unknown) => [string, string?]) {
    setBusy(true);
    const { data, error } = await supabase.rpc(fn);
    setBusy(false);
    if (error) {
      const hint = Object.keys(hints).find((k) => error.message.includes(k));
      Alert.alert(failTitle, hint ? hints[hint] : error.message);
    } else Alert.alert(...success(data));
    onChange?.();
  }

  const load = () =>
    run('seed_mock_friends', "Couldn't load test friends", {
      already_seeded: "You've already got test friends. Remove them first to start fresh.",
      seed_mock_friends: 'Run the mock friends SQL in Supabase first (supabase/migrations/20261014230000_mock_friends.sql).',
    }, (n) => [`${n} test friends loaded`, "They're split across 2 circles (Uni lot and Work wives), and 2 of them have sent you Roams. They'll answer any Roam you send them."]);

  const testVote = () =>
    run('seed_mock_open_roam', "Couldn't start a test vote", {
      load_test_friends_first: 'Load test friends first.',
      seed_mock_open_roam: 'Run the open Roams SQL in Supabase first (supabase/migrations/20261015000000_open_roams.sql).',
    }, () => ['Test vote started', 'A test friend wants to find a night. Most of the others have voted already. Vote from the Buzzing card on home. The buzzer goes off in 3 minutes, so keep the app open to see it.']);

  const clear = () =>
    Alert.alert('Remove test friends?', 'They and their Roams disappear. Your circles stay.', [
      { text: 'Keep them', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => run('clear_mock_friends', 'Hmm', {}, (n) => [`Removed ${n} test friends`]) },
    ]);

  return (
    <Sticker shadow={null} color={colors.muteFill} innerStyle={{ padding: 14, gap: 10 }}>
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13, letterSpacing: 1, color: colors.ink }}>TEST MODE · ONLY YOU SEE THIS</Text>
      <View style={{ gap: 4 }}>
        <Button variant="dashed" label={busy ? 'One sec…' : 'Load test friends'} onPress={load} />
        <Button variant="dashed" label="Start a test vote (buzzer in 3 min)" onPress={testVote} />
        <Button variant="link" label="Remove test friends" onPress={clear} />
      </View>
    </Sticker>
  );
}
