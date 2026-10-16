import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';

import { Body, Button, Field, H1, Label, Progress, Screen, Sticker, TopBar } from '@/components/ui';
import { REVIEW_EMAIL } from '@/lib/config';
import { supabase } from '@/lib/supabase';
import { border, colors, fonts, radius } from '@/lib/theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Sign up or log in with an email code. After this, Face ID / fingerprint unlocks the app. */
export default function EmailLogin() {
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [password, setPassword] = useState('');
  const isReviewer = email.trim().toLowerCase() === REVIEW_EMAIL;
  const codeRef = useRef<TextInput>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  async function reviewerLogin() {
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: REVIEW_EMAIL, password });
    setBusy(false);
    if (error) Alert.alert('Not quite', 'Wrong password.');
  }

  async function sendCode() {
    const clean = email.trim().toLowerCase();
    if (clean === REVIEW_EMAIL) return reviewerLogin();
    if (!EMAIL_RE.test(clean)) {
      Alert.alert('Hmm', "That doesn't look like an email.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ email: clean, options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) {
      Alert.alert(
        "Couldn't send your code",
        error.message.toLowerCase().includes('rate') ? 'Too many tries. Give it a minute and try again.' : error.message,
      );
      return;
    }
    setSentTo(clean);
    setCode('');
    setResendIn(60);
    setTimeout(() => codeRef.current?.focus(), 300);
  }

  async function verify(token = code) {
    if (!sentTo || token.length !== 6) return;
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email: sentTo, token, type: 'email' });
    setBusy(false);
    if (error) {
      Alert.alert('Not quite', "That code didn't work. Check your email and try again.");
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
            <Button label="Let me in" onPress={() => verify()} loading={busy} disabled={code.length !== 6} />
          ) : isReviewer ? (
            <Button label="Sign in" onPress={reviewerLogin} loading={busy} disabled={!password} />
          ) : (
            <Button label="Email me a code" onPress={sendCode} loading={busy} disabled={!email.trim()} />
          )
        }>
        <TopBar onBack={() => router.back()} right={<Progress step={0} of={3} />} />
        <H1 style={{ marginTop: 28, marginBottom: 10 }}>What's your email?</H1>
        <Body style={{ marginBottom: 24 }}>
          Just this once. After today it's Face ID or fingerprint. We'll never spam you. Pinky promise.
        </Body>

        <Label>Email</Label>
        <View style={{ marginTop: 8 }}>
          <Field
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              if (sentTo) setSentTo(null);
            }}
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
              <Field
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                accessibilityLabel="Password"
                returnKeyType="done"
                onSubmitEditing={reviewerLogin}
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
              autoComplete="one-time-code"
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
