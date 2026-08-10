import React from 'react';
import { StyleSheet, View } from 'react-native';

import { InlineNote, SegmentedControl, ToggleRow } from '@/components/ui/Controls';
import { useToast } from '@/components/ui/Feedback';
import { AppHeader, Screen, ScreenScroll, SectionHeader } from '@/components/ui/Layout';
import { NumberStepper, TimeField } from '@/components/ui/Pickers';
import { Caption, Eyebrow } from '@/components/ui/Text';
import { toFriendlyError } from '@/services/firebase/errors';
import { syncWakeReminder } from '@/services/notificationService';
import { useAuthStore, useSettings } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { useTheme } from '@/theme/ThemeProvider';
import type { UserSettings } from '@/types/models';
import { DAY_LABELS_SHORT, todayKey } from '@/utils/date';

export default function Preferences() {
  const { c, space, radius } = useTheme();
  const toast = useToast();
  const settings = useSettings();
  const updateSettings = useAuthStore((s) => s.updateSettings);
  const setStoreSettings = useDataStore((s) => s.setSettings);
  const recomputeNow = useDataStore((s) => s.recomputeNow);

  const patch = async (next: Partial<UserSettings>) => {
    try {
      const updated = await updateSettings(next);
      if (updated) {
        setStoreSettings(updated);
        await syncWakeReminder(updated).catch(() => {});
        recomputeNow(todayKey());
      }
    } catch (e) {
      toast.show(toFriendlyError(e, 'Could not save that setting').message, 'error');
    }
  };

  return (
    <Screen>
      <AppHeader title="Routine preferences" eyebrow="Settings" showBack />
      <ScreenScroll>
        <View style={{ gap: space.xl, paddingTop: space.sm }}>
          <View style={{ gap: space.md }}>
            <SectionHeader title="Wake & sleep" />
            <TimeField
              label="Wake target"
              value={settings.wakeTarget}
              onChange={(wakeTarget) => patch({ wakeTarget })}
              use24Hour={settings.use24HourTime}
            />
            <View
              style={{
                padding: space.base,
                backgroundColor: c.surface2,
                borderRadius: radius.card,
                borderWidth: StyleSheet.hairlineWidth * 2,
                borderColor: c.line,
              }}>
              <NumberStepper
                label="Tolerance"
                value={settings.wakeToleranceMinutes}
                onChange={(wakeToleranceMinutes) => patch({ wakeToleranceMinutes })}
                step={5}
                min={0}
                max={60}
                suffix="min"
              />
              <Caption tone="faint">
                Waking within this window counts as on target. Exact times are still recorded.
              </Caption>
            </View>
            <View
              style={{
                paddingHorizontal: space.base,
                backgroundColor: c.surface2,
                borderRadius: radius.card,
                borderWidth: StyleSheet.hairlineWidth * 2,
                borderColor: c.line,
              }}>
              <ToggleRow
                label="Track bedtime"
                icon="moon"
                value={settings.trackSleep}
                onChange={(trackSleep) => patch({ trackSleep })}
              />
            </View>
            {settings.trackSleep ? (
              <TimeField
                label="Target bedtime"
                value={settings.sleepTarget}
                onChange={(sleepTarget) => patch({ sleepTarget })}
                use24Hour={settings.use24HourTime}
              />
            ) : null}
          </View>

          <View style={{ gap: space.sm }}>
            <SectionHeader title="Week & time" />
            <Eyebrow tone="meta">Week starts on</Eyebrow>
            <SegmentedControl
              options={[
                { value: '1', label: 'Monday' },
                { value: '0', label: 'Sunday' },
              ]}
              value={String(settings.weekStart)}
              onChange={(v) => patch({ weekStart: v === '1' ? 1 : 0 })}
            />
            <Eyebrow tone="meta" style={{ paddingTop: space.sm }}>
              Time format
            </Eyebrow>
            <SegmentedControl
              options={[
                { value: '12', label: '12 hour' },
                { value: '24', label: '24 hour' },
              ]}
              value={settings.use24HourTime ? '24' : '12'}
              onChange={(v) => patch({ use24HourTime: v === '24' })}
            />
            <Eyebrow tone="meta" style={{ paddingTop: space.sm }}>
              Weekly review day
            </Eyebrow>
            <SegmentedControl
              scrollable
              options={DAY_LABELS_SHORT.map((label, index) => ({ value: String(index), label }))}
              value={String(settings.weeklyReviewDay)}
              onChange={(v) => patch({ weeklyReviewDay: Number(v) })}
            />
          </View>

          <View>
            <SectionHeader title="Tasks" />
            <View
              style={{
                paddingHorizontal: space.base,
                backgroundColor: c.surface2,
                borderRadius: radius.card,
                borderWidth: StyleSheet.hairlineWidth * 2,
                borderColor: c.line,
              }}>
              <ToggleRow
                label="Auto-carry unfinished tasks"
                subtitle="Move yesterday's open tasks to today automatically"
                icon="corner-down-right"
                value={settings.autoCarryTasks}
                onChange={(autoCarryTasks) => patch({ autoCarryTasks })}
              />
            </View>
          </View>

          <InlineNote text="Carrying a task moves the same record — it never creates a duplicate." />

          <Caption tone="faint">Timezone: {settings.timezone}</Caption>
        </View>
      </ScreenScroll>
    </Screen>
  );
}
