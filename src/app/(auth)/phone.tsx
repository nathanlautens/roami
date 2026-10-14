import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';

import { Body, Button, Field, H1, Label, Progress, Screen, Sticker, TopBar } from '@/components/ui';
import { prettyPhone, toE164 } from '@/lib/phone';
import { supabase } from '@/lib/supabase';
import { border, colors, fonts, radius } from '@/lib/theme';

export default function PhoneLogin() {
  const [number, setNumber] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const codeRef = useRef<TextInput>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  async function sendCode() {
    const phone = toE164(number);
    if (!phone) {
      Alert.alert('Hmm', "That doesn't look like a phone number.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ phone });
    setBusy(false);
    if (error) {
      Alert.alert("Couldn't send your code", error.message);
      return;
    }
    setSentTo(phone);
    setCode('');
    setResendIn(60);
    setTimeout(() => codeRef.current?.focus(), 300);
  }

  async function verify(token = code) {
    if (!sentTo || token.length !== 6) return;
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ phone: sentTo, token, type: 'sms' });
    setBusy(false);
    if (error) {
      Alert.alert('Not quite', "That code didn't work. Check your texts and try again.");
      setCode('');
    }
    // On success the auth guard moves you on automatically.
  }

  const digits = code.split('');

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen
        footer={
          sentTo ? (
            <Button label="Verify me" onPress={() => verify()} loading={busy} disabled={code.length !== 6} />
          ) : (
            <Button label="Text me a code" onPress={sendCode} loading={busy} disabled={!number.trim()} />
          )
        }>
        <TopBar onBack={() => router.back()} right={<Progress step={0} of={3} />} />
        <H1 style={{ marginTop: 28, marginBottom: 10 }}>What's your number?</H1>
        <Body style={{ marginBottom: 24 }}>So your friends can find you. We'll never call. We're not like that.</Body>

        <Label>Mobile number</Label>
        <View style={{ marginTop: 8 }}>
          <Field
            value={number}
            onChangeText={(t) => {
              setNumber(t);
              if (sentTo) setSentTo(null);
            }}
            placeholder="07700 900123"
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            autoComplete="tel"
            accessibilityLabel="Mobile number"
            returnKeyType="done"
            onSubmitEditing={sendCode}
          />
        </View>
        <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.inkSoft, marginTop: 8 }}>
          UK numbers work as-is. Abroad? Start with + and your country code.
        </Text>

        {sentTo ? (
          <Sticker shadow={null} style={{ marginTop: 28 }} innerStyle={{ padding: 18 }}>
            <Text style={{ fontFamily: fonts.bodyBold, fontSize: 16, color: colors.ink }}>Code sent. Check your texts</Text>
            <Text style={{ fontFamily: fonts.body, fontSize: 14, color: colors.inkSoft, marginTop: 2 }}>
              6 digits, sent to {prettyPhone(sentTo)}
            </Text>

            <Pressable
              onPress={() => codeRef.current?.focus()}
              accessibilityLabel="Enter your 6 digit code"
              style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
              {Array.from({ length: 6 }, (_, i) => {
                const filled = !!digits[i];
                const active = i === digits.length;
                return (
                  <View
                    key={i}
                    style={{
                      flex: 1,
                      height: 52,
                      borderRadius: radius.sm,
                      borderWidth: border,
                      borderColor: active ? colors.pink : filled ? colors.ink : colors.mute,
                      backgroundColor: filled ? colors.lime : colors.white,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                    <Text style={{ fontFamily: fonts.display, fontSize: 24, color: colors.ink }}>{digits[i] ?? ''}</Text>
                  </View>
                );
              })}
            </Pressable>
            {/* One real input behind the six boxes, so SMS autofill works. */}
            <TextInput
              ref={codeRef}
              value={code}
              onChangeText={(t) => {
                const clean = t.replace(/\D/g, '').slice(0, 6);
                setCode(clean);
                if (clean.length === 6) verify(clean);
              }}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              maxLength={6}
              style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }}
              accessibilityLabel="Verification code"
            />

            <View style={{ marginTop: 6 }}>
              {resendIn > 0 ? (
                <Text style={{ fontFamily: fonts.body, fontSize: 14, color: colors.inkSoft, marginTop: 10 }}>
                  Nothing yet? Resend in {Math.floor(resendIn / 60)}:{String(resendIn % 60).padStart(2, '0')}
                </Text>
              ) : (
                <Button variant="link" label="Resend the code" onPress={sendCode} />
              )}
            </View>
          </Sticker>
        ) : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}
