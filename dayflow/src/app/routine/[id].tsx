import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Heatmap } from '@/components/analytics/Charts';
import { TrackingConfig, TrackingTypeSheet } from '@/components/routines/TrackingTypeSheet';
import { Button, IconButton } from '@/components/ui/Button';
import { useIntensityColors } from '@/components/ui/Calendar';
import { TextField } from '@/components/ui/Controls';
import { ConfirmationDialog, useToast } from '@/components/ui/Feedback';
import { AppHeader, Screen, ScreenScroll, SectionHeader } from '@/components/ui/Layout';
import { MetricCard, MetricGrid } from '@/components/ui/MetricCard';
import { ErrorState, SkeletonCard } from '@/components/ui/States';
import { Body, Caption, Eyebrow, Title } from '@/components/ui/Text';
import {
  calculateRoutineConsistency,
  calculateStreak,
  targetLabel,
} from '@/services/analytics/routines';
import { toFriendlyError } from '@/services/firebase/errors';
import { cancel } from '@/services/notificationService';
import { describeSchedule } from '@/services/recurrence';
import {
  archiveRoutine,
  deleteRoutine,
  fetchLogsForRoutine,
  updateRoutine,
} from '@/services/routineService';
import { useAuthStore, useSettings } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { useTheme } from '@/theme/ThemeProvider';
import type { RoutineLog } from '@/types/models';
import {
  dateRange,
  lastNDays,
  startOfMonth,
  startOfWeek,
  todayKey,
} from '@/utils/date';

