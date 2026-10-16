import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { RoamCard } from '@/components/roam-card';
import { Body, H1, Label, Loading, Screen, TopBar } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useArchive, type FeedItem } from '@/lib/data';
import { colors, fonts } from '@/lib/theme';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Past and called-off Roams, grouped by month. */
export default function Archive() {
  const { userId } = useAuth();
  const { data: items, loading } = useArchive();

  if (loading && !items.length) return <Loading />;

  const groups: { label: string; items: FeedItem[] }[] = [];
  for (const it of items) {
    const d = new Date(it.roam.starts_at);
    const label = `${MONTHS[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : ''}`;
    const last = groups.at(-1);
    if (last?.label === label) last.items.push(it);
    else groups.push({ label, items: [it] });
  }

  const roamedWith = new Set(items.flatMap((i) => (i.mine.response === 'in' ? i.ins.map((p) => p.user_id) : []))).size;

  return (
    <Screen>
      <TopBar onBack={() => router.back()} />
      <H1 style={{ marginTop: 20, marginBottom: 8 }}>The archive</H1>
      <Body style={{ marginBottom: 20 }}>
        {items.length
          ? `${items.length} Roams in the books${roamedWith > 1 ? `, with ${roamedWith - 1} different people` : ''}. Iconic behaviour.`
          : 'Nothing here yet. Go make some memories.'}
      </Body>

      <View style={{ gap: 22 }}>
        {groups.map((g) => (
          <View key={g.label} style={{ gap: 10 }}>
            <Label>{g.label}</Label>
            {g.items.map((it) => (
              <RoamCard key={it.roam.id} item={it} me={userId!} variant="quiet" />
            ))}
          </View>
        ))}
      </View>
      {items.length >= 200 ? (
        <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.inkSoft, marginTop: 16 }}>Showing your latest 200.</Text>
      ) : null}
    </Screen>
  );
}
