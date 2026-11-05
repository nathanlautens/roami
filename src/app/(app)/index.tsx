import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddPersonIcon, CirclesIcon, PeopleIcon, PlusIcon } from '@/components/icons';
import { BuzzerResult } from '@/components/buzzer-result';
import { OpenRoamCard } from '@/components/open-roam-card';
import { RoamCard } from '@/components/roam-card';
import { SentCelebration } from '@/components/sent-celebration';
import { TestTools } from '@/components/test-tools';
import { UnlockPrompt } from '@/components/unlock-prompt';
import { Avatar, Body, Button, Sticker } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { syncCalendar } from '@/lib/calendar';
import { useAppLocked } from '@/lib/signals';
import { useFeed, useFriends, type FeedItem } from '@/lib/data';
import { markBuzzerSeen, resolveDue, seenBuzzers, useOpenRoams, useTick } from '@/lib/open-roams';
import { DAYS, effectiveResponse, isActive, MONTHS } from '@/lib/roams';
import { colors, fonts } from '@/lib/theme';

export default function Feed() {
  const { profile, userId } = useAuth();
  const me = userId!;
  const { data: items, loading, error, reload } = useFeed();
  const { data: friends, reload: reloadFriends } = useFriends();
  const { data: opens, reload: reloadOpens } = useOpenRoams();
  const tick = useTick(15_000);
  const [seen, setSeen] = useState(() => seenBuzzers());
  const locked = useAppLocked();

  // The buzzer: when one goes off, lock in the winner, then show the result.
  useEffect(() => {
    resolveDue(opens, tick).then((n) => {
      if (n) {
        reloadOpens();
        reload();
      }
    });
  }, [opens, tick, reload, reloadOpens]);

  // Keep the phone calendar in step with your Roams. Only what ends up in a calendar
  // event counts, so someone else answering a Roam doesn't trigger a sync.
  const calendarKey = useMemo(
    () =>
      items
        .filter((i) => i.mine.response === 'in')
        .map(({ roam: r }) => [r.id, r.starts_at, r.ends_at, r.what, r.location, r.status].join('~'))
        .sort()
        .join('|'),
    [items],
  );
  useEffect(() => {
    if (!loading) syncCalendar(me);
  }, [calendarKey, loading, me]);

  const buzzing = opens
    .filter((o) => o.status === 'open' && new Date(o.buzzer_at).getTime() > tick)
    .sort((a, b) => a.buzzer_at.localeCompare(b.buzzer_at));
  const justBuzzed = opens.find((o) => o.status === 'locked' && !seen.has(o.id));
  const refreshAll = () => {
    reload();
    reloadOpens();
  };

  const sections = useMemo(() => {
    const out: Record<Variant, FeedItem[]> = { going: [], grabs: [], mine: [], hot: [], quiet: [] };
    for (const it of [...items].sort((x, y) => x.roam.starts_at.localeCompare(y.roam.starts_at))) {
      const response = effectiveResponse(it.mine, it.roam);
      if (!isActive(it.roam)) continue; // over or called off: lives in the Archive
      if (it.roam.host_id === me) out.mine.push(it);
      // Up for grabs: only people who are In can take it over; for everyone else it's on hold.
      else if (it.roam.status === 'up_for_grabs') response === 'in' && out.grabs.push(it);
      else if (response === null || response === 'maybe') out.hot.push(it);
      else out[response === 'in' ? 'going' : 'quiet'].push(it); // quiet: said Can't (can still change their mind)
    }
    return out;
  }, [items, me]);

  const now = new Date();
  const empty = !loading && items.length === 0 && buzzing.length === 0;
  const noFriends = friends.friends.length === 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 140, gap: 14 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={refreshAll} tintColor={colors.ink} />}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, marginBottom: 8 }}>
          <View>
            <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.inkSoft }}>
              {DAYS[now.getDay()]}, {now.getDate()} {MONTHS[now.getMonth()]}
            </Text>
            <Text style={{ fontFamily: fonts.display, fontSize: 34, letterSpacing: -1, color: colors.ink }}>
              hey {profile?.display_name ?? 'you'}
            </Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Your profile" onPress={() => router.push('/profile')}>
            <Avatar profile={profile} size={48} />
          </Pressable>
        </View>

        {error ? (
          <Sticker color={colors.yellow} shadow={null} innerStyle={{ padding: 14, gap: 8 }}>
            <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: colors.ink }}>Couldn't load your Roams</Text>
            <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.ink }}>{error}</Text>
            <Button variant="dashed" label="Try again" onPress={reload} />
          </Sticker>
        ) : null}

        {noFriends && !loading ? (
          <Sticker color={colors.yellow} innerStyle={{ padding: 18, gap: 10 }}>
            <Text style={{ fontFamily: fonts.display, fontSize: 24, color: colors.ink }}>Suspiciously quiet.</Text>
            <Body style={{ color: colors.ink }}>Add your friends, make a circle, then throw out your first Roam.</Body>
            <Button label="Find your people" onPress={() => router.push('/friends?onboarding=1')} />
          </Sticker>
        ) : null}

        {noFriends && !loading ? (
          <TestTools onChange={() => { reload(); reloadFriends(); }} />
        ) : null}

        {friends.incoming.length ? (
          <Pressable accessibilityRole="button" onPress={() => router.push('/friends')}>
            <Sticker shadow={null} innerStyle={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <AddPersonIcon size={20} />
              <Text style={{ flex: 1, fontFamily: fonts.bodyBold, fontSize: 15, color: colors.ink }}>
                {friends.incoming.length} {friends.incoming.length === 1 ? 'person wants' : 'people want'} to roam with you
              </Text>
            </Sticker>
          </Pressable>
        ) : null}

        {buzzing.length ? (
          <Section dot={colors.yellow} title="Buzzing" count={buzzing.length}>
            {buzzing.map((o) => <OpenRoamCard key={o.id} o={o} me={me} now={tick} />)}
          </Section>
        ) : null}
        {FEED_SECTIONS.map(([variant, title, dot]) =>
          sections[variant].length ? (
            <Section key={variant} dot={dot} title={title} count={sections[variant].length}>
              {sections[variant].map((it) => <RoamCard key={it.roam.id} item={it} me={me} variant={variant} />)}
            </Section>
          ) : null,
        )}

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/archive')}
          style={{ alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, marginTop: 8 }}>
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: colors.inkSoft, textDecorationLine: 'underline' }}>
            See past Roams
          </Text>
        </Pressable>

        {empty && !noFriends ? (
          <View style={{ paddingVertical: 32, gap: 8 }}>
            <Text style={{ fontFamily: fonts.display, fontSize: 28, color: colors.ink }}>Suspiciously quiet.</Text>
            <Body>Be the main character. Hit the pink button and send a Roam.</Body>
          </View>
        ) : null}
      </ScrollView>

      <NavBar />
      <SentCelebration />
      <UnlockPrompt />
      {justBuzzed && !locked ? (
        <BuzzerResult
          key={justBuzzed.id}
          o={justBuzzed}
          me={me}
          onClose={() => {
            markBuzzerSeen(justBuzzed.id);
            setSeen(seenBuzzers());
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

type Variant = 'going' | 'grabs' | 'mine' | 'hot' | 'quiet';
// Feed order: what you've committed to, then what you're hosting, then what's waiting on you.
const FEED_SECTIONS: [Variant, string, string][] = [
  ['going', "You're in", colors.lilac],
  ['grabs', 'Up for grabs', colors.yellow],
  ['mine', 'Your Roams', colors.lime],
  ['hot', 'Waiting on you', colors.pink],
  ['quiet', 'You passed', colors.mute],
];

function Section({ dot, title, count, children }: { dot: string; title: string; count: number; children: React.ReactNode }) {
  return (
    <View style={{ gap: 12, marginTop: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dot, borderWidth: 2, borderColor: colors.ink }} />
        <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13, letterSpacing: 1, color: colors.ink }}>
          {title.toUpperCase()} · {count}
        </Text>
      </View>
      {children}
    </View>
  );
}

function NavBar() {
  return (
    <SafeAreaView edges={['bottom']} style={{ position: 'absolute', left: 16, right: 16, bottom: 8 }} pointerEvents="box-none">
      <View
        style={{
          height: 76,
          backgroundColor: colors.ink,
          borderRadius: 26,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-around',
          paddingHorizontal: 12,
        }}>
        <NavItem label="Friends" onPress={() => router.push('/friends')}>
          <PeopleIcon size={24} color={colors.white} />
        </NavItem>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send a Roam"
          onPress={() => router.push('/send')}
          style={{
            width: 64,
            height: 64,
            marginTop: -34,
            borderRadius: 22,
            backgroundColor: colors.pink,
            borderWidth: 3,
            borderColor: colors.ink,
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ rotate: '-6deg' }],
          }}>
          <PlusIcon size={30} />
        </Pressable>

        <NavItem label="Circles" onPress={() => router.push('/circles')}>
          <CirclesIcon size={24} color={colors.white} />
        </NavItem>
      </View>
    </SafeAreaView>
  );
}

function NavItem({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({ alignItems: 'center', justifyContent: 'center', minWidth: 72, minHeight: 56, gap: 4, opacity: pressed ? 0.6 : 1 })}>
      {children}
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: colors.white }}>{label}</Text>
    </Pressable>
  );
}
