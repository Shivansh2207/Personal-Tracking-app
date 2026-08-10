import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, IconButton } from '@/components/ui/Button';
import { Calendar, DayDecoration, IntensityLegend } from '@/components/ui/Calendar';
import { Chip, ChipGroup, SegmentedControl } from '@/components/ui/Controls';
import { useToast } from '@/components/ui/Feedback';
import { Icon, resolveIcon } from '@/components/ui/Icon';
import { GUTTER, Screen, ScreenScroll, SectionHeader } from '@/components/ui/Layout';
import { EmptyState, SkeletonCard } from '@/components/ui/States';
import { Body, Caption, Display, Eyebrow, MetricSmall, Title } from '@/components/ui/Text';
import { describeSchedule, isScheduledOn } from '@/services/recurrence';
import { sortTasks } from '@/services/analytics/tasks';
import { fetchDailySummaries } from '@/services/summaryService';
import { fetchTasksInRange, rescheduleTask } from '@/services/taskService';
import { targetLabel } from '@/services/analytics/routines';
import { useAuthStore, useSettings } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { useTheme } from '@/theme/ThemeProvider';
import type { DailySummary, DateKey, Task } from '@/types/models';
import {
  addDays,
  endOfMonth,
  formatRelativeDate,
  formatTime,
  startOfMonth,
  todayKey,
} from '@/utils/date';

type Segment = 'calendar' | 'tasks' | 'routines' | 'recurring' | 'backlog';

