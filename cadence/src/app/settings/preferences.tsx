import React from 'react';
import { StyleSheet, View } from 'react-native';

import { InlineNote, SegmentedControl, ToggleRow } from '@/components/ui/Controls';
import { useToast } from '@/components/ui/Feedback';
import { AppHeader, Screen, ScreenScroll, SectionHeader } from '@/components/ui/Layout';
import { NumberStepper } from '@/components/ui/Pickers';
import { Caption, Eyebrow } from '@/components/ui/Text';
import { toFriendlyError } from '@/services/firebase/errors';
import { useAuthStore, useSettings } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { useTheme } from '@/theme/ThemeProvider';
import { DAY_LABELS_SHORT, todayKey } from '@/utils/date';

export default function Preferences() {
  const { c, space, radius } = useTheme();
  const toast = useToast();
  const settings = useSettings();
  const updateSettings = useAuthStore((s) => s.updateSettings);
  const setStoreSettings = useDataStore((s) => s.setSettings);
  const recomputeNow = useDataStore((s) => s.recomputeNow);

  const patch = async (next: Parameters<typeof updateSettings>[0]) => {
    try {
      const updated = await updateSettings(next);
      if (updated) {
        setStoreSettings(updated);
        // Threshold / focus-goal changes re-classify today.
        recomputeNow(todayKey());
      }
    } catch (e) {
      toast.show(toFriendlyError(e, 'Could not save that setting').message, 'error');
    }
  };

  return (
    <Screen>
      <AppHeader title="Preferences" eyebrow="Settings" showBack />
      <ScreenScroll>
        <View style={{ gap: space.xl, paddingTop: space.sm }}>
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
          </View>

          <View
            style={{
              padding: space.base,
              backgroundColor: c.surface2,
              borderRadius: radius.card,
              borderWidth: StyleSheet.hairlineWidth * 2,
              borderColor: c.line,
            }}>
            <SectionHeader title="Scoring" />
            <NumberStepper
              label="Streak threshold"
              value={settings.productivityThreshold}
              onChange={(value) => patch({ productivityThreshold: value })}
              step={5}
              min={20}
              max={95}
              suffix="%"
            />
            <NumberStepper
              label="Daily focus goal"
              value={settings.dailyFocusGoalMinutes}
              onChange={(value) => patch({ dailyFocusGoalMinutes: value })}
              step={15}
              min={0}
              max={480}
              suffix="min"
            />
            <Caption tone="faint" style={{ paddingTop: space.sm }}>
              A day counts toward your streak at or above the threshold. The focus goal only
              affects the score on days where duration-based work was planned or recorded.
            </Caption>
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
                onChange={(value) => patch({ autoCarryTasks: value })}
              />
            </View>
          </View>

          <View style={{ gap: space.sm }}>
            <SectionHeader title="Weekly review" />
            <Eyebrow tone="meta">Review day</Eyebrow>
            <SegmentedControl
              scrollable
              options={DAY_LABELS_SHORT.map((label, index) => ({
                value: String(index),
                label,
              }))}
              value={String(settings.weeklyReviewDay)}
              onChange={(v) => patch({ weeklyReviewDay: Number(v) })}
            />
          </View>

          <InlineNote text="Changing the threshold recalculates today's classification immediately. Past days keep the score they were given." />
        </View>
      </ScreenScroll>
    </Screen>
  );
}
