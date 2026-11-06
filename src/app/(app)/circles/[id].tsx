import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { Body, Button, Checkbox, Field, H1, Label, Loading, PersonRow, Progress, Screen, TopBar } from '@/components/ui';
import { useCircles, useFriends } from '@/lib/data';
import { supabase } from '@/lib/supabase';
import { colors, fonts } from '@/lib/theme';
import type { Circle } from '@/lib/types';

/** /circles/new makes a circle; /circles/<id> edits one. */
export default function CircleEditor() {
  const { id, onboarding } = useLocalSearchParams<{ id: string; onboarding?: string }>();
  const isNew = id === 'new';
  const { data: circles, loading } = useCircles();
  const existing = circles.find((c) => c.id === id);

  if (!isNew && !existing) {
    if (loading) return <Loading />;
    return (
      <Screen>
        <TopBar onBack={() => router.back()} />
        <H1 style={{ marginTop: 24 }}>This circle's gone.</H1>
      </Screen>
    );
  }
  return <CircleForm key={existing?.id ?? 'new'} id={id} circle={existing} onboarding={!!onboarding} />;
}

function CircleForm({ id, circle, onboarding }: { id: string; circle?: Circle; onboarding: boolean }) {
  const isNew = !circle;
  const existing = circle;
  const { data: friends, loading, error: friendsError } = useFriends();
  const friendsLoading = loading || !!friendsError;
  const [name, setName] = useState(circle?.name ?? '');
  const [picked, setPicked] = useState<Set<string>>(() => new Set(circle?.members.map((m) => m.id) ?? []));
  const [saving, setSaving] = useState(false);

  function toggle(fid: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(fid)) next.delete(fid);
      else next.add(fid);
      return next;
    });
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed || friendsLoading) return; // wait for your friends list, or everyone would look removed
    setSaving(true);
    try {
      // Only current friends can be in a circle (someone you've since unfriended is dropped).
      const friendIds = new Set(friends.friends.map((f) => f.id));
      const want = [...picked].filter((fid) => friendIds.has(fid));
      const had = new Set(circle?.members.map((m) => m.id) ?? []);

      let circleId = id;
      if (isNew) {
        const { data, error } = await supabase.from('crews').insert({ name: trimmed }).select('id').single();
        if (error) throw error;
        circleId = data.id;
      } else {
        const { error } = await supabase.from('crews').update({ name: trimmed }).eq('id', id);
        if (error) throw error;
      }
      // Change only who was added or removed, so a failed save can't empty the circle.
      const added = want.filter((fid) => !had.has(fid));
      const removed = [...had].filter((fid) => !want.includes(fid));
      if (added.length) {
        const { error } = await supabase
          .from('crew_members')
          .upsert(added.map((member_id) => ({ crew_id: circleId, member_id })), { ignoreDuplicates: true });
        if (error) throw error;
      }
      if (removed.length) {
        const { error } = await supabase.from('crew_members').delete().eq('crew_id', circleId).in('member_id', removed);
        if (error) throw error;
      }
      if (onboarding) router.replace('/');
      else router.back();
    } catch {
      Alert.alert("Couldn't save the circle", 'Try again?');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    Alert.alert(`Delete ${existing?.name}?`, 'Your friends stay your friends. Only the circle goes.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('crews').delete().eq('id', id);
          router.back();
        },
      },
    ]);
  }

  return (
    <Screen footer={<Button label={isNew ? 'Make it official' : 'Save circle'} onPress={save} loading={saving} disabled={!name.trim() || friendsLoading} />}>
      <TopBar
        onBack={onboarding ? undefined : () => router.back()}
        right={
          onboarding ? (
            <Progress step={2} of={3} />
          ) : !isNew ? (
            <Button variant="link" label="Delete" onPress={remove} />
          ) : undefined
        }
      />
      <H1 style={{ marginTop: 20, marginBottom: 8 }}>{isNew ? 'Start a circle' : 'Edit circle'}</H1>
      <Body style={{ marginBottom: 20 }}>Group your people. Only you see circles, so name them whatever. We won't tell.</Body>

      <Label>Circle name</Label>
      <View style={{ marginTop: 8 }}>
        <Field big value={name} onChangeText={setName} placeholder="Uni lot" maxLength={40} accessibilityLabel="Circle name" />
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 24, marginBottom: 10 }}>
        <Label>Your friends</Label>
        <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: colors.violet }}>{picked.size} picked</Text>
      </View>

      {friends.friends.length === 0 ? (
        <View style={{ gap: 12 }}>
          <Body>Add some friends first, then put them in circles.</Body>
          <Button variant="dashed" label="Find your people" onPress={() => router.push('/friends')} />
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          {friends.friends.map((f) => {
            const on = picked.has(f.id);
            return (
              <PersonRow key={f.id} profile={f} role="checkbox" checked={on} onPress={() => toggle(f.id)} color={on ? colors.white : colors.ground}>
                <Checkbox checked={on} />
              </PersonRow>
            );
          })}
        </View>
      )}
    </Screen>
  );
}
