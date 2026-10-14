import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddPersonIcon, CirclesIcon, PeopleIcon, PlusIcon } from '@/components/icons';
import { RoamCard } from '@/components/roam-card';
import { SentCelebration } from '@/components/sent-celebration';
import { TestTools } from '@/components/test-tools';
import { Avatar, Body, Button, Sticker } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useFeed, useFriends, type FeedItem } from '@/lib/data';
import { effectiveResponse, isActive } from '@/lib/roams';
import { colors, fonts } from '@/lib/theme';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function Feed() {
  const { profile, userId } = useAuth();
  const me = userId!;
  const { data: items, loading, error, reload } = useFeed();
  const { data: friends, reload: reloadFriends } = useFriends();

  const sections = useMemo(() => {
    const byStart = (a: FeedItem, b: FeedItem) => a.roam.starts_at.localeCompare(b.roam.starts_at);
    const waiting: FeedItem[] = [];
    const grabs: FeedItem[] = [];
    const mine: FeedItem[] = [];
    const going: FeedItem[] = [];
    const recent: FeedItem[] = [];
    for (const it of items) {
      const { roam, mine: inv } = it;
      const response = effectiveResponse(inv, roam);
      if (!isActive(roam)) recent.push(it);
      else if (roam.host_id === me) mine.push(it);
      else if (roam.status === 'up_for_grabs' && response === 'in') grabs.push(it);
      else if (response === null || response === 'maybe') waiting.push(it);
      else if (response === 'in') going.push(it);
      else recent.push(it); // said Can't
    }
    return {
      waiting: waiting.sort(byStart),
      grabs: grabs.sort(byStart),
      mine: mine.sort(byStart),
      going: going.sort(byStart),
      recent: recent.sort((a, b) => b.roam.starts_at.localeCompare(a.roam.starts_at)),
    };
  }, [items, me]);

  const now = new Date();
  const empty = !loading && items.length === 0;
  const noFriends = friends.friends.length === 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 140, gap: 14 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={reload} tintColor={colors.ink} />}>
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

        <Section dot={colors.yellow} title="Up for grabs" items={sections.grabs} me={me} variant="grabs" />
        <Section dot={colors.pink} title="Waiting on you" items={sections.waiting} me={me} variant="hot" />
        <Section dot={colors.lime} title="Your Roams" items={sections.mine} me={me} variant="mine" />
        <Section dot={colors.lilac} title="You're in" items={sections.going} me={me} variant="quiet" />
        <Section dot={colors.mute} title="Recently" items={sections.recent} me={me} variant="quiet" />

        {empty && !noFriends ? (
          <View style={{ paddingVertical: 32, gap: 8 }}>
            <Text style={{ fontFamily: fonts.display, fontSize: 28, color: colors.ink }}>Suspiciously quiet.</Text>
            <Body>Be the main character. Hit the pink button and send a Roam.</Body>
          </View>
        ) : null}
      </ScrollView>

      <NavBar />
      <SentCelebration />
    </SafeAreaView>
  );
}

function Section({
  dot,
  title,
  items,
  me,
  variant,
}: {
  dot: string;
  title: string;
  items: FeedItem[];
  me: string;
  variant: 'hot' | 'mine' | 'grabs' | 'quiet';
}) {
  if (!items.length) return null;
  return (
    <View style={{ gap: 12, marginTop: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dot, borderWidth: 2, borderColor: colors.ink }} />
        <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13, letterSpacing: 1, color: colors.ink }}>
          {title.toUpperCase()} · {items.length}
        </Text>
      </View>
      {items.map((it) => (
        <RoamCard key={it.roam.id} item={it} me={me} variant={variant} />
      ))}
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
