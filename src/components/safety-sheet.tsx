import { useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { friendlyError } from '@/lib/roams';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radius } from '@/lib/theme';
import { useAction } from '@/lib/use-action';
import type { Profile } from '@/lib/types';
import { Body, Button, InlineInput, SelectTile, Sheet } from './ui';

const REASONS: { id: string; label: string }[] = [
  { id: 'harassment', label: 'Being mean or harassing' },
  { id: 'inappropriate', label: 'Inappropriate stuff' },
  { id: 'spam', label: 'Spam' },
  { id: 'fake', label: 'Fake account' },
  { id: 'other', label: 'Something else' },
];

/**
 * Report and/or block. Pass a person (block + report them), a Roam (report it),
 * or both (e.g. a Roam and its host).
 */
export function SafetySheet({
  visible,
  onClose,
  person,
  roamId,
  onBlocked,
}: {
  visible: boolean;
  onClose: () => void;
  person?: Profile | null;
  roamId?: string;
  onBlocked?: () => void;
}) {
  const [step, setStep] = useState<'menu' | 'report'>('menu');
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [busy, run] = useAction();
  const name = person?.display_name ?? 'them';

  function close() {
    setStep('menu');
    setReason(null);
    setDetails('');
    onClose();
  }

  async function sendReport() {
    if (!reason) return;
    const { error } = await run('report', () =>
      supabase.rpc('report', {
        p_user: person?.id ?? null,
        p_roam: roamId ?? null,
        p_reason: reason,
        p_details: details.trim() || null,
      }),
    );
    if (error) {
      Alert.alert("Couldn't send that", error.message.includes('too_many_reports') ? friendlyError(error) : 'Try again?');
      return;
    }
    close();
    Alert.alert(
      'Thanks for telling us',
      person ? `We'll take a look. Want to block ${name} too? You can do that from the same menu.` : "We'll take a look.",
    );
  }

  function block() {
    if (!person) return;
    Alert.alert(
      `Block ${name}?`,
      "They'll be unfriended, taken out of your circles and your upcoming Roams, and they can't add you back. They won't be told.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.rpc('block_user', { p_user: person.id });
            if (error) {
              Alert.alert("Couldn't block", 'Try again?');
              return;
            }
            close();
            onBlocked?.();
          },
        },
      ],
    );
  }

  return (
    <Sheet visible={visible} onClose={close}>
      {step === 'menu' ? (
        <View style={{ gap: 10 }}>
          <Text style={{ fontFamily: fonts.display, fontSize: 26, color: colors.ink }}>
            {roamId && !person ? 'Something off?' : `Something off with ${name}?`}
          </Text>
          <Body style={{ marginBottom: 6 }}>Reports are private. Nobody's told who sent them.</Body>
          <Button variant="dashed" label={roamId ? 'Report this Roam' : `Report ${name}`} onPress={() => setStep('report')} />
          {person ? <Button variant="dashed" label={`Block ${name}`} onPress={block} /> : null}
          <Button variant="link" label="Never mind" onPress={close} />
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          <Text style={{ fontFamily: fonts.display, fontSize: 26, color: colors.ink }}>What's going on?</Text>
          {REASONS.map((r) => {
            const on = reason === r.id;
            return (
              <SelectTile key={r.id} selected={on} onPress={() => setReason(r.id)} style={{ minHeight: 48, paddingHorizontal: 14, justifyContent: 'center' }}>
                <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: colors.ink }}>{r.label}</Text>
              </SelectTile>
            );
          })}
          <InlineInput
            value={details}
            onChangeText={setDetails}
            placeholder="Anything else we should know? (optional)"
            maxLength={500}
            multiline
            accessibilityLabel="More details"
            style={{ minHeight: 72, padding: 12, paddingHorizontal: 12, borderRadius: radius.md, textAlignVertical: 'top' }}
          />
          <Button label="Send report" onPress={sendReport} loading={!!busy} disabled={!reason} />
          <Button variant="link" label="Back" onPress={() => setStep('menu')} />
        </View>
      )}
    </Sheet>
  );
}
