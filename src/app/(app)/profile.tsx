import { router } from 'expo-router';
import { View } from 'react-native';

import { ProfileForm } from '@/components/profile-form';
import { Button, H1, Screen, TopBar } from '@/components/ui';
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
      <H1 style={{ marginTop: 20 }}>You, but editable</H1>
      <View style={{ flex: 1 }}>
        <ProfileForm cta="Save" onSaved={() => router.back()} />
      </View>
    </Screen>
  );
}
