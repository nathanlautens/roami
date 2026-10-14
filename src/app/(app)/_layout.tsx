import { Stack } from 'expo-router';

import { colors } from '@/lib/theme';

export const unstable_settings = { initialRouteName: 'index' };

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ground } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="send" options={{ presentation: 'modal' }} />
      <Stack.Screen name="roam/[id]" />
      <Stack.Screen name="friends" />
      <Stack.Screen name="circles/index" />
      <Stack.Screen name="circles/[id]" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="add/[id]" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
