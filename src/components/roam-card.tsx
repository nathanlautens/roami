import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import type { FeedItem } from '@/lib/data';
import { formatWhen, roamState, STATE_LABEL, vibeLabel } from '@/lib/roams';
import { colors, fonts } from '@/lib/theme';
import { ChevronIcon, PinIcon } from './icons';
import { Avatar, AvatarStack, namesIn, Sticker, Tag } from './ui';

type Variant = 'hot' | 'mine' | 'grabs' | 'quiet';

export function RoamCard({ item, me, variant }: { item: FeedItem; me: string; variant: Variant }) {
  const { roam, ins } = item;
  const state = roamState(roam, ins.length);
  const people = ins.map((i) => i.profile);
  const others = ins.filter((i) => i.user_id !== roam.host_id).map((i) => i.profile);
  const open = () => router.push(`/roam/${roam.id}`);

  if (variant === 'quiet') {
    return (
      <Pressable accessibilityRole="button" onPress={open}>
        <Sticker shadow={null} innerStyle={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Avatar profile={roam.host} size={36} faded={state === 'cancelled' || state === 'fizzled'} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontFamily: fonts.bodyBold, fontSize: 16, color: colors.ink }}>{roam.what}</Text>
            <Text numberOfLines={1} style={{ fontFamily: fonts.body, fontSize: 14, color: colors.inkSoft }}>
              {roam.host_id === me ? 'You' : roam.host?.display_name} · {['cancelled', 'done', 'fizzled'].includes(state) ? STATE_LABEL[state] : formatWhen(roam)}
            </Text>
          </View>
          <ChevronIcon size={20} />
        </Sticker>
      </Pressable>
    );
  }

  const bg = variant === 'hot' ? colors.pink : variant === 'mine' ? colors.lime : colors.yellow;
  const vibe = vibeLabel(roam.vibe);

  return (
    <Pressable accessibilityRole="button" onPress={open}>
      <Sticker color={bg} innerStyle={{ padding: 16, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {variant !== 'mine' ? <Avatar profile={roam.host} size={36} /> : null}
          <Text style={{ flex: 1, fontFamily: fonts.bodyBold, fontSize: 15, color: colors.ink }} numberOfLines={1}>
            {variant === 'mine' ? formatWhen(roam) : `${roam.host?.display_name ?? 'Someone'} · ${formatWhen(roam)}`}
          </Text>
          {variant === 'mine' ? (
            <Tag label={STATE_LABEL[state]} dark />
          ) : variant === 'grabs' ? (
            <Tag label="Up for grabs" dark />
          ) : vibe ? (
            <Tag label={vibe} dark />
          ) : null}
        </View>
        <Text style={{ fontFamily: fonts.display, fontSize: variant === 'hot' ? 28 : 24, lineHeight: variant === 'hot' ? 30 : 27, letterSpacing: -0.6, color: colors.ink }}>
          {roam.what}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {variant === 'mine' && others.length ? <AvatarStack people={others} size={28} /> : null}
          {roam.location && variant !== 'mine' ? <PinIcon size={16} /> : null}
          <Text style={{ flex: 1, fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.ink }} numberOfLines={1}>
            {variant === 'mine'
              ? others.length
                ? namesIn(others, me)
                : 'Waiting for takers…'
              : `${roam.location ? roam.location + ' · ' : ''}${namesIn(people, me)}`}
          </Text>
        </View>
      </Sticker>
    </Pressable>
  );
}