export default function Plan() {
  const { c, space, accent, radius } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const settings = useSettings();
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const { routines, backlog, recurringTemplates, categories, setActiveDate } = useDataStore();

  const [segment, setSegment] = useState<Segment>('calendar');
  const [taskView, setTaskView] = useState<'today' | 'upcoming' | 'overdue' | 'completed'>('today');
  const [month, setMonth] = useState<DateKey>(startOfMonth(todayKey()));
  const [summaries, setSummaries] = useState<DailySummary[]>([]);
  const [rangeTasks, setRangeTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);

  const today = todayKey();
  const categoryById = useMemo(() => new Map(categories.map((c2) => [c2.id, c2])), [categories]);

  const load = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const from = addDays(startOfMonth(month), -7);
      const to = addDays(endOfMonth(month), 7);
      const [summaryList, taskList] = await Promise.all([
        fetchDailySummaries(uid, from, to),
        fetchTasksInRange(uid, addDays(today, -60), addDays(today, 60)),
      ]);
      setSummaries(summaryList);
      setRangeTasks(taskList.filter((t) => !t.isRecurringTemplate));
    } catch {
      toast.show('Could not load your plan.', 'error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, month, today]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const decorations = useMemo(() => {
    const map: Record<DateKey, DayDecoration> = {};
    for (const summary of summaries) {
      map[summary.dateKey] = {
        intensity: summary.overallConsistency,
        restDay: summary.isRestDay,
      };
    }
    for (const task of rangeTasks) {
      if (!task.dateKey) continue;
      const existing = map[task.dateKey];
      if (!existing || existing.intensity === null || existing.intensity === undefined) {
        map[task.dateKey] = { ...(existing ?? {}), planned: true };
      }
    }
    for (const template of recurringTemplates) {
      if (!template.recurrence) continue;
      let cursor = startOfMonth(month);
      const end = endOfMonth(month);
      let guard = 0;
      while (cursor <= end && guard < 40) {
        guard += 1;
        if (isScheduledOn(template.recurrence, cursor) && !map[cursor]?.intensity) {
          map[cursor] = { ...(map[cursor] ?? {}), planned: true };
        }
        cursor = addDays(cursor, 1);
      }
    }
    return map;
  }, [summaries, rangeTasks, recurringTemplates, month]);

  const taskBuckets = useMemo(() => {
    const pending = rangeTasks.filter((t) => t.status === 'pending');
    return {
      today: sortTasks(rangeTasks.filter((t) => t.dateKey === today)),
      upcoming: sortTasks(pending.filter((t) => t.dateKey && t.dateKey > today)),
      overdue: sortTasks(pending.filter((t) => t.dateKey && t.dateKey < today)),
      completed: sortTasks(rangeTasks.filter((t) => t.status === 'completed')).reverse(),
    };
  }, [rangeTasks, today]);

  const visibleTasks = taskBuckets[taskView];

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
          <Eyebrow tone="faint">Plan</Eyebrow>
          <Display tone="strong">{TITLES[segment]}</Display>
        </View>
        <IconButton
          icon="plus"
          label={segment === 'routines' ? 'Add routine' : 'Add task'}
          onPress={() => router.push(segment === 'routines' ? '/routine/new' : '/task/new')}
        />
      </View>

      <View style={{ paddingHorizontal: GUTTER, paddingBottom: space.md }}>
        <SegmentedControl
          scrollable
          options={[
            { value: 'calendar', label: 'Calendar' },
            { value: 'tasks', label: 'Tasks' },
            { value: 'routines', label: 'Routines' },
            { value: 'recurring', label: 'Recurring' },
            { value: 'backlog', label: 'Backlog' },
          ]}
          value={segment}
          onChange={(v) => setSegment(v as Segment)}
        />
      </View>

      <ScreenScroll>
        {segment === 'calendar' ? (
          loading && summaries.length === 0 ? (
            <SkeletonCard lines={5} />
          ) : (
            <View style={{ gap: space.lg }}>
              <View
                style={{
                  padding: space.base,
                  backgroundColor: c.surface2,
                  borderRadius: radius.card,
                  borderWidth: StyleSheet.hairlineWidth * 2,
                  borderColor: c.line,
                }}>
                <Calendar
                  month={month}
                  onMonthChange={setMonth}
                  selected={today}
                  decorations={decorations}
                  weekStart={settings.weekStart}
                  onSelectDate={(date) => {
                    if (date <= today) router.push(`/history/${date}`);
                    else {
                      setActiveDate(date);
                      router.push(`/task/new?date=${date}`);
                    }
                  }}
                />
                <View style={{ paddingTop: space.md, alignItems: 'center' }}>
                  <IntensityLegend />
                </View>
              </View>
              <Caption tone="faint" align="center">
                Tap a past day to see what happened, or a future day to plan it.
              </Caption>
            </View>
          )
        ) : null}

        {segment === 'tasks' ? (
          <View style={{ gap: space.md }}>
            <SegmentedControl
              scrollable
              options={[
                { value: 'today', label: `Today (${taskBuckets.today.length})` },
                { value: 'upcoming', label: `Upcoming (${taskBuckets.upcoming.length})` },
                { value: 'overdue', label: `Overdue (${taskBuckets.overdue.length})` },
                { value: 'completed', label: 'Completed' },
              ]}
              value={taskView}
              onChange={(v) => setTaskView(v as typeof taskView)}
            />

            {visibleTasks.length === 0 ? (
              <EmptyState
                icon="check-square"
                title={
                  taskView === 'overdue'
                    ? 'Nothing overdue'
                    : taskView === 'completed'
                      ? 'Nothing completed yet'
                      : 'Nothing scheduled'
                }
                message={
                  taskView === 'overdue'
                    ? 'You are on top of everything with a date.'
                    : 'Nothing scheduled. Enjoy the space or add something.'
                }
                actionLabel={taskView === 'completed' ? undefined : 'Add task'}
                onAction={taskView === 'completed' ? undefined : () => router.push('/task/new')}
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
                {visibleTasks.map((task, index) => (
                  <View key={task.id}>
                    {index > 0 ? (
                      <View
                        style={{ height: StyleSheet.hairlineWidth * 2, backgroundColor: c.line }}
                      />
                    ) : null}
                    <PlanTaskRow
                      task={task}
                      categoryName={categoryById.get(task.categoryId ?? '')?.name ?? null}
                      use24Hour={settings.use24HourTime}
                      showDate={taskView !== 'today'}
                      onPress={() => router.push(`/task/${encodeURIComponent(task.id)}`)}
                    />
                  </View>
                ))}
              </View>
            )}

            {taskView === 'overdue' && visibleTasks.length > 0 ? (
              <Button
                label="Move all to today"
                icon="corner-down-right"
                variant="outline"
                full
                onPress={async () => {
                  if (!uid) return;
                  await Promise.all(visibleTasks.map((t) => rescheduleTask(uid, t.id, today)));
                  toast.show(`${visibleTasks.length} moved to today.`);
                  load();
                }}
              />
            ) : null}
          </View>
        ) : null}

        {segment === 'routines' ? (
          routines.length === 0 ? (
            <EmptyState
              icon="repeat"
              title="No routines yet"
              message="Routines are the part of your day that repeats. Add the ones you actually intend to keep."
              actionLabel="Create routine"
              onAction={() => router.push('/routine/new')}
            />
          ) : (
            <View style={{ gap: space.sm }}>
              {routines.map((routine) => (
                <Pressable
                  key={routine.id}
                  accessibilityRole="button"
                  accessibilityLabel={routine.name}
                  onPress={() => router.push(`/routine/${routine.id}`)}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.md,
                    padding: space.md,
                    backgroundColor: pressed ? c.surface3 : c.surface2,
                    borderRadius: radius.card,
                    borderWidth: StyleSheet.hairlineWidth * 2,
                    borderColor: c.line,
                    opacity: routine.active ? 1 : 0.5,
                  })}>
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: c.inset,
                    }}>
                    <Icon name={resolveIcon(routine.icon)} size={15} color={c.text50} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Body numberOfLines={1}>{routine.name}</Body>
                    <Caption tone="faint">
                      {targetLabel(routine)} · {describeSchedule(routine.schedule)}
                    </Caption>
                  </View>
                  <Icon name="chevron-right" size={15} color={c.text30} />
                </Pressable>
              ))}
            </View>
          )
        ) : null}

        {segment === 'recurring' ? (
          recurringTemplates.length === 0 ? (
            <EmptyState
              icon="rotate-cw"
              title="No recurring tasks"
              message="Repeating responsibilities — a weekly portfolio review, a monthly backup — live here."
              actionLabel="Add recurring task"
              onAction={() => router.push('/task/new?recurring=1')}
            />
          ) : (
            <View style={{ gap: space.sm }}>
              {recurringTemplates.map((template) => (
                <Pressable
                  key={template.id}
                  accessibilityRole="button"
                  accessibilityLabel={template.title}
                  onPress={() => router.push(`/task/${encodeURIComponent(template.id)}`)}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.md,
                    padding: space.md,
                    backgroundColor: pressed ? c.surface3 : c.surface2,
                    borderRadius: radius.card,
                    borderWidth: StyleSheet.hairlineWidth * 2,
                    borderColor: c.line,
                  })}>
                  <Icon name="rotate-cw" size={15} color={accent.base} />
                  <View style={{ flex: 1 }}>
                    <Body numberOfLines={1}>{template.title}</Body>
                    <Caption tone="faint">{describeSchedule(template.recurrence)}</Caption>
                  </View>
                  <Icon name="chevron-right" size={15} color={c.text30} />
                </Pressable>
              ))}
              <Caption tone="faint">
                Occurrences are generated as needed. Completing one day never completes the rest.
              </Caption>
            </View>
          )
        ) : null}

        {segment === 'backlog' ? (
          backlog.length === 0 ? (
            <EmptyState
              icon="inbox"
              title="Backlog is empty"
              message="Park ideas here without committing to a date — learn Docker, redesign the portfolio, research programmes."
              actionLabel="Add to backlog"
              onAction={() => router.push('/task/new?backlog=1')}
            />
          ) : (
            <View style={{ gap: space.md }}>
              <Body tone="muted" style={{ fontSize: 13 }}>
                {backlog.length} item{backlog.length === 1 ? '' : 's'} waiting for a date.
              </Body>
              <View
                style={{
                  borderWidth: StyleSheet.hairlineWidth * 2,
                  borderColor: c.line,
                  borderRadius: radius.card,
                  overflow: 'hidden',
                  backgroundColor: c.surface2,
                }}>
                {sortTasks(backlog).map((task, index) => (
                  <View key={task.id}>
                    {index > 0 ? (
                      <View
                        style={{ height: StyleSheet.hairlineWidth * 2, backgroundColor: c.line }}
                      />
                    ) : null}
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: space.md,
                        padding: space.md,
                      }}>
                      <Icon name="inbox" size={14} color={c.text40} />
                      <Body style={{ flex: 1 }} numberOfLines={1}>
                        {task.title}
                      </Body>
                      <ChipGroup>
                        <Chip
                          label="Today"
                          size="sm"
                          onPress={async () => {
                            if (!uid) return;
                            await rescheduleTask(uid, task.id, today);
                            toast.show('Scheduled for today.');
                            load();
                          }}
                        />
                        <Chip
                          label="Open"
                          size="sm"
                          onPress={() => router.push(`/task/${encodeURIComponent(task.id)}`)}
                        />
                      </ChipGroup>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )
        ) : null}
      </ScreenScroll>
    </Screen>
  );
}

