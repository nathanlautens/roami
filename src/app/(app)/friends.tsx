import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Share, Text, TextInput, View } from 'react-native';

import { MoreIcon, ShareIcon } from '@/components/icons';
import { SafetySheet } from '@/components/safety-sheet';
import { TestTools } from '@/components/test-tools';
import { Body, Button, H1, Label, PersonRow, Screen, Sticker, Tag, TopBar } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { addFriend, useFriends } from '@/lib/data';
import { supabase } from '@/lib/supabase';
import { useAction } from '@/lib/use-action';
import { border, colors, fonts, radius } from '@/lib/theme';
import type { Profile } from '@/lib/types';

export default function Friends() {
  const { onboarding } = useLocalSearchParams<{ onboarding?: string }>();
  const { userId } = useAuth();
  const { data, reload } = useFriends();
  const [busyId, runAdd] = useAction();
  const [safetyFor, setSafetyFor] = useState<Profile | null>(null);

  async function add(id: string) {
    await runAdd(id, () => addFriend(id));
    reload();
  }

  async function decline(friendshipId: string) {
    await supabase.from('friendships').delete().eq('id', friendshipId);
    reload();
  }

  async function shareLink() {
    await Share.share({
      message: `Come roam with me on Roami. My friend code is ${myCode}, or tap this once you've got the app: roami://add/${userId}`,
    });
  }

  // Friend codes: the first 8 characters of someone's id, e.g. "3F9A12BC".
  const myCode = userId ? userId.slice(0, 8).toUpperCase() : '';
  const [code, setCode] = useState('');
  const [adding, runCode] = useAction();

  async function addByCode() {
    const clean = code.trim().toLowerCase().replace(/[^0-9a-f]/g, '');
    if (clean.length !== 8) {
      Alert.alert('Hmm', 'Friend codes are 8 letters and numbers.');
      return;
    }
    if (clean === myCode.toLowerCase()) {
      Alert.alert("That's you, babe", 'Ask your friend for their code.');
      return;
    }
    const result = await runCode('add', async () => {
      // Looked up on the server, one person at a time (profiles aren't listable).
      const { data } = await supabase.rpc('find_by_friend_code', { p_code: clean });
      const found = (data ?? []) as { id: string; display_name: string }[];
      if (found.length !== 1) return 'not_found' as const;
      const status = await addFriend(found[0].id);
      return status ? { status, name: found[0].display_name } : null;
    });
    if (result === 'not_found') {
      Alert.alert('No one by that code', 'Double-check it with your friend?');
      return;
    }
    if (!result) return;
    const { status, name } = result;
    setCode('');
    Alert.alert(
      status === 'accepted' ? `You and ${name} are friends!` : 'Request sent',
      status === 'accepted' ? 'Go send them a Roam.' : `Once ${name} adds you back, you can roam together.`,
    );
    reload();
  }

  return (
    <Screen
      footer={
        onboarding ? (
          <Button label={data.friends.length ? 'Next: start a circle' : 'Skip for now'} onPress={() => router.replace(data.friends.length ? '/circles/new?onboarding=1' : '/')} />
        ) : undefined
      }>
      <TopBar onBack={onboarding ? undefined : () => router.back()} />
      <H1 style={{ marginTop: 20, marginBottom: 8 }}>Find your people</H1>
      <Body style={{ marginBottom: 20 }}>Friends have to add each other back. Mutual vibes only.</Body>

      <View style={{ marginBottom: 20 }}>
        <TestTools onChange={reload} />
      </View>

      <Sticker color={colors.lime} innerStyle={{ padding: 16, gap: 12 }} style={{ marginBottom: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <Label>Your friend code</Label>
            <Text selectable style={{ fontFamily: fonts.display, fontSize: 30, letterSpacing: 2, color: colors.ink }}>{myCode}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Share your friend code" onPress={shareLink} style={{ width: 44, height: 44, borderRadius: 14, borderWidth: border, borderColor: colors.ink, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' }}>
            <ShareIcon size={20} />
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder="Their code"
            placeholderTextColor={colors.placeholderOnLime}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={9}
            accessibilityLabel="Friend's code"
            returnKeyType="done"
            onSubmitEditing={addByCode}
            style={{ flex: 1, minHeight: 48, paddingHorizontal: 14, borderWidth: border, borderColor: colors.ink, borderRadius: radius.sm, backgroundColor: colors.white, fontFamily: fonts.bodyBold, fontSize: 17, letterSpacing: 1.5, color: colors.ink }}
          />
          <Pressable accessibilityRole="button" onPress={addByCode} disabled={!!adding} style={{ minHeight: 48, paddingHorizontal: 18, borderRadius: radius.sm, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', opacity: adding ? 0.6 : 1 }}>
            <Text style={{ fontFamily: fonts.bodyBold, fontSize: 16, color: colors.lime }}>{adding ? '…' : 'Add'}</Text>
          </Pressable>
        </View>
      </Sticker>

      {data.incoming.length ? (
        <View style={{ marginBottom: 24 }}>
          <Label count={data.incoming.length}>Want to roam with you</Label>
          <View style={{ gap: 8, marginTop: 10 }}>
            {data.incoming.map(({ id, profile }) => (
              <PersonRow key={id} profile={profile}>
                <SmallButton label="Nah" onPress={() => decline(id)} />
                <SmallButton label="Add" primary busy={busyId === profile.id} onPress={() => add(profile.id)} />
              </PersonRow>
            ))}
          </View>
        </View>
      ) : null}

      <Button variant="dashed" icon={<ShareIcon size={18} />} label="Invite someone who's not here yet" onPress={shareLink} />

      {data.friends.length ? (
        <View style={{ marginTop: 28 }}>
          <Label count={data.friends.length}>Your friends</Label>
          <View style={{ gap: 8, marginTop: 10 }}>
            {data.friends.map((p) => (
              <PersonRow key={p.id} profile={p}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`More options for ${p.display_name}`}
                  onPress={() => setSafetyFor(p)}
                  hitSlop={8}
                  style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                  <MoreIcon size={20} />
                </Pressable>
              </PersonRow>
            ))}
          </View>
        </View>
      ) : null}

      {data.outgoing.length ? (
        <View style={{ marginTop: 28 }}>
          <Label>Waiting on them</Label>
          <View style={{ gap: 8, marginTop: 10 }}>
            {data.outgoing.map((p) => (
              <PersonRow key={p.id} profile={p}>
                <Tag label="Requested" />
              </PersonRow>
            ))}
          </View>
        </View>
      ) : null}
      <SafetySheet visible={!!safetyFor} person={safetyFor} onClose={() => setSafetyFor(null)} onBlocked={reload} />
    </Screen>
  );
}

function SmallButton({ label, onPress, primary, busy }: { label: string; onPress: () => void; primary?: boolean; busy?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={busy}
      style={{
        minHeight: 40,
        minWidth: 64,
        paddingHorizontal: 14,
        borderRadius: 12,
        borderWidth: border,
        borderColor: colors.ink,
        backgroundColor: primary ? colors.lime : colors.white,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: busy ? 0.5 : 1,
      }}>
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: colors.ink }}>{label}</Text>
    </Pressable>
  );
}
