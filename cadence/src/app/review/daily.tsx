import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { RatingPicker, TextField } from '@/components/ui/Controls';
import { useToast } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { AppHeader, Screen, ScreenScroll, SectionHeader } from '@/components/ui/Layout';
import { MetricCard, MetricGrid } from '@/components/ui/MetricCard';
import { ProgressRing } from '@/components/ui/Progress';
import { SkeletonCard } from '@/components/ui/States';
import { Body, Caption, Eyebrow, Metric, Title } from '@/components/ui/Text';
import { toFriendlyError } from '@/services/firebase/errors';
import { fetchDailyReview, saveDailyReview } from '@/services/reviewService';
import { fetchStatsForDate, recomputeDailyStats } from '@/services/statsService';
import { useAuthStore, useSettings } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { useTheme, withAlpha } from '@/theme/ThemeProvider';
import type { DailyReview, DailyStats } from '@/types/models';
import { formatDuration, formatLongDate, isValidDateKey, todayKey } from '@/utils/date';

/**
 * Daily mission log. Every objective number is filled in from the day's
 * records — the user only writes the parts the app cannot know.
 */
export default function DailyReviewScreen() {
  const { c, space, accent, radius } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const settings = useSettings();
  const params = useLocalSearchParams<{ date?: string }>();
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const scheduleRecompute = useDataStore((s) => s.scheduleRecompute);

  const date = isValidDateKey(params.date) ? params.date : todayKey();

  const [stats, setStats] = useState<DailyStats | null>(null);
  const [existing, setExisting] = useState<DailyReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [biggestWin, setBiggestWin] = useState('');
  const [improvement, setImprovement] = useState('');
  const [tomorrowFocus, setTomorrowFocus] = useState('');
  const [energy, setEnergy] = useState<number | null>(null);
  const [mood, setMood] = useState<number | null>(null);
  const [restDay, setRestDay] = useState(false);

  const load = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    try {
      // Recompute first so the review always reflects the latest activity.
      await recomputeDailyStats(uid, date, settings).catch(() => {});
      const [s, r] = await Promise.all([
        fetchStatsForDate(uid, date),
        fetchDailyReview(uid, date),
      ]);
      setStats(s);
      setExisting(r);
      if (r) {
        setBiggestWin(r.biggestWin ?? '');
        setImprovement(r.improvement ?? '');
        setTomorrowFocus(r.tomorrowFocus ?? '');
        setEnergy(r.energyScore ?? null);
        setMood(r.moodScore ?? null);
        setRestDay(r.isRestDay);
      }
    } catch {
      toast.show('Could not load the day.', 'error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, date]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!uid) return;
    setSaving(true);
    try {
      await saveDailyReview(
        uid,
        date,
        stats,
        {
          biggestWin: biggestWin.trim() || null,
          improvement: improvement.trim() || null,
          tomorrowFocus: tomorrowFocus.trim() || null,
          energyScore: energy,
          moodScore: mood,
          isRestDay: restDay,
        },
        settings,
      );
      scheduleRecompute(date);
      toast.show('Day closed out.', 'success');
      router.back();
    } catch (e) {
      toast.show(toFriendlyError(e, 'Could not save the review').message, 'error');
      setSaving(false);
    }
  };

  const taskRate =
    stats && stats.tasksPlanned > 0
      ? Math.round((stats.tasksCompleted / stats.tasksPlanned) * 100)
      : null;

  return (
    <Screen>
      <AppHeader title="Daily review" eyebrow={formatLongDate(date)} showBack />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScreenScroll bottomInset={40}>
          {loading ? (
            <View style={{ gap: space.md, paddingTop: space.sm }}>
              <SkeletonCard lines={3} />
              <SkeletonCard lines={3} />
            </View>
          ) : (
            <View style={{ gap: space.xl, paddingTop: space.sm }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.lg,
                  padding: space.base,
                  backgroundColor: c.surface2,
                  borderRadius: radius.card,
                  borderWidth: StyleSheet.hairlineWidth * 2,
                  borderColor: c.line,
                }}>
                <ProgressRing value={stats?.productivityScore ?? 0} size={92} thickness={7}>
                  <Metric tone="strong">{stats?.productivityScore ?? 0}</Metric>
                </ProgressRing>
                <View style={{ flex: 1, gap: 3 }}>
                  <Eyebrow tone="faint">Execution score</Eyebrow>
                  <Title tone="strong">
                    {stats?.dayState === 'rest'
                      ? 'Rest day'
                      : (stats?.productivityScore ?? 0) >= settings.productivityThreshold
                        ? 'Counted toward your streak'
                        : 'Below your threshold'}
                  </Title>
                  <Caption tone="faint">
                    Threshold {settings.productivityThreshold}%
                  </Caption>
                </View>
              </View>

              <MetricGrid columns={2}>
                <MetricCard
                  label="Tasks"
                  value={`${stats?.tasksCompleted ?? 0}/${stats?.tasksPlanned ?? 0}`}
                  caption={taskRate !== null ? `${taskRate}% complete` : 'None planned'}
                  icon="check-square"
                />
                <MetricCard
                  label="Habits"
                  value={`${stats?.habitsCompleted ?? 0}/${stats?.habitsScheduled ?? 0}`}
                  icon="repeat"
                />
                <MetricCard
                  label="Focus"
                  value={formatDuration(stats?.focusMinutes ?? 0, '0m')}
                  icon="clock"
                />
                <MetricCard
                  label="Activity"
                  value={
                    stats?.activityCount
                      ? `${stats.activityCount} session${stats.activityCount === 1 ? '' : 's'}`
                      : 'None'
                  }
                  caption={
                    stats?.activityMinutes ? formatDuration(stats.activityMinutes) : undefined
                  }
                  icon="activity"
                />
              </MetricGrid>

              <View style={{ gap: space.lg }}>
                <SectionHeader title="Reflection" />

                <TextField
                  label="Biggest win today?"
                  value={biggestWin}
                  onChangeText={setBiggestWin}
                  placeholder="Finished the probability chapter"
                  multiline
                />

                <TextField
                  label="What could have gone better?"
                  value={improvement}
                  onChangeText={setImprovement}
                  placeholder="Lost an hour to my phone after lunch"
                  multiline
                />

                <TextField
                  label="One thing to focus on tomorrow"
                  value={tomorrowFocus}
                  onChangeText={setTomorrowFocus}
                  placeholder="Start the DBMS assignment before noon"
                  multiline
                />

                <View style={{ gap: space.sm }}>
                  <Eyebrow tone="meta">Energy</Eyebrow>
                  <RatingPicker value={energy} onChange={setEnergy} />
                </View>

                <View style={{ gap: space.sm }}>
                  <Eyebrow tone="meta">Mood</Eyebrow>
                  <RatingPicker value={mood} onChange={setMood} />
                </View>

                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: restDay }}
                  accessibilityLabel="Mark as a planned rest day"
                  onPress={() => setRestDay((v) => !v)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.md,
                    padding: space.md,
                    borderWidth: StyleSheet.hairlineWidth * 2,
                    borderColor: restDay ? withAlpha(accent.base, 0.5) : c.line,
                    backgroundColor: restDay ? withAlpha(accent.base, 0.1) : 'transparent',
                    borderRadius: radius.card,
                  }}>
                  <Icon
                    name={restDay ? 'check-square' : 'square'}
                    size={17}
                    color={restDay ? accent.base : c.text40}
                  />
                  <View style={{ flex: 1 }}>
                    <Body>Planned rest day</Body>
                    <Caption tone="faint">
                      Rest days do not break your streak and are excluded from averages.
                    </Caption>
                  </View>
                </Pressable>
              </View>

              {existing ? (
                <Caption tone="faint">
                  Last saved {new Date(existing.updatedAt).toLocaleString()}
                </Caption>
              ) : null}
            </View>
          )}
        </ScreenScroll>

        <View
          style={{
            padding: 16,
            borderTopWidth: StyleSheet.hairlineWidth * 2,
            borderTopColor: c.line,
          }}>
          <Button
            label={existing ? 'Update review' : 'Save review'}
            full
            size="lg"
            loading={saving}
            onPress={save}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
