import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { TaskCard } from '@/components/tasks/TaskCard';
import { Button, IconButton } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/Controls';
import { useToast } from '@/components/ui/Feedback';
import { Calendar, DayDecoration, IntensityLegend } from '@/components/ui/Calendar';
import { GUTTER, Screen, ScreenScroll, SectionHeader } from '@/components/ui/Layout';
import { EmptyState, SkeletonCard } from '@/components/ui/States';
import { Body, Caption, Display, Eyebrow, MetricSmall } from '@/components/ui/Text';
import { expandTasksForDate } from '@/services/analytics/recurrence';
import { fetchStatsInRange } from '@/services/statsService';
import { fetchTasksInRange, sortTasks } from '@/services/taskService';
import { useAuthStore, useSettings } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { useTheme } from '@/theme/ThemeProvider';
import type { DailyStats, DateKey, Task } from '@/types/models';
import {
  addDays,
  endOfMonth,
  formatLongDate,
  formatRelativeDate,
  startOfMonth,
  todayKey,
} from '@/utils/date';

type Segment = 'today' | 'calendar' | 'upcoming' | 'backlog';

export default function Plan() {
  const { c, space, radius } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const settings = useSettings();
  const uid = useAuthStore((s) => s.user?.uid ?? null);

  const {
    categories,
    backlog,
    recurringTemplates,
    activeDate,
    setActiveDate,
    toggleTaskComplete,
    visibleTasks,
    loading,
    hydrated,
  } = useDataStore();

  const [segment, setSegment] = useState<Segment>('today');
  const [month, setMonth] = useState<DateKey>(startOfMonth(todayKey()));
  const [monthStats, setMonthStats] = useState<DailyStats[]>([]);
  const [monthTasks, setMonthTasks] = useState<Task[]>([]);
  const [upcoming, setUpcoming] = useState<Task[]>([]);
  const [rangeLoading, setRangeLoading] = useState(false);

  const categoryById = useMemo(() => new Map(categories.map((cat) => [cat.id, cat])), [categories]);
  const today = todayKey();

  const loadMonth = useCallback(async () => {
    if (!uid) return;
    setRangeLoading(true);
    try {
      const from = addDays(startOfMonth(month), -7);
      const to = addDays(endOfMonth(month), 7);
      const [stats, tasks] = await Promise.all([
        fetchStatsInRange(uid, from, to),
        fetchTasksInRange(uid, from, to),
      ]);
      setMonthStats(stats);
      setMonthTasks(tasks);
    } catch {
      toast.show('Could not load the calendar.', 'error');
    } finally {
      setRangeLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, month]);

  const loadUpcoming = useCallback(async () => {
    if (!uid) return;
    setRangeLoading(true);
    try {
      const tasks = await fetchTasksInRange(uid, addDays(today, 1), addDays(today, 30));
      setUpcoming(sortTasks(tasks.filter((t) => !t.isRecurringTemplate)));
    } catch {
      toast.show('Could not load upcoming work.', 'error');
    } finally {
      setRangeLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, today]);

  useEffect(() => {
    if (segment === 'calendar') loadMonth();
    if (segment === 'upcoming') loadUpcoming();
  }, [segment, loadMonth, loadUpcoming]);

  useFocusEffect(
    useCallback(() => {
      if (segment === 'calendar') loadMonth();
      if (segment === 'upcoming') loadUpcoming();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [segment]),
  );

  const decorations = useMemo(() => {
    const map: Record<DateKey, DayDecoration> = {};
    for (const stat of monthStats) {
      map[stat.date] = {
        intensity: stat.dayState === 'no_data' ? null : stat.productivityScore,
        restDay: stat.dayState === 'rest',
      };
    }
    for (const task of monthTasks) {
      if (!task.scheduledDate) continue;
      const existing = map[task.scheduledDate];
      if (!existing || existing.intensity === null || existing.intensity === undefined) {
        map[task.scheduledDate] = { ...(existing ?? {}), planned: true };
      }
    }
    // Recurring occurrences also mark days as planned.
    for (const template of recurringTemplates) {
      if (!template.recurrenceRule) continue;
      let cursor = startOfMonth(month);
      const end = endOfMonth(month);
      let guard = 0;
      while (cursor <= end && guard < 40) {
        guard += 1;
        const occurrences = expandTasksForDate([], [template], cursor);
        if (occurrences.length > 0 && !map[cursor]?.intensity) {
          map[cursor] = { ...(map[cursor] ?? {}), planned: true };
        }
        cursor = addDays(cursor, 1);
      }
    }
    return map;
  }, [monthStats, monthTasks, recurringTemplates, month]);

  const todayTasks = visibleTasks();
  const upcomingByDate = useMemo(() => {
    const groups = new Map<DateKey, Task[]>();
    for (const task of upcoming) {
      if (!task.scheduledDate) continue;
      const list = groups.get(task.scheduledDate) ?? [];
      list.push(task);
      groups.set(task.scheduledDate, list);
    }
    return [...groups.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }, [upcoming]);

  const backlogSorted = useMemo(() => sortTasks(backlog), [backlog]);

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
          <Display tone="strong">
            {segment === 'today'
              ? activeDate === today
                ? 'Today'
                : formatRelativeDate(activeDate)
              : segment === 'calendar'
                ? 'Calendar'
                : segment === 'upcoming'
                  ? 'Upcoming'
                  : 'Backlog'}
          </Display>
        </View>
        <IconButton icon="plus" label="Add task" onPress={() => router.push('/task/new')} />
      </View>

      <View style={{ paddingHorizontal: GUTTER, paddingBottom: space.md }}>
        <SegmentedControl
          options={[
            { value: 'today', label: 'Today' },
            { value: 'calendar', label: 'Calendar' },
            { value: 'upcoming', label: 'Upcoming' },
            { value: 'backlog', label: 'Backlog' },
          ]}
          value={segment}
          onChange={(v) => setSegment(v as Segment)}
        />
      </View>

      <ScreenScroll>
        {segment === 'today' ? (
          <>
            {activeDate !== today ? (
              <View style={{ paddingBottom: space.md }}>
                <Button
                  label={`Back to today`}
                  variant="outline"
                  size="sm"
                  icon="corner-up-left"
                  onPress={() => setActiveDate(today)}
                />
              </View>
            ) : null}
            <Caption tone="faint" style={{ paddingBottom: space.md }}>
              {formatLongDate(activeDate)}
            </Caption>
            {loading && !hydrated ? (
              <SkeletonCard lines={4} />
            ) : todayTasks.length === 0 ? (
              <EmptyState
                icon="sun"
                title="Nothing planned"
                message="Add the work that matters for this day."
                actionLabel="Add task"
                onAction={() => router.push(`/task/new?date=${activeDate}`)}
              />
            ) : (
              <TaskList
                tasks={todayTasks}
                onToggle={toggleTaskComplete}
                onOpen={(task) => router.push(`/task/${encodeURIComponent(task.id)}`)}
                categoryById={categoryById}
                use24Hour={settings.use24HourTime}
              />
            )}
          </>
        ) : null}

        {segment === 'calendar' ? (
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
                selected={activeDate}
                decorations={decorations}
                weekStart={settings.weekStart}
                onSelectDate={(date) => {
                  if (date <= today) {
                    router.push(`/history/${date}`);
                  } else {
                    setActiveDate(date);
                    setSegment('today');
                  }
                }}
              />
              <View style={{ paddingTop: space.md, alignItems: 'center' }}>
                <IntensityLegend />
              </View>
            </View>

            <View
              style={{
                flexDirection: 'row',
                gap: StyleSheet.hairlineWidth * 2,
                backgroundColor: c.line,
                borderRadius: radius.card,
                overflow: 'hidden',
              }}>
              {[
                {
                  label: 'Scored days',
                  value: String(monthStats.filter((s) => s.dayState !== 'no_data').length),
                },
                {
                  label: 'Avg score',
                  value: (() => {
                    const scored = monthStats.filter(
                      (s) => s.dayState === 'successful' || s.dayState === 'incomplete',
                    );
                    return scored.length
                      ? `${Math.round(scored.reduce((a, s) => a + s.productivityScore, 0) / scored.length)}%`
                      : '—';
                  })(),
                },
                {
                  label: 'Successful',
                  value: String(monthStats.filter((s) => s.dayState === 'successful').length),
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

            <Caption tone="faint" align="center">
              Tap a past day to open its history, or a future day to plan it.
            </Caption>
          </View>
        ) : null}

        {segment === 'upcoming' ? (
          rangeLoading && upcoming.length === 0 ? (
            <SkeletonCard lines={4} />
          ) : upcomingByDate.length === 0 ? (
            <EmptyState
              icon="calendar"
              title="Nothing scheduled ahead"
              message="The next 30 days are clear. Plan something, or keep the space."
              actionLabel="Add task"
              onAction={() => router.push(`/task/new?date=${addDays(today, 1)}`)}
            />
          ) : (
            <View style={{ gap: space.lg }}>
              {upcomingByDate.map(([date, tasks]) => (
                <View key={date}>
                  <SectionHeader title={formatRelativeDate(date)} meta={`${tasks.length}`} />
                  <TaskList
                    tasks={tasks}
                    onToggle={toggleTaskComplete}
                    onOpen={(task) => router.push(`/task/${encodeURIComponent(task.id)}`)}
                    categoryById={categoryById}
                    use24Hour={settings.use24HourTime}
                  />
                </View>
              ))}
            </View>
          )
        ) : null}

        {segment === 'backlog' ? (
          backlogSorted.length === 0 ? (
            <EmptyState
              icon="inbox"
              title="Backlog is empty"
              message="Park ideas here without committing to a date — learn Docker, update the portfolio, research companies."
              actionLabel="Add to backlog"
              onAction={() => router.push('/task/new')}
            />
          ) : (
            <View style={{ gap: space.md }}>
              <Body tone="muted" style={{ fontSize: 13 }}>
                {backlogSorted.length} idea{backlogSorted.length === 1 ? '' : 's'} waiting for a
                date. Open one to schedule it.
              </Body>
              <TaskList
                tasks={backlogSorted}
                onToggle={toggleTaskComplete}
                onOpen={(task) => router.push(`/task/${encodeURIComponent(task.id)}`)}
                categoryById={categoryById}
                use24Hour={settings.use24HourTime}
              />
            </View>
          )
        ) : null}
      </ScreenScroll>
    </Screen>
  );
}

function TaskList({
  tasks,
  onToggle,
  onOpen,
  categoryById,
  use24Hour,
  showDates,
}: {
  tasks: Task[];
  onToggle: (task: Task) => void;
  onOpen: (task: Task) => void;
  categoryById: Map<string, any>;
  use24Hour?: boolean;
  showDates?: boolean;
}) {
  const { c, radius } = useTheme();
  return (
    <View
      style={{
        borderWidth: StyleSheet.hairlineWidth * 2,
        borderColor: c.line,
        borderRadius: radius.card,
        overflow: 'hidden',
        backgroundColor: c.surface2,
      }}>
      {tasks.map((task, i) => (
        <View key={task.id}>
          {i > 0 ? (
            <View style={{ height: StyleSheet.hairlineWidth * 2, backgroundColor: c.line, marginLeft: 40 }} />
          ) : null}
          <TaskCard
            task={task}
            category={categoryById.get(task.categoryId ?? '')}
            use24Hour={use24Hour}
            showDate={showDates && task.scheduledDate ? formatRelativeDate(task.scheduledDate) : null}
            onToggle={() => onToggle(task)}
            onPress={() => onOpen(task)}
          />
        </View>
      ))}
    </View>
  );
}
