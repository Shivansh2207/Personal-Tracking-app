import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  BarChart,
  ChartEmpty,
  DistributionChart,
  Heatmap,
  LineChart,
  RankedBars,
} from '@/components/analytics/Charts';
import { SegmentedControl } from '@/components/ui/Controls';
import { useIntensityColors, IntensityLegend, intensityLevel } from '@/components/ui/Calendar';
import { useToast } from '@/components/ui/Feedback';
import { GUTTER, Screen, ScreenScroll, SectionHeader } from '@/components/ui/Layout';
import { MetricCard, MetricGrid } from '@/components/ui/MetricCard';
import { EmptyState, SkeletonCard } from '@/components/ui/States';
import { Body, Caption, Display, Eyebrow } from '@/components/ui/Text';
import {
  buildScoreTrend,
  calculateActivitySummary,
  calculateCategoryDistribution,
  calculateHabitAnalytics,
  calculateStreak,
  calculateStudyAnalytics,
  calculateTimeVariance,
  calculateWeekdayAverages,
} from '@/services/analytics';
import { fetchActivitiesInRange } from '@/services/activityService';
import { fetchHabitLogsInRange } from '@/services/habitService';
import { fetchStatsInRange, VIRTUAL_CATEGORY_LABELS } from '@/services/statsService';
import { fetchAllTopics, fetchSessionsInRange } from '@/services/studyService';
import { fetchTasksInRange } from '@/services/taskService';
import { useAuthStore, useSettings } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { useTheme } from '@/theme/ThemeProvider';
import type {
  ActivityLog,
  DailyStats,
  HabitLog,
  StudySession,
  Task,
  Topic,
} from '@/types/models';
import {
  addDays,
  dateRange,
  formatDuration,
  formatShortDate,
  lastNDays,
  startOfWeek,
  todayKey,
} from '@/utils/date';

type Range = '7' | '30' | '90' | '365';
const RANGE_DAYS: Record<Range, number> = { '7': 7, '30': 30, '90': 90, '365': 365 };

