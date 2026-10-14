import { router } from 'expo-router';
import { View } from 'react-native';

import { ProfileForm } from '@/components/profile-form';
import { Body, Button, H1, Screen, TopBar } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { SKIP_LOGIN } from '@/lib/config';

export default function ProfileScreen() {
  const { signOut } = useAuth();
  return (
    <Screen>
      <TopBar
        onBack={() => router.back()}
        right={SKIP_LOGIN ? undefined : <Button variant="link" label="Log out" onPress={signOut} />}
      />
      <H1 style={{ marginTop: 20 }}>Main character edit</H1>
      <Body style={{ marginTop: 8 }}>New pic, new name, same icon.</Body>
      <View style={{ flex: 1 }}>
        <ProfileForm cta="Lock it in" onSaved={() => router.back()} />
      </View>
    </Screen>
  );
}
