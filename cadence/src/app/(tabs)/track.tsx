import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { HabitRow } from '@/components/habits/HabitChip';
import {
  GridLegend,
  HabitCompletionColumn,
  HabitMonthGrid,
} from '@/components/habits/HabitMonthGrid';
import { Button, IconButton } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/Controls';
import { useToast } from '@/components/ui/Feedback';
import { Icon, resolveIcon } from '@/components/ui/Icon';
import { GUTTER, Screen, ScreenScroll, SectionHeader } from '@/components/ui/Layout';
import { ProgressRing } from '@/components/ui/Progress';
import { EmptyState, SkeletonCard } from '@/components/ui/States';
import { Body, Caption, Display, Eyebrow, Metric, MetricSmall, Title } from '@/components/ui/Text';
import {
  calculateActivitySummary,
  calculateHabitStreaks,
  calculateHabitConsistency,
  groupLogsByHabit,
  indexLogsByDate,
  isLogComplete,
  progressForTopic,
  snapshotHabitDay,
} from '@/services/analytics';
import { fetchActivitiesInRange } from '@/services/activityService';
import { clearHabitLog, fetchHabitLogsInRange, logHabit } from '@/services/habitService';
import { fetchAllTopics, fetchSessionsInRange } from '@/services/studyService';
import { useAuthStore, useSettings } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { useTheme, withAlpha } from '@/theme/ThemeProvider';
import type { ActivityLog, DateKey, HabitLog, StudySession, Topic } from '@/types/models';
import {
  addDays,
  addMonths,
  dateRange,
  endOfMonth,
  endOfWeek,
  formatDuration,
  monthName,
  fromDateKey,
  startOfMonth,
  startOfWeek,
  todayKey,
} from '@/utils/date';

type Segment = 'habits' | 'study' | 'activity' | 'goals';

