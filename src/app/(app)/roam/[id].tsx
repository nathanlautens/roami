import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { AddPersonIcon, ClashIcon, PinIcon } from '@/components/icons';
import { Avatar, Body, Button, Checkbox, Chip, H1, Label, Loading, Screen, Sheet, Sticker, Tag, TopBar } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { findClashes, useFriends, useRoam } from '@/lib/data';
import {
  effectiveResponse,
  formatWhen,
  friendlyError,
  isActive,
  roamState,
  startsIn,
  STATE_LABEL,
  vibeLabel,
} from '@/lib/roams';
import { supabase } from '@/lib/supabase';
import { border, colors, fonts, radius } from '@/lib/theme';
import type { Response, Roam } from '@/lib/types';

const ANSWERS: { id: Response; label: string; color: string }[] = [
  { id: 'in', label: "I'm in", color: colors.lime },
  { id: 'maybe', label: 'Tempt me', color: colors.yellow },
  { id: 'cant', label: 'Next time', color: colors.ink },
];

const BAIL_REASONS = ['Plot twist', 'Too tired, sorry', 'Rain check?'];

export default function RoamScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const me = userId!;
  const { data, loading, error, reload } = useRoam(id);
  const { data: friends } = useFriends();

  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [clashes, setClashes] = useState<Roam[] | null>(null);
  const [skip, setSkip] = useState<string | null>(null);
  const [bailOpen, setBailOpen] = useState(false);
  const [bailNote, setBailNote] = useState(BAIL_REASONS[0]);
  const [bringOpen, setBringOpen] = useState(false);

  if (loading && !data.roam) return <Loading />;
  const roam = data.roam;
  if (!roam) {
    return (
      <Screen>
        <TopBar onBack={() => router.back()} />
        <H1 style={{ marginTop: 24 }}>{error ? "Couldn't load this Roam." : 'This Roam has left the chat.'}</H1>
        {error ? (
          <View style={{ gap: 12, marginTop: 12 }}>
            <Body>{error}</Body>
            <Button variant="dashed" label="Try again" onPress={reload} />
          </View>
        ) : null}
      </Screen>
    );
  }

  const ins = data.invites.filter((i) => i.response === 'in');
  const mine = data.invites.find((i) => i.user_id === me);
  const myResponse = mine ? effectiveResponse(mine, roam) : null;
  const amHost = roam.host_id === me;
  const state = roamState(roam, ins.length);
  const active = isActive(roam);
  const vibe = vibeLabel(roam.vibe);
  const noteValue = note ?? mine?.note ?? '';

  async function run(key: string, fn: () => PromiseLike<{ error: unknown }>, success?: () => void) {
    setBusy(key);
    const { error } = await fn();
    setBusy(null);
    if (error) {
      Alert.alert('Hmm', friendlyError(error));
      return false;
    }
    success?.();
    reload();
    return true;
  }

  const respond = (response: Response, roamId = roam.id) =>
    run(response, () => supabase.rpc('respond_to_roam', { p_roam: roamId, p_response: response, p_note: noteValue || null }));

  async function answer(response: Response) {
    Haptics.selectionAsync().catch(() => {});
    if (response === 'in' && myResponse !== 'in') {
      const found = await findClashes(me, roam!);
      if (found.length) {
        setClashes(found);
        setSkip(found[0].id);
        return;
      }
    }
    const ok = await respond(response);
    if (ok && response === 'in') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }

  async function resolveClash(chaos: boolean) {
    const list = clashes ?? [];
    setClashes(null);
    if (!chaos && skip) {
      const skipped = skip === roam!.id ? roam! : list.find((r) => r.id === skip);
      if (skipped) {
        if (skipped.host_id === me) {
          await run('skip', () => supabase.rpc('host_cant_make_it', { p_roam: skipped.id, p_note: 'Double-booked, sorry!' }));
        } else {
          await run('skip', () => supabase.rpc('respond_to_roam', { p_roam: skipped.id, p_response: 'cant', p_note: null }));
        }
      }
      if (skip === roam!.id) return;
    }
    await respond('in');
  }

  async function hostBail() {
    setBailOpen(false);
    setBusy('bail');
    const { data: status, error } = await supabase.rpc('host_cant_make_it', { p_roam: roam!.id, p_note: bailNote || null });
    setBusy(null);
    if (error) {
      Alert.alert('Hmm', friendlyError(error));
      return;
    }
    Alert.alert(
      status === 'up_for_grabs' ? "It's up for grabs" : 'Called off',
      status === 'up_for_grabs'
        ? "Everyone who's in can take over as host. No hard feelings."
        : 'Nobody was in yet, so it quietly disappears.',
    );
    reload();
  }

  async function bring(friendId: string) {
    setBringOpen(false);
    await run('bring', () => supabase.rpc('request_invite', { p_roam: roam!.id, p_friend: friendId }), () =>
      Alert.alert('Asked!', `${roam!.host?.display_name ?? 'The host'} will get to say yes or no.`),
    );
  }

  const pitchNewPlan = () => {
    const to = ins.map((i) => i.user_id).filter((uid) => uid !== me && uid !== roam.host_id);
    router.push({ pathname: '/send', params: { what: roam.what, to: to.join(',') } });
  };

  const others = data.invites.filter((i) => i.user_id !== me);
  const maybes = others.filter((i) => effectiveResponse(i, roam) === 'maybe');
  const cants = others.filter((i) => effectiveResponse(i, roam) === 'cant');
  const waitingOn = others.filter((i) => i.response === null);
  const notes = ins.filter((i) => i.note);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <TopBar onBack={() => router.back()} right={active ? <Tag label={startsIn(roam)} /> : <Tag label={STATE_LABEL[state]} dark />} />

        {/* The Roam */}
        <Sticker
          color={state === 'up_for_grabs' ? colors.yellow : amHost ? colors.lime : colors.pink}
          offset={6}
          rounded={radius.xl}
          rotate={-1.5}
          style={{ marginTop: 20 }}
          innerStyle={{ padding: 20, gap: 12, opacity: active ? 1 : 0.6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Avatar profile={roam.host} size={44} faded={state === 'up_for_grabs'} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: fonts.bodyBold, fontSize: 16, color: colors.ink }}>
                {state === 'up_for_grabs' ? 'Host needed' : amHost ? "You're hosting" : `${roam.host?.display_name ?? 'Someone'} is roaming`}
              </Text>
              <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.ink }}>{formatWhen(roam)}</Text>
            </View>
            {vibe ? <Tag label={vibe} dark /> : null}
          </View>
          <Text style={{ fontFamily: fonts.display, fontSize: 36, lineHeight: 37, letterSpacing: -1, color: colors.ink }}>{roam.what}</Text>
          {roam.location ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <PinIcon size={16} />
              <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: colors.ink }}>{roam.location}</Text>
            </View>
          ) : null}
          {roam.max_spots ? (
            <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.ink }}>
              {Math.max(0, roam.max_spots - ins.filter((i) => i.user_id !== roam.host_id).length)} of {roam.max_spots} spots left
            </Text>
          ) : null}
        </Sticker>

        {state === 'up_for_grabs' ? (
          <Sticker shadow={null} color={colors.white} style={{ marginTop: 18 }} innerStyle={{ padding: 14 }}>
            <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: colors.ink }}>
              The host can't make it{roam.bail_note ? `: "${roam.bail_note}"` : '.'}
            </Text>
          </Sticker>
        ) : null}

        {/* Who's in */}
        <Label style={{ marginTop: 26 }}>Who's in · {ins.length}</Label>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, marginTop: 10 }}>
          {ins.map((i) => (
            <View key={i.user_id} style={{ alignItems: 'center', gap: 4, width: 56 }}>
              <Avatar profile={i.profile} size={48} />
              <Text numberOfLines={1} style={{ fontFamily: fonts.bodyBold, fontSize: 13, color: colors.ink }}>
                {i.user_id === me ? 'You' : i.profile?.display_name}
              </Text>
            </View>
          ))}
          {!amHost && myResponse !== 'in' && active && roam.status === 'live' ? (
            <View style={{ alignItems: 'center', gap: 4, width: 56 }}>
              <View style={{ width: 48, height: 48, borderRadius: 24, borderWidth: border, borderStyle: 'dashed', borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: fonts.display, fontSize: 20, color: colors.ink }}>?</Text>
              </View>
              <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13, color: colors.ink }}>you?</Text>
            </View>
          ) : null}
        </ScrollView>

        {notes.length ? (
          <View style={{ gap: 8, marginTop: 14 }}>
            {notes.map((i) => (
              <Sticker key={i.user_id} shadow={null} rounded={16} innerStyle={{ paddingVertical: 10, paddingHorizontal: 14 }}>
                <Text style={{ fontFamily: fonts.body, fontSize: 15, color: colors.ink }}>
                  <Text style={{ fontFamily: fonts.bodyBold }}>{i.user_id === me ? 'You' : i.profile?.display_name}:</Text> {i.note}
                </Text>
              </Sticker>
            ))}
          </View>
        ) : null}

        {/* Host-only view */}
        {amHost && active ? (
          <View style={{ marginTop: 22, gap: 18 }}>
            {data.requests.length ? (
              <View style={{ gap: 8 }}>
                <Label>Can they come too?</Label>
                {data.requests.map((r) => (
                  <Sticker key={r.id} shadow={null} rounded={radius.md} innerStyle={{ padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Avatar profile={r.invitee} size={40} />
                    <Text style={{ flex: 1, fontFamily: fonts.body, fontSize: 15, color: colors.ink }}>
                      <Text style={{ fontFamily: fonts.bodyBold }}>{r.requester?.display_name}</Text> wants to bring{' '}
                      <Text style={{ fontFamily: fonts.bodyBold }}>{r.invitee?.display_name}</Text>
                    </Text>
                    <Chip label="Nah" onPress={() => run('req', () => supabase.rpc('decide_invite_request', { p_request: r.id, p_approve: false }))} />
                    <Chip label="Yes" selected selectedColor={colors.lime} onPress={() => run('req', () => supabase.rpc('decide_invite_request', { p_request: r.id, p_approve: true }))} />
                  </Sticker>
                ))}
              </View>
            ) : null}
            <PeopleLine label="Tempt me" people={maybes.map((i) => i.profile?.display_name ?? '?')} />
            <PeopleLine label="Next time" people={cants.map((i) => i.profile?.display_name ?? '?')} />
            <PeopleLine label="Haven't answered" people={waitingOn.map((i) => i.profile?.display_name ?? '?')} />
            <Button variant="dashed" label={busy === 'bail' ? 'One sec…' : "I can't make it anymore"} onPress={() => setBailOpen(true)} />
          </View>
        ) : null}

        {/* Up for grabs: anyone who's In can take over */}
        {!amHost && state === 'up_for_grabs' && myResponse === 'in' ? (
          <View style={{ marginTop: 22, gap: 10 }}>
            <Label>What now?</Label>
            <Button label="Take the wheel" loading={busy === 'take'} onPress={() => run('take', () => supabase.rpc('take_over_roam', { p_roam: roam.id }), () => Alert.alert("You're the host now", 'Glow up.'))} />
            <Button variant="dashed" label="Pitch a new plan" onPress={pitchNewPlan} />
            <Button variant="link" label="I'm out too" onPress={() => answer('cant')} />
          </View>
        ) : null}

        {/* Invitee: answer */}
        {!amHost && active && roam.status === 'live' ? (
          <View style={{ marginTop: 26, gap: 10 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {ANSWERS.map((a) => {
                const on = myResponse === a.id;
                const dark = on && a.id === 'cant';
                return (
                  <Pressable
                    key={a.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    disabled={!!busy}
                    onPress={() => answer(a.id)}
                    style={{ flex: a.id === 'in' ? 1.4 : 1, paddingRight: on ? 4 : 0, paddingBottom: on ? 4 : 0 }}>
                    {on ? <View style={{ position: 'absolute', left: 4, top: 4, right: 0, bottom: 0, borderRadius: radius.md, backgroundColor: colors.ink }} /> : null}
                    <View style={{ height: 64, borderRadius: radius.md, borderWidth: border, borderColor: colors.ink, backgroundColor: on ? a.color : colors.white, alignItems: 'center', justifyContent: 'center', opacity: busy && busy !== a.id ? 0.6 : 1 }}>
                      <Text style={{ fontFamily: fonts.display, fontSize: 18, color: dark ? colors.white : colors.ink }}>{busy === a.id ? '…' : a.label}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
            <TextInput
              value={noteValue}
              onChangeText={setNote}
              onEndEditing={() => myResponse && note !== null && respond(myResponse)}
              placeholder="Add a note… (optional)"
              placeholderTextColor="#8B82A3"
              maxLength={80}
              accessibilityLabel="Add a note"
              style={{ minHeight: 48, paddingHorizontal: 14, borderWidth: border, borderColor: colors.ink, borderRadius: 16, backgroundColor: colors.white, fontFamily: fonts.body, fontSize: 15, color: colors.ink }}
            />
            {mine?.response === 'maybe' && myResponse === 'cant' ? (
              <Body style={{ fontSize: 14 }}>Your Maybe expired an hour before the start. Still keen? Tap I'm in.</Body>
            ) : null}
            <Button
              variant="dashed"
              icon={<AddPersonIcon size={18} />}
              label={`Ask ${roam.host?.display_name ?? 'the host'} if you can bring someone`}
              onPress={() => setBringOpen(true)}
            />
          </View>
        ) : null}

        {!active ? (
          <Body style={{ marginTop: 24 }}>
            {state === 'cancelled' ? 'This one got called off. Rain check?' : state === 'fizzled' ? 'Nobody bit this time. No shame, try again.' : 'That was a good one.'}
          </Body>
        ) : null}
      </Screen>

      {/* Double-booked */}
      <Sheet visible={!!clashes} onClose={() => setClashes(null)}>
        <View style={{ alignItems: 'center', marginTop: 6 }}>
          <Sticker color={colors.yellow} offset={4} rotate={8} innerStyle={{ width: 72, height: 72, alignItems: 'center', justifyContent: 'center' }}>
            <ClashIcon size={36} />
          </Sticker>
        </View>
        <H1 style={{ textAlign: 'center', fontSize: 32, lineHeight: 34, marginTop: 16 }}>Ooh, popular.</H1>
        <Body style={{ textAlign: 'center', marginTop: 8, marginBottom: 18 }}>
          You're already in on something then. You can't be in two places (yet). Which one are you skipping?
        </Body>
        <View style={{ gap: 10 }}>
          {[...(clashes ?? []), roam].map((r) => {
            const on = skip === r.id;
            return (
              <Pressable
                key={r.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                onPress={() => setSkip(r.id)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: border, borderColor: colors.ink, borderRadius: 20, backgroundColor: on ? colors.muteFill : colors.white }}>
                <Avatar profile={r.host} size={44} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: fonts.displayBold, fontSize: 18, color: colors.ink, textDecorationLine: on ? 'line-through' : 'none' }}>{r.what}</Text>
                  <Text style={{ fontFamily: fonts.body, fontSize: 14, color: colors.inkSoft }}>
                    {r.host_id === me ? 'You' : r.host?.display_name} · {formatWhen(r)}{r.id === roam.id ? ' · new' : ''}
                  </Text>
                </View>
                {on ? <Tag label="skip" dark /> : null}
              </Pressable>
            );
          })}
        </View>
        <View style={{ marginTop: 20 }}>
          <Button label="Skip it" onPress={() => resolveClash(false)} />
          <Button variant="link" label="I'll try to do both, chaos mode" onPress={() => resolveClash(true)} />
        </View>
      </Sheet>

      {/* Host can't make it */}
      <Sheet visible={bailOpen} onClose={() => setBailOpen(false)}>
        <H1 style={{ fontSize: 30, lineHeight: 32 }}>Can't make it?</H1>
        <Body style={{ marginTop: 8, marginBottom: 16 }}>
          {ins.length > 1
            ? "Everyone who's in gets the chance to take over as host. The show goes on."
            : "Nobody's in yet, so it'll just be called off."}
        </Body>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {BAIL_REASONS.map((r) => (
            <Chip key={r} label={r} selected={bailNote === r} onPress={() => setBailNote(r)} />
          ))}
        </View>
        <TextInput
          value={bailNote}
          onChangeText={setBailNote}
          maxLength={80}
          placeholder="Or say why…"
          placeholderTextColor="#8B82A3"
          accessibilityLabel="Reason"
          style={{ minHeight: 48, paddingHorizontal: 14, borderWidth: border, borderColor: colors.ink, borderRadius: 16, backgroundColor: colors.white, fontFamily: fonts.body, fontSize: 15, color: colors.ink, marginBottom: 18 }}
        />
        <Button label={ins.length > 1 ? 'Hand it over' : 'Call it off'} onPress={hostBail} />
        <Button variant="link" label="Actually, I'm still going" onPress={() => setBailOpen(false)} />
      </Sheet>

      {/* Bring someone */}
      <Sheet visible={bringOpen} onClose={() => setBringOpen(false)}>
        <H1 style={{ fontSize: 30, lineHeight: 32 }}>Bring someone?</H1>
        <Body style={{ marginTop: 8, marginBottom: 16 }}>Pick a friend. {roam.host?.display_name ?? 'The host'} gets the final say.</Body>
        <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 8 }}>
          {friends.friends
            .filter((f) => f.id !== roam.host_id && !data.invites.some((i) => i.user_id === f.id))
            .map((f) => (
              <Pressable
                key={f.id}
                accessibilityRole="button"
                onPress={() => bring(f.id)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderWidth: border, borderColor: colors.ink, borderRadius: radius.md, backgroundColor: colors.white }}>
                <Avatar profile={f} size={40} />
                <Text style={{ flex: 1, fontFamily: fonts.bodyBold, fontSize: 16, color: colors.ink }}>{f.display_name}</Text>
                <Checkbox checked={false} />
              </Pressable>
            ))}
        </ScrollView>
        <Button variant="link" label="Never mind" onPress={() => setBringOpen(false)} />
      </Sheet>
    </KeyboardAvoidingView>
  );
}

function PeopleLine({ label, people }: { label: string; people: string[] }) {
  if (!people.length) return null;
  return (
    <View style={{ gap: 4 }}>
      <Label>{label} · {people.length}</Label>
      <Text style={{ fontFamily: fonts.body, fontSize: 15, color: colors.inkSoft }}>{people.join(', ')}</Text>
    </View>
  );
}
