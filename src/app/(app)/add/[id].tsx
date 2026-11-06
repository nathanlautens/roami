import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Avatar, Body, Button, H1, Screen, TopBar } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { addFriend } from '@/lib/data';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

/** Opened from someone's invite link: roami://add/<their id> */
export default function AddFriend() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const [person, setPerson] = useState<Profile | null>(null);
  const [state, setState] = useState<'idle' | 'busy' | 'requested' | 'accepted'>('idle');

  useEffect(() => {
    // The full id in an invite link is the invitation, so the server shares just this one profile.
    supabase
      .rpc('profile_for_invite', { p_id: id })
      .then(({ data }) => setPerson(((data ?? []) as Profile[])[0] ?? null));
  }, [id]);

  async function add() {
    setState('busy');
    setState((await addFriend(id)) ?? 'idle');
  }

  const isMe = id === userId;

  return (
    <Screen footer={
      state === 'requested' || state === 'accepted' || isMe ? (
        <Button label="Back to Roams" onPress={() => router.replace('/')} />
      ) : (
        <Button label="Add them" onPress={add} loading={state === 'busy'} disabled={!person} />
      )
    }>
      <TopBar onBack={() => router.replace('/')} close />
      <View style={{ alignItems: 'center', marginTop: 48, gap: 16 }}>
        <Avatar profile={person} size={120} />
        <H1 style={{ textAlign: 'center' }}>
          {isMe
            ? "That's you, babe."
            : state === 'accepted'
              ? `You and ${person?.display_name ?? 'them'} are friends!`
              : state === 'requested'
                ? 'Request sent'
                : `Roam with ${person?.display_name ?? '…'}?`}
        </H1>
        <Body style={{ textAlign: 'center' }}>
          {state === 'requested' ? "Once they add you back, you can send each other Roams." : 'Friends can send each other Roams.'}
        </Body>
      </View>
    </Screen>
  );
}
