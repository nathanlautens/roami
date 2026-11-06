import { isRunningInExpoGo } from 'expo';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import type { NotificationResponse } from 'expo-notifications';
import { Platform } from 'react-native';

import { kv } from './storage';
import { supabase } from './supabase';

// Push needs a real device and a dev or store build. In Expo Go the library is never loaded
// (on Android, even loading it crashes), so these functions quietly do nothing there.
const unsupported = () => isRunningInExpoGo();
const SAVED_KEY = 'roami.pushTokenSaved';
const HANDLED_KEY = 'roami.lastPushTap';

/** Asks for notification permission and saves this phone's push token. */
export async function registerForPush(userId: string) {
  if (unsupported() || !Device.isDevice) return;
  const Notifications = await import('expo-notifications');
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'Roams', importance: Notifications.AndroidImportance.HIGH });
  }
  // Only prompts if you haven't answered before.
  if ((await Notifications.requestPermissionsAsync()).status !== 'granted') return;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  // The time zone lets the server hold pushes overnight (no pings midnight–8am your time).
  const time_zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;

  // Skip the write if nothing changed today. (Re-saved daily anyway: the server keeps one token
  // per person, so a second phone can take it over and this one should win it back.)
  const saved = `${userId}|${token}|${time_zone}|${new Date().toDateString()}`;
  if (kv.get(SAVED_KEY) === saved) return;
  const { error } = await supabase.from('push_tokens').upsert({ user_id: userId, token, time_zone, updated_at: new Date().toISOString() });
  if (!error) kv.set(SAVED_KEY, saved);
}

/** Signing out deletes the token on the server, so the next sign-in must save it again. */
export const forgetSavedPushToken = () => kv.set(SAVED_KEY, null);

/** Tapping a push opens the screen in its `url` (e.g. "/roam/<id>"), including the tap that launched the app. */
export function listenForPushTaps(open: (url: string) => void): () => void {
  if (unsupported()) return () => {};
  let cancelled = false;
  let remove = () => {};
  import('expo-notifications').then((Notifications) => {
    if (cancelled) return;
    const handle = (response: NotificationResponse | null) => {
      // Each tap opens its screen once, even if the app restarts or this listener is set up again.
      const id = response?.notification.request.identifier;
      if (!id || kv.get(HANDLED_KEY) === id) return;
      kv.set(HANDLED_KEY, id);
      const url = response.notification.request.content.data?.url;
      // Only Roami's own screens: a path like /roam/<id>, never another site.
      if (typeof url === 'string' && /^\/(?!\/)[A-Za-z0-9/_-]*$/.test(url)) open(url);
    };
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
