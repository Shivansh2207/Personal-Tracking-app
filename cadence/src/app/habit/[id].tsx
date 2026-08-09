import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Heatmap } from '@/components/analytics/Charts';
import { GridLegend, HabitMonthGrid } from '@/components/habits/HabitMonthGrid';
import { Button, IconButton } from '@/components/ui/Button';
import { useIntensityColors } from '@/components/ui/Calendar';
import { ConfirmationDialog, useToast } from '@/components/ui/Feedback';
import { AppHeader, Screen, ScreenScroll, SectionHeader } from '@/components/ui/Layout';
import { MetricCard, MetricGrid } from '@/components/ui/MetricCard';
import { ErrorState, Skeleton } from '@/components/ui/States';
import { Body, Caption, Eyebrow, Title } from '@/components/ui/Text';
import {
  calculateHabitConsistency,
  calculateHabitStreaks,
  indexLogsByDate,
  isHabitRequiredOn,
  isLogComplete,
} from '@/services/analytics/habits';
import { toFriendlyError } from '@/services/firebase/errors';
import {
  archiveHabit,
  clearHabitLog,
  deleteHabit,
  describeFrequency,
  describeTarget,
  fetchLogsForHabit,
  logHabit,
} from '@/services/habitService';
import { cancel } from '@/services/notificationService';
import { useAuthStore, useSettings } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { useTheme } from '@/theme/ThemeProvider';
import type { HabitLog } from '@/types/models';
import {
  addMonths,
  dateRange,
  endOfMonth,
  fromDateKey,
  lastNDays,
  monthName,
  startOfMonth,
  startOfWeek,
  todayKey,
} from '@/utils/date';

