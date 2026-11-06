import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Alert, Pressable, Text, TextInput, View, type TextInputInstance } from 'react-native';

import { Body, Button, FormField, H1, Label, Progress, Screen, Sticker, TopBar } from '@/components/ui';
import { loginSchema } from '@/lib/schemas';
import { supabase } from '@/lib/supabase';
import { border, colors, fonts, radius } from '@/lib/theme';

// Store reviewers can't receive codes, so this one account (Supabase -> Authentication -> Users) uses a password.
const REVIEW_EMAIL = 'review@roami.test';

export default function EmailLogin() {
  const { control, handleSubmit, setValue, formState } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', code: '' },
  });
  const [email, password, code] = useWatch({ control, name: ['email', 'password', 'code'] });
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const isReviewer = email.trim().toLowerCase() === REVIEW_EMAIL;
  const codeRef = useRef<TextInputInstance>(null);
  // Autofill and the button can both fire; only check the code once.
  const verifying = useRef(false);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const sendCode = () => handleSubmit(async ({ email, password }) => {
    if (email === REVIEW_EMAIL) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) Alert.alert('Not quite', 'Wrong password.');
      return;
    }
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) {
      Alert.alert("Couldn't send your code", error.message.toLowerCase().includes('rate') ? 'Too many tries. Give it a minute and try again.' : error.message);
      return;
    }
    setSentTo(email);
    setValue('code', '');
    setResendIn(60);
    setTimeout(() => codeRef.current?.focus(), 300);
  })();

  // On success the auth guard moves you on automatically.
  const verify = () => handleSubmit(async ({ code }) => {
    if (!sentTo || code.length !== 6 || verifying.current) return;
    verifying.current = true;
    const { error } = await supabase.auth.verifyOtp({ email: sentTo, token: code, type: 'email' });
    verifying.current = false;
    if (error) {
      Alert.alert('Not quite', "That code didn't work. Check your email and try again.");
      setValue('code', '');
    }
  })();

  const digits = code.split('');

  return (
    <Screen keyboard
      footer={
        sentTo ? (
          <Button label="Let me in" onPress={verify} loading={formState.isSubmitting} disabled={code.length !== 6} />
        ) : isReviewer ? (
          <Button label="Sign in" onPress={sendCode} loading={formState.isSubmitting} disabled={!password} />
        ) : (
          <Button label="Email me a code" onPress={sendCode} loading={formState.isSubmitting} disabled={!email.trim()} />
        )
      }>
      <TopBar onBack={() => router.back()} right={<Progress step={0} of={3} />} />
      <H1 style={{ marginTop: 28, marginBottom: 10 }}>What's your email?</H1>
      <Body style={{ marginBottom: 24 }}>
        Just this once. After today it's Face ID or fingerprint. We'll never spam you. Pinky promise.
      </Body>

      <Label>Email</Label>
      <View style={{ marginTop: 8 }}>
        <FormField
          control={control}
          name="email"
          onChangeText={() => sentTo && setSentTo(null)}
          placeholder="you@example.com"
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Email"
          returnKeyType="done"
          onSubmitEditing={sendCode}
        />
      </View>

      {isReviewer ? (
        <View style={{ marginTop: 20 }}>
          <Label>Password</Label>
          <View style={{ marginTop: 8 }}>
            <FormField
              control={control}
              name="password"
              secureTextEntry
              autoCapitalize="none"
              accessibilityLabel="Password"
              returnKeyType="done"
              onSubmitEditing={sendCode}
            />
          </View>
        </View>
      ) : null}

      {sentTo ? (
        <Sticker shadow={null} style={{ marginTop: 28 }} innerStyle={{ padding: 18 }}>
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 16, color: colors.ink }}>Code sent. Check your inbox</Text>
          <Text style={{ fontFamily: fonts.body, fontSize: 14, color: colors.inkSoft, marginTop: 2 }}>
            6 digits, sent to {sentTo}. Peek in spam if it's shy.
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
          {/* One real input behind the six boxes, so autofill from Mail works. */}
          <Controller
            control={control}
            name="code"
            render={({ field }) => (
              <TextInput
                ref={codeRef}
                value={field.value}
                onChangeText={(t) => {
                  const clean = t.replace(/\D/g, '').slice(0, 6);
                  field.onChange(clean);
                  if (clean.length === 6) verify();
                }}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                maxLength={6}
                style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }}
                accessibilityLabel="Verification code"
              />
            )}
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
  );
}
