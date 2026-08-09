import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { InlineNote, ToggleRow } from '@/components/ui/Controls';
import { useToast } from '@/components/ui/Feedback';
import { AppHeader, Screen, ScreenScroll, SectionHeader } from '@/components/ui/Layout';
import { TimeField } from '@/components/ui/Pickers';
import { Caption } from '@/components/ui/Text';
import { toFriendlyError } from '@/services/firebase/errors';
import {
  hasPermission,
  listScheduled,
  requestPermissions,
  syncRoutineReminders,
} from '@/services/notificationService';
import { useAuthStore, useSettings } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { useTheme } from '@/theme/ThemeProvider';

export default function NotificationSettings() {
  const { c, space, radius } = useTheme();
  const toast = useToast();
  const settings = useSettings();
  const updateSettings = useAuthStore((s) => s.updateSettings);
  const setStoreSettings = useDataStore((s) => s.setSettings);

  const [granted, setGranted] = useState<boolean | null>(null);
  const [scheduledCount, setScheduledCount] = useState(0);

  const refresh = async () => {
    setGranted(await hasPermission());
    setScheduledCount((await listScheduled()).length);
  };

  useEffect(() => {
    refresh();
  }, []);

  const patchNotifications = async (
    next: Partial<typeof settings.notifications>,
  ) => {
    try {
      const updated = await updateSettings({ notifications: { ...settings.notifications, ...next } });
      if (updated) {
        setStoreSettings(updated);
        await syncRoutineReminders(updated);
        await refresh();
      }
    } catch (e) {
      toast.show(toFriendlyError(e, 'Could not save that setting').message, 'error');
    }
  };

  const enableAll = async () => {
    const result = await requestPermissions();
    if (result === 'granted') {
      await patchNotifications({ enabled: true });
      toast.show('Reminders enabled.', 'success');
    } else if (result === 'denied') {
      toast.show('Permission denied — enable notifications in system settings.', 'error');
    } else {
      toast.show('Notifications need a physical device.', 'default');
    }
    await refresh();
  };

  const n = settings.notifications;

  return (
    <Screen>
      <AppHeader title="Notifications" eyebrow="Settings" showBack />
      <ScreenScroll>
        <View style={{ gap: space.xl, paddingTop: space.sm }}>
          {granted === false ? (
            <View style={{ gap: space.md }}>
              <InlineNote
                icon="bell-off"
                text="Notifications are not permitted yet. DEVBEAST OS cannot remind you until you allow them."
              />
              <Button label="Allow notifications" full onPress={enableAll} />
            </View>
          ) : null}

          <View
            style={{
              paddingHorizontal: space.base,
              backgroundColor: c.surface2,
              borderRadius: radius.card,
              borderWidth: StyleSheet.hairlineWidth * 2,
              borderColor: c.line,
            }}>
            <ToggleRow
              label="All reminders"
              subtitle="Master switch"
              icon="bell"
              value={n.enabled}
              onChange={(value) => patchNotifications({ enabled: value })}
            />
          </View>

          <View>
            <SectionHeader title="Categories" />
            <View
              style={{
                paddingHorizontal: space.base,
                backgroundColor: c.surface2,
                borderRadius: radius.card,
                borderWidth: StyleSheet.hairlineWidth * 2,
                borderColor: c.line,
                opacity: n.enabled ? 1 : 0.45,
              }}>
              <ToggleRow
                label="Task reminders"
                subtitle="Before a scheduled task starts"
                value={n.taskReminders}
                disabled={!n.enabled}
                onChange={(value) => patchNotifications({ taskReminders: value })}
              />
              <Divider />
              <ToggleRow
                label="Habit reminders"
                subtitle="At each habit's reminder time"
                value={n.habitReminders}
                disabled={!n.enabled}
                onChange={(value) => patchNotifications({ habitReminders: value })}
              />
              <Divider />
              <ToggleRow
                label="Goal deadlines"
                value={n.goalDeadlines}
                disabled={!n.enabled}
                onChange={(value) => patchNotifications({ goalDeadlines: value })}
              />
              <Divider />
              <ToggleRow
                label="Morning planning"
                value={n.dailyPlanning}
                disabled={!n.enabled}
                onChange={(value) => patchNotifications({ dailyPlanning: value })}
              />
              <Divider />
              <ToggleRow
                label="Evening review"
                value={n.dailyReview}
                disabled={!n.enabled}
                onChange={(value) => patchNotifications({ dailyReview: value })}
              />
              <Divider />
              <ToggleRow
                label="Weekly review"
                value={n.weeklyReview}
                disabled={!n.enabled}
                onChange={(value) => patchNotifications({ weeklyReview: value })}
              />
            </View>
          </View>

          <View style={{ gap: space.md }}>
            <SectionHeader title="Times" />
            <View style={{ flexDirection: 'row', gap: space.md }}>
              <TimeField
                label="Planning"
                value={n.planningTime}
                onChange={(value) => patchNotifications({ planningTime: value ?? '08:00' })}
                allowClear={false}
                use24Hour={settings.use24HourTime}
              />
              <TimeField
                label="Review"
                value={n.reviewTime}
                onChange={(value) => patchNotifications({ reviewTime: value ?? '21:30' })}
                allowClear={false}
                use24Hour={settings.use24HourTime}
              />
            </View>
            <Caption tone="faint">
              {scheduledCount} reminder{scheduledCount === 1 ? '' : 's'} currently scheduled on this
              device.
            </Caption>
          </View>
        </View>
      </ScreenScroll>
    </Screen>
  );
}

function Divider() {
  const { c } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth * 2, backgroundColor: c.line }} />;
}
