import { useEffect, useState } from 'react';
import { Text } from 'react-native';

import { authenticate, setUnlockEnabled, unlockKind, unlockLabel, wasAskedAboutUnlock } from '@/lib/biometric';
import { colors, fonts } from '@/lib/theme';
import { Body, Button, Sheet } from './ui';

/** Asks once, after sign-up: "Use Face ID to get in from now on?" */
export function UnlockPrompt() {
  const [kind, setKind] = useState<Awaited<ReturnType<typeof unlockKind>>>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (wasAskedAboutUnlock()) return;
    unlockKind().then((k) => {
      setKind(k);
      if (k) setTimeout(() => setOpen(true), 900);
    });
  }, []);

  const label = unlockLabel(kind);

  async function turnOn() {
    const ok = await authenticate(`Use ${label} for Roami`);
    if (!ok) return;
    setUnlockEnabled(true);
    setOpen(false);
  }

  function notNow() {
    setUnlockEnabled(false);
    setOpen(false);
  }

  return (
    <Sheet visible={open} onClose={notNow}>
      <Text style={{ fontFamily: fonts.display, fontSize: 30, lineHeight: 32, color: colors.ink }}>
        No more emails. Promise.
      </Text>
      <Body style={{ marginTop: 8, marginBottom: 20 }}>
        Use {label} to get into Roami from now on. You can change this anytime in your profile.
      </Body>
      <Button label={`Use ${label}`} onPress={turnOn} />
      <Button variant="link" label="Not now" onPress={notNow} />
    </Sheet>
  );
}