export default function HabitDetail() {
  const { c, space, radius } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const settings = useSettings();
  const params = useLocalSearchParams<{ id: string }>();
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const habits = useDataStore((s) => s.habits);
  const categories = useDataStore((s) => s.categories);
  const scheduleRecompute = useDataStore((s) => s.scheduleRecompute);
  const intensityColors = useIntensityColors();

  const habit = habits.find((h) => h.id === params.id) ?? null;
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(startOfMonth(todayKey()));
  const [confirm, setConfirm] = useState<null | 'archive' | 'delete'>(null);

  const today = todayKey();

  const load = useCallback(async () => {
    if (!uid || !params.id) return;
    setLoading(true);
    try {
      setLogs(await fetchLogsForHabit(uid, params.id));
    } catch {
      toast.show('Could not load habit history.', 'error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, params.id]);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    if (!habit) return null;
    const monthRange = dateRange(startOfMonth(today), today);
    const weekRange = dateRange(startOfWeek(today, settings.weekStart), today);
    return {
      month: calculateHabitConsistency(habit, monthRange, logs, settings.weekStart, today),
      week: calculateHabitConsistency(habit, weekRange, logs, settings.weekStart, today),
      streaks: calculateHabitStreaks(habit, logs, settings.weekStart, today),
      total: logs.filter((l) => isLogComplete(l, habit)).length,
    };
  }, [habit, logs, settings.weekStart, today]);

  const heatmapCells = useMemo(() => {
    if (!habit) return [];
    const logsByDate = indexLogsByDate(logs);
    // Align the grid so each column is a full week.
    const start = startOfWeek(lastNDays(182, today)[0], settings.weekStart);
    return dateRange(start, today).map((date) => {
      const log = logsByDate.get(date);
      const done = isLogComplete(log, habit);
      const required =
        !done &&
        date >= habit.startDate &&
        isHabitRequiredOn(habit, date, {
          logsByDate,
          weekStart: settings.weekStart,
          today,
        });
      return {
        date,
        level: (done ? 4 : log?.status === 'skipped' ? 1 : required ? 0 : 0) as 0 | 1 | 2 | 3 | 4,
      };
    });
  }, [habit, logs, settings.weekStart, today]);

  const category = categories.find((cat) => cat.id === habit?.categoryId);

  if (!habit) {
    return (
      <Screen>
        <AppHeader showBack title="Habit" />
        <View style={{ padding: 16 }}>
          {loading ? (
            <Skeleton height={120} />
          ) : (
            <ErrorState message="This habit no longer exists." onRetry={() => router.back()} retryLabel="Go back" />
          )}
        </View>
      </Screen>
    );
  }

  const toggleCell = async (date: string, currentlyComplete: boolean) => {
    if (!uid) return;
    try {
      if (currentlyComplete) await clearHabitLog(uid, habit.id, date);
      else await logHabit(uid, habit, date, { status: 'completed', value: habit.target });
      await load();
      scheduleRecompute(date);
    } catch (e) {
      toast.show(toFriendlyError(e, 'Could not update that day').message, 'error');
    }
  };

  return (
    <Screen>
      <AppHeader
        showBack
        eyebrow={category?.name ?? 'Habit'}
        title={habit.name}
        right={
          <IconButton
            icon="settings"
            label="Habit options"
            size={40}
            onPress={() => setConfirm('archive')}
          />
        }
      />

      <ScreenScroll>
        <View style={{ gap: space.xl, paddingTop: space.sm }}>
          <View
            style={{
              padding: space.base,
              gap: 4,
              backgroundColor: c.surface2,
              borderRadius: radius.card,
              borderWidth: StyleSheet.hairlineWidth * 2,
              borderColor: c.line,
            }}>
            <Eyebrow tone="faint">Setup</Eyebrow>
            <Title tone="strong">{describeFrequency(habit.frequency)}</Title>
            <Caption tone="faint">
              {describeTarget(habit)} · started {habit.startDate}
              {habit.reminderTime ? ` · reminder ${habit.reminderTime}` : ''}
            </Caption>
          </View>

          {stats ? (
            <MetricGrid columns={2}>
              <MetricCard label="Current streak" value={`${stats.streaks.current}`} caption="days" />
              <MetricCard label="Longest streak" value={`${stats.streaks.longest}`} caption="days" />
              <MetricCard label="This week" value={`${stats.week.rate}%`} caption={`${stats.week.completed}/${stats.week.scheduled}`} />
              <MetricCard label="This month" value={`${stats.month.rate}%`} caption={`${stats.month.completed}/${stats.month.scheduled}`} />
            </MetricGrid>
          ) : null}

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
                habits={[habit]}
                logs={logs.filter(
                  (l) => l.date >= startOfMonth(month) && l.date <= endOfMonth(month),
                )}
                month={month}
                weekStart={settings.weekStart}
                today={today}
                onToggleCell={(_, date, complete) => toggleCell(date, complete)}
              />
              <GridLegend />
            </View>
          </View>

          <View>
            <SectionHeader title="Last six months" />
            <View
              style={{
                padding: space.md,
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
            </View>
          </View>

          <View style={{ gap: space.sm }}>
            <SectionHeader title="Manage" />
            <Button
              label="Archive habit"
              icon="archive"
              variant="outline"
              full
              onPress={() => setConfirm('archive')}
            />
            <Button
              label="Delete habit and history"
              icon="trash-2"
              variant="danger"
              full
              onPress={() => setConfirm('delete')}
            />
            <Body tone="faint" style={{ fontSize: 12 }}>
              Archiving keeps your history and stops the habit appearing on today&apos;s list.
            </Body>
          </View>
        </View>
      </ScreenScroll>

      <ConfirmationDialog
        visible={confirm === 'archive'}
        title="Archive this habit?"
        message="It stops appearing on today's list. Past logs and analytics are kept."
        confirmLabel="Archive"
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          if (!uid) return;
          await cancel(habit.notificationId);
          await archiveHabit(uid, habit.id);
          setConfirm(null);
          toast.show('Habit archived.');
          scheduleRecompute(today);
          router.back();
        }}
      />

      <ConfirmationDialog
        visible={confirm === 'delete'}
        title="Delete this habit?"
        message={`${logs.length} logged day${logs.length === 1 ? '' : 's'} will be permanently removed. Archiving keeps the history instead.`}
        destructive
        confirmLabel="Delete"
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          if (!uid) return;
          await cancel(habit.notificationId);
          await deleteHabit(uid, habit.id);
          setConfirm(null);
          toast.show('Habit deleted.');
          scheduleRecompute(today);
          router.back();
        }}
      />
    </Screen>
  );
}