export default function RoutineDetail() {
  const { c, space, radius } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const settings = useSettings();
  const params = useLocalSearchParams<{ id: string }>();
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const routines = useDataStore((s) => s.routines);
  const categories = useDataStore((s) => s.categories);
  const scheduleRecompute = useDataStore((s) => s.scheduleRecompute);
  const intensityColors = useIntensityColors();

  const routine = routines.find((r) => r.id === params.id) ?? null;
  const [logs, setLogs] = useState<RoutineLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState(routine?.name ?? '');
  const [configOpen, setConfigOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | 'archive' | 'delete'>(null);

  const today = todayKey();

  const load = useCallback(async () => {
    if (!uid || !params.id) return;
    setLoading(true);
    try {
      setLogs(await fetchLogsForRoutine(uid, params.id));
    } catch {
      toast.show('Could not load routine history.', 'error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, params.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (routine) setName(routine.name);
  }, [routine?.id]);

  const stats = useMemo(() => {
    if (!routine) return null;
    return {
      month: calculateRoutineConsistency(
        routine,
        dateRange(startOfMonth(today), today),
        logs,
        settings.weekStart,
        today,
        settings.wakeToleranceMinutes,
      ),
      week: calculateRoutineConsistency(
        routine,
        dateRange(startOfWeek(today, settings.weekStart), today),
        logs,
        settings.weekStart,
        today,
        settings.wakeToleranceMinutes,
      ),
      streaks: calculateStreak(routine, logs, settings.weekStart, today),
    };
  }, [routine, logs, settings, today]);

  const heatmapCells = useMemo(() => {
    if (!routine) return [];
    const byDate = new Map(logs.map((l) => [l.dateKey, l]));
    const start = startOfWeek(lastNDays(182, today)[0], settings.weekStart);
    return dateRange(start, today).map((dateKey) => {
      const log = byDate.get(dateKey);
      let level: 0 | 1 | 2 | 3 | 4 = 0;
      if (log) {
        if (log.status === 'completed') level = 4;
        else if (log.status === 'partial') level = 2;
        else if (log.status === 'skipped' || log.status === 'rest') level = 1;
      }
      return { date: dateKey, level };
    });
  }, [routine, logs, today, settings.weekStart]);

  if (!routine) {
    return (
      <Screen>
        <AppHeader showBack title="Routine" />
        <View style={{ padding: 16 }}>
          {loading ? (
            <SkeletonCard lines={3} />
          ) : (
            <ErrorState
              message="This routine no longer exists."
              onRetry={() => router.back()}
              retryLabel="Go back"
            />
          )}
        </View>
      </Screen>
    );
  }

  const category = categories.find((cat) => cat.id === routine.categoryId);

  const config: TrackingConfig = {
    trackingType: routine.trackingType,
    targetValue: routine.targetValue,
    unit: routine.unit,
    targetTime: routine.targetTime,
    preferredTime: routine.preferredTime,
    schedule: routine.schedule,
  };

  return (
    <Screen>
      <AppHeader
        showBack
        eyebrow={category?.name ?? 'Routine'}
        title={routine.name}
        right={
          <IconButton
            icon="edit-3"
            label="Change tracking"
            size={40}
            onPress={() => setConfigOpen(true)}
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
            <Title tone="strong">{targetLabel(routine)}</Title>
            <Caption tone="faint">
              {describeSchedule(routine.schedule)} · started {routine.schedule.startDate}
              {routine.reminderEnabled && routine.reminderTime
                ? ` · reminder ${routine.reminderTime}`
                : ''}
            </Caption>
          </View>

          {stats ? (
            <MetricGrid columns={2}>
              <MetricCard label="Current streak" value={`${stats.streaks.current}`} caption="days" />
              <MetricCard label="Longest streak" value={`${stats.streaks.longest}`} caption="days" />
              <MetricCard
                label="This week"
                value={`${stats.week.rate}%`}
                caption={`${stats.week.completed}/${stats.week.scheduled}`}
              />
              <MetricCard
                label="This month"
                value={`${stats.month.rate}%`}
                caption={
                  routine.trackingType === 'count' || routine.trackingType === 'duration'
                    ? `${stats.month.actualTotal}/${stats.month.targetTotal}`
                    : `${stats.month.completed}/${stats.month.scheduled}`
                }
              />
            </MetricGrid>
          ) : null}

          <View>
            <SectionHeader title="Last six months" />
            <View
              style={{
                padding: space.base,
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

          <View style={{ gap: space.md }}>
            <SectionHeader title="Rename" />
            <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-end' }}>
              <TextField containerStyle={{ flex: 1 }} value={name} onChangeText={setName} />
              <Button
                label="Save"
                onPress={async () => {
                  if (!uid || !name.trim()) return;
                  await updateRoutine(uid, routine.id, { name: name.trim() });
                  toast.show('Routine updated.');
                }}
              />
            </View>
          </View>

          <View style={{ gap: space.sm }}>
            <SectionHeader title="Manage" />
            <Button
              label={routine.active ? 'Archive routine' : 'Reactivate routine'}
              icon={routine.active ? 'archive' : 'rotate-ccw'}
              variant="outline"
              full
              onPress={async () => {
                if (!uid) return;
                if (routine.active) setConfirm('archive');
                else {
                  await updateRoutine(uid, routine.id, { active: true, archivedAt: null });
                  toast.show('Routine reactivated.');
                  scheduleRecompute(today);
                }
              }}
            />
            <Button
              label="Delete routine and history"
              icon="trash-2"
              variant="danger"
              full
              onPress={() => setConfirm('delete')}
            />
            <Body tone="faint" style={{ fontSize: 12 }}>
              Archiving keeps every log and stops the routine appearing on today.
            </Body>
          </View>
        </View>
      </ScreenScroll>

      <TrackingTypeSheet
        visible={configOpen}
        title={routine.name}
        value={config}
        onClose={() => setConfigOpen(false)}
        use24Hour={settings.use24HourTime}
        allowNumeric
        onSave={async (next) => {
          if (!uid) return;
          try {
            await updateRoutine(uid, routine.id, {
              trackingType: next.trackingType,
              targetValue: next.targetValue,
              unit: next.unit,
              targetTime: next.targetTime,
              schedule: next.schedule,
              preferredTime: next.preferredTime,
            });
            scheduleRecompute(today);
            toast.show('Tracking updated. Past logs keep their original targets.');
          } catch (e) {
            toast.show(toFriendlyError(e, 'Could not update').message, 'error');
          }
        }}
      />

      <ConfirmationDialog
        visible={confirm === 'archive'}
        title="Archive this routine?"
        message="It stops appearing on today. Every past log and all analytics are kept."
        confirmLabel="Archive"
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          if (!uid) return;
          await cancel(routine.notificationId);
          await archiveRoutine(uid, routine.id);
          setConfirm(null);
          scheduleRecompute(today);
          toast.show('Routine archived.');
          router.back();
        }}
      />

      <ConfirmationDialog
        visible={confirm === 'delete'}
        title="Delete this routine?"
        message={`${logs.length} logged day${logs.length === 1 ? '' : 's'} will be permanently removed. Archiving keeps the history instead.`}
        destructive
        confirmLabel="Delete"
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          if (!uid) return;
          await cancel(routine.notificationId);
          await deleteRoutine(uid, routine.id);
          setConfirm(null);
          scheduleRecompute(today);
          toast.show('Routine deleted.');
          router.back();
        }}
      />
    </Screen>
  );
}