export default function Analytics() {
  const { c, space, radius } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const settings = useSettings();
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const categories = useDataStore((s) => s.categories);
  const habits = useDataStore((s) => s.habits);
  const subjects = useDataStore((s) => s.subjects);
  const goals = useDataStore((s) => s.goals);
  const intensityColors = useIntensityColors();

  const [range, setRange] = useState<Range>('30');
  const [distributionMode, setDistributionMode] = useState<'time' | 'activities'>('time');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DailyStats[]>([]);
  const [previousStats, setPreviousStats] = useState<DailyStats[]>([]);
  const [habitLogs, setHabitLogs] = useState<HabitLog[]>([]);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [yearStats, setYearStats] = useState<DailyStats[]>([]);

  const today = todayKey();
  const days = RANGE_DAYS[range];
  const from = addDays(today, -(days - 1));
  const prevFrom = addDays(from, -days);
  const prevTo = addDays(from, -1);

  const load = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const [current, previous, logs, sess, acts, taskList, topicList, year] = await Promise.all([
        fetchStatsInRange(uid, from, today),
        fetchStatsInRange(uid, prevFrom, prevTo),
        fetchHabitLogsInRange(uid, from, today),
        fetchSessionsInRange(uid, from, today),
        fetchActivitiesInRange(uid, from, today),
        fetchTasksInRange(uid, from, today),
        fetchAllTopics(uid, subjects),
        range === '365'
          ? Promise.resolve([] as DailyStats[])
          : fetchStatsInRange(uid, addDays(today, -364), today),
      ]);
      setStats(current);
      setPreviousStats(previous);
      setHabitLogs(logs);
      setSessions(sess);
      setActivities(acts);
      setTasks(taskList.filter((t) => !t.isRecurringTemplate));
      setTopics(topicList);
      setYearStats(range === '365' ? current : year);
    } catch {
      toast.show('Could not load analytics.', 'error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, range, subjects.length]);

  useFocusEffect(
    useCallback(() => {
      load();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [range, subjects.length]),
  );

  const scored = stats.filter((s) => s.dayState === 'successful' || s.dayState === 'incomplete');
  const prevScored = previousStats.filter(
    (s) => s.dayState === 'successful' || s.dayState === 'incomplete',
  );
  const hasComparison = prevScored.length >= Math.max(3, Math.floor(days * 0.2));

  const avgScore = scored.length
    ? Math.round(scored.reduce((a, s) => a + s.productivityScore, 0) / scored.length)
    : 0;
  const prevAvgScore = prevScored.length
    ? Math.round(prevScored.reduce((a, s) => a + s.productivityScore, 0) / prevScored.length)
    : 0;

  const tasksCompleted = stats.reduce((a, s) => a + s.tasksCompleted, 0);
  const prevTasksCompleted = previousStats.reduce((a, s) => a + s.tasksCompleted, 0);
  const focusMinutes = stats.reduce((a, s) => a + s.focusMinutes, 0);
  const prevFocusMinutes = previousStats.reduce((a, s) => a + s.focusMinutes, 0);

  const habitAnalytics = useMemo(
    () =>
      calculateHabitAnalytics(
        habits.filter((h) => h.active),
        habitLogs,
        dateRange(from, today),
        settings.weekStart,
        today,
      ),
    [habits, habitLogs, from, today, settings.weekStart],
  );

  const streak = useMemo(
    () => calculateStreak(new Map(yearStats.map((s) => [s.date, { dayState: s.dayState }])), today),
    [yearStats, today],
  );

  const trend = useMemo(
    () => buildScoreTrend(stats, lastNDays(Math.min(days, 60), today)),
    [stats, days, today],
  );

  const weekdayAverages = useMemo(() => calculateWeekdayAverages(stats), [stats]);
  const bestWeekday = [...weekdayAverages]
    .filter((w) => w.samples > 0)
    .sort((a, b) => b.average - a.average)[0];

  const distribution = useMemo(() => {
    const slices = calculateCategoryDistribution(stats, categories, distributionMode);
    return slices.map((slice) => ({
      label: VIRTUAL_CATEGORY_LABELS[slice.categoryId] ?? slice.name,
      value: slice.value,
      percent: slice.percent,
      color: slice.color,
      formattedValue:
        distributionMode === 'time'
          ? formatDuration(slice.value)
          : `${slice.value} task${slice.value === 1 ? '' : 's'}`,
    }));
  }, [stats, categories, distributionMode]);

  const studyAnalytics = useMemo(
    () => calculateStudyAnalytics(sessions, subjects, topics),
    [sessions, subjects, topics],
  );

  const timeVariance = useMemo(() => calculateTimeVariance(tasks), [tasks]);
  const activitySummary = useMemo(() => calculateActivitySummary(activities), [activities]);

  const weekBars = useMemo(() => {
    const weekStartKey = startOfWeek(today, settings.weekStart);
    const weekDates = dateRange(weekStartKey, addDays(weekStartKey, 6));
    const byDate = new Map(stats.map((s) => [s.date, s]));
    return weekDates.map((date) => {
      const stat = byDate.get(date);
      return {
        label: formatShortDate(date).split(' ')[0],
        value: stat?.productivityScore ?? 0,
        hasData: !!stat && stat.dayState !== 'no_data',
      };
    });
  }, [stats, today, settings.weekStart]);

  const heatmapCells = useMemo(() => {
    const byDate = new Map(yearStats.map((s) => [s.date, s]));
    const start = startOfWeek(addDays(today, -363), settings.weekStart);
    return dateRange(start, today).map((date) => {
      const stat = byDate.get(date);
      return {
        date,
        level: intensityLevel(
          stat && stat.dayState !== 'no_data' ? stat.productivityScore : null,
        ),
      };
    });
  }, [yearStats, today, settings.weekStart]);

  const goalProgress =
    goals.filter((g) => g.status === 'active').length > 0
      ? Math.round(
          goals
            .filter((g) => g.status === 'active')
            .reduce((a, g) => a + g.progress, 0) /
            goals.filter((g) => g.status === 'active').length,
        )
      : 0;

  const hasAnyData = stats.some((s) => s.dayState !== 'no_data');

  return (
    <Screen>
      <View style={{ paddingHorizontal: GUTTER, paddingVertical: space.md }}>
        <Eyebrow tone="faint">Analytics</Eyebrow>
        <Display tone="strong">Where effort goes</Display>
      </View>

      <View style={{ paddingHorizontal: GUTTER, paddingBottom: space.md }}>
        <SegmentedControl
          options={[
            { value: '7', label: '7 days' },
            { value: '30', label: '30 days' },
            { value: '90', label: '3 months' },
            { value: '365', label: 'Year' },
          ]}
          value={range}
          onChange={(v) => setRange(v as Range)}
        />
      </View>

      <ScreenScroll>
        {loading && stats.length === 0 ? (
          <View style={{ gap: space.md }}>
            <SkeletonCard lines={3} />
            <SkeletonCard lines={4} />
          </View>
        ) : !hasAnyData ? (
          <EmptyState
            icon="bar-chart-2"
            title="Not enough data yet"
            message="Complete a few days of tasks, habits or focus sessions and your trends will appear here."
            actionLabel="Go to today"
            onAction={() => router.push('/(tabs)')}
          />
        ) : (
          <View style={{ gap: space.xl }}>
            <MetricGrid columns={2}>
              <MetricCard
                label="Productivity"
                value={`${avgScore}%`}
                delta={hasComparison ? avgScore - prevAvgScore : null}
                caption={hasComparison ? 'vs previous' : `${scored.length} scored days`}
                large
              />
              <MetricCard
                label="Streak"
                value={`${streak}`}
                caption={streak === 1 ? 'day' : 'days'}
                icon="zap"
                large
              />
              <MetricCard
                label="Tasks completed"
                value={`${tasksCompleted}`}
                delta={
                  hasComparison && prevTasksCompleted > 0
                    ? Math.round(
                        ((tasksCompleted - prevTasksCompleted) / prevTasksCompleted) * 100,
                      )
                    : null
                }
                icon="check-square"
              />
              <MetricCard
                label="Focus"
                value={formatDuration(focusMinutes, '0m')}
                delta={
                  hasComparison && prevFocusMinutes > 0
                    ? Math.round(((focusMinutes - prevFocusMinutes) / prevFocusMinutes) * 100)
                    : null
                }
                icon="clock"
              />
              <MetricCard
                label="Habit consistency"
                value={`${habitAnalytics.overall}%`}
                caption={`${habits.filter((h) => h.active).length} habits`}
                icon="repeat"
              />
              <MetricCard
                label="Goal progress"
                value={`${goalProgress}%`}
                caption={`${goals.filter((g) => g.status === 'active').length} active`}
                icon="target"
              />
            </MetricGrid>

            <View>
              <SectionHeader title="Productivity trend" index={1} />
              {trend.filter((t) => t.hasData).length < 2 ? (
                <ChartEmpty message="Two or more scored days are needed to draw a trend." />
              ) : (
                <View
                  style={{
                    padding: space.base,
                    backgroundColor: c.surface2,
                    borderRadius: radius.card,
                    borderWidth: StyleSheet.hairlineWidth * 2,
                    borderColor: c.line,
                  }}>
                  <LineChart data={trend} height={180} />
                </View>
              )}
            </View>

            <View>
              <SectionHeader
                title="This week"
                index={2}
                meta={bestWeekday ? `Best: ${bestWeekday.label}` : undefined}
              />
              <View
                style={{
                  padding: space.base,
                  backgroundColor: c.surface2,
                  borderRadius: radius.card,
                  borderWidth: StyleSheet.hairlineWidth * 2,
                  borderColor: c.line,
                }}>
                <BarChart
                  data={weekBars}
                  highlightIndex={weekBars.reduce(
                    (best, cur, i, arr) => (cur.value > arr[best].value ? i : best),
                    0,
                  )}
                />
              </View>
            </View>

            <View>
              <SectionHeader title="Where effort goes" index={3} />
              <View style={{ paddingBottom: space.md }}>
                <SegmentedControl
                  options={[
                    { value: 'time', label: 'By time' },
                    { value: 'activities', label: 'By activities' },
                  ]}
                  value={distributionMode}
                  onChange={(v) => setDistributionMode(v as 'time' | 'activities')}
                />
              </View>
              {distribution.length === 0 ? (
                <ChartEmpty
                  message={
                    distributionMode === 'time'
                      ? 'Record a focus session or activity to see where your time goes.'
                      : 'Complete tasks with a category to see the split.'
                  }
                />
              ) : (
                <View
                  style={{
                    padding: space.base,
                    backgroundColor: c.surface2,
                    borderRadius: radius.card,
                    borderWidth: StyleSheet.hairlineWidth * 2,
                    borderColor: c.line,
                  }}>
                  <DistributionChart items={distribution} />
                </View>
              )}
            </View>

            {habitAnalytics.rows.filter((r) => r.scheduled > 0).length > 0 ? (
              <View>
                <SectionHeader
                  title="Habit consistency"
                  index={4}
                  meta={`${habitAnalytics.overall}%`}
                />
                <View
                  style={{
                    padding: space.base,
                    gap: space.base,
                    backgroundColor: c.surface2,
                    borderRadius: radius.card,
                    borderWidth: StyleSheet.hairlineWidth * 2,
                    borderColor: c.line,
                  }}>
                  <RankedBars
                    items={habitAnalytics.rows
                      .filter((r) => r.scheduled > 0)
                      .sort((a, b) => b.consistency - a.consistency)
                      .map((row) => ({
                        label: row.habit.name,
                        value: row.consistency,
                        color: row.habit.color ?? undefined,
                        caption: `${row.completed}/${row.scheduled}`,
                      }))}
                  />
                  {habitAnalytics.weakest ? (
                    <Caption tone="faint">
                      {habitAnalytics.weakest} has been your least consistent habit in this period.
                    </Caption>
                  ) : null}
                </View>
              </View>
            ) : null}

            {studyAnalytics.totalMinutes > 0 ? (
              <View>
                <SectionHeader
                  title="Study"
                  index={5}
                  meta={formatDuration(studyAnalytics.totalMinutes)}
                />
                <View
                  style={{
                    padding: space.base,
                    gap: space.base,
                    backgroundColor: c.surface2,
                    borderRadius: radius.card,
                    borderWidth: StyleSheet.hairlineWidth * 2,
                    borderColor: c.line,
                  }}>
                  <RankedBars
                    suffix=""
                    items={studyAnalytics.bySubject
                      .filter((s) => s.minutes > 0)
                      .map((s) => ({
                        label: s.name,
                        value: s.minutes,
                        color: s.color,
                        caption: `${s.topicsCompleted}/${s.topicsTotal} topics`,
                      }))}
                  />
                  <View style={{ flexDirection: 'row', gap: space.lg }}>
                    <View>
                      <Eyebrow tone="faint">Sessions</Eyebrow>
                      <Body>{studyAnalytics.sessionCount}</Body>
                    </View>
                    <View>
                      <Eyebrow tone="faint">Avg length</Eyebrow>
                      <Body>{formatDuration(studyAnalytics.averageSessionMinutes)}</Body>
                    </View>
                    {studyAnalytics.averageProductivity !== null ? (
                      <View>
                        <Eyebrow tone="faint">Avg rating</Eyebrow>
                        <Body>{studyAnalytics.averageProductivity}/5</Body>
                      </View>
                    ) : null}
                    {studyAnalytics.averageConfidence !== null ? (
                      <View>
                        <Eyebrow tone="faint">Confidence</Eyebrow>
                        <Body>{studyAnalytics.averageConfidence}/5</Body>
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>
            ) : null}

            {timeVariance.tasksWithBoth > 0 ? (
              <View>
                <SectionHeader title="Planned vs actual" index={6} />
                <View
                  style={{
                    flexDirection: 'row',
                    gap: StyleSheet.hairlineWidth * 2,
                    backgroundColor: c.line,
                    borderRadius: radius.card,
                    overflow: 'hidden',
                    borderWidth: StyleSheet.hairlineWidth * 2,
                    borderColor: c.line,
                  }}>
                  <MetricCard
                    label="Planned"
                    value={formatDuration(timeVariance.plannedMinutes)}
                    style={{ flex: 1, backgroundColor: c.surface2 }}
                  />
                  <MetricCard
                    label="Actual"
                    value={formatDuration(timeVariance.actualMinutes)}
                    style={{ flex: 1, backgroundColor: c.surface2 }}
                  />
                  <MetricCard
                    label="Variance"
                    value={`${timeVariance.variance > 0 ? '+' : ''}${formatDuration(Math.abs(timeVariance.variance))}`}
                    delta={timeVariance.variancePercent}
                    lowerIsBetter
                    style={{ flex: 1, backgroundColor: c.surface2 }}
                  />
                </View>
                <Caption tone="faint" style={{ paddingTop: space.sm }}>
                  Based on {timeVariance.tasksWithBoth} task
                  {timeVariance.tasksWithBoth === 1 ? '' : 's'} with both an estimate and recorded
                  time.
                </Caption>
              </View>
            ) : null}

            {activitySummary.sessions > 0 ? (
              <View>
                <SectionHeader
                  title="Activity"
                  index={7}
                  meta={`${activitySummary.sessions} sessions`}
                />
                <View
                  style={{
                    padding: space.base,
                    gap: space.md,
                    backgroundColor: c.surface2,
                    borderRadius: radius.card,
                    borderWidth: StyleSheet.hairlineWidth * 2,
                    borderColor: c.line,
                  }}>
                  <RankedBars
                    suffix=""
                    items={activitySummary.byType.map((t) => ({
                      label: t.type.charAt(0).toUpperCase() + t.type.slice(1),
                      value: t.count,
                      caption: formatDuration(t.minutes, '0m'),
                    }))}
                  />
                </View>
              </View>
            ) : null}

            <View>
              <SectionHeader title="Consistency" index={8} />
              <View
                style={{
                  padding: space.base,
                  gap: space.md,
                  backgroundColor: c.surface2,
                  borderRadius: radius.card,
                  borderWidth: StyleSheet.hairlineWidth * 2,
                  borderColor: c.line,
                }}>
                <Heatmap
                  cells={heatmapCells}
                  colors={intensityColors}
                  onSelect={(date) => router.push(`/history/${date}`)}
                />
                <IntensityLegend />
                <Caption tone="faint">Tap any day to open its summary.</Caption>
              </View>
            </View>

            <View style={{ paddingBottom: space.lg }}>
              <SectionHeader title="Weekday averages" index={9} />
              <View
                style={{
                  padding: space.base,
                  backgroundColor: c.surface2,
                  borderRadius: radius.card,
                  borderWidth: StyleSheet.hairlineWidth * 2,
                  borderColor: c.line,
                }}>
                <BarChart
                  data={weekdayAverages.map((w) => ({
                    label: w.label,
                    value: w.average,
                    hasData: w.samples > 0,
                  }))}
                  height={140}
                  highlightIndex={
                    bestWeekday ? weekdayAverages.findIndex((w) => w.dow === bestWeekday.dow) : null
                  }
                />
              </View>
            </View>
          </View>
        )}
      </ScreenScroll>
    </Screen>
  );
}
