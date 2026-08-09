import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { TaskRow } from '@/components/tasks/TaskCard';
import { Button, IconButton } from '@/components/ui/Button';
import { Icon, resolveIcon } from '@/components/ui/Icon';
import { AppHeader, Screen, ScreenScroll, SectionHeader } from '@/components/ui/Layout';
import { MetricCard, MetricGrid } from '@/components/ui/MetricCard';
import { ProgressRing } from '@/components/ui/Progress';
import { EmptyState, SkeletonCard } from '@/components/ui/States';
import { Body, Caption, Eyebrow, Metric, Title } from '@/components/ui/Text';
import { isLogComplete } from '@/services/analytics/habits';
import { fetchDailyReview, fetchReflections } from '@/services/reviewService';
import { fetchStatsForDate, loadDayRecords } from '@/services/statsService';
import { useAuthStore } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { useTheme } from '@/theme/ThemeProvider';
import type { ActivityLog, DailyReview, DailyStats, Reflection } from '@/types/models';
import { addDays, formatDuration, formatLongDate, isValidDateKey, todayKey } from '@/utils/date';

/** History view — the app doubles as a life log, not just a planner. */
export default function DayHistory() {
  const { c, space, accent, radius } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ date: string }>();
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const categories = useDataStore((s) => s.categories);

  const date = isValidDateKey(params.date) ? params.date : todayKey();
  const today = todayKey();

  const [stats, setStats] = useState<DailyStats | null>(null);
  const [review, setReview] = useState<DailyReview | null>(null);
  const [records, setRecords] = useState<Awaited<ReturnType<typeof loadDayRecords>> | null>(null);
  const [reflections, setReflections] = useState<Reflection[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const [s, r, rec, notes] = await Promise.all([
        fetchStatsForDate(uid, date),
        fetchDailyReview(uid, date),
        loadDayRecords(uid, date),
        fetchReflections(uid, date, date),
      ]);
      setStats(s);
      setReview(r);
      setRecords(rec);
      setReflections(notes);
    } finally {
      setLoading(false);
    }
  }, [uid, date]);

  useEffect(() => {
    load();
  }, [load]);

  const categoryById = useMemo(
    () => new Map(categories.map((cat) => [cat.id, cat])),
    [categories],
  );

  const tasks = records?.tasks.filter((t) => !t.isRecurringTemplate) ?? [];
  const completedHabits =
    records?.habits.filter((habit) => {
      const log = records.habitLogs.find((l) => l.habitId === habit.id);
      return isLogComplete(log, habit);
    }) ?? [];
  const skippedHabits =
    records?.habits.filter((habit) =>
      records.habitLogs.some((l) => l.habitId === habit.id && l.status === 'skipped'),
    ) ?? [];

  const hasAnything =
    tasks.length > 0 ||
    (records?.habitLogs.length ?? 0) > 0 ||
    (records?.sessions.length ?? 0) > 0 ||
    (records?.activities.length ?? 0) > 0 ||
    !!review;

  return (
    <Screen>
      <AppHeader
        showBack
        eyebrow="History"
        title={formatLongDate(date)}
        right={
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <IconButton
              icon="chevron-left"
              label="Previous day"
              size={38}
              onPress={() => router.replace(`/history/${addDays(date, -1)}`)}
            />
            <IconButton
              icon="chevron-right"
              label="Next day"
              size={38}
              disabled={date >= today}
              onPress={() => router.replace(`/history/${addDays(date, 1)}`)}
            />
          </View>
        }
      />

      <ScreenScroll>
        {loading ? (
          <View style={{ gap: space.md, paddingTop: space.sm }}>
            <SkeletonCard lines={3} />
            <SkeletonCard lines={4} />
          </View>
        ) : !hasAnything ? (
          <EmptyState
            icon="moon"
            title="Nothing recorded"
            message="No tasks, habits, sessions or reflections were logged on this day."
            actionLabel={date >= today ? 'Plan this day' : undefined}
            onAction={date >= today ? () => router.push(`/task/new?date=${date}`) : undefined}
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
              <ProgressRing value={stats?.productivityScore ?? 0} size={86} thickness={6}>
                <Metric tone="strong">{stats?.productivityScore ?? 0}</Metric>
              </ProgressRing>
              <View style={{ flex: 1, gap: 3 }}>
                <Eyebrow tone="faint">Score</Eyebrow>
                <Title tone="strong" style={{ textTransform: 'capitalize' }}>
                  {(stats?.dayState ?? 'no_data').replace('_', ' ')}
                </Title>
                <Caption tone="faint">
                  {formatDuration(stats?.focusMinutes ?? 0, '0m')} focus ·{' '}
                  {stats?.activityCount ?? 0} activity
                </Caption>
              </View>
            </View>

            <MetricGrid columns={2}>
              <MetricCard
                label="Tasks"
                value={`${stats?.tasksCompleted ?? 0}/${stats?.tasksPlanned ?? 0}`}
                icon="check-square"
              />
              <MetricCard
                label="Habits"
                value={`${stats?.habitsCompleted ?? 0}/${stats?.habitsScheduled ?? 0}`}
                icon="repeat"
              />
            </MetricGrid>

            {tasks.length > 0 ? (
              <View>
                <SectionHeader title="Tasks" meta={`${tasks.length}`} />
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
                        <View
                          style={{ height: StyleSheet.hairlineWidth * 2, backgroundColor: c.line }}
                        />
                      ) : null}
                      <TaskRow
                        task={task}
                        category={categoryById.get(task.categoryId ?? '')}
                        onPress={() => router.push(`/task/${encodeURIComponent(task.id)}`)}
                      />
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {(completedHabits.length > 0 || skippedHabits.length > 0) ? (
              <View>
                <SectionHeader title="Habits" meta={`${completedHabits.length} done`} />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                  {completedHabits.map((habit) => (
                    <View
                      key={habit.id}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        paddingVertical: 7,
                        paddingHorizontal: 11,
                        borderWidth: StyleSheet.hairlineWidth * 2,
                        borderColor: c.line,
                      }}>
                      <Icon name="check" size={12} color={accent.base} />
                      <Caption>{habit.name}</Caption>
                    </View>
                  ))}
                  {skippedHabits.map((habit) => (
                    <View
                      key={habit.id}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        paddingVertical: 7,
                        paddingHorizontal: 11,
                        borderWidth: StyleSheet.hairlineWidth * 2,
                        borderColor: c.line,
                        opacity: 0.6,
                      }}>
                      <Icon name="moon" size={12} color={c.text40} />
                      <Caption tone="faint">{habit.name}</Caption>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {records && records.sessions.length > 0 ? (
              <View>
                <SectionHeader
                  title="Focus sessions"
                  meta={formatDuration(stats?.focusMinutes ?? 0)}
                />
                <View style={{ gap: space.sm }}>
                  {records.sessions.map((session) => (
                    <View
                      key={session.id}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: space.md,
                        padding: space.md,
                        borderWidth: StyleSheet.hairlineWidth * 2,
                        borderColor: c.line,
                        borderRadius: radius.card,
                      }}>
                      <Icon name="clock" size={14} color={c.text40} />
                      <View style={{ flex: 1 }}>
                        <Body numberOfLines={1}>{session.label ?? 'Focus session'}</Body>
                        {session.notes ? (
                          <Caption tone="faint" numberOfLines={2}>
                            {session.notes}
                          </Caption>
                        ) : null}
                      </View>
                      <Caption tone="meta">{formatDuration(session.durationMinutes)}</Caption>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {records && records.activities.length > 0 ? (
              <View>
                <SectionHeader title="Activity" />
                <View style={{ gap: space.sm }}>
                  {records.activities.map((activity: ActivityLog) => (
                    <View
                      key={activity.id}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: space.md,
                        padding: space.md,
                        borderWidth: StyleSheet.hairlineWidth * 2,
                        borderColor: c.line,
                        borderRadius: radius.card,
                      }}>
                      <Icon name={resolveIcon(activity.type)} size={14} color={accent.base} />
                      <Body style={{ flex: 1 }}>
                        {activity.label ||
                          activity.type.charAt(0).toUpperCase() + activity.type.slice(1)}
                      </Body>
                      {activity.durationMinutes ? (
                        <Caption tone="meta">{formatDuration(activity.durationMinutes)}</Caption>
                      ) : null}
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {reflections.length > 0 ? (
              <View>
                <SectionHeader title="Notes" />
                <View style={{ gap: space.sm }}>
                  {reflections.map((note) => (
                    <View
                      key={note.id}
                      style={{
                        padding: space.md,
                        borderLeftWidth: 2,
                        borderLeftColor: accent.base,
                        backgroundColor: c.surface1,
                      }}>
                      <Body>{note.text}</Body>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {review ? (
              <View>
                <SectionHeader title="Daily review" />
                <View
                  style={{
                    padding: space.base,
                    gap: space.md,
                    borderWidth: StyleSheet.hairlineWidth * 2,
                    borderColor: c.line,
                    borderRadius: radius.card,
                    backgroundColor: c.surface2,
                  }}>
                  {review.biggestWin ? (
                    <View>
                      <Eyebrow tone="faint">Biggest win</Eyebrow>
                      <Body>{review.biggestWin}</Body>
                    </View>
                  ) : null}
                  {review.improvement ? (
                    <View>
                      <Eyebrow tone="faint">Could have gone better</Eyebrow>
                      <Body>{review.improvement}</Body>
                    </View>
                  ) : null}
                  {review.tomorrowFocus ? (
                    <View>
                      <Eyebrow tone="faint">Focus next</Eyebrow>
                      <Body>{review.tomorrowFocus}</Body>
                    </View>
                  ) : null}
                  <View style={{ flexDirection: 'row', gap: space.lg }}>
                    {review.energyScore ? (
                      <View>
                        <Eyebrow tone="faint">Energy</Eyebrow>
                        <Body>{review.energyScore}/5</Body>
                      </View>
                    ) : null}
                    {review.moodScore ? (
                      <View>
                        <Eyebrow tone="faint">Mood</Eyebrow>
                        <Body>{review.moodScore}/5</Body>
                      </View>
                    ) : null}
                    {review.isRestDay ? (
                      <View>
                        <Eyebrow tone="faint">Type</Eyebrow>
                        <Body>Rest day</Body>
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>
            ) : (
              <Button
                label={date === today ? 'Write today’s review' : 'Add a review for this day'}
                icon="edit-3"
                variant="outline"
                full
                onPress={() => router.push(`/review/daily?date=${date}`)}
              />
            )}
          </View>
        )}
      </ScreenScroll>
    </Screen>
  );
}
