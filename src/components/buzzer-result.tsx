import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { nightDayName, nightLong, vibeName, type OpenRoam } from '@/lib/open-roams';
import { colors, fonts } from '@/lib/theme';
import { Avatar, Button, Sticker } from './ui';

/** "BZZZT! It's Friday." The moment an open Roam locks in. */
export function BuzzerResult({ o, me, onClose }: { o: OpenRoam; me: string; onClose: () => void }) {
  const [pop] = useState(() => new Animated.Value(0));
  const [shake] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(shake, { toValue: 1, duration: 70, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(shake, { toValue: -1, duration: 70, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(shake, { toValue: 0, duration: 70, easing: Easing.linear, useNativeDriver: true }),
        Animated.delay(900),
      ]),
    ).start();
  }, [pop, shake]);

  if (!o.winning_night) return null;
  const night = o.winning_night;
  const sameNight = (a: string) => new Date(a).getTime() === new Date(night).getTime();
  const freeIds = new Set(o.nightVotes.filter((v) => sameNight(v.night_start)).map((v) => v.user_id));
  freeIds.add(o.host_id);
  const lockedIn = o.people.filter((p) => freeIds.has(p.user_id));
  const cantMake = o.people.filter((p) => !freeIds.has(p.user_id));
  const iAmIn = freeIds.has(me);
  const amHost = o.host_id === me;
  const vibe = vibeName(o.winning_vibe);

  const seeRoam = () => {
    onClose();
    if (o.locked_roam_id) router.push(`/roam/${o.locked_roam_id}`);
  };

  const scale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });
  const wiggle = shake.interpolate({ inputRange: [-1, 1], outputRange: ['-11deg', '-3deg'] });

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        accessibilityLabel="Close"
        style={{ flex: 1, backgroundColor: 'rgba(23, 18, 31, 0.6)', justifyContent: 'center', paddingHorizontal: 20 }}>
        <Animated.View style={{ transform: [{ scale }] }}>
          <Pressable onPress={() => {}} accessible={false}>
            <Animated.View style={{ alignSelf: 'center', zIndex: 2, marginBottom: -16, transform: [{ rotate: wiggle }] }}>
              <Sticker color={colors.yellow} rounded={22} innerStyle={{ paddingVertical: 8, paddingHorizontal: 22 }}>
                <Text style={{ fontFamily: fonts.display, fontSize: 40, letterSpacing: -1, color: colors.ink }}>BZZZT!</Text>
              </Sticker>
            </Animated.View>

            <Sticker color={colors.lime} offset={6} rounded={28} innerStyle={{ paddingTop: 30, paddingHorizontal: 20, paddingBottom: 20, gap: 14 }}>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13, letterSpacing: 1, color: colors.ink }}>THE PEOPLE HAVE SPOKEN</Text>
                <Text style={{ fontFamily: fonts.display, fontSize: 44, lineHeight: 46, letterSpacing: -1.5, color: colors.ink, marginTop: 6 }}>
                  It's {nightDayName(night)}.
                </Text>
                <Text style={{ fontFamily: fonts.bodyBold, fontSize: 16, color: colors.ink, marginTop: 4 }}>{nightLong(night)} · from 7pm</Text>
              </View>

              {vibe || o.winning_idea ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
                  {vibe ? (
                    <View style={{ minHeight: 32, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.ink, justifyContent: 'center' }}>
                      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: colors.white }}>{vibe}</Text>
                    </View>
                  ) : null}
                  {o.winning_idea ? (
                    <View style={{ minHeight: 32, paddingHorizontal: 12, borderRadius: 999, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.white, justifyContent: 'center' }}>
                      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: colors.ink }}>{o.winning_idea}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              <Sticker shadow={null} rounded={20} innerStyle={{ padding: 12, gap: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13, letterSpacing: 1, color: colors.ink }}>LOCKED IN · {lockedIn.length}</Text>
                  <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13, color: colors.violet }}>{iAmIn ? "You're in" : "You're not in (yet)"}</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                  {lockedIn.map((p) => (
                    <View key={p.user_id} style={{ alignItems: 'center', gap: 3, width: 46 }}>
                      <Avatar profile={p.profile} size={40} />
                      <Text numberOfLines={1} style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: colors.ink }}>
                        {p.user_id === me ? 'You' : p.profile?.display_name}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
                {cantMake.length ? (
                  <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.inkSoft }}>
                    Can't do {nightDayName(night)}: {cantMake.map((p) => (p.user_id === me ? 'you' : p.profile?.display_name)).join(', ')}.
                    {iAmIn ? " We'll get 'em next time." : ' Plans change. You can still say In.'}
                  </Text>
                ) : null}
              </Sticker>

              <Button label="See the Roam" onPress={seeRoam} />
              <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.ink, textAlign: 'center', marginTop: -4 }}>
                {amHost ? "You're hosting. It's on your home screen now." : `${o.host?.display_name ?? 'The host'} is hosting.`}
              </Text>
            </Sticker>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}
