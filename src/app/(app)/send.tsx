import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';

import { PinIcon } from '@/components/icons';
import { Avatar, Body, Button, Checkbox, Chip, Field, Label, Screen, Tag, TopBar } from '@/components/ui';
import { useCircles, useFriends } from '@/lib/data';
import { daysAgo, friendlyError, isStale, PROMPTS, VIBES, WHENS, windowFor, type WhenId } from '@/lib/roams';
import { celebrateSent } from '@/lib/celebrate';
import { openRoamError } from '@/lib/open-roams';
import { supabase } from '@/lib/supabase';
import { border, colors, fonts, radius } from '@/lib/theme';
import type { Vibe } from '@/lib/types';

const SPOTS: (number | null)[] = [null, 2, 4, 6, 10];

export default function SendRoam() {
  const params = useLocalSearchParams<{ what?: string; to?: string; mode?: string }>();
  const { data: circles } = useCircles();
  const { data: friends } = useFriends();

  const [circleIds, setCircleIds] = useState<Set<string>>(new Set());
  const [people, setPeople] = useState<Set<string>>(new Set(params.to ? params.to.split(',') : []));
  const [showPeople, setShowPeople] = useState(!!params.to);
  const [what, setWhat] = useState(params.what ?? '');
  const [vibe, setVibe] = useState<Vibe | null>(null);
  const [when, setWhen] = useState<WhenId>('tonight');
  const [where, setWhere] = useState('');
  const [spots, setSpots] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [placeholder] = useState(() => PROMPTS[Math.floor(Math.random() * PROMPTS.length)]);
  const [mode, setMode] = useState<'now' | 'find'>(params.mode === 'find' ? 'find' : 'now');
  // Find a night
  const [days] = useState(() => twoWeeks());
  const [nights, setNights] = useState<Set<string>>(new Set());
  const [buzzerId, setBuzzerId] = useState<string | null>(null);
  const [idea, setIdea] = useState('');

  const invitees = useMemo(() => {
    const ids = new Set(people);
    for (const c of circles) if (circleIds.has(c.id)) c.members.forEach((m) => ids.add(m.id));
    return ids;
  }, [circles, circleIds, people]);

  function toggle(set: Set<string>, setter: (s: Set<string>) => void, id: string) {
    Haptics.selectionAsync().catch(() => {});
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  }

  const firstNight = [...nights].sort()[0] ?? null;
  const buzzers = buzzerOptions(firstNight ? new Date(firstNight) : null);
  const buzzer = buzzers.find((b) => b.id === buzzerId) ?? buzzers.find((b) => b.id === 'tomorrow') ?? buzzers.at(-1) ?? null;

  async function startVote() {
    if (!nights.size || invitees.size === 0 || !buzzer) return;
    setSending(true);
    const { error } = await supabase.rpc('start_open_roam', {
      p_nights: [...nights].sort(),
      p_buzzer_at: buzzer.at.toISOString(),
      p_invitees: [...invitees],
      p_idea: idea.trim() || null,
    });
    setSending(false);
    if (error) {
      Alert.alert('Not started', openRoamError(error));
      return;
    }
    celebrateSent({
      what: `${nights.size} ${nights.size === 1 ? 'night' : 'nights'} on the table`,
      count: invitees.size,
      title: "Vote's open!",
      line: `Buzzer goes off ${buzzer.label.toLowerCase()}${buzzer.sub ? ` (${buzzer.sub})` : ''}.`,
    });
    router.dismissTo('/');
  }

  async function send() {
    if (mode === 'find') return startVote();
    if (!what.trim() || invitees.size === 0) return;
    setSending(true);
    const { start, end } = windowFor(when);
    const { error } = await supabase.rpc('send_roam', {
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
    // Back to home, where the "Roam sent!" celebration plays over the feed.
    celebrateSent({ what: what.trim(), count: invitees.size });
    router.dismissTo('/');
  }

  const n = invitees.size;
  const ready = mode === 'find' ? n > 0 && nights.size > 0 && !!buzzer : n > 0 && !!what.trim();
  const cta =
    n === 0
      ? 'Pick some people'
      : mode === 'find'
        ? !nights.size
          ? 'Pick your nights'
          : !buzzer
            ? 'Nights are too soon for a buzzer'
            : `Start the vote · ${n} ${n === 1 ? 'person' : 'people'}`
        : !what.trim()
          ? "What's the plan?"
          : `Send it to ${n} ${n === 1 ? 'person' : 'people'}`;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen footer={<Button label={cta} onPress={send} loading={sending} disabled={!ready} />}>
        <TopBar onBack={() => router.back()} close title="New Roam" />

        <View style={{ flexDirection: 'row', marginTop: 16, borderWidth: border, borderColor: colors.ink, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.white }}>
          {(
            [
              { id: 'now', label: "I'm free now" },
              { id: 'find', label: 'Find a night' },
            ] as const
          ).map((m) => (
            <Pressable
              key={m.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === m.id }}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setMode(m.id);
              }}
              style={{ flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', backgroundColor: mode === m.id ? colors.ink : colors.white }}>
              <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: mode === m.id ? colors.lime : colors.ink }}>{m.label}</Text>
            </Pressable>
          ))}
        </View>

        <Label style={{ marginTop: 18 }}>Who's it for?</Label>
        {friends.friends.length === 0 ? (
          <View style={{ gap: 10, marginTop: 8 }}>
            <Body>You need friends on Roami first. Tragic, fixable.</Body>
            <Button variant="dashed" label="Find your people" onPress={() => router.push('/friends')} />
          </View>
        ) : (
          <View style={{ gap: 8, marginTop: 8 }}>
            {(() => {
              const everyone = friends.friends.length > 0 && friends.friends.every((f) => invitees.has(f.id));
              return (
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: everyone }}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setPeople(everyone ? new Set() : new Set(friends.friends.map((f) => f.id)));
                    if (everyone) setCircleIds(new Set());
                  }}
                  style={[row, { backgroundColor: everyone ? colors.lime : colors.white }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: fonts.bodyBold, fontSize: 16, color: colors.ink }}>Everyone</Text>
                    <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.inkSoft }}>All {friends.friends.length} of your friends</Text>
                  </View>
                  <Checkbox checked={everyone} />
                </Pressable>
              );
            })()}
            {circles.map((c) => {
              const on = circleIds.has(c.id);
              return (
                <Pressable
                  key={c.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  onPress={() => toggle(circleIds, setCircleIds, c.id)}
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
                  const viaCircle = on && !people.has(f.id);
                  return (
                    <Pressable
                      key={f.id}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      onPress={() => !viaCircle && toggle(people, setPeople, f.id)}
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
                        opacity: viaCircle ? 0.6 : 1,
                      }}>
                      <Avatar profile={f} size={30} />
                      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: colors.ink }}>{f.display_name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <Button variant="dashed" label={circles.length ? 'Or pick people one by one' : 'Pick people'} onPress={() => setShowPeople(true)} />
            )}
          </View>
        )}

        {mode === 'find' ? (
          <>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 22 }}>
          <Label>Which nights are you free?</Label>
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: colors.violet }}>{nights.size} picked</Text>
        </View>
        <View style={{ flexDirection: 'row', marginTop: 10 }}>
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <Text key={i} style={{ flex: 1, textAlign: 'center', fontFamily: fonts.bodyBold, fontSize: 12, color: colors.inkSoft }}>{d}</Text>
          ))}
        </View>
        {[0, 1].map((week) => (
          <View key={week} style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
            {days.slice(week * 7, week * 7 + 7).map((d) => {
              const on = nights.has(d.iso);
              return (
                <Pressable
                  key={d.iso}
                  disabled={d.past}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on, disabled: d.past }}
                  accessibilityLabel={d.label}
                  onPress={() => toggle(nights, setNights, d.iso)}
                  style={{
                    flex: 1,
                    height: 46,
                    borderRadius: 12,
                    borderWidth: d.past ? 2 : border,
                    borderStyle: d.past ? 'dashed' : 'solid',
                    borderColor: d.past ? colors.mute : colors.ink,
                    backgroundColor: d.past ? 'transparent' : on ? colors.pink : colors.white,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <Text style={{ fontFamily: fonts.display, fontSize: 17, color: d.past ? colors.mute : colors.ink }}>{d.num}</Text>
                </Pressable>
              );
            })}
          </View>
        ))}

        <Label style={{ marginTop: 22 }}>Set the buzzer</Label>
        {firstNight ? (
          buzzers.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {buzzers.map((b) => {
                const on = buzzer?.id === b.id;
                return (
                  <Pressable
                    key={b.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setBuzzerId(b.id);
                    }}
                    style={{ flexBasis: '31%', flexGrow: 1, minHeight: 54, borderRadius: radius.sm, borderWidth: border, borderColor: colors.ink, backgroundColor: on ? colors.yellow : colors.white, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
                    <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: colors.ink }} numberOfLines={1}>{b.label}</Text>
                    {b.sub ? <Text style={{ fontFamily: fonts.body, fontSize: 11.5, color: colors.inkSoft }}>{b.sub}</Text> : null}
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <Body style={{ marginTop: 8 }}>Your first night is too soon for a vote. Pick later nights, or use I'm free now.</Body>
          )
        ) : (
          <Body style={{ marginTop: 8 }}>Pick your nights first. The buzzer goes off before the first one.</Body>
        )}
        <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.inkSoft, marginTop: 8 }}>
          Everyone votes until then. When it buzzes, the top night locks in.
        </Text>

        <Label style={{ marginTop: 22 }}>Got an idea? (optional)</Label>
        <View style={{ marginTop: 8 }}>
          <Field value={idea} onChangeText={setIdea} placeholder="e.g. that new taco place" maxLength={60} accessibilityLabel="Your idea" />
        </View>
          </>
        ) : (
          <>
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
          </>
        )}
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

