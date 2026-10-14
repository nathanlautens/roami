import { Contact, ContactField, requestPermissionsAsync } from 'expo-contacts';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Share, Text, TextInput, View } from 'react-native';

import { ShareIcon } from '@/components/icons';
import { TestTools } from '@/components/test-tools';
import { Avatar, Body, Button, H1, Label, Screen, Sticker, Tag, TopBar } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { SKIP_LOGIN } from '@/lib/config';
import { useFriends } from '@/lib/data';
import { toE164 } from '@/lib/phone';
import { supabase } from '@/lib/supabase';
import { border, colors, fonts, radius } from '@/lib/theme';
import type { Profile } from '@/lib/types';

export default function Friends() {
  const { onboarding } = useLocalSearchParams<{ onboarding?: string }>();
  const { userId } = useAuth();
  const { data, reload } = useFriends();
  const [matches, setMatches] = useState<Profile[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const friendIds = new Set(data.friends.map((f) => f.id));
  const outgoingIds = new Set(data.outgoing.map((f) => f.id));

  async function checkContacts() {
    setChecking(true);
    try {
      const { status } = await requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('No worries', 'Share your invite link instead and friends can add you.');
        return;
      }
      const all = await Contact.getAllDetails([ContactField.PHONES]);
      const phones = new Set<string>();
      for (const c of all) {
        for (const p of c.phones ?? []) {
          const e = p.number ? toE164(p.number) : null;
          if (e) phones.add(e);
        }
      }
      const { data: found, error } = await supabase.rpc('match_contacts', { p_phones: [...phones].slice(0, 2000) });
      if (error) throw error;
      setMatches((found ?? []) as Profile[]);
    } catch {
      Alert.alert("Couldn't check contacts", 'Try again in a sec?');
    } finally {
      setChecking(false);
    }
  }

  async function add(id: string) {
    setBusyId(id);
    const { error } = await supabase.rpc('add_friend', { p_target: id });
    setBusyId(null);
    if (error) Alert.alert('Hmm', 'Something went sideways. Try again?');
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
  const [adding, setAdding] = useState(false);

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
    setAdding(true);
    const { data: found } = await supabase
      .from('profiles')
      .select('id, display_name')
      .gte('id', `${clean}-0000-0000-0000-000000000000`)
      .lte('id', `${clean}-ffff-ffff-ffff-ffffffffffff`)
      .not('display_name', 'is', null)
      .limit(2);
    if (!found || found.length !== 1) {
      setAdding(false);
      Alert.alert('No one by that code', 'Double-check it with your friend?');
      return;
    }
    const { data: status, error } = await supabase.rpc('add_friend', { p_target: found[0].id });
    setAdding(false);
    if (error) {
      Alert.alert('Hmm', 'Something went sideways. Try again?');
      return;
    }
    setCode('');
    Alert.alert(
      status === 'accepted' ? `You and ${found[0].display_name} are friends!` : 'Request sent',
      status === 'accepted' ? 'Go send them a Roam.' : `Once ${found[0].display_name} adds you back, you can roam together.`,
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
            placeholderTextColor="#5E5670"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={9}
            accessibilityLabel="Friend's code"
            returnKeyType="done"
            onSubmitEditing={addByCode}
            style={{ flex: 1, minHeight: 48, paddingHorizontal: 14, borderWidth: border, borderColor: colors.ink, borderRadius: radius.sm, backgroundColor: colors.white, fontFamily: fonts.bodyBold, fontSize: 17, letterSpacing: 1.5, color: colors.ink }}
          />
          <Pressable accessibilityRole="button" onPress={addByCode} disabled={adding} style={{ minHeight: 48, paddingHorizontal: 18, borderRadius: radius.sm, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', opacity: adding ? 0.6 : 1 }}>
            <Text style={{ fontFamily: fonts.bodyBold, fontSize: 16, color: colors.lime }}>{adding ? '…' : 'Add'}</Text>
          </Pressable>
        </View>
      </Sticker>

      {data.incoming.length ? (
        <View style={{ marginBottom: 24 }}>
          <Label>Want to roam with you · {data.incoming.length}</Label>
          <View style={{ gap: 8, marginTop: 10 }}>
            {data.incoming.map(({ id, profile }) => (
              <Row key={id} profile={profile}>
                <SmallButton label="Nah" onPress={() => decline(id)} />
                <SmallButton label="Add" primary busy={busyId === profile.id} onPress={() => add(profile.id)} />
              </Row>
            ))}
          </View>
        </View>
      ) : null}

      {SKIP_LOGIN ? null : <Label>Already on Roami</Label>}
      <View style={{ gap: 8, marginTop: 10 }}>
        {SKIP_LOGIN ? null : matches === null ? (
          <Button variant="dashed" label={checking ? 'Checking…' : 'Check my contacts'} onPress={checkContacts} />
        ) : matches.length === 0 ? (
          <Body>None of your contacts are here yet. Send them the link!</Body>
        ) : (
          matches.map((p) => (
            <Row key={p.id} profile={p}>
              {friendIds.has(p.id) ? (
                <Tag label="Friends" color={colors.lime} dark />
              ) : outgoingIds.has(p.id) ? (
                <Tag label="Requested" />
              ) : (
                <SmallButton label="Add" primary busy={busyId === p.id} onPress={() => add(p.id)} />
              )}
            </Row>
          ))
        )}
        <Button variant="dashed" icon={<ShareIcon size={18} />} label="Invite someone who's not here yet" onPress={shareLink} />
      </View>

      {data.friends.length ? (
        <View style={{ marginTop: 28 }}>
          <Label>Your friends · {data.friends.length}</Label>
          <View style={{ gap: 8, marginTop: 10 }}>
            {data.friends.map((p) => (
              <Row key={p.id} profile={p} />
            ))}
          </View>
        </View>
      ) : null}

      {data.outgoing.length ? (
        <View style={{ marginTop: 28 }}>
          <Label>Waiting on them</Label>
          <View style={{ gap: 8, marginTop: 10 }}>
            {data.outgoing.map((p) => (
              <Row key={p.id} profile={p}>
                <Tag label="Requested" />
              </Row>
            ))}
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

function Row({ profile, children }: { profile: Profile; children?: React.ReactNode }) {
  return (
    <Sticker shadow={null} rounded={radius.md} innerStyle={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10 }}>
      <Avatar profile={profile} size={40} />
      <Text style={{ flex: 1, fontFamily: fonts.bodyBold, fontSize: 16, color: colors.ink }}>{profile.display_name}</Text>
      {children}
    </Sticker>
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
