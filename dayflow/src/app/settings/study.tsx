import React from 'react';
import { StyleSheet, View } from 'react-native';

import { InlineNote } from '@/components/ui/Controls';
import { useToast } from '@/components/ui/Feedback';
import { AppHeader, Screen, ScreenScroll, SectionHeader } from '@/components/ui/Layout';
import { NumberStepper } from '@/components/ui/Pickers';
import { Caption } from '@/components/ui/Text';
import { toFriendlyError } from '@/services/firebase/errors';
import { useAuthStore, useSettings } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { useTheme } from '@/theme/ThemeProvider';
import type { UserSettings } from '@/types/models';

export default function StudyPreferences() {
  const { c, space, radius } = useTheme();
  const toast = useToast();
  const settings = useSettings();
  const updateSettings = useAuthStore((s) => s.updateSettings);
  const setStoreSettings = useDataStore((s) => s.setSettings);

  const patch = async (next: Partial<UserSettings>) => {
    try {
      const updated = await updateSettings(next);
      if (updated) setStoreSettings(updated);
    } catch (e) {
      toast.show(toFriendlyError(e, 'Could not save that setting').message, 'error');
    }
  };

  return (
    <Screen>
      <AppHeader title="Study preferences" eyebrow="Settings" showBack />
      <ScreenScroll>
        <View style={{ gap: space.xl, paddingTop: space.sm }}>
          <View>
            <SectionHeader title="Focus timer" />
            <View
              style={{
                padding: space.base,
                backgroundColor: c.surface2,
                borderRadius: radius.card,
                borderWidth: StyleSheet.hairlineWidth * 2,
                borderColor: c.line,
              }}>
              <NumberStepper
                label="Default length"
                value={settings.defaultStudyMinutes}
                onChange={(defaultStudyMinutes) => patch({ defaultStudyMinutes })}
                step={5}
                min={10}
                max={180}
                suffix="min"
              />
            </View>
          </View>

          <View>
            <SectionHeader title="Timetable reminders" />
            <View
              style={{
                padding: space.base,
                backgroundColor: c.surface2,
                borderRadius: radius.card,
                borderWidth: StyleSheet.hairlineWidth * 2,
                borderColor: c.line,
              }}>
              <NumberStepper
                label="Remind me before"
                value={settings.notifications.timetableOffsetMinutes}
                onChange={(timetableOffsetMinutes) =>
                  patch({
                    notifications: { ...settings.notifications, timetableOffsetMinutes },
                  })
                }
                step={5}
                min={0}
                max={60}
                suffix="min"
              />
              <Caption tone="faint">
                Individual slots can override this from the timetable editor.
              </Caption>
            </View>
          </View>

          <InlineNote
            icon="info"
            text="Study time never marks a chapter complete on its own. Progress and confidence are always set by you when a session ends."
          />
        </View>
      </ScreenScroll>
    </Screen>
  );
}
