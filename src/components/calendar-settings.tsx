import { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { useAuth } from '@/lib/auth';
import {
  calendarAvailable,
  calendarPrefs,
  defaultCalendarId,
  removeAllRoamiEvents,
  requestCalendarAccess,
  setCalendarPrefs,
  syncCalendar,
  writableCalendars,
  type PhoneCalendar,
} from '@/lib/calendar';
import { colors, fonts, radius } from '@/lib/theme';
import { SelectTile, Sticker, SwitchRow } from './ui';

const noAccess = () => Alert.alert('No calendar access', 'Allow Roami to use your calendar in Settings to turn this on.');

/** Profile section: add Roams to my calendar, and show my plans when deciding. */
export function CalendarSettings() {
  const { userId } = useAuth();
  const [prefs, setPrefs] = useState(calendarPrefs());
  const [calendars, setCalendars] = useState<PhoneCalendar[] | null>(null);

  useEffect(() => {
    if (calendarAvailable && (prefs.sync || prefs.showPlans)) writableCalendars().then(setCalendars).catch(() => {});
  }, [prefs.sync, prefs.showPlans]);

  if (!calendarAvailable) {
    return (
      <Sticker shadow={null} innerStyle={{ padding: 14, gap: 4 }}>
        <Text style={{ fontFamily: fonts.bodyBold, fontSize: 16, color: colors.ink }}>Calendar</Text>
        <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.inkSoft }}>
          Calendar sync works in the real app (TestFlight / Play), not in Expo Go.
        </Text>
      </Sticker>
    );
  }

  const update = (patch: Partial<typeof prefs>) => {
    setCalendarPrefs(patch);
    setPrefs(calendarPrefs());
  };

  async function toggleSync(on: boolean) {
    if (on) {
      if (!(await requestCalendarAccess())) return noAccess();
      update({ sync: true, calendarId: prefs.calendarId ?? (await defaultCalendarId()) });
      if (userId) syncCalendar(userId);
    } else {
      Alert.alert('Stop adding Roams?', 'Remove the Roams Roami already added to your calendar?', [
        { text: 'Keep them', onPress: () => update({ sync: false }) },
        {
          text: 'Remove them',
          style: 'destructive',
          onPress: async () => {
            await removeAllRoamiEvents();
            update({ sync: false });
          },
        },
      ]);
    }
  }

  async function toggleShowPlans(on: boolean) {
    if (on && !(await requestCalendarAccess())) return noAccess();
    update({ showPlans: on });
  }

  return (
    <Sticker shadow={null} innerStyle={{ padding: 14, gap: 14 }}>
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 16, color: colors.ink }}>Calendar</Text>

      <SwitchRow
        title="Add Roams to my calendar"
        sub="When you're in. Removed if you bail or it's called off."
        value={prefs.sync}
        onChange={toggleSync}
      />
      <SwitchRow
        title="Show my plans when deciding"
        sub="See what's already on when you answer or vote."
        value={prefs.showPlans}
        onChange={toggleShowPlans}
      />

      {prefs.sync && calendars?.length ? (
        <View style={{ gap: 6 }}>
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1, color: colors.ink }}>ADD THEM TO</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {calendars.map((c) => {
              const on = prefs.calendarId === c.id;
              return (
                <SelectTile
                  key={c.id}
                  selected={on}
                  rounded={radius.pill}
                  accessibilityLabel={`${c.title}${c.account ? `, ${c.account}` : ''}`}
                  onPress={() => update({ calendarId: c.id })}
                  style={{ minHeight: 36, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 2 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.color ?? colors.mute, borderWidth: 1, borderColor: colors.ink }} />
                  <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13, color: colors.ink }} numberOfLines={1}>
                    {c.title}
                  </Text>
                </SelectTile>
              );
            })}
          </View>
        </View>
      ) : null}
    </Sticker>
  );
}
