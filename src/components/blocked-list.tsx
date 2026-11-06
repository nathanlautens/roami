import { Alert, Pressable, Text, View } from 'react-native';

import { useLoader } from '@/lib/data';
import { PROFILE } from '@/lib/queries';
import { supabase } from '@/lib/supabase';
import { colors, fonts } from '@/lib/theme';
import type { Profile } from '@/lib/types';
import { Label, PersonRow } from './ui';

/** People you've blocked, with an Unblock button. Hidden when empty. */
export function BlockedList() {
  const { data: people, reload } = useLoader<Profile[]>(async () => {
    const { data } = await supabase
      .from('blocks')
      .select(`blocked_id, profile:profiles!blocks_blocked_id_fkey(${PROFILE})`)
      .order('created_at', { ascending: false });
    return ((data ?? []) as unknown as { profile: Profile | null }[]).map((b) => b.profile).filter((p): p is Profile => !!p);
  }, []);

  if (!people.length) return null;

  function unblock(p: Profile) {
    Alert.alert(`Unblock ${p.display_name}?`, "You won't be friends again automatically. Either of you can send a request.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unblock',
        onPress: async () => {
          await supabase.rpc('unblock_user', { p_user: p.id });
          reload();
        },
      },
    ]);
  }

  return (
    <View style={{ gap: 8 }}>
      <Label count={people.length}>Blocked</Label>
      {people.map((p) => (
        <PersonRow key={p.id} profile={p} avatarSize={36} nameSize={15} faded>
          <Pressable accessibilityRole="button" onPress={() => unblock(p)} style={{ minHeight: 40, paddingHorizontal: 12, justifyContent: 'center' }}>
            <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: colors.violet }}>Unblock</Text>
          </Pressable>
        </PersonRow>
      ))}
    </View>
  );
}