export default function Track() {
  const { c, space, accent, radius } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const settings = useSettings();
  const uid = useAuthStore((s) => s.user?.uid ?? null);

  const {
    habits,
    subjects,
    goals,
    dayHabitLogs,
    activeDate,
    toggleHabit,
    setHabitValue,
  } = useDataStore();

  const [segment, setSegment] = useState<Segment>('habits');
  const [month, setMonth] = useState<DateKey>(startOfMonth(todayKey()));
  const [monthLogs, setMonthLogs] = useState<HabitLog[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [busy, setBusy] = useState(false);

  const today = todayKey();
  const activeHabits = useMemo(() => habits.filter((h) => h.active), [habits]);

  const loadHabitMonth = useCallback(async () => {
    if (!uid) return;
    setBusy(true);
    try {
      const logs = await fetchHabitLogsInRange(uid, startOfMonth(month), endOfMonth(month));
      setMonthLogs(logs);
    } catch {
      toast.show('Could not load habit history.', 'error');
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, month]);

  const loadStudy = useCallback(async () => {
    if (!uid) return;
    setBusy(true);
    try {
      const [allTopics, recentSessions] = await Promise.all([
        fetchAllTopics(uid, subjects),
        fetchSessionsInRange(uid, addDays(today, -90), today),
      ]);
      setTopics(allTopics);
      setSessions(recentSessions);
    } catch {
      toast.show('Could not load study data.', 'error');
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, subjects.length, today]);

  const loadActivity = useCallback(async () => {
    if (!uid) return;
    setBusy(true);
    try {
      const logs = await fetchActivitiesInRange(uid, addDays(today, -60), today);
      setActivities(logs);
    } catch {
      toast.show('Could not load activity.', 'error');
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, today]);

  useFocusEffect(
    useCallback(() => {
      if (segment === 'habits') loadHabitMonth();
      if (segment === 'study') loadStudy();
      if (segment === 'activity') loadActivity();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [segment, month, subjects.length]),
  );

  const habitStats = useMemo(() => {
    const grouped = groupLogsByHabit(monthLogs);
    const monthRange = dateRange(startOfMonth(month), endOfMonth(month));
    return activeHabits.map((habit) => {
      const logs = grouped.get(habit.id) ?? [];
      const consistency = calculateHabitConsistency(
        habit,
        monthRange,
        logs,
        settings.weekStart,
        today,
      );
      const streaks = calculateHabitStreaks(habit, logs, settings.weekStart, today);
      const todayLog = dayHabitLogs.find((l) => l.habitId === habit.id);
      const snapshot = snapshotHabitDay(habit, activeDate, {
        logsByDate: indexLogsByDate(dayHabitLogs.filter((l) => l.habitId === habit.id)),
        weekStart: settings.weekStart,
        today,
      });
      return {
        habit,
        consistency: consistency.rate,
        streak: streaks.current,
        completed: isLogComplete(todayLog, habit),
        required: snapshot.required,
        skipped: todayLog?.status === 'skipped',
        value: todayLog?.value ?? 0,
      };
    });
  }, [activeHabits, monthLogs, month, settings.weekStart, today, dayHabitLogs, activeDate]);

  const overallConsistency = useMemo(() => {
    if (habitStats.length === 0) return 0;
    const measured = habitStats.filter((h) => h.consistency > 0 || h.streak > 0);
    const source = measured.length > 0 ? measured : habitStats;
    return Math.round(source.reduce((a, h) => a + h.consistency, 0) / source.length);
  }, [habitStats]);

  const studyByCategory = useMemo(() => {
    return subjects.map((subject) => {
      const subjectTopics = topics.filter((t) => t.subjectId === subject.id);
      const minutes = sessions
        .filter((s) => s.subjectId === subject.id)
        .reduce((a, s) => a + s.durationMinutes, 0);
      const progress =
        subjectTopics.length > 0
          ? Math.round(
              subjectTopics.reduce((a, t) => a + progressForTopic(t), 0) / subjectTopics.length,
            )
          : 0;
      return {
        subject,
        topics: subjectTopics.length,
        completed: subjectTopics.filter((t) => t.status === 'completed').length,
        minutes,
        progress,
      };
    });
  }, [subjects, topics, sessions]);

  const weekRange = useMemo(
    () => dateRange(startOfWeek(today, settings.weekStart), endOfWeek(today, settings.weekStart)),
    [today, settings.weekStart],
  );
  const weekActivities = activities.filter((a) => weekRange.includes(a.date));
  const activitySummary = calculateActivitySummary(weekActivities);

  const activeGoals = goals.filter((g) => g.status === 'active');
  const finishedGoals = goals.filter((g) => g.status === 'completed');

  const toggleCell = async (habitId: string, date: DateKey, currentlyComplete: boolean) => {
    if (!uid) return;
    const habit = habits.find((h) => h.id === habitId);
    if (!habit) return;
    try {
      if (currentlyComplete) await clearHabitLog(uid, habit.id, date);
      else await logHabit(uid, habit, date, { status: 'completed', value: habit.target });
      await loadHabitMonth();
      useDataStore.getState().scheduleRecompute(date);
    } catch {
      toast.show('Could not update that day.', 'error');
    }
  };

  return (
    <Screen>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: GUTTER,
          paddingVertical: space.md,
          gap: space.md,
        }}>
        <View style={{ flex: 1 }}>
          <Eyebrow tone="faint">Track</Eyebrow>
          <Display tone="strong">
            {segment === 'habits'
              ? 'Habits'
              : segment === 'study'
                ? 'Study'
                : segment === 'activity'
                  ? 'Activity'
                  : 'Goals'}
          </Display>
        </View>
        <IconButton
          icon="plus"
          label={`Add ${segment === 'goals' ? 'goal' : segment.slice(0, -1)}`}
          onPress={() =>
            router.push(
              segment === 'habits'
                ? '/habit/new'
                : segment === 'study'
                  ? '/subject/new'
                  : segment === 'activity'
                    ? '/activity/new'
                    : '/goal/new',
            )
          }
        />
      </View>

      <View style={{ paddingHorizontal: GUTTER, paddingBottom: space.md }}>
        <SegmentedControl
          options={[
            { value: 'habits', label: 'Habits' },
            { value: 'study', label: 'Study' },
            { value: 'activity', label: 'Activity' },
            { value: 'goals', label: 'Goals' },
          ]}
          value={segment}
          onChange={(v) => setSegment(v as Segment)}
        />
      </View>

      <ScreenScroll>
        {segment === 'habits' ? (
          activeHabits.length === 0 ? (
            <EmptyState
              icon="repeat"
              title="No habits yet"
              message="Habits are the compounding part of the system. Start with one you will actually do."
              actionLabel="Create habit"
              onAction={() => router.push('/habit/new')}
            />
          ) : (
            <View style={{ gap: space.xl }}>
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
                <ProgressRing value={overallConsistency} size={78} thickness={6}>
                  <Metric tone="strong">{overallConsistency}</Metric>
                </ProgressRing>
                <View style={{ flex: 1, gap: 4 }}>
                  <Eyebrow tone="faint">Consistency this month</Eyebrow>
                  <Title tone="strong">
                    {activeHabits.length} habit{activeHabits.length === 1 ? '' : 's'} tracked
                  </Title>
                  <Caption tone="faint">
                    Best streak:{' '}
                    {Math.max(0, ...habitStats.map((h) => h.streak))} days
                  </Caption>
                </View>
              </View>

              <View>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingBottom: space.md,
                  }}>
                  <IconButton
                    icon="chevron-left"
                    label="Previous month"
                    size={34}
                    onPress={() => setMonth(addMonths(month, -1))}
                  />
                  <Eyebrow tone="meta">
                    {monthName(fromDateKey(month).getMonth())} {fromDateKey(month).getFullYear()}
                  </Eyebrow>
                  <IconButton
                    icon="chevron-right"
                    label="Next month"
                    size={34}
                    disabled={startOfMonth(month) >= startOfMonth(today)}
                    onPress={() => setMonth(addMonths(month, 1))}
                  />
                </View>

                {busy && monthLogs.length === 0 ? (
                  <SkeletonCard lines={4} />
                ) : (
                  <View
                    style={{
                      padding: space.md,
                      gap: space.base,
                      backgroundColor: c.surface2,
                      borderRadius: radius.card,
                      borderWidth: StyleSheet.hairlineWidth * 2,
                      borderColor: c.line,
                    }}>
                    <HabitMonthGrid
                      habits={activeHabits}
                      logs={monthLogs}
                      month={month}
                      weekStart={settings.weekStart}
                      today={today}
                      onSelectHabit={(habit) => router.push(`/habit/${habit.id}`)}
                      onToggleCell={(habit, date, complete) =>
                        toggleCell(habit.id, date, complete)
                      }
                    />
                    <GridLegend />
                  </View>
                )}
              </View>

              <View>
                <SectionHeader title="Completion" />
                <HabitCompletionColumn
                  habits={activeHabits}
                  logs={monthLogs}
                  month={month}
                  weekStart={settings.weekStart}
                  today={today}
                />
              </View>

              <View>
                <SectionHeader title="Today" />
                <View
                  style={{
                    borderWidth: StyleSheet.hairlineWidth * 2,
                    borderColor: c.line,
                    borderRadius: radius.card,
                    overflow: 'hidden',
                    backgroundColor: c.surface2,
                  }}>
                  {habitStats.map((stat, i) => (
                    <View key={stat.habit.id}>
                      {i > 0 ? (
                        <View
                          style={{ height: StyleSheet.hairlineWidth * 2, backgroundColor: c.line }}
                        />
                      ) : null}
                      <HabitRow
                        habit={stat.habit}
                        completed={stat.completed}
                        required={stat.required}
                        skipped={stat.skipped}
                        value={stat.value}
                        consistency={stat.consistency}
                        streak={stat.streak}
                        onToggle={() => toggleHabit(stat.habit)}
                        onIncrement={
                          stat.habit.measurementType === 'binary'
                            ? undefined
                            : (delta) =>
                                setHabitValue(
                                  stat.habit,
                                  Math.max(0, stat.value + delta * incrementStep(stat.habit.target)),
                                )
                        }
                        onPress={() => router.push(`/habit/${stat.habit.id}`)}
                      />
                    </View>
                  ))}
                </View>
              </View>
            </View>
          )
        ) : null}

        {segment === 'study' ? (
          subjects.length === 0 ? (
            <EmptyState
              icon="book"
              title="No subjects yet"
              message="Turn a syllabus into topics you can actually tick off."
              actionLabel="Create subject"
              onAction={() => router.push('/subject/new')}
            />
          ) : (
            <View style={{ gap: space.md }}>
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <Button
                  label="Start focus session"
                  icon="play"
                  style={{ flex: 1 }}
                  onPress={() => router.push('/focus/setup')}
                />
              </View>
              {studyByCategory.map(({ subject, topics: count, completed, minutes, progress }) => (
                <Pressable
                  key={subject.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${subject.name}, ${progress} percent complete`}
                  onPress={() => router.push(`/subject/${subject.id}`)}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.base,
                    padding: space.base,
                    backgroundColor: pressed ? c.surface3 : c.surface2,
                    borderRadius: radius.card,
                    borderWidth: StyleSheet.hairlineWidth * 2,
                    borderColor: c.line,
                  })}>
                  <ProgressRing value={progress} size={62} thickness={5} color={subject.color}>
                    <MetricSmall tone="strong">{progress}</MetricSmall>
                  </ProgressRing>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Title tone="strong" numberOfLines={1}>
                      {subject.name}
                    </Title>
                    <Caption tone="faint">
                      {completed} / {count} topics · {formatDuration(minutes, '0m')} studied
                    </Caption>
                    {subject.examDate ? (
                      <Caption tone="faint">Exam {subject.examDate}</Caption>
                    ) : null}
                  </View>
                  <Icon name="chevron-right" size={16} color={c.text30} />
                </Pressable>
              ))}
            </View>
          )
        ) : null}

        {segment === 'activity' ? (
          <View style={{ gap: space.lg }}>
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
              {[
                { label: 'This week', value: String(activitySummary.sessions) },
                { label: 'Total time', value: formatDuration(activitySummary.totalMinutes, '0m') },
                {
                  label: 'Last 60 days',
                  value: String(activities.filter((a) => a.completed).length),
                },
              ].map((cell) => (
                <View
                  key={cell.label}
                  style={{
                    flex: 1,
                    padding: space.md,
                    gap: 4,
                    alignItems: 'center',
                    backgroundColor: c.surface2,
                  }}>
                  <Eyebrow tone="faint">{cell.label}</Eyebrow>
                  <MetricSmall tone="strong">{cell.value}</MetricSmall>
                </View>
              ))}
            </View>

            <Button
              label="Log activity"
              icon="plus"
              full
              onPress={() => router.push('/activity/new')}
            />

            {activities.length === 0 ? (
              <EmptyState
                icon="activity"
                title="No sessions logged"
                message="Log a workout, run or match. One tap is enough — details are optional."
                compact
              />
            ) : (
              <View>
                <SectionHeader title="Recent" meta={`${activities.length}`} />
                <View
                  style={{
                    borderWidth: StyleSheet.hairlineWidth * 2,
                    borderColor: c.line,
                    borderRadius: radius.card,
                    overflow: 'hidden',
                    backgroundColor: c.surface2,
                  }}>
                  {activities.slice(0, 20).map((log, i) => (
                    <View
                      key={log.id}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: space.md,
                        padding: space.md,
                        borderTopWidth: i > 0 ? StyleSheet.hairlineWidth * 2 : 0,
                        borderTopColor: c.line,
                      }}>
                      <View
                        style={{
                          width: 32,
                          height: 32,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: withAlpha(accent.base, 0.14),
                        }}>
                        <Icon name={resolveIcon(log.type)} size={15} color={accent.base} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Body numberOfLines={1}>
                          {log.label || log.type.charAt(0).toUpperCase() + log.type.slice(1)}
                        </Body>
                        <Caption tone="faint">
                          {log.date}
                          {log.durationMinutes ? ` · ${formatDuration(log.durationMinutes)}` : ''}
                        </Caption>
                      </View>
                      <Icon name="check" size={15} color={c.text30} />
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>
        ) : null}

        {segment === 'goals' ? (
          goals.length === 0 ? (
            <EmptyState
              icon="target"
              title="No goals yet"
              message="Goals give your daily work a direction. Link them to tasks, habits or a syllabus and they update themselves."
              actionLabel="Create goal"
              onAction={() => router.push('/goal/new')}
            />
          ) : (
            <View style={{ gap: space.lg }}>
              <View style={{ gap: space.md }}>
                {activeGoals.map((goal) => (
                  <Pressable
                    key={goal.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${goal.title}, ${goal.progress} percent`}
                    onPress={() => router.push(`/goal/${goal.id}`)}
                    style={({ pressed }) => ({
                      gap: space.md,
                      padding: space.base,
                      backgroundColor: pressed ? c.surface3 : c.surface2,
                      borderRadius: radius.card,
                      borderWidth: StyleSheet.hairlineWidth * 2,
                      borderColor: c.line,
                    })}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                      <View style={{ flex: 1, gap: 3 }}>
                        <Title tone="strong" numberOfLines={2}>
                          {goal.title}
                        </Title>
                        <Caption tone="faint">
                          {goal.targetDate ? `Target ${goal.targetDate}` : 'No target date'}
                        </Caption>
                      </View>
                      <Metric tone="strong">{goal.progress}%</Metric>
                    </View>
                    <View style={{ height: 5, backgroundColor: c.inset }}>
                      <View
                        style={{
                          width: `${Math.max(0, Math.min(100, goal.progress))}%`,
                          height: 5,
                          backgroundColor: accent.base,
                        }}
                      />
                    </View>
                  </Pressable>
                ))}
              </View>

              {finishedGoals.length > 0 ? (
                <View>
                  <SectionHeader title="Completed" meta={`${finishedGoals.length}`} />
                  <View style={{ gap: space.sm }}>
                    {finishedGoals.map((goal) => (
                      <Pressable
                        key={goal.id}
                        accessibilityRole="button"
                        accessibilityLabel={goal.title}
                        onPress={() => router.push(`/goal/${goal.id}`)}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: space.md,
                          padding: space.md,
                          borderWidth: StyleSheet.hairlineWidth * 2,
                          borderColor: c.line,
                          borderRadius: radius.card,
                        }}>
                        <Icon name="check-circle" size={16} color={accent.base} />
                        <Body tone="muted" style={{ flex: 1 }} numberOfLines={1}>
                          {goal.title}
                        </Body>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}
            </View>
          )
        ) : null}
      </ScreenScroll>
    </Screen>
  );
}

/** Water-style habits step in 1s; duration habits step in 5-minute blocks. */
function incrementStep(target: number): number {
  return target >= 30 ? 5 : 1;
}
