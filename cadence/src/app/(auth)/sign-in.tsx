import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Controls';
import { useToast } from '@/components/ui/Feedback';
import { AppHeader, Screen } from '@/components/ui/Layout';
import { Body, Caption, MetricLarge } from '@/components/ui/Text';
import { toFriendlyError } from '@/services/firebase/errors';
import { signIn } from '@/services/userService';
import { useTheme } from '@/theme/ThemeProvider';

export default function SignIn() {
  const { space } = useTheme();
  const router = useRouter();
  const toast = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const next: typeof errors = {};
    if (!email.trim()) next.email = 'Enter your email.';
    if (!password) next.password = 'Enter your password.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setLoading(true);
    try {
      await signIn(email, password);
      // The root layout redirects once the auth state and profile land.
    } catch (error) {
      const friendly = toFriendlyError(error, 'Could not sign in');
      setErrors({ form: friendly.message });
      toast.show(friendly.message, 'error');
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
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48, gap: space.lg }}
          keyboardShouldPersistTaps="handled">
          <View style={{ gap: space.sm, paddingTop: space.lg }}>
            <MetricLarge tone="strong">WELCOME BACK</MetricLarge>
            <Body tone="muted">Pick up where your system left off.</Body>
          </View>

          <TextField
            label="Email"
            icon="mail"
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              setErrors((e) => ({ ...e, email: undefined, form: undefined }));
            }}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            placeholder="you@example.com"
            error={errors.email}
            returnKeyType="next"
          />

          <TextField
            label="Password"
            icon="lock"
            value={password}
            onChangeText={(v) => {
              setPassword(v);
              setErrors((e) => ({ ...e, password: undefined, form: undefined }));
            }}
            secureTextEntry={!showPassword}
            autoComplete="current-password"
            textContentType="password"
            placeholder="••••••••"
            error={errors.password ?? errors.form}
            returnKeyType="go"
            onSubmitEditing={submit}
            right={
              <Button
                label={showPassword ? 'Hide' : 'Show'}
                variant="ghost"
                size="sm"
                haptic={false}
                onPress={() => setShowPassword((v) => !v)}
                style={{ paddingHorizontal: 8, minHeight: 32 }}
              />
            }
          />

          <Button label="Sign in" full size="lg" loading={loading} onPress={submit} />

          <Button
            label="Forgot password?"
            variant="ghost"
            full
            onPress={() => router.push('/(auth)/forgot-password')}
          />

          <View style={{ alignItems: 'center', paddingTop: space.md }}>
            <Caption tone="faint">New here?</Caption>
            <Button
              label="Create an account"
              variant="ghost"
              onPress={() => router.replace('/(auth)/sign-up')}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
