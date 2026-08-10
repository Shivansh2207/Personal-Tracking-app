import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Chip, ChipGroup, TextField } from '@/components/ui/Controls';
import { useToast } from '@/components/ui/Feedback';
import { AppHeader, Screen, ScreenScroll } from '@/components/ui/Layout';
import { Caption, Eyebrow } from '@/components/ui/Text';
import { toFriendlyError } from '@/services/firebase/errors';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/theme/ThemeProvider';
import type { UserType } from '@/types/models';

const USER_TYPES: { value: UserType; label: string }[] = [
  { value: 'student', label: 'Student' },
  { value: 'student_work', label: 'Student + Work' },
  { value: 'work', label: 'Work' },
  { value: 'personal', label: 'Personal routine' },
  { value: 'other', label: 'Other' },
];

export default function EditProfile() {
  const { c, space } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const profile = useAuthStore((s) => s.profile);
  const updateProfile = useAuthStore((s) => s.updateProfile);

  const [name, setName] = useState(profile?.name ?? '');
  const [userType, setUserType] = useState<UserType | null>(profile?.userType ?? null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) {
      toast.show('Enter your name.', 'error');
      return;
    }
    setSaving(true);
    try {
      await updateProfile({ name: name.trim(), userType });
      toast.show('Profile updated.', 'success');
      router.back();
    } catch (e) {
      toast.show(toFriendlyError(e, 'Could not save your profile').message, 'error');
      setSaving(false);
    }
  };

  return (
    <Screen>
      <AppHeader title="Account" eyebrow="Settings" showBack />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScreenScroll bottomInset={40}>
          <View style={{ gap: space.lg, paddingTop: space.sm }}>
            <TextField label="Name" value={name} onChangeText={setName} autoCapitalize="words" />
            <View style={{ gap: space.xs }}>
              <TextField label="Email" value={profile?.email ?? ''} editable={false} icon="mail" />
              <Caption tone="faint">
                Email is managed by your sign-in provider and cannot be changed here.
              </Caption>
            </View>
            <View style={{ gap: space.sm }}>
              <Eyebrow tone="meta">Mainly using DayFlow for</Eyebrow>
              <ChipGroup>
                {USER_TYPES.map((option) => (
                  <Chip
                    key={option.value}
                    label={option.label}
                    selected={userType === option.value}
                    onPress={() => setUserType(option.value)}
                  />
                ))}
              </ChipGroup>
            </View>
          </View>
        </ScreenScroll>
        <View
          style={{
            padding: 16,
            borderTopWidth: StyleSheet.hairlineWidth * 2,
            borderTopColor: c.line,
          }}>
          <Button label="Save changes" full size="lg" loading={saving} onPress={save} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
