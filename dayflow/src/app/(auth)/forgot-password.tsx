import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { InlineNote, TextField } from '@/components/ui/Controls';
import { AppHeader, Screen } from '@/components/ui/Layout';
import { Body, MetricLarge } from '@/components/ui/Text';
import { toFriendlyError } from '@/services/firebase/errors';
import { sendReset } from '@/services/userService';
import { useTheme } from '@/theme/ThemeProvider';

export default function ForgotPassword() {
  const { space } = useTheme();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await sendReset(email);
      setSent(true);
    } catch (e) {
      setError(toFriendlyError(e, 'Could not send the reset email').message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <AppHeader showBack bordered={false} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, gap: space.lg }}
          keyboardShouldPersistTaps="handled">
          <View style={{ gap: space.sm, paddingTop: space.lg }}>
            <MetricLarge tone="strong">RESET{'\n'}PASSWORD</MetricLarge>
            <Body tone="muted">We&apos;ll email you a link to choose a new password.</Body>
          </View>

          {sent ? (
            <>
              <InlineNote
                icon="mail"
                text={`If an account exists for ${email.trim()}, a reset link is on its way. Check your spam folder if it does not arrive.`}
              />
              <Button
                label="Back to sign in"
                full
                onPress={() => router.replace('/(auth)/sign-in')}
              />
            </>
          ) : (
            <>
              <TextField
                label="Email"
                icon="mail"
                value={email}
                onChangeText={(v) => {
                  setEmail(v);
                  setError(null);
                }}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                placeholder="you@example.com"
                error={error}
                onSubmitEditing={submit}
              />
              <Button label="Send reset link" full size="lg" loading={loading} onPress={submit} />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
