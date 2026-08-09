import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { HabitChip } from '@/components/habits/HabitChip';
import { TaskCard } from '@/components/tasks/TaskCard';
import { DailyScoreCard } from '@/components/dashboard/DailyScoreCard';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button, IconButton } from '@/components/ui/Button';
import { Chip, ChipGroup } from '@/components/ui/Controls';
import { useToast } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { GUTTER, Screen, ScreenScroll, SectionHeader } from '@/components/ui/Layout';
import { EmptyState, OfflineBanner, SkeletonCard } from '@/components/ui/States';
import { Body, Caption, Display, Eyebrow } from '@/components/ui/Text';
import {
  calculateDailyScore,
  isFocusApplicable,
  calculateStreak,
  pickInsight,
} from '@/services/analytics';
import { carryForwardTasks, setTopPriority } from '@/services/taskService';
import { useAuthStore, useSettings } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { useTheme, withAlpha } from '@/theme/ThemeProvider';
import type { Task } from '@/types/models';
import {
  DAY_PART_LABELS,
  DayPart,
  addDays,
  dayPartForTime,
  endOfWeek,
  formatDuration,
  formatLongDate,
  greetingForHour,
  lastNDays,
  startOfWeek,
  todayKey,
} from '@/utils/date';

const DAY_PART_ORDER: DayPart[] = ['morning', 'afternoon', 'evening', 'anytime'];

