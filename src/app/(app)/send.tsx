import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';

import { PinIcon } from '@/components/icons';
import { Avatar, Body, Button, Checkbox, Chip, Field, Label, Screen, Tag, TopBar } from '@/components/ui';
import { useCrews, useFriends } from '@/lib/data';
import { daysAgo, friendlyError, isStale, PROMPTS, VIBES, WHENS, windowFor, type WhenId } from '@/lib/roams';
import { supabase } from '@/lib/supabase';
import { border, colors, fonts, radius } from '@/lib/theme';
import type { Vibe } from '@/lib/types';

const SPOTS: (number | null)[] = [null, 2, 4, 6, 10];

export default function SendRoam() {
  const params = useLocalSearchParams<{ what?: string; to?: string }>();
  const { data: crews } = useCrews();
  const { data: friends } = useFriends();

  const [crewIds, setCrewIds] = useState<Set<string>>(new Set());
  const [people, setPeople] = useState<Set<string>>(new Set(params.to ? params.to.split(',') : []));
  const [showPeople, setShowPeople] = useState(!!params.to);
  const [what, setWhat] = useState(params.what ?? '');
  const [vibe, setVibe] = useState<Vibe | null>(null);
  const [when, setWhen] = useState<WhenId>('tonight');
  const [where, setWhere] = useState('');
  const [spots, setSpots] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [placeholder] = useState(() => PROMPTS[Math.floor(Math.random() * PROMPTS.length)]);

  const invitees = useMemo(() => {
    const ids = new Set(people);
    for (const c of crews) if (crewIds.has(c.id)) c.members.forEach((m) => ids.add(m.id));
    return ids;
  }, [crews, crewIds, people]);

  function toggle(set: Set<string>, setter: (s: Set<string>) => void, id: string) {
    Haptics.selectionAsync().catch(() => {});
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  }

  async function send() {
    if (!what.trim() || invitees.size === 0) return;
    setSending(true);
    const { start, end } = windowFor(when);
    const { data, error } = await supabase.rpc('send_roam', {
      p_what: what.trim(),
      p_vibe: vibe,
      p_location: where.trim() || null,
      p_starts_at: start.toISOString(),
      p_ends_at: end.toISOString(),
      p_max_spots: spots,
      p_invitees: [...invitees],
    });
    setSending(false);
    if (error) {
      Alert.alert('Not sent', friendlyError(error));
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    router.replace(`/roam/${data as string}`);
  }

  const n = invitees.size;
  const cta = n === 0 ? 'Pick some people' : !what.trim() ? "What's the plan?" : `Send it to ${n} ${n === 1 ? 'person' : 'people'}`;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen footer={<Button label={cta} onPress={send} loading={sending} disabled={n === 0 || !what.trim()} />}>
        <TopBar onBack={() => router.back()} close title="New Roam" />

        <Label style={{ marginTop: 18 }}>Who's it for?</Label>
        {friends.friends.length === 0 ? (
          <View style={{ gap: 10, marginTop: 8 }}>
            <Body>You need friends on Roami first. Tragic, fixable.</Body>
            <Button variant="dashed" label="Find your people" onPress={() => router.push('/friends')} />
          </View>
        ) : (
          <View style={{ gap: 8, marginTop: 8 }}>
            {crews.map((c) => {
              const on = crewIds.has(c.id);
              return (
                <Pressable
                  key={c.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  onPress={() => toggle(crewIds, setCrewIds, c.id)}
                  style={[row, { backgroundColor: on ? colors.lime : colors.white }]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontFamily: fonts.bodyBold, fontSize: 16, color: colors.ink }}>{c.name}</Text>
                    <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.inkSoft }}>
                      {c.members.length} people · {daysAgo(c.lastRoamedAt)}
                    </Text>
                  </View>
                  {isStale(c.lastRoamedAt) && c.members.length ? <Tag label="miss them?" color={colors.pink} dark /> : null}
                  <Checkbox checked={on} />
                </Pressable>
              );
            })}

            {showPeople ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                {friends.friends.map((f) => {
                  const on = invitees.has(f.id);
                  const viaCrew = on && !people.has(f.id);
                  return (
                    <Pressable
                      key={f.id}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      onPress={() => !viaCrew && toggle(people, setPeople, f.id)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        paddingLeft: 4,
                        paddingRight: 12,
                        minHeight: 40,
                        borderRadius: radius.pill,
                        borderWidth: 2,
                        borderColor: colors.ink,
                        backgroundColor: on ? colors.lime : colors.white,
                        opacity: viaCrew ? 0.6 : 1,
                      }}>
                      <Avatar profile={f} size={30} />
                      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: colors.ink }}>{f.display_name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <Button variant="dashed" label={crews.length ? 'Or pick people one by one' : 'Pick people'} onPress={() => setShowPeople(true)} />
            )}
          </View>
        )}

        <Label style={{ marginTop: 22 }}>What's the plan?</Label>
        <View style={{ marginTop: 8 }}>
          <Field
            big
            multiline
            value={what}
            onChangeText={setWhat}
            placeholder={placeholder}
            maxLength={80}
            accessibilityLabel="What's the plan?"
            style={{ minHeight: 72, textAlignVertical: 'top' }}
          />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {VIBES.map((v) => (
            <Chip key={v.id} label={v.label} selected={vibe === v.id} onPress={() => setVibe(vibe === v.id ? null : v.id)} />
          ))}
        </View>

        <Label style={{ marginTop: 22 }}>When are you free?</Label>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
          {WHENS.map((w) => {
            const on = when === w.id;
            return (
              <Pressable
                key={w.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setWhen(w.id);
                }}
                style={{
                  flex: 1,
                  minHeight: 56,
                  borderRadius: radius.sm,
                  borderWidth: border,
                  borderColor: colors.ink,
                  backgroundColor: on ? colors.pink : colors.white,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 2,
                }}>
                <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: colors.ink }} numberOfLines={1}>{w.label}</Text>
                <Text style={{ fontFamily: fonts.body, fontSize: 11.5, color: colors.inkSoft }}>{w.sub}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={[row, { marginTop: 10, borderStyle: 'dashed', backgroundColor: 'transparent' }]}>
          <PinIcon size={18} />
          <TextInput
            value={where}
            onChangeText={setWhere}
            placeholder="Where? (optional)"
            placeholderTextColor="#8B82A3"
            maxLength={80}
            accessibilityLabel="Where"
            style={{ flex: 1, fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.ink, minHeight: 28 }}
          />
        </View>

        <Label style={{ marginTop: 22 }}>Spots</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {SPOTS.map((sp) => (
            <Chip key={String(sp)} label={sp === null ? 'No limit' : `${sp}`} selected={spots === sp} onPress={() => setSpots(sp)} />
          ))}
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const row = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  gap: 10,
  padding: 12,
  borderWidth: border,
  borderColor: colors.ink,
  borderRadius: 16,
};