// ─── Find a night helpers ───────────────────────────────────────

const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** This week and next, Monday first. Each night starts at 7pm local. */
function twoWeeks() {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i, 19, 0, 0, 0);
    return {
      iso: d.toISOString(),
      num: d.getDate(),
      past: d.getTime() <= now.getTime(),
      label: `${d.getDate()} ${MONTHS_LONG[d.getMonth()]}`,
    };
  });
}

/** Buzzer choices that land before the first night. */
function buzzerOptions(firstNight: Date | null) {
  if (!firstNight) return [];
  const now = new Date();
  const at = (days: number, h: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, h, 0, 0, 0);
  const nightBefore = new Date(firstNight.getFullYear(), firstNight.getMonth(), firstNight.getDate() - 1, 18, 0, 0, 0);
  const all = [
    ...(__DEV__ ? [{ id: 'test', label: 'In 2 min', sub: 'test mode', at: new Date(now.getTime() + 2 * 60_000) }] : []),
    { id: 'soon', label: 'In 2 hours', sub: '', at: new Date(now.getTime() + 2 * 3600_000) },
    { id: 'tonight', label: 'Tonight', sub: '9pm', at: at(0, 21) },
    { id: 'tomorrow', label: 'Tomorrow', sub: '12pm', at: at(1, 12) },
    { id: 'nightBefore', label: 'Night before', sub: '6pm', at: nightBefore },
  ];
  const seen = new Set<number>();
  return all.filter((b) => {
    const t = b.at.getTime();
    if (t <= now.getTime() + 60_000 || t > firstNight.getTime() || seen.has(t)) return false;
    seen.add(t);
    return true;
  });
}