export default function Home() {
  const { c, space, accent, radius } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const settings = useSettings();
  const profile = useAuthStore((s) => s.profile);
  const uid = useAuthStore((s) => s.user?.uid ?? null);

  const {
    categories,
    habits,
    dayHabitLogs,
    daySessions,
    dayActivities,
    recentStats,
    loading,
    hydrated,
    error,
    offline,
    activeDate,
    setActiveDate,
    toggleTaskComplete,
    toggleHabit,
    skipHabit,
    visibleTasks,
    habitSnapshots,
    recomputeNow,
  } = useDataStore();

  const [refreshing, setRefreshing] = useState(false);
  const [habitSheet, setHabitSheet] = useState<string | null>(null);
  const [carryPrompt, setCarryPrompt] = useState(false);

  const today = todayKey();

  // Keep the dashboard pinned to the real "today" even if the Plan tab moved
  // the active date, and roll over automatically at midnight.
  useEffect(() => {
    if (activeDate !== today) setActiveDate(today);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);

  const tasks = visibleTasks();
  const snapshots = habitSnapshots();
  const categoryById = useMemo(
    () => new Map(categories.map((cat) => [cat.id, cat])),
    [categories],
  );

  const plannedTasks = tasks.filter((t) => t.status !== 'skipped');
  const completedTasks = plannedTasks.filter((t) => t.status === 'completed');
  const requiredHabits = snapshots.filter((s) => s.required);
  const completedHabits = requiredHabits.filter((s) => s.completed);
  const focusMinutes = daySessions.reduce((a, s) => a + s.durationMinutes, 0);

  const score = useMemo(
    () =>
      calculateDailyScore({
        tasksPlanned: plannedTasks.length,
        tasksCompleted: completedTasks.length,
        habitsScheduled: requiredHabits.length,
        habitsCompleted: completedHabits.length,
        focusMinutes,
        focusGoalMinutes: settings.dailyFocusGoalMinutes,
        focusApplicable: isFocusApplicable({
          focusMinutes,
          plannedTasks,
          hasDurationHabit: habits.some((h) => h.active && h.measurementType === 'duration'),
        }),
      }),
    [
      plannedTasks,
      completedTasks.length,
      requiredHabits.length,
      completedHabits.length,
      focusMinutes,
      settings.dailyFocusGoalMinutes,
      habits,
    ],
  );

  // The stored aggregate lags a live tap by the debounce window, so today's
  // state is overlaid from the numbers on screen.
  const streak = useMemo(() => {
    const map = new Map(recentStats.map((s) => [s.date, { dayState: s.dayState }]));
    map.set(today, {
      dayState: !score.hasData
        ? 'no_data'
        : score.score >= settings.productivityThreshold
          ? 'successful'
          : 'incomplete',
    });
    return calculateStreak(map, today);
  }, [recentStats, today, score, settings.productivityThreshold]);

  const insight = useMemo(() => {
    if (recentStats.length === 0) return null;
    const weekDates = (() => {
      const start = startOfWeek(today, settings.weekStart);
      return lastNDays(7, endOfWeek(today, settings.weekStart)).filter((d) => d >= start);
    })();
    return pickInsight({
      today,
      weekStart: settings.weekStart,
      weekDates,
      lastWeekDates: weekDates.map((d) => addDays(d, -7)),
      stats: recentStats,
      habits,
      habitLogs: dayHabitLogs,
      activities: dayActivities,
      categories,
      weeklyActivityTarget: null,
    });
  }, [recentStats, today, settings.weekStart, habits, dayHabitLogs, dayActivities, categories]);

  const topPriorities = tasks
    .filter((t) => t.isTopPriority)
    .sort((a, b) => (a.topPriorityOrder ?? 0) - (b.topPriorityOrder ?? 0));

  const grouped = useMemo(() => {
    const map: Record<DayPart, Task[]> = { morning: [], afternoon: [], evening: [], anytime: [] };
    for (const task of tasks) map[dayPartForTime(task.startTime)].push(task);
    return map;
  }, [tasks]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await recomputeNow(today);
    setRefreshing(false);
  }, [recomputeNow, today]);

  // Offer to carry yesterday's unfinished work forward.
  const yesterday = addDays(today, -1);
  const yesterdayStats = recentStats.find((s) => s.date === yesterday);
  const unfinishedYesterday = yesterdayStats
    ? Math.max(0, yesterdayStats.tasksPlanned - yesterdayStats.tasksCompleted)
    : 0;

  useEffect(() => {
    if (!uid || !settings.autoCarryTasks || unfinishedYesterday === 0) return;
    carryForwardTasks(uid, yesterday, today)
      .then((count) => {
        if (count > 0) {
          toast.show(`${count} unfinished task${count === 1 ? '' : 's'} moved to today.`);
          recomputeNow(today);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, settings.autoCarryTasks, unfinishedYesterday, yesterday, today]);

  const habitForSheet = snapshots.find((s) => s.habit.id === habitSheet);

  const togglePin = async (task: Task) => {
    if (!uid) return;
    try {
      await setTopPriority(uid, task.id, !task.isTopPriority, topPriorities.length);
      toast.show(task.isTopPriority ? 'Unpinned.' : 'Pinned to top priorities.');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not pin that task.', 'error');
    }
  };

  return (
    <Screen>
      <OfflineBanner visible={offline} message={error ?? undefined} />

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.md,
          paddingHorizontal: GUTTER,
          paddingVertical: space.md,
        }}>
        <View
          accessible
          accessibilityLabel={`Signed in as ${profile?.name ?? 'you'}`}
          style={{
            width: 42,
            height: 42,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: withAlpha(accent.base, 0.16),
            borderWidth: StyleSheet.hairlineWidth * 2,
            borderColor: withAlpha(accent.base, 0.4),
          }}>
          <Eyebrow color={accent.base} style={{ fontSize: 13, letterSpacing: 0.5 }}>
            {initials(profile?.name)}
          </Eyebrow>
        </View>
        <View style={{ flex: 1 }}>
          <Caption tone="faint">{greetingForHour()}</Caption>
          <Display tone="strong" numberOfLines={1}>
            {firstName(profile?.name)}
          </Display>
        </View>
        <IconButton icon="search" label="Search" onPress={() => router.push('/search')} size={40} />
        <IconButton
          icon="bell"
          label="Reminders"
          onPress={() => router.push('/settings/notifications')}
          size={40}
        />
      </View>

      <ScreenScroll
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent.base} />
        }>
        <Caption tone="faint" style={{ paddingBottom: space.md }}>
          {formatLongDate(today)}
        </Caption>

        {loading && !hydrated ? (
          <View style={{ gap: space.md }}>
            <SkeletonCard lines={4} />
            <SkeletonCard lines={3} />
          </View>
        ) : (
          <>
            <DailyScoreCard
              score={score}
              tasksCompleted={completedTasks.length}
              tasksPlanned={plannedTasks.length}
              habitsCompleted={completedHabits.length}
              habitsScheduled={requiredHabits.length}
              focusMinutes={focusMinutes}
              streak={streak}
              threshold={settings.productivityThreshold}
            />

            {topPriorities.length > 0 ? (
              <View style={{ paddingTop: space.xl }}>
                <SectionHeader title="Top priorities" meta={`${topPriorities.length}/3`} />
                <View
                  style={{
                    borderWidth: StyleSheet.hairlineWidth * 2,
                    borderColor: c.line,
                    borderRadius: radius.card,
                    overflow: 'hidden',
                    backgroundColor: c.surface2,
                  }}>
                  {topPriorities.map((task, i) => (
                    <View key={task.id}>
                      {i > 0 ? (
                        <View style={{ height: StyleSheet.hairlineWidth * 2, backgroundColor: c.line }} />
                      ) : null}
                      <TaskCard
                        task={task}
                        index={i + 1}
                        category={categoryById.get(task.categoryId ?? '')}
                        use24Hour={settings.use24HourTime}
                        onToggle={() => toggleTaskComplete(task)}
                        onPress={() => router.push(`/task/${encodeURIComponent(task.id)}`)}
                        onLongPress={() => togglePin(task)}
                      />
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {snapshots.length > 0 ? (
              <View style={{ paddingTop: space.xl }}>
                <SectionHeader
                  title="Habits today"
                  meta={`${completedHabits.length}/${requiredHabits.length}`}
                  action={{ label: 'All', onPress: () => router.push('/(tabs)/track') }}
                />
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: space.sm, paddingRight: space.base }}>
                  {snapshots.map((snapshot) => (
                    <HabitChip
                      key={snapshot.habit.id}
                      habit={snapshot.habit}
                      completed={snapshot.completed}
                      required={snapshot.required}
                      skipped={snapshot.status === 'skipped'}
                      value={snapshot.value}
                      onPress={() => toggleHabit(snapshot.habit)}
                      onLongPress={() => setHabitSheet(snapshot.habit.id)}
                    />
                  ))}
                </ScrollView>
              </View>
            ) : null}

            <View style={{ paddingTop: space.xl }}>
              <SectionHeader
                title="Today's plan"
                meta={`${completedTasks.length}/${plannedTasks.length}`}
                action={{ label: 'Add', icon: 'plus', onPress: () => router.push('/task/new') }}
              />

              {tasks.length === 0 ? (
                <EmptyState
                  icon="sun"
                  title="Your day is clear"
                  message="Nothing is scheduled. Add the one thing that would make today count."
                  actionLabel="Add task"
                  onAction={() => router.push('/task/new')}
                  compact
                />
              ) : (
                <View
                  style={{
                    borderWidth: StyleSheet.hairlineWidth * 2,
                    borderColor: c.line,
                    borderRadius: radius.card,
                    overflow: 'hidden',
                    backgroundColor: c.surface2,
                  }}>
                  {DAY_PART_ORDER.map((part) => {
                    const items = grouped[part];
                    if (items.length === 0) return null;
                    return (
                      <View key={part}>
                        <View
                          style={{
                            paddingHorizontal: space.base,
                            paddingTop: space.md,
                            paddingBottom: space.xs,
                            backgroundColor: c.surface1,
                          }}>
                          <Eyebrow tone="faint">{DAY_PART_LABELS[part]}</Eyebrow>
                        </View>
                        {items.map((task, i) => (
                          <View key={task.id}>
                            {i > 0 ? (
                              <View
                                style={{
                                  height: StyleSheet.hairlineWidth * 2,
                                  backgroundColor: c.line,
                                  marginLeft: space.h1,
                                }}
                              />
                            ) : null}
                            <TaskCard
                              task={task}
                              category={categoryById.get(task.categoryId ?? '')}
                              use24Hour={settings.use24HourTime}
                              onToggle={() => toggleTaskComplete(task)}
                              onPress={() => router.push(`/task/${encodeURIComponent(task.id)}`)}
                              onLongPress={() => togglePin(task)}
                            />
                          </View>
                        ))}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>

            {unfinishedYesterday > 0 && !settings.autoCarryTasks ? (
              <View
                style={{
                  marginTop: space.base,
                  padding: space.base,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.md,
                  borderWidth: StyleSheet.hairlineWidth * 2,
                  borderColor: c.line,
                  borderRadius: radius.card,
                  backgroundColor: c.surface2,
                }}>
                <Icon name="corner-down-right" size={16} color={c.text40} />
                <Body tone="muted" style={{ flex: 1, fontSize: 13 }}>
                  {unfinishedYesterday} unfinished task
                  {unfinishedYesterday === 1 ? '' : 's'} from yesterday.
                </Body>
                <Button
                  label="Move"
                  size="sm"
                  variant="outline"
                  onPress={() => setCarryPrompt(true)}
                />
              </View>
            ) : null}

            {insight ? (
              <View
                style={{
                  marginTop: space.xl,
                  padding: space.base,
                  gap: space.sm,
                  borderLeftWidth: 2,
                  borderLeftColor: accent.base,
                  backgroundColor: c.surface1,
                }}>
                <Eyebrow color={accent.base}>Insight</Eyebrow>
                <Body>{insight.text}</Body>
              </View>
            ) : null}

            <View style={{ paddingTop: space.xl, gap: space.md }}>
              <SectionHeader title="Quick actions" />
              <ChipGroup>
                <Chip
                  label="Start focus"
                  icon="play"
                  onPress={() => router.push('/focus/setup')}
                />
                <Chip
                  label="Log activity"
                  icon="activity"
                  onPress={() => router.push('/activity/new')}
                />
                <Chip
                  label="Daily review"
                  icon="edit-3"
                  onPress={() => router.push(`/review/daily?date=${today}`)}
                />
                <Chip
                  label="Weekly review"
                  icon="bar-chart-2"
                  onPress={() => router.push('/review/weekly')}
                />
              </ChipGroup>
              {focusMinutes > 0 ? (
                <Caption tone="faint">
                  {formatDuration(focusMinutes)} focused across {daySessions.length} session
                  {daySessions.length === 1 ? '' : 's'} today.
                </Caption>
              ) : null}
            </View>
          </>
        )}
      </ScreenScroll>

      <BottomSheet
        visible={!!habitForSheet}
        onClose={() => setHabitSheet(null)}
        title={habitForSheet?.habit.name}
        eyebrow="Habit">
        <View style={{ gap: space.sm, paddingBottom: space.base }}>
          <Button
            label={habitForSheet?.completed ? 'Mark not done' : 'Mark done'}
            full
            onPress={() => {
              if (habitForSheet) toggleHabit(habitForSheet.habit);
              setHabitSheet(null);
            }}
          />
          <Button
            label="Rest day (does not count as a miss)"
            variant="outline"
            full
            onPress={() => {
              if (habitForSheet) skipHabit(habitForSheet.habit);
              setHabitSheet(null);
            }}
          />
          <Button
            label="Open habit"
            variant="ghost"
            full
            onPress={() => {
              const id = habitForSheet?.habit.id;
              setHabitSheet(null);
              if (id) router.push(`/habit/${id}`);
            }}
          />
        </View>
      </BottomSheet>

      <BottomSheet
        visible={carryPrompt}
        onClose={() => setCarryPrompt(false)}
        title="Move unfinished work"
        eyebrow="Yesterday">
        <View style={{ gap: space.sm, paddingBottom: space.base }}>
          <Body tone="muted">
            {unfinishedYesterday} task{unfinishedYesterday === 1 ? '' : 's'} were left open
            yesterday.
          </Body>
          <Button
            label="Move to today"
            full
            onPress={async () => {
              if (!uid) return;
              const count = await carryForwardTasks(uid, yesterday, today).catch(() => 0);
              setCarryPrompt(false);
              toast.show(count > 0 ? `${count} moved to today.` : 'Nothing to move.');
              recomputeNow(today);
              recomputeNow(yesterday);
            }}
          />
          <Button
            label="Move to backlog"
            variant="outline"
            full
            onPress={async () => {
              if (!uid) return;
              const { fetchTasksInRange, rescheduleTask } = await import('@/services/taskService');
              const pending = (await fetchTasksInRange(uid, yesterday, yesterday)).filter(
                (t) => t.status !== 'completed' && t.status !== 'skipped',
              );
              await Promise.all(pending.map((t) => rescheduleTask(uid, t.id, null)));
              setCarryPrompt(false);
              toast.show(`${pending.length} moved to backlog.`);
              recomputeNow(yesterday);
            }}
          />
          <Button
            label="Review yesterday first"
            variant="ghost"
            full
            onPress={() => {
              setCarryPrompt(false);
              router.push(`/history/${yesterday}`);
            }}
          />
        </View>
      </BottomSheet>
    </Screen>
  );
}

function initials(name?: string | null): string {
  if (!name) return 'C';
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '');
}

function firstName(name?: string | null): string {
  if (!name) return 'there';
  return name.trim().split(/\s+/)[0];
}
