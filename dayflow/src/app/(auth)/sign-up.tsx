import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { APP_NAME } from '@/constants/app';
import { Button } from '@/components/ui/Button';
import { InlineNote, TextField } from '@/components/ui/Controls';
import { useToast } from '@/components/ui/Feedback';
import { AppHeader, Screen } from '@/components/ui/Layout';
import { Body, Caption, MetricLarge } from '@/components/ui/Text';
import { toFriendlyError } from '@/services/firebase/errors';
import { signUp } from '@/services/userService';
import { useTheme } from '@/theme/ThemeProvider';

export default function SignUp() {
  const { space } = useTheme();
  const router = useRouter();
  const toast = useToast();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const next: Record<string, string | undefined> = {};
    if (!name.trim()) next.name = 'What should we call you?';
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) next.email = 'Enter a valid email address.';
    if (password.length < 6) next.password = 'Use at least 6 characters.';
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;

    setLoading(true);
    try {
      await signUp({ name, email, password });
    } catch (error) {
      const friendly = toFriendlyError(error, 'Could not create your account');
      setErrors({ form: friendly.message });
      toast.show(friendly.message, 'error');
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
            <MetricLarge tone="strong">CREATE YOUR{'\n'}ACCOUNT</MetricLarge>
            <Body tone="muted">Setup takes a few minutes. After that, daily logging is seconds.</Body>
          </View>

          <TextField
            label="Name"
            icon="user"
            value={name}
            onChangeText={(v) => {
              setName(v);
              setErrors((e) => ({ ...e, name: undefined }));
            }}
            autoCapitalize="words"
            autoComplete="name"
            placeholder="Your name"
            error={errors.name}
          />

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
            autoComplete="new-password"
            textContentType="newPassword"
            placeholder="At least 6 characters"
            error={errors.password ?? errors.form}
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

          <InlineNote
            icon="shield"
            text={`Your ${APP_NAME} data is stored under your own account and is only readable by you.`}
          />

          <Button label="Create account" full size="lg" loading={loading} onPress={submit} />

          <View style={{ alignItems: 'center' }}>
            <Caption tone="faint">Already have an account?</Caption>
            <Button
              label="Sign in"
              variant="ghost"
              onPress={() => router.replace('/(auth)/sign-in')}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
