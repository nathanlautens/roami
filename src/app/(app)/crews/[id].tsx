import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { Avatar, Body, Button, Checkbox, Field, H1, Label, Loading, Progress, Screen, TopBar } from '@/components/ui';
import { useCrews, useFriends } from '@/lib/data';
import { supabase } from '@/lib/supabase';
import { border, colors, fonts, radius } from '@/lib/theme';
import type { Crew } from '@/lib/types';

/** /crews/new makes a crew; /crews/<id> edits one. */
export default function CrewEditor() {
  const { id, onboarding } = useLocalSearchParams<{ id: string; onboarding?: string }>();
  const isNew = id === 'new';
  const { data: crews, loading } = useCrews();
  const existing = crews.find((c) => c.id === id);

  if (!isNew && !existing) {
    if (loading) return <Loading />;
    return (
      <Screen>
        <TopBar onBack={() => router.back()} />
        <H1 style={{ marginTop: 24 }}>This crew's gone.</H1>
      </Screen>
    );
  }
  return <CrewForm key={existing?.id ?? 'new'} id={id} crew={existing} onboarding={!!onboarding} />;
}

function CrewForm({ id, crew, onboarding }: { id: string; crew?: Crew; onboarding: boolean }) {
  const isNew = !crew;
  const existing = crew;
  const { data: friends } = useFriends();
  const [name, setName] = useState(crew?.name ?? '');
  const [picked, setPicked] = useState<Set<string>>(() => new Set(crew?.members.map((m) => m.id) ?? []));
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
    if (!trimmed) return;
    setSaving(true);
    try {
      let crewId = id;
      if (isNew) {
        const { data, error } = await supabase.from('crews').insert({ name: trimmed }).select('id').single();
        if (error) throw error;
        crewId = data.id;
      } else {
        const { error } = await supabase.from('crews').update({ name: trimmed }).eq('id', id);
        if (error) throw error;
        await supabase.from('crew_members').delete().eq('crew_id', id);
      }
      if (picked.size) {
        const { error } = await supabase
          .from('crew_members')
          .insert([...picked].map((member_id) => ({ crew_id: crewId, member_id })));
        if (error) throw error;
      }
      if (onboarding) router.replace('/');
      else router.back();
    } catch {
      Alert.alert("Couldn't save the crew", 'Try again?');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    Alert.alert(`Delete ${existing?.name}?`, 'Your friends stay your friends. Only the crew goes.', [
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
    <Screen footer={<Button label={isNew ? 'Make it official' : 'Save crew'} onPress={save} loading={saving} disabled={!name.trim()} />}>
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
      <H1 style={{ marginTop: 20, marginBottom: 8 }}>{isNew ? 'Start a crew' : 'Edit crew'}</H1>
      <Body style={{ marginBottom: 20 }}>Group your people. Only you see crews, so name them whatever. We won't tell.</Body>

      <Label>Crew name</Label>
      <View style={{ marginTop: 8 }}>
        <Field big value={name} onChangeText={setName} placeholder="Uni lot" maxLength={40} accessibilityLabel="Crew name" />
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 24, marginBottom: 10 }}>
        <Label>Your friends</Label>
        <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: colors.violet }}>{picked.size} picked</Text>
      </View>

      {friends.friends.length === 0 ? (
        <View style={{ gap: 12 }}>
          <Body>Add some friends first, then put them in crews.</Body>
          <Button variant="dashed" label="Find your people" onPress={() => router.push('/friends')} />
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          {friends.friends.map((f) => {
            const on = picked.has(f.id);
            return (
              <Pressable
                key={f.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                onPress={() => toggle(f.id)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  padding: 10,
                  borderWidth: border,
                  borderColor: colors.ink,
                  borderRadius: radius.md,
                  backgroundColor: on ? colors.white : colors.ground,
                }}>
                <Avatar profile={f} size={40} />
                <Text style={{ flex: 1, fontFamily: fonts.bodyBold, fontSize: 16, color: colors.ink }}>{f.display_name}</Text>
                <Checkbox checked={on} />
              </Pressable>
            );
          })}
        </View>
      )}
    </Screen>
  );
}
