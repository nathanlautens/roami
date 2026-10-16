import { isRunningInExpoGo } from 'expo';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import { supabase } from './supabase';

/**
 * Asks for notification permission and saves this phone's push token,
 * so the server can tell you when someone's free.
 *
 * Push needs a real device and a development or store build. Expo Go doesn't
 * include push notifications (and on Android even loading the library crashes),
 * so in Expo Go this quietly does nothing and the library is never loaded.
 */
export async function registerForPush(userId: string) {
  if (isRunningInExpoGo() || !Device.isDevice) return;

  const Notifications = await import('expo-notifications');

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Roams',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    ({ status } = await Notifications.requestPermissionsAsync());
  }
  if (status !== 'granted') return;

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

  // Time zone lets the server hold pushes overnight (no pings midnight–8am your time).
  let time_zone: string | null = null;
  try {
    time_zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    // older devices: the server falls back to London
  }

  await supabase
    .from('push_tokens')
    .upsert({ user_id: userId, token, time_zone, updated_at: new Date().toISOString() });
}

/**
 * Tapping a push opens the screen it's about (each push carries a `url`, e.g.
 * "/roam/<id>"). Covers taps while the app is open and taps that launch it.
 * Returns a cleanup function. Does nothing in Expo Go.
 */
export function listenForPushTaps(open: (url: string) => void): () => void {
  if (isRunningInExpoGo()) return () => {};
  let cancelled = false;
  let remove = () => {};

  import('expo-notifications').then((Notifications) => {
    if (cancelled) return;
    const handle = (response: { notification: { request: { content: { data?: Record<string, unknown> } } } } | null) => {
      const url = response?.notification.request.content.data?.url;
      if (typeof url === 'string' && url.startsWith('/')) open(url);
    };
    Notifications.getLastNotificationResponseAsync().then((r) => {
      if (!cancelled) handle(r);
    });
    const sub = Notifications.addNotificationResponseReceivedListener(handle);
    remove = () => sub.remove();
  });

  return () => {
    cancelled = true;
    remove();
  };
}
