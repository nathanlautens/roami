import * as Haptics from 'expo-haptics';

/** Haptic taps. Best effort: some devices (and the web) have none. */
export const haptic = {
  select: () => Haptics.selectionAsync().catch(() => {}),
  press: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}),
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
};
