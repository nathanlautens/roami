import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';

import { PinIcon } from '@/components/icons';
import { Avatar, Body, Button, Checkbox, Chip, Field, Label, Screen, SelectTile, Tag, TopBar } from '@/components/ui';
import { haptic } from '@/lib/haptics';
import { useCircles, useFriends } from '@/lib/data';
import { daysAgo, friendlyError, isStale, PROMPTS, VIBES, WHENS, windowFor, type WhenId } from '@/lib/roams';
import { celebrateSent } from '@/lib/celebrate';
import { openRoamError } from '@/lib/open-roams';
import { eventsOnNight, useCalendarBusy } from '@/lib/calendar';
import { HOUR, LONG_MONTHS, MINUTE, people as peopleCount } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { toggleIn, useAction } from '@/lib/use-action';
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
  const [sending, run] = useAction();
  const [placeholder] = useState(() => PROMPTS[Math.floor(Math.random() * PROMPTS.length)]);
  const [mode, setMode] = useState<'now' | 'find'>(params.mode === 'find' ? 'find' : 'now');
  // Find a night
  const [days] = useState(() => twoWeeks());
  // Dots on nights you already have plans (if calendar checks are on).
  const calBusy = useCalendarBusy(
    mode === 'find' ? new Date(new Date(days[0].iso).getTime() - 19 * HOUR) : null,
    mode === 'find' ? new Date(new Date(days[13].iso).getTime() + 5 * HOUR) : null,
  );
  const busyNight = (iso: string) => eventsOnNight(calBusy, iso).length > 0;
  const [nights, setNights] = useState<Set<string>>(new Set());
  const [buzzerId, setBuzzerId] = useState<string | null>(null);
  const [idea, setIdea] = useState('');

  // Only current friends can be invited, so the count on the button is the real count.
  const invitees = useMemo(() => {
    const friendIds = new Set(friends.friends.map((f) => f.id));
    const ids = new Set([...people].filter((id) => friendIds.has(id)));
    for (const c of circles) if (circleIds.has(c.id)) c.members.forEach((m) => friendIds.has(m.id) && ids.add(m.id));
    return ids;
  }, [circles, circleIds, people, friends.friends]);

  function toggle(set: Set<string>, setter: (s: Set<string>) => void, id: string) {
    haptic.select();
    setter(toggleIn(set, id));
  }

  const firstNight = [...nights].sort()[0] ?? null;
  const buzzers = buzzerOptions(firstNight ? new Date(firstNight) : null);
  const buzzer = buzzers.find((b) => b.id === buzzerId) ?? buzzers.find((b) => b.id === 'tomorrow') ?? buzzers.at(-1) ?? null;

  async function startVote() {
    if (!nights.size || invitees.size === 0 || !buzzer) return;
    const { error } = await run('vote', () =>
      supabase.rpc('start_open_roam', {
        p_nights: [...nights].sort(),
        p_buzzer_at: buzzer.at.toISOString(),
        p_invitees: [...invitees],
        p_idea: idea.trim() || null,
      }),
    );
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
    const { start, end } = windowFor(when);
    const { error } = await run('send', () =>
      supabase.rpc('send_roam', {
        p_what: what.trim(),
        p_vibe: vibe,
        p_location: where.trim() || null,
        p_starts_at: start.toISOString(),
        p_ends_at: end.toISOString(),
        p_max_spots: spots,
        p_invitees: [...invitees],
      }),
    );
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
            : `Start the vote · ${peopleCount(n)}`
        : !what.trim()
          ? "What's the plan?"
          : `Send it to ${peopleCount(n)}`;

  return (
    <Screen keyboard footer={<Button label={cta} onPress={send} loading={!!sending} disabled={!ready} />}>
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
              haptic.select();
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
              <SelectTile
                role="checkbox"
                selected={everyone}
                rounded={16}
                haptic
                onPress={() => {
                  setPeople(everyone ? new Set() : new Set(friends.friends.map((f) => f.id)));
                  if (everyone) setCircleIds(new Set());
                }}
                style={row}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: fonts.bodyBold, fontSize: 16, color: colors.ink }}>Everyone</Text>
                  <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.inkSoft }}>All {friends.friends.length} of your friends</Text>
                </View>
                <Checkbox checked={everyone} />
              </SelectTile>
            );
          })()}
          {circles.map((c) => {
            const on = circleIds.has(c.id);
            return (
              <SelectTile key={c.id} role="checkbox" selected={on} rounded={16} onPress={() => toggle(circleIds, setCircleIds, c.id)} style={row}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontFamily: fonts.bodyBold, fontSize: 16, color: colors.ink }}>{c.name}</Text>
                  <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.inkSoft }}>
                    {c.members.length} people · {daysAgo(c.lastRoamedAt)}
                  </Text>
                </View>
                {isStale(c.lastRoamedAt) && c.members.length ? <Tag label="miss them?" color={colors.pink} dark /> : null}
                <Checkbox checked={on} />
              </SelectTile>
            );
          })}

          {showPeople ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
              {friends.friends.map((f) => {
                const on = invitees.has(f.id);
                const viaCircle = on && !people.has(f.id);
                return (
                  <SelectTile
                    key={f.id}
                    role="checkbox"
                    selected={on}
                    rounded={radius.pill}
                    onPress={() => !viaCircle && toggle(people, setPeople, f.id)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 4, paddingRight: 12, minHeight: 40, borderWidth: 2, opacity: viaCircle ? 0.6 : 1 }}>
                    <Avatar profile={f} size={30} />
                    <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: colors.ink }}>{f.display_name}</Text>
                  </SelectTile>
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
                accessibilityLabel={`${d.label}${busyNight(d.iso) ? ', you have plans' : ''}`}
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
                {!d.past && busyNight(d.iso) ? (
                  <View style={{ position: 'absolute', bottom: 5, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.violet }} />
                ) : null}
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
                <SelectTile
                  key={b.id}
                  selected={on}
                  selectedColor={colors.yellow}
                  rounded={radius.sm}
                  haptic
                  onPress={() => setBuzzerId(b.id)}
                  style={{ flexBasis: '31%', flexGrow: 1, minHeight: 54, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
                  <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: colors.ink }} numberOfLines={1}>{b.label}</Text>
                  {b.sub ? <Text style={{ fontFamily: fonts.body, fontSize: 11.5, color: colors.inkSoft }}>{b.sub}</Text> : null}
                </SelectTile>
              );
            })}
          </View>
        ) : (
          <Body style={{ marginTop: 8 }}>Your first night is too soon for a vote. Pick later nights, or use I'm free now.</Body>
        )
      ) : (
        <Body style={{ marginTop: 8 }}>Pick your nights first. The buzzer goes off before the first one.</Body>
      )}
      {calBusy?.length ? (
        <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.inkSoft, marginTop: 8 }}>
          <Text style={{ color: colors.violet }}>●</Text> = you already have plans that night
        </Text>
      ) : null}
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
            <SelectTile
              key={w.id}
              selected={on}
              selectedColor={colors.pink}
              rounded={radius.sm}
              haptic
              onPress={() => setWhen(w.id)}
              style={{ flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 }}>
              <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: colors.ink }} numberOfLines={1}>{w.label}</Text>
              <Text style={{ fontFamily: fonts.body, fontSize: 11.5, color: colors.inkSoft }}>{w.sub}</Text>
            </SelectTile>
          );
        })}
      </View>

      <View style={[row, { marginTop: 10, borderWidth: border, borderColor: colors.ink, borderRadius: 16, borderStyle: 'dashed' }]}>
        <PinIcon size={18} />
        <TextInput
          value={where}
          onChangeText={setWhere}
          placeholder="Where? (optional)"
          placeholderTextColor={colors.placeholder}
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
  );
}

const row = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, padding: 12 };

// ─── Find a night helpers ───────────────────────────────────────

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
      label: `${d.getDate()} ${LONG_MONTHS[d.getMonth()]}`,
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
    ...(__DEV__ ? [{ id: 'test', label: 'In 2 min', sub: 'test mode', at: new Date(now.getTime() + 2 * MINUTE) }] : []),
    { id: 'soon', label: 'In 2 hours', sub: '', at: new Date(now.getTime() + 2 * HOUR) },
    { id: 'tonight', label: 'Tonight', sub: '9pm', at: at(0, 21) },
    { id: 'tomorrow', label: 'Tomorrow', sub: '12pm', at: at(1, 12) },
    { id: 'nightBefore', label: 'Night before', sub: '6pm', at: nightBefore },
  ];
  const seen = new Set<number>();
  return all.filter((b) => {
    const t = b.at.getTime();
    if (t <= now.getTime() + MINUTE || t > firstNight.getTime() || seen.has(t)) return false;
    seen.add(t);
    return true;
  });
}
