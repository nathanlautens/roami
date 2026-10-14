import { Stack } from 'expo-router';

import { colors } from '@/lib/theme';

export const unstable_settings = { initialRouteName: 'setup' };

export default function OnboardingLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ground } }} />;
}
