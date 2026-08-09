import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import { BarChart } from '@/components/analytics/Charts';
import { Button, IconButton } from '@/components/ui/Button';
import { RatingPicker, TextField } from '@/components/ui/Controls';
import { useToast } from '@/components/ui/Feedback';
import { AppHeader, Screen, ScreenScroll, SectionHeader } from '@/components/ui/Layout';
import { MetricCard, MetricGrid, StatChangeIndicator } from '@/components/ui/MetricCard';
import { ProgressRing } from '@/components/ui/Progress';
import { EmptyState, SkeletonCard } from '@/components/ui/States';
import { Body, Caption, Eyebrow, Metric, Title } from '@/components/ui/Text';
import { toFriendlyError } from '@/services/firebase/errors';
import { buildWeeklyReview, saveWeeklyReview, WeeklyReviewBundle } from '@/services/reviewService';
import { fetchStatsInRange, resolveCategoryName } from '@/services/statsService';
import { useAuthStore, useSettings } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { useTheme } from '@/theme/ThemeProvider';
import type { DailyStats } from '@/types/models';
import {
  addDays,
  dateRange,
  formatDuration,
  formatShortDate,
  isValidDateKey,
  todayKey,
} from '@/utils/date';

export default function WeeklyReviewScreen() {
  const { c, space, radius } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const settings = useSettings();
  const params = useLocalSearchParams<{ week?: string }>();
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const categories = useDataStore((s) => s.categories);
  const goals = useDataStore((s) => s.goals);

  const [anchor, setAnchor] = useState(
    isValidDateKey(params.week) ? params.week : todayKey(),
  );
  const [bundle, setBundle] = useState<WeeklyReviewBundle | null>(null);
  const [weekStats, setWeekStats] = useState<DailyStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [biggestWin, setBiggestWin] = useState('');
  const [biggestMistake, setBiggestMistake] = useState('');
  const [slowdown, setSlowdown] = useState('');
  const [improvement, setImprovement] = useState('');
  const [nextWeekFocus, setNextWeekFocus] = useState('');
  const [realityScore, setRealityScore] = useState<number | null>(null);
  const [notes, setNotes] = useState('');

  const load = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const result = await buildWeeklyReview(uid, anchor, settings.weekStart);
      setBundle(result);
      setWeekStats(await fetchStatsInRange(uid, result.weekStart, result.weekEnd));
      const saved = result.saved;
      setBiggestWin(saved?.biggestWin ?? '');
      setBiggestMistake(saved?.biggestMistake ?? '');
      setSlowdown(saved?.slowdown ?? '');
      setImprovement(saved?.improvement ?? '');
      setNextWeekFocus(saved?.nextWeekFocus ?? '');
      setRealityScore(saved?.realityScore ?? null);
      setNotes(saved?.notes ?? '');
    } catch (e) {
      toast.show(toFriendlyError(e, 'Could not build the review').message, 'error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, anchor, settings.weekStart]);

  useEffect(() => {
    load();
  }, [load]);

  const dayBars = useMemo(() => {
    if (!bundle) return [];
    const byDate = new Map(weekStats.map((s) => [s.date, s]));
    return dateRange(bundle.weekStart, bundle.weekEnd).map((date) => {
      const stat = byDate.get(date);
      return {
        label: formatShortDate(date).split(' ')[0],
        value: stat?.productivityScore ?? 0,
        hasData: !!stat && stat.dayState !== 'no_data',
      };
    });
  }, [bundle, weekStats]);

  const goalProgress = useMemo(() => {
    const active = goals.filter((g) => g.status === 'active');
    if (active.length === 0) return 0;
    return Math.round(active.reduce((a, g) => a + g.progress, 0) / active.length);
  }, [goals]);

  const weakestCategory = useMemo(() => {
    if (!bundle) return null;
    const entries = Object.entries(bundle.summary.categoryMinutes);
    if (entries.length < 2) return null;
    const sorted = entries.sort((a, b) => a[1] - b[1]);
    return resolveCategoryName(sorted[0][0], categories);
  }, [bundle, categories]);

  const save = async () => {
    if (!uid || !bundle) return;
    setSaving(true);
    try {
      await saveWeeklyReview(
        uid,
        bundle,
        {
          biggestWin: biggestWin.trim() || null,
          biggestMistake: biggestMistake.trim() || null,
          slowdown: slowdown.trim() || null,
          improvement: improvement.trim() || null,
          nextWeekFocus: nextWeekFocus.trim() || null,
          realityScore,
          notes: notes.trim() || null,
        },
        { goalProgress, weakestCategory },
      );
      toast.show('Weekly review saved.', 'success');
      router.back();
    } catch (e) {
      toast.show(toFriendlyError(e, 'Could not save the review').message, 'error');
      setSaving(false);
    }
  };

  const summary = bundle?.summary;
  const previous = bundle?.previous ?? null;
  const delta = (current: number, prev: number | undefined) =>
    previous && prev !== undefined && prev > 0 ? Math.round(current - prev) : null;

  return (
    <Screen>
      <AppHeader
        title="Weekly review"
        eyebrow={bundle ? `${bundle.weekStart} → ${bundle.weekEnd}` : 'Loading'}
        showBack
        right={
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <IconButton
              icon="chevron-left"
              label="Previous week"
              size={38}
              onPress={() => setAnchor(addDays(anchor, -7))}
            />
            <IconButton
              icon="chevron-right"
              label="Next week"
              size={38}
              disabled={bundle ? bundle.weekEnd >= todayKey() : true}
              onPress={() => setAnchor(addDays(anchor, 7))}
            />
          </View>
        }
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScreenScroll bottomInset={40}>
          {loading || !summary ? (
            <View style={{ gap: space.md, paddingTop: space.sm }}>
              <SkeletonCard lines={3} />
              <SkeletonCard lines={4} />
            </View>
          ) : summary.daysWithData === 0 ? (
            <EmptyState
              icon="calendar"
              title="Nothing recorded this week"
              message="Once you have a few scored days, the weekly review will fill itself in."
            />
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
                <ProgressRing value={summary.productivityScore} size={96} thickness={7}>
                  <Metric tone="strong">{summary.productivityScore}</Metric>
                </ProgressRing>
                <View style={{ flex: 1, gap: 5 }}>
                  <Eyebrow tone="faint">Execution score</Eyebrow>
                  <Title tone="strong">
                    {summary.daysWithData} day{summary.daysWithData === 1 ? '' : 's'} recorded
                  </Title>
                  {previous ? (
                    <StatChangeIndicator
                      value={summary.productivityScore - previous.productivityScore}
                    />
                  ) : (
                    <Caption tone="faint">No comparable week yet</Caption>
                  )}
                </View>
              </View>

              <MetricGrid columns={2}>
                <MetricCard
                  label="Task completion"
                  value={`${summary.taskCompletionRate}%`}
                  caption={`${summary.tasksCompleted}/${summary.tasksPlanned}`}
                  delta={delta(summary.taskCompletionRate, previous?.taskCompletionRate)}
                  icon="check-square"
                />
                <MetricCard
                  label="Habit consistency"
                  value={`${summary.habitConsistency}%`}
                  caption={`${summary.habitsCompleted}/${summary.habitsScheduled}`}
                  delta={delta(summary.habitConsistency, previous?.habitConsistency)}
                  icon="repeat"
                />
                <MetricCard
                  label="Focus"
                  value={formatDuration(summary.focusMinutes, '0m')}
                  delta={
                    previous && previous.focusMinutes > 0
                      ? Math.round(
                          ((summary.focusMinutes - previous.focusMinutes) / previous.focusMinutes) *
                            100,
                        )
                      : null
                  }
                  icon="clock"
                />
                <MetricCard
                  label="Workouts"
                  value={`${summary.activityCount}`}
                  delta={
                    previous ? summary.activityCount - previous.activityCount : null
                  }
                  deltaSuffix=""
                  icon="activity"
                />
                <MetricCard
                  label="Best day"
                  value={summary.bestDay ? formatShortDate(summary.bestDay) : '—'}
                  icon="award"
                />
                <MetricCard label="Goal progress" value={`${goalProgress}%`} icon="target" />
              </MetricGrid>

              <View>
                <SectionHeader title="Day by day" />
                <View
                  style={{
                    padding: space.base,
                    backgroundColor: c.surface2,
                    borderRadius: radius.card,
                    borderWidth: StyleSheet.hairlineWidth * 2,
                    borderColor: c.line,
                  }}>
                  <BarChart
                    data={dayBars}
                    highlightIndex={dayBars.reduce(
                      (best, cur, i, arr) => (cur.value > arr[best].value ? i : best),
                      0,
                    )}
                  />
                </View>
              </View>

              {weakestCategory ? (
                <Body tone="muted" style={{ fontSize: 13 }}>
                  {weakestCategory} received the least recorded time this week.
                </Body>
              ) : null}

              <View style={{ gap: space.lg }}>
                <SectionHeader title="CEO review" />
                <TextField
                  label="Biggest win"
                  value={biggestWin}
                  onChangeText={setBiggestWin}
                  placeholder="Shipped the client dashboard"
                  multiline
                />
                <TextField
                  label="Biggest mistake"
                  value={biggestMistake}
                  onChangeText={setBiggestMistake}
                  placeholder="Over-committed on Wednesday"
                  multiline
                />
                <TextField
                  label="What slowed you down?"
                  value={slowdown}
                  onChangeText={setSlowdown}
                  placeholder="Context switching between projects"
                  multiline
                />
                <TextField
                  label="What improved?"
                  value={improvement}
                  onChangeText={setImprovement}
                  placeholder="Gym consistency"
                  multiline
                />
                <TextField
                  label="Main focus next week"
                  value={nextWeekFocus}
                  onChangeText={setNextWeekFocus}
                  placeholder="Finish the syllabus backlog"
                  multiline
                />
                <View style={{ gap: space.sm }}>
                  <Eyebrow tone="meta">Reality score (1–10)</Eyebrow>
                  <RatingPicker value={realityScore} onChange={setRealityScore} max={10} />
                  <Caption tone="faint">
                    Honest read on the week, independent of the numbers.
                  </Caption>
                </View>
                <TextField
                  label="Notes"
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Anything else worth recording"
                  multiline
                />
              </View>
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
            label={bundle?.saved ? 'Update review' : 'Save review'}
            full
            size="lg"
            loading={saving}
            disabled={!bundle || summary?.daysWithData === 0}
            onPress={save}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
