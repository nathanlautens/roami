import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import {
  Avatar,
  Body,
  Button,
  Checkbox,
  H1,
  InlineInput,
  Label,
  Loading,
  MissingScreen,
  PersonChip,
  ProgressBar,
  Screen,
  SelectTile,
  Sticker,
  Tag,
  TopBar,
} from '@/components/ui';
import { haptic } from '@/lib/haptics';
import { alertError } from '@/lib/alerts';
import { useAuth } from '@/lib/auth';
import {
  buzzerIn,
  nightDayName,
  nightLong,
  openRoamError,
  standings,
  useOpenRoam,
  useTick,
  type OpenRoam,
} from '@/lib/open-roams';
import { vibeLabel, VIBES } from '@/lib/roams';
import { busyLabel, eventsOnNight, useCalendarBusy } from '@/lib/calendar';
import { DAYS, HOUR, joinShort } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { toggleIn, useAction } from '@/lib/use-action';
import { border, colors, fonts, radius } from '@/lib/theme';
import type { Vibe } from '@/lib/types';

export default function OpenRoamScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const me = userId!;
  const { data: o, loading, error, reload } = useOpenRoam(id);
  const now = useTick(15_000);

  // When the buzzer passes while you're looking, lock it in.
  const buzzed = !!o && o.status === 'open' && new Date(o.buzzer_at).getTime() <= now;
  useEffect(() => {
    if (!buzzed) return;
    supabase.rpc('resolve_open_roam', { p_open: id }).then(({ error: e }) => {
      if (!e) reload();
    });
  }, [buzzed, id, reload]);

  if (loading && !o) return <Loading />;
  if (!o) {
    return <MissingScreen title={error ? "Couldn't load this one." : 'This vote has left the chat.'} error={error} onRetry={reload} />;
  }

  if (o.status !== 'open' || buzzed) return <Result o={o} me={me} />;
  // Remount the voting form when you switch between open Roams.
  return <Vote key={o.id} o={o} me={me} now={now} reload={reload} />;
}

// ─── Voting ─────────────────────────────────────────────────────

