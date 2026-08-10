import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, IconButton } from '@/components/ui/Button';
import { Icon, resolveIcon } from '@/components/ui/Icon';
import { AppHeader, Screen, ScreenScroll, SectionHeader } from '@/components/ui/Layout';
import { MetricCard, MetricGrid } from '@/components/ui/MetricCard';
import { EmptyState, SkeletonCard } from '@/components/ui/States';
import { Body, Caption, Eyebrow, MetricSmall, Title } from '@/components/ui/Text';
import { describeProgress, snapshotRoutineDay, indexLogsByDate } from '@/services/analytics/routines';
import {
  fetchDailySummary,
  fetchReflection,
  loadDayRecords,
  recomputeDailySummary,
} from '@/services/summaryService';
import { useAuthStore, useSettings } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { useTheme, withAlpha } from '@/theme/ThemeProvider';
import type { DailyReflection, DailySummary } from '@/types/models';
import {
  addDays,
  formatDeviation,
  formatDuration,
  formatLongDate,
  formatTime,
  isValidDateKey,
  minutesToTime,
  timeToMinutes,
  todayKey,
} from '@/utils/date';

/** A day in full: what was planned, what happened, and what was written down. */
export default function DayHistory() {
  const { c, space, accent, radius } = useTheme();
  const router = useRouter();
  const settings = useSettings();
  const params = useLocalSearchParams<{ date: string }>();
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const subjects = useDataStore((s) => s.subjects);
  const chapters = useDataStore((s) => s.chapters);
  const categories = useDataStore((s) => s.categories);

  const dateKey = isValidDateKey(params.date) ? params.date : todayKey();
  const today = todayKey();

  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [reflection, setReflection] = useState<DailyReflection | null>(null);
  const [records, setRecords] = useState<Awaited<ReturnType<typeof loadDayRecords>> | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    try {
      // Recompute so an old day reflects any edits made since.
      await recomputeDailySummary(uid, dateKey, settings).catch(() => {});
      const [s, r, rec] = await Promise.all([
        fetchDailySummary(uid, dateKey),
        fetchReflection(uid, dateKey),
        loadDayRecords(uid, dateKey),
      ]);
      setSummary(s);
      setReflection(r);
      setRecords(rec);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, dateKey]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const tasks = records?.tasks.filter((t) => !t.isRecurringTemplate) ?? [];
  const sessions = records?.sessions ?? [];

  const routineSnapshots =
    records?.routines
      .filter((r) => r.active || r.archivedAt)
      .map((routine) => {
        const logs = (records?.routineLogs ?? []).filter((l) => l.routineId === routine.id);
        return snapshotRoutineDay(
          routine,
          dateKey,
          {
            logsByDate: indexLogsByDate(logs),
            weekStart: settings.weekStart,
            today,
          },
          settings.wakeToleranceMinutes,
        );
      })
      .filter((s) => s.available) ?? [];

  const hasAnything =
    tasks.length > 0 ||
    sessions.length > 0 ||
    (records?.routineLogs.length ?? 0) > 0 ||
    !!reflection;

  const subjectName = (id: string | null) => subjects.find((s) => s.id === id)?.name ?? 'Study';
  const chapterName = (id: string | null) => chapters.find((ch) => ch.id === id)?.name ?? null;

  return (
    <Screen>
      <AppHeader
        showBack
        eyebrow="History"
        title={formatLongDate(dateKey)}
        right={
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <IconButton
              icon="chevron-left"
              label="Previous day"
              size={38}
              onPress={() => router.replace(`/history/${addDays(dateKey, -1)}`)}
            />
            <IconButton
              icon="chevron-right"
              label="Next day"
              size={38}
              disabled={dateKey >= today}
              onPress={() => router.replace(`/history/${addDays(dateKey, 1)}`)}
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
            message="No routines, tasks, study or reflections were logged on this day."
            actionLabel={dateKey >= today ? 'Plan this day' : undefined}
            onAction={dateKey >= today ? () => router.push(`/task/new?date=${dateKey}`) : undefined}
          />
        ) : (
          <View style={{ gap: space.xl, paddingTop: space.sm }}>
            {summary?.wakeActual ? (
              <View
                style={{
                  padding: space.base,
                  gap: 4,
                  backgroundColor: c.surface2,
                  borderRadius: radius.card,
                  borderWidth: StyleSheet.hairlineWidth * 2,
                  borderColor: c.line,
                }}>
                <Eyebrow tone="faint">Woke up</Eyebrow>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.md }}>
                  <MetricSmall tone="strong" style={{ fontSize: 28, lineHeight: 30 }}>
                    {formatTime(summary.wakeActual, settings.use24HourTime)}
                  </MetricSmall>
                  <Caption tone="faint">
                    {formatDeviation(summary.wakeDeviationMinutes, settings.wakeToleranceMinutes)}
                    {summary.wakeTarget
                      ? ` vs ${formatTime(summary.wakeTarget, settings.use24HourTime)}`
                      : ''}
                  </Caption>
                </View>
                {summary.sleepActual ? (
                  <Caption tone="faint">
                    Bedtime {formatTime(summary.sleepActual, settings.use24HourTime)}
                  </Caption>
                ) : null}
              </View>
            ) : null}

            <MetricGrid columns={2}>
              <MetricCard
                label="Routines"
                value={`${summary?.routinesCompleted ?? 0}/${summary?.routinesScheduled ?? 0}`}
                caption={`${summary?.routineConsistency ?? 0}%`}
                icon="repeat"
              />
              <MetricCard
                label="Tasks"
                value={`${summary?.tasksCompleted ?? 0}/${summary?.tasksPlanned ?? 0}`}
                icon="check-square"
              />
              <MetricCard
                label="Study"
                value={formatDuration(summary?.studyActualMinutes ?? 0, '0m')}
                caption={
                  summary?.studyExtraMinutes
                    ? `${formatDuration(summary.studyExtraMinutes)} extra`
                    : undefined
                }
                icon="book"
              />
              <MetricCard
                label="Timetable"
                value={`${summary?.timetableCompleted ?? 0}/${summary?.timetableSlots ?? 0}`}
                icon="calendar"
              />
            </MetricGrid>

            {routineSnapshots.length > 0 ? (
              <View>
                <SectionHeader title="Routines" />
                <View
                  style={{
                    borderWidth: StyleSheet.hairlineWidth * 2,
                    borderColor: c.line,
                    borderRadius: radius.card,
                    overflow: 'hidden',
                    backgroundColor: c.surface2,
                  }}>
                  {routineSnapshots.map((snapshot, index) => {
                    const done = snapshot.status === 'completed';
                    const rested = snapshot.status === 'rest' || snapshot.status === 'skipped';
                    return (
                      <View
                        key={snapshot.routine.id}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: space.md,
                          padding: space.md,
                          borderTopWidth: index > 0 ? StyleSheet.hairlineWidth * 2 : 0,
                          borderTopColor: c.line,
                          opacity: rested ? 0.55 : 1,
                        }}>
                        <Icon
                          name={done ? 'check' : rested ? 'moon' : 'x'}
                          size={14}
                          color={done ? accent.base : c.text40}
                        />
                        <Body style={{ flex: 1 }} numberOfLines={1}>
                          {snapshot.routine.name}
                        </Body>
                        <Caption tone="faint">
                          {rested ? 'Rest' : describeProgress(snapshot)}
                        </Caption>
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}

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
                  {tasks.map((task, index) => (
                    <View
                      key={task.id}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: space.md,
                        padding: space.md,
                        borderTopWidth: index > 0 ? StyleSheet.hairlineWidth * 2 : 0,
                        borderTopColor: c.line,
                      }}>
                      <Icon
                        name={
                          task.status === 'completed'
                            ? 'check-circle'
                            : task.status === 'skipped'
                              ? 'slash'
                              : 'circle'
                        }
                        size={14}
                        color={task.status === 'completed' ? accent.base : c.text30}
                      />
                      <Body style={{ flex: 1 }} numberOfLines={1}>
                        {task.title}
                      </Body>
                      <Caption tone="faint">
                        {categories.find((cat) => cat.id === task.categoryId)?.name ?? ''}
                      </Caption>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {sessions.length > 0 ? (
              <View>
                <SectionHeader
                  title="Study"
                  meta={formatDuration(summary?.studyActualMinutes ?? 0)}
                />
                <View style={{ gap: space.sm }}>
                  {sessions.map((session) => (
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
                      <View
                        style={{
                          width: 30,
                          height: 30,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: withAlpha(
                            subjects.find((s) => s.id === session.subjectId)?.color ?? accent.base,
                            0.16,
                          ),
                        }}>
                        <Icon
                          name={session.timetableSlotId ? 'calendar' : 'clock'}
                          size={13}
                          color={
                            subjects.find((s) => s.id === session.subjectId)?.color ?? accent.base
                          }
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Body numberOfLines={1}>
                          {subjectName(session.subjectId)}
                          {chapterName(session.chapterId)
                            ? ` · ${chapterName(session.chapterId)}`
                            : ''}
                        </Body>
                        <Caption tone="faint">
                          {formatTime(
                            minutesToTime(
                              (new Date(session.startedAt).getHours() * 60 +
                                new Date(session.startedAt).getMinutes()) %
                                1440,
                            ),
                            settings.use24HourTime,
                          )}
                          {session.timetableSlotId ? ' · scheduled' : ' · extra'}
                          {session.notes ? ` · ${session.notes}` : ''}
                        </Caption>
                      </View>
                      <MetricSmall tone="strong">
                        {formatDuration(session.actualMinutes)}
                      </MetricSmall>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {reflection ? (
              <View>
                <SectionHeader title="Reflection" />
                <View
                  style={{
                    padding: space.base,
                    gap: space.md,
                    borderWidth: StyleSheet.hairlineWidth * 2,
                    borderColor: c.line,
                    borderRadius: radius.card,
                    backgroundColor: c.surface2,
                  }}>
                  {reflection.biggestWin ? (
                    <View>
                      <Eyebrow tone="faint">Biggest win</Eyebrow>
                      <Body>{reflection.biggestWin}</Body>
                    </View>
                  ) : null}
                  {reflection.tomorrowFocus ? (
                    <View>
                      <Eyebrow tone="faint">Focus next</Eyebrow>
                      <Body>{reflection.tomorrowFocus}</Body>
                    </View>
                  ) : null}
                  <View style={{ flexDirection: 'row', gap: space.lg }}>
                    {reflection.dayRating ? (
                      <View>
                        <Eyebrow tone="faint">Day</Eyebrow>
                        <Body>{reflection.dayRating}/5</Body>
                      </View>
                    ) : null}
                    {reflection.energy ? (
                      <View>
                        <Eyebrow tone="faint">Energy</Eyebrow>
                        <Body>{reflection.energy}/5</Body>
                      </View>
                    ) : null}
                    {reflection.isRestDay ? (
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
                label={dateKey === today ? 'Close out today' : 'Add a reflection'}
                icon="edit-3"
                variant="outline"
                full
                onPress={() => router.push(`/review/daily?date=${dateKey}`)}
              />
            )}
          </View>
        )}
      </ScreenScroll>
    </Screen>
  );
}
