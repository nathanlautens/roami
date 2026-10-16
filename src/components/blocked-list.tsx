import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { PROFILE } from '@/lib/data';
import { supabase } from '@/lib/supabase';
import { border, colors, fonts, radius } from '@/lib/theme';
import type { Profile } from '@/lib/types';
import { Avatar } from './ui';

/** People you've blocked, with an Unblock button. Hidden when empty. */
export function BlockedList() {
  const [people, setPeople] = useState<Profile[]>([]);

  const fetchBlocked = useCallback(async () => {
    const { data } = await supabase
      .from('blocks')
      .select(`blocked_id, profile:profiles!blocks_blocked_id_fkey(${PROFILE})`)
      .order('created_at', { ascending: false });
    return ((data ?? []) as unknown as { profile: Profile | null }[]).map((b) => b.profile).filter((p): p is Profile => !!p);
  }, []);
  const load = useCallback(() => fetchBlocked().then(setPeople), [fetchBlocked]);

  useEffect(() => {
    let cancelled = false;
    fetchBlocked().then((p) => !cancelled && setPeople(p));
    return () => {
      cancelled = true;
    };
  }, [fetchBlocked]);

  if (!people.length) return null;

  function unblock(p: Profile) {
    Alert.alert(`Unblock ${p.display_name}?`, "You won't be friends again automatically. Either of you can send a request.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unblock',
        onPress: async () => {
          await supabase.rpc('unblock_user', { p_user: p.id });
          load();
        },
      },
    ]);
  }

  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13, letterSpacing: 1, color: colors.ink }}>BLOCKED · {people.length}</Text>
      {people.map((p) => (
        <View
          key={p.id}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderWidth: border, borderColor: colors.ink, borderRadius: radius.md, backgroundColor: colors.white }}>
          <Avatar profile={p} size={36} faded />
          <Text style={{ flex: 1, fontFamily: fonts.bodyBold, fontSize: 15, color: colors.ink }}>{p.display_name}</Text>
          <Pressable accessibilityRole="button" onPress={() => unblock(p)} style={{ minHeight: 40, paddingHorizontal: 12, justifyContent: 'center' }}>
            <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: colors.violet }}>Unblock</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}