function Vote({ o, me, now, reload }: { o: OpenRoam; me: string; now: number; reload: () => void }) {
  const amHost = o.host_id === me;
  const iVoted = !!o.people.find((p) => p.user_id === me)?.voted_at;
  const [nights, setNights] = useState<Set<string>>(
    () => new Set(o.nightVotes.filter((v) => v.user_id === me).map((v) => v.night_start)),
  );
  const [vibes, setVibes] = useState<Set<Vibe>>(() => new Set(o.vibeVotes.filter((v) => v.user_id === me).map((v) => v.vibe)));
  const [pitch, setPitch] = useState('');
  const [saving, runSave] = useAction();
  const [busyIdea, runIdea] = useAction();

  // Everyone else's votes, plus mine as currently ticked (so counts move as you tap).
  const s = standings({
    ...o,
    nightVotes: [...o.nightVotes.filter((v) => v.user_id !== me), ...[...nights].map((n) => ({ user_id: me, night_start: n }))],
    vibeVotes: [...o.vibeVotes.filter((v) => v.user_id !== me), ...[...vibes].map((v) => ({ user_id: me, vibe: v }))],
  });
  const maxFree = Math.max(1, ...o.nights.map((n) => s.freeBy.get(n)?.length ?? 0));

  // What's already on your calendar on each night (if you've turned that on).
  const firstNight = o.nights[0] ? new Date(o.nights[0]) : null;
  const lastNight = o.nights.at(-1) ? new Date(new Date(o.nights.at(-1)!).getTime() + 6 * HOUR) : null;
  const calBusy = useCalendarBusy(firstNight ? new Date(firstNight.getTime() - 2 * HOUR) : null, lastNight);
  const profileOf = (uid: string) => o.people.find((p) => p.user_id === uid)?.profile;

  function toggle<T>(set: Set<T>, setter: (s: Set<T>) => void, v: T) {
    haptic.select();
    setter(toggleIn(set, v));
  }

  async function save() {
    const { error } = await runSave('save', () =>
      supabase.rpc('vote_open_roam', { p_open: o.id, p_nights: [...nights], p_vibes: [...vibes] }),
    );
    if (error) {
      alertError(error, openRoamError);
      return;
    }
    haptic.success();
    Alert.alert(
      nights.size ? 'Votes locked in' : 'Noted',
      nights.size ? `We'll buzz you when it's decided. ${buzzerIn(o.buzzer_at, now)}.` : "None of those nights work for you. No stress, there's always next time.",
    );
    reload();
    router.back();
  }

  async function upvote(ideaId: string) {
    const { error } = await runIdea(ideaId, () => supabase.rpc('toggle_open_roam_idea_vote', { p_idea: ideaId }));
    if (error) alertError(error, openRoamError);
    else haptic.select();
    reload();
  }

  async function addIdea() {
    const text = pitch.trim();
    if (!text) return;
    const { error } = await supabase.rpc('pitch_open_roam_idea', { p_open: o.id, p_text: text });
    if (error) {
      alertError(error, openRoamError);
      return;
    }
    setPitch('');
    reload();
  }

  return (
    <Screen keyboard
      footer={
        <Button
          label={iVoted && !amHost ? 'Update my votes' : amHost ? 'Save my picks' : 'Lock in my votes'}
          onPress={save}
          loading={!!saving}
        />
      }>
      <TopBar onBack={() => router.back()} right={<Tag label={buzzerIn(o.buzzer_at, now)} color={colors.yellow} />} />

      <Sticker color={amHost ? colors.yellow : colors.pink} rotate={-1} style={{ marginTop: 18 }} innerStyle={{ padding: 16, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Avatar profile={o.host} size={40} />
          <Text style={{ flex: 1, fontFamily: fonts.bodyBold, fontSize: 15, color: colors.ink }}>
            {amHost ? 'Your open Roam' : `${o.host?.display_name ?? 'Someone'}'s free a few nights`}
          </Text>
        </View>
        <Text style={{ fontFamily: fonts.display, fontSize: 30, lineHeight: 32, letterSpacing: -0.8, color: colors.ink }}>
          Pick a night, pick a vibe.
        </Text>
        <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.ink }}>
          {s.votedCount} of {o.people.length} have voted. Top night locks in at the buzzer.
        </Text>
      </Sticker>

      <Label style={{ marginTop: 24 }}>Which nights work for you?</Label>
      <View style={{ gap: 8, marginTop: 10 }}>
        {o.nights.map((n) => {
          const on = nights.has(n);
          const free = s.freeBy.get(n) ?? [];
          const names = free.map((uid) => (uid === me ? 'You' : profileOf(uid)?.display_name ?? '?'));
          const d = new Date(n);
          const plans = eventsOnNight(calBusy, n);
          return (
            <SelectTile
              key={n}
              role="checkbox"
              selected={on}
              selectedColor={colors.white}
              color={colors.ground}
              accessibilityLabel={`${nightLong(n)}, ${free.length} free`}
              onPress={() => toggle(nights, setNights, n)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10 }}>
              <View style={{ width: 50, alignItems: 'center' }}>
                <Text style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: colors.ink }}>{DAYS[d.getDay()].toUpperCase()}</Text>
                <Text style={{ fontFamily: fonts.display, fontSize: 24, lineHeight: 26, color: colors.ink }}>{d.getDate()}</Text>
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <ProgressBar
                  value={free.length / maxFree}
                  color={n === s.leadNight ? colors.lime : colors.lilac}
                  track={colors.muteFill}
                  height={10}
                  borderWidth={1.5}
                />
                <Text numberOfLines={1} style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.inkSoft }}>
                  {free.length} free{names.length ? ` · ${joinShort(names)}` : ''}
                </Text>
                {plans.length ? (
                  <Text numberOfLines={1} style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: colors.violet }}>
                    📅 You've got {busyLabel(plans[0])}
                    {plans.length > 1 ? ` +${plans.length - 1}` : ''}
                  </Text>
                ) : null}
              </View>
              <Checkbox checked={on} />
            </SelectTile>
          );
        })}
      </View>

      <Label style={{ marginTop: 24 }}>What are you in the mood for?</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
        {VIBES.map((v) => {
          const on = vibes.has(v.id);
          const count = s.vibeCounts.get(v.id) ?? 0;
          return (
            <Pressable
              key={v.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              onPress={() => toggle(vibes, setVibes, v.id)}
              style={{ minHeight: 38, paddingHorizontal: 12, borderWidth: 2, borderColor: colors.ink, borderRadius: 999, backgroundColor: on ? colors.ink : colors.white, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: on ? colors.white : colors.ink }}>{v.label}</Text>
              {count ? <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 14, color: on ? colors.mute : colors.inkSoft }}>{count}</Text> : null}
            </Pressable>
          );
        })}
      </View>

      <Label style={{ marginTop: 24 }}>Ideas</Label>
      <View style={{ gap: 8, marginTop: 10 }}>
        {o.ideas.map((i) => {
          const on = i.voters.includes(me);
          return (
            <View key={i.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingLeft: 14, paddingRight: 10, borderWidth: border, borderColor: colors.ink, borderRadius: radius.md, backgroundColor: colors.white }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: fonts.bodyBold, fontSize: 16, color: colors.ink }}>{i.text}</Text>
                <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.inkSoft }}>
                  pitched by {i.author?.id === me ? 'you' : i.author?.display_name ?? 'someone'}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${on ? 'Remove upvote from' : 'Upvote'} ${i.text}, ${i.voters.length} votes`}
                disabled={busyIdea === i.id}
                onPress={() => upvote(i.id)}
                style={{ width: 52, height: 52, borderWidth: border, borderColor: colors.ink, borderRadius: 14, backgroundColor: on ? colors.lime : colors.white, alignItems: 'center', justifyContent: 'center', opacity: busyIdea === i.id ? 0.5 : 1 }}>
                <Text style={{ fontFamily: fonts.display, fontSize: 14, color: colors.ink }}>▲</Text>
                <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: colors.ink }}>{i.voters.length}</Text>
              </Pressable>
            </View>
          );
        })}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <InlineInput
            value={pitch}
            onChangeText={setPitch}
            placeholder="Pitch an idea…"
            maxLength={60}
            accessibilityLabel="Pitch an idea"
            returnKeyType="done"
            onSubmitEditing={addIdea}
            style={{ flex: 1, borderStyle: 'dashed', backgroundColor: 'transparent', fontFamily: fonts.bodyBold }}
          />
          <Pressable
            accessibilityRole="button"
            onPress={addIdea}
            disabled={!pitch.trim()}
            style={{ minHeight: 48, paddingHorizontal: 16, borderRadius: 16, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', opacity: pitch.trim() ? 1 : 0.5 }}>
            <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: colors.lime }}>Add</Text>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}

// ─── After the buzzer ───────────────────────────────────────────

function Result({ o, me }: { o: OpenRoam; me: string }) {
  if (o.status === 'expired') {
    return (
      <Screen>
        <TopBar onBack={() => router.back()} />
        <H1 style={{ marginTop: 24 }}>The buzzer went off… after every night had passed.</H1>
        <Body style={{ marginTop: 12 }}>No plan this time. Throw out a fresh one?</Body>
        <View style={{ marginTop: 20 }}>
          <Button label="Find a night" onPress={() => router.replace('/send?mode=find')} />
        </View>
      </Screen>
    );
  }
  if (o.status === 'open') {
    return (
      <Screen>
        <TopBar onBack={() => router.back()} />
        <H1 style={{ marginTop: 24 }}>BZZZT! Counting the votes…</H1>
      </Screen>
    );
  }

  const night = o.winning_night!;
  const free = new Set(o.nightVotes.filter((v) => new Date(v.night_start).getTime() === new Date(night).getTime()).map((v) => v.user_id));
  free.add(o.host_id);
  const vibe = vibeLabel(o.winning_vibe);

  return (
    <Screen
      footer={o.locked_roam_id ? <Button label="See the Roam" onPress={() => router.replace(`/roam/${o.locked_roam_id}`)} /> : undefined}>
      <TopBar onBack={() => router.back()} right={<Tag label="Locked in" color={colors.lime} />} />
      <Sticker color={colors.lime} rotate={-1.5} style={{ marginTop: 20 }} innerStyle={{ padding: 20, gap: 10 }}>
        <Label>The people have spoken</Label>
        <Text style={{ fontFamily: fonts.display, fontSize: 40, lineHeight: 42, letterSpacing: -1.2, color: colors.ink }}>
          It's {nightDayName(night)}.
        </Text>
        <Text style={{ fontFamily: fonts.bodyBold, fontSize: 16, color: colors.ink }}>
          {nightLong(night)} · from 7pm{vibe ? ` · ${vibe}` : ''}
        </Text>
        {o.winning_idea ? <Text style={{ fontFamily: fonts.displayBold, fontSize: 20, color: colors.ink }}>“{o.winning_idea}”</Text> : null}
      </Sticker>
      <Label style={{ marginTop: 24 }} count={free.size}>Locked in</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 }}>
        {o.people
          .filter((p) => free.has(p.user_id))
          .map((p) => (
            <PersonChip key={p.user_id} profile={p.profile} label={p.user_id === me ? 'You' : p.profile?.display_name} />
          ))}
      </View>
    </Screen>
  );
}
