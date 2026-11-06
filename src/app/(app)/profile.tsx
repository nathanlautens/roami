import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { BlockedList } from '@/components/blocked-list';
import { CalendarSettings } from '@/components/calendar-settings';
import { ProfileForm } from '@/components/profile-form';
import { Body, Button, H1, Label, Screen, Sticker, SwitchRow, TopBar } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { removePhotos } from '@/lib/avatar';
import {
  authenticate,
  clearUnlockPrefs,
  isUnlockEnabled,
  setUnlockEnabled,
  unlockKind,
  unlockLabel,
  type UnlockKind,
} from '@/lib/biometric';
import { removeAllRoamiEvents, setCalendarPrefs } from '@/lib/calendar';
import { SKIP_LOGIN } from '@/lib/config';
import { supabase } from '@/lib/supabase';
import { colors, fonts } from '@/lib/theme';

export default function ProfileScreen() {
  const { signOut, session, userId } = useAuth();
  const [kind, setKind] = useState<UnlockKind>(null);
  const [unlock, setUnlock] = useState(isUnlockEnabled());
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    unlockKind().then(setKind);
  }, []);

  const label = unlockLabel(kind);

  async function toggleUnlock(on: boolean) {
    if (on && !(await authenticate(`Use ${label} for Roami`))) return;
    setUnlockEnabled(on);
    setUnlock(on);
  }

  function logOut() {
    Alert.alert('Log out?', "You'll need an email code to get back in.", [
      { text: 'Stay', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: () => {
          clearUnlockPrefs();
          signOut();
        },
      },
    ]);
  }

  function deleteAccount() {
    Alert.alert(
      'Delete your account?',
      "This wipes your profile, friends, circles and every Roam you've hosted or answered. It can't be undone.",
      [
        { text: 'Keep my account', style: 'cancel' },
        {
          text: 'Delete forever',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            // Photos first (storage files can only be removed through the Storage API).
            if (userId) await removePhotos(userId);
            const { error } = await supabase.rpc('delete_my_account');
            setDeleting(false);
            if (error) {
              Alert.alert("Couldn't delete your account", 'Try again, or email admin@roami.com and we\'ll do it for you.');
              return;
            }
            clearUnlockPrefs();
            // Take the Roams Roami added off your calendar, since they no longer exist.
            await removeAllRoamiEvents().catch(() => {});
            setCalendarPrefs({ sync: false, showPlans: false });
            await supabase.auth.signOut();
          },
        },
      ],
    );
  }

  return (
    <Screen>
      <TopBar onBack={() => router.back()} />
      <H1 style={{ marginTop: 20 }}>Main character edit</H1>
      <Body style={{ marginTop: 8 }}>New pic, new name, same icon.</Body>
      <View style={{ minHeight: 560 }}>
        <ProfileForm cta="Lock it in" onSaved={() => router.back()} />
      </View>

      {!SKIP_LOGIN ? (
        <View style={{ marginTop: 32, gap: 12 }}>
          <Label>Account</Label>
          {session?.user.email ? (
            <Text style={{ fontFamily: fonts.body, fontSize: 14, color: colors.inkSoft }}>Signed in as {session.user.email}</Text>
          ) : null}

          {kind ? (
            <Sticker shadow={null} innerStyle={{ padding: 14 }}>
              <SwitchRow large title={`Unlock with ${label}`} sub="Asked when you open Roami" value={unlock} onChange={toggleUnlock} />
            </Sticker>
          ) : null}

          <CalendarSettings />
          <BlockedList />
          <Button variant="dashed" label="Log out" onPress={logOut} />
          <Button variant="link" label={deleting ? 'Deleting…' : 'Delete my account'} onPress={deleteAccount} />
        </View>
      ) : null}
    </Screen>
  );
}