const TITLES: Record<Segment, string> = {
  calendar: 'Calendar',
  tasks: 'Tasks',
  routines: 'Routines',
  recurring: 'Recurring',
  backlog: 'Backlog',
};

function PlanTaskRow({
  task,
  categoryName,
  use24Hour,
  showDate,
  onPress,
}: {
  task: Task;
  categoryName: string | null;
  use24Hour: boolean;
  showDate: boolean;
  onPress: () => void;
}) {
  const { c, space, semantic } = useTheme();
  const done = task.status === 'completed';
  const meta = [
    showDate && task.dateKey ? formatRelativeDate(task.dateKey) : null,
    task.startTime ? formatTime(task.startTime, use24Hour) : null,
    categoryName,
  ]
    .filter(Boolean)
    .join('  ·  ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={task.title}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        padding: space.md,
        backgroundColor: pressed ? c.surface3 : 'transparent',
      })}>
      <Icon
        name={done ? 'check-circle' : task.status === 'skipped' ? 'slash' : 'circle'}
        size={15}
        color={done ? semantic.success : c.text30}
      />
      <View style={{ flex: 1 }}>
        <Body tone={done ? 'faint' : 'default'} numberOfLines={1}>
          {task.title}
        </Body>
        {meta ? <Caption tone="faint">{meta}</Caption> : null}
      </View>
      {task.deadline && !done ? (
        <MetricSmall color={task.deadline < todayKey() ? semantic.danger : undefined} tone="meta">
          {formatRelativeDate(task.deadline)}
        </MetricSmall>
      ) : null}
    </Pressable>
  );
}
