import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { joinShort } from '@/lib/format';
import { buzzerIn, nightShort, standings, type OpenRoam } from '@/lib/open-roams';
import { vibeLabel } from '@/lib/roams';
import { colors, fonts } from '@/lib/theme';
import { Avatar, ProgressBar, Sticker, Tag } from './ui';

/** A "Buzzing" card on home for an open Roam that's still being voted on. */
export function OpenRoamCard({ o, me, now }: { o: OpenRoam; me: string; now: number }) {
  const s = standings(o);
  const amHost = o.host_id === me;
  const iVoted = !!o.people.find((p) => p.user_id === me)?.voted_at;
  const total = o.people.length;
  const leading = [s.leadNight ? nightShort(s.leadNight) : null, vibeLabel(s.leadVibe)].filter(Boolean).join(' · ');
  const hot = !amHost && !iVoted;

  return (
    <Pressable accessibilityRole="button" onPress={() => router.push(`/open/${o.id}`)}>
      <Sticker color={hot ? colors.pink : colors.yellow} innerStyle={{ padding: 16, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {!amHost ? <Avatar profile={o.host} size={36} /> : null}
          <Text style={{ flex: 1, fontFamily: fonts.bodyBold, fontSize: 15, color: colors.ink }} numberOfLines={1}>
            {amHost ? `Your vote · ${o.nights.length} nights` : `${o.host?.display_name ?? 'Someone'}'s free some nights`}
          </Text>
          <Tag label={buzzerIn(o.buzzer_at, now)} dark />
        </View>

        <Text style={{ fontFamily: fonts.display, fontSize: 26, lineHeight: 28, letterSpacing: -0.6, color: colors.ink }}>
          {hot ? "You haven't voted yet" : leading ? `Leading: ${leading}` : 'Votes incoming…'}
        </Text>

        {hot ? (
          <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.ink }} numberOfLines={1}>
            {o.nights.map(nightShort).join(' · ')} · {s.votedCount} voted
          </Text>
        ) : (
          <View style={{ gap: 6 }}>
            <ProgressBar value={s.votedCount / Math.max(total, 1)} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13, color: colors.ink }}>
                {s.votedCount} of {total} voted
              </Text>
              {s.waitingOn.length ? (
                <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: fonts.bodyBold, fontSize: 13, color: colors.ink }}>
                  Waiting on {joinShort(s.waitingOn.map((p) => p.display_name ?? '?'))}
                </Text>
              ) : null}
            </View>
          </View>
        )}
      </Sticker>
    </Pressable>
  );
}

