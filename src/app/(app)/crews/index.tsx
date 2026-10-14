import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { ChevronIcon, PlusIcon } from '@/components/icons';
import { AvatarStack, Body, Button, H1, Screen, Sticker, Tag, TopBar } from '@/components/ui';
import { useCrews } from '@/lib/data';
import { daysAgo, isStale } from '@/lib/roams';
import { colors, fonts } from '@/lib/theme';

export default function Crews() {
  const { data: crews, loading } = useCrews();

  return (
    <Screen>
      <TopBar onBack={() => router.back()} right={
        <Pressable accessibilityRole="button" accessibilityLabel="New crew" onPress={() => router.push('/crews/new')} hitSlop={8}>
          <Sticker color={colors.pink} offset={3} rounded={14} innerStyle={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <PlusIcon size={20} />
          </Sticker>
        </Pressable>
      } />
      <H1 style={{ marginTop: 20, marginBottom: 8 }}>Your crews</H1>
      <Body style={{ marginBottom: 20 }}>Only you can see these. Name them whatever. We won't tell.</Body>

      {!loading && crews.length === 0 ? (
        <View style={{ gap: 12 }}>
          <Body>No crews yet. Group the people you roam with so sending a Roam is one tap.</Body>
          <Button label="Start a crew" onPress={() => router.push('/crews/new')} />
        </View>
      ) : null}

      <View style={{ gap: 12 }}>
        {crews.map((c) => (
          <Pressable key={c.id} accessibilityRole="button" onPress={() => router.push(`/crews/${c.id}`)}>
            <Sticker offset={4} innerStyle={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={{ fontFamily: fonts.displayBold, fontSize: 20, color: colors.ink }}>{c.name}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <AvatarStack people={c.members} size={26} />
                  <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.inkSoft, flexShrink: 1 }}>
                    {c.members.length} · {daysAgo(c.lastRoamedAt)}
                  </Text>
                </View>
              </View>
              {isStale(c.lastRoamedAt) && c.members.length ? <Tag label="miss them?" color={colors.pink} dark /> : null}
              <ChevronIcon size={20} />
            </Sticker>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}
