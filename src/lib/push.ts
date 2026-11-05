import { isRunningInExpoGo } from 'expo';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import { kv } from './storage';
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

  // Skip the write when nothing changed today. (Re-saved daily anyway: the server keeps one
  // token per person, so a second phone can take it over and this one should win it back.)
  const saved = `${userId}|${token}|${time_zone}|${new Date().toDateString()}`;
  if (kv.get(SAVED_KEY) === saved) return;
  const { error } = await supabase
    .from('push_tokens')
    .upsert({ user_id: userId, token, time_zone, updated_at: new Date().toISOString() });
  if (!error) kv.set(SAVED_KEY, saved);
}

const SAVED_KEY = 'roami.pushTokenSaved';
/** Signing out deletes the token on the server, so the next sign-in must save it again. */
export function forgetSavedPushToken() {
  kv.set(SAVED_KEY, null);
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
    type Tap = { notification: { request: { identifier: string; content: { data?: Record<string, unknown> } } } } | null;
    const handle = (response: Tap) => {
      if (!response) return;
      // Each tap opens its screen once, even if the app restarts or this listener is set up again.
      const id = response.notification.request.identifier;
      if (id && readHandled() === id) return;
      writeHandled(id);
      const url = response.notification.request.content.data?.url;
      // Only Roami's own screens: a path like /roam/<id>, never another site.
      if (typeof url === 'string' && /^\/(?!\/)[A-Za-z0-9/_-]*$/.test(url)) open(url);
    };
    // The tap that launched the app (if any), then later taps.
    handle(Notifications.getLastNotificationResponse());
    Notifications.clearLastNotificationResponse();
    const sub = Notifications.addNotificationResponseReceivedListener(handle);
    remove = () => sub.remove();
  });

  return () => {
    cancelled = true;
    remove();
  };
}

const HANDLED_KEY = 'roami.lastPushTap';
const readHandled = () => kv.get(HANDLED_KEY);
const writeHandled = (id: string) => kv.set(HANDLED_KEY, id);
