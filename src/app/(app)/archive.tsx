import { router } from 'expo-router';
import { useMemo } from 'react';
import { SectionList, Text, View } from 'react-native';

import { RoamCard } from '@/components/roam-card';
import { Body, H1, Label, Loading, Screen, TopBar } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useArchive, type FeedItem } from '@/lib/data';
import { longName } from '@/lib/roams';
import { colors, fonts } from '@/lib/theme';

/** Past and called-off Roams, grouped by month. A virtualized list: up to 200 can be here. */
export default function Archive() {
  const { userId } = useAuth();
  const { data: items, loading } = useArchive();

  const sections = useMemo(() => {
    const out: { title: string; data: FeedItem[] }[] = [];
    const thisYear = new Date().getFullYear();
    for (const it of items) {
      const d = new Date(it.roam.starts_at);
      const title = `${longName(d, 'month')}${d.getFullYear() !== thisYear ? ` ${d.getFullYear()}` : ''}`;
      const last = out.at(-1);
      if (last?.title === title) last.data.push(it);
      else out.push({ title, data: [it] });
    }
    return out;
  }, [items]);

  const roamedWith = useMemo(
    () => new Set(items.flatMap((i) => (i.mine.response === 'in' ? i.ins.map((p) => p.user_id) : []))).size,
    [items],
  );

  if (loading && !items.length) return <Loading />;

  return (
    <Screen scroll={false} style={{ paddingHorizontal: 0, paddingBottom: 0 }}>
      <SectionList
        sections={sections}
        keyExtractor={(it) => it.roam.id}
        renderItem={({ item }) => <RoamCard item={item} me={userId!} variant="quiet" />}
        renderSectionHeader={({ section }) => <Label style={{ marginTop: 22, marginBottom: 10 }}>{section.title}</Label>}
        ItemSeparatorComponent={Gap}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        initialNumToRender={12}
        windowSize={7}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
        ListHeaderComponent={
          <View>
            <TopBar onBack={() => router.back()} />
            <H1 style={{ marginTop: 20, marginBottom: 8 }}>The archive</H1>
            <Body>
              {items.length
                ? `${items.length} Roams in the books${roamedWith > 1 ? `, with ${roamedWith - 1} different people` : ''}. Iconic behaviour.`
                : 'Nothing here yet. Go make some memories.'}
            </Body>
          </View>
        }
        ListFooterComponent={
          items.length >= 200 ? (
            <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.inkSoft, marginTop: 16 }}>Showing your latest 200.</Text>
          ) : undefined
        }
      />
    </Screen>
  );
}

function Gap() {
  return <View style={{ height: 10 }} />;
}
