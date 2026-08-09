import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Controls';
import { useToast } from '@/components/ui/Feedback';
import { AppHeader, Screen, ScreenScroll } from '@/components/ui/Layout';
import { TimeField } from '@/components/ui/Pickers';
import { Caption } from '@/components/ui/Text';
import { toFriendlyError } from '@/services/firebase/errors';
import { useAuthStore, useSettings } from '@/store/authStore';
import { useTheme } from '@/theme/ThemeProvider';

export default function EditProfile() {
  const { c, space } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const settings = useSettings();
  const profile = useAuthStore((s) => s.profile);
  const updateProfile = useAuthStore((s) => s.updateProfile);

  const [name, setName] = useState(profile?.name ?? '');
  const [mainGoal, setMainGoal] = useState(profile?.mainGoal ?? '');
  const [wakeTime, setWakeTime] = useState(profile?.wakeTime ?? null);
  const [sleepTime, setSleepTime] = useState(profile?.sleepTime ?? null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) {
      toast.show('Enter your name.', 'error');
      return;
    }
    setSaving(true);
    try {
      await updateProfile({
        name: name.trim(),
        mainGoal: mainGoal.trim() || null,
        wakeTime,
        sleepTime,
      });
      toast.show('Profile updated.', 'success');
      router.back();
    } catch (e) {
      toast.show(toFriendlyError(e, 'Could not save your profile').message, 'error');
      setSaving(false);
    }
  };

  return (
    <Screen>
      <AppHeader title="Edit profile" eyebrow="Settings" showBack />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScreenScroll bottomInset={40}>
          <View style={{ gap: space.lg, paddingTop: space.sm }}>
            <TextField label="Name" value={name} onChangeText={setName} autoCapitalize="words" />
            <View style={{ gap: space.xs }}>
              <TextField
                label="Email"
                value={profile?.email ?? ''}
                editable={false}
                icon="mail"
              />
              <Caption tone="faint">
                Email is managed by your sign-in provider and cannot be changed here.
              </Caption>
            </View>
            <TextField
              label="Main goal"
              value={mainGoal}
              onChangeText={setMainGoal}
              placeholder="What are you working toward?"
              multiline
            />
            <View style={{ flexDirection: 'row', gap: space.md }}>
              <TimeField
                label="Wake"
                value={wakeTime}
                onChange={setWakeTime}
                use24Hour={settings.use24HourTime}
              />
              <TimeField
                label="Sleep"
                value={sleepTime}
                onChange={setSleepTime}
                use24Hour={settings.use24HourTime}
              />
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
