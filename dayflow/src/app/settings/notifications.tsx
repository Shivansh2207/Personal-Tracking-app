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
import type { NotificationSettings } from '@/types/models';

export default function NotificationSettingsScreen() {
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

  const patch = async (next: Partial<NotificationSettings>) => {
    try {
      const updated = await updateSettings({
        notifications: { ...settings.notifications, ...next },
      });
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
      await patch({ enabled: true });
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
                text="Notifications are not permitted yet, so no reminders can be delivered."
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
              onChange={(enabled) => patch({ enabled })}
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
                label="Wake reminder"
                subtitle="A nudge to log your wake time"
                value={n.wake}
                disabled={!n.enabled}
                onChange={(wake) => patch({ wake })}
              />
              <Divider />
              <ToggleRow
                label="Routine reminders"
                subtitle="Only routines you gave a reminder time"
                value={n.routines}
                disabled={!n.enabled}
                onChange={(routines) => patch({ routines })}
              />
              <Divider />
              <ToggleRow
                label="Study timetable"
                value={n.timetable}
                disabled={!n.enabled}
                onChange={(timetable) => patch({ timetable })}
              />
              <Divider />
              <ToggleRow
                label="Task reminders"
                value={n.tasks}
                disabled={!n.enabled}
                onChange={(tasks) => patch({ tasks })}
              />
              <Divider />
              <ToggleRow
                label="Revision due"
                value={n.revision}
                disabled={!n.enabled}
                onChange={(revision) => patch({ revision })}
              />
              <Divider />
              <ToggleRow
                label="Daily summary"
                value={n.dailySummary}
                disabled={!n.enabled}
                onChange={(dailySummary) => patch({ dailySummary })}
              />
              <Divider />
              <ToggleRow
                label="Weekly review"
                value={n.weeklyReview}
                disabled={!n.enabled}
                onChange={(weeklyReview) => patch({ weeklyReview })}
              />
            </View>
          </View>

          <View style={{ gap: space.md }}>
            <SectionHeader title="Timing" />
            <TimeField
              label="Daily summary at"
              value={n.dailySummaryTime}
              onChange={(dailySummaryTime) =>
                patch({ dailySummaryTime: dailySummaryTime ?? '21:30' })
              }
              allowClear={false}
              use24Hour={settings.use24HourTime}
            />
            <Caption tone="faint">
              {scheduledCount} reminder{scheduledCount === 1 ? '' : 's'} currently scheduled on this
              device.
            </Caption>
          </View>

          <InlineNote text="Reminders are scheduled on your device only — nothing about your day is sent to a notification server." />
        </View>
      </ScreenScroll>
    </Screen>
  );
}

function Divider() {
  const { c } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth * 2, backgroundColor: c.line }} />;
}
