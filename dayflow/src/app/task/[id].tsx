import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, IconButton } from '@/components/ui/Button';
import { Chip, ChipGroup, TextField } from '@/components/ui/Controls';
import { ConfirmationDialog, useToast } from '@/components/ui/Feedback';
import { AppHeader, Screen, ScreenScroll, SectionHeader } from '@/components/ui/Layout';
import { DateField, TimeField } from '@/components/ui/Pickers';
import { ErrorState, SkeletonCard } from '@/components/ui/States';
import { Body, Caption, Eyebrow, Title } from '@/components/ui/Text';
import { describeSchedule, parseVirtualOccurrence } from '@/services/recurrence';
import { toFriendlyError } from '@/services/firebase/errors';
import { cancel } from '@/services/notificationService';
import {
  buildVirtualOccurrence,
  deleteRecurringSeries,
  deleteTask,
  duplicateTask,
  fetchTask,
  rescheduleTask,
  setTaskStatus,
  updateTask,
} from '@/services/taskService';
import { useAuthStore, useSettings } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { useTheme } from '@/theme/ThemeProvider';
import type { Task } from '@/types/models';
import { addDays, formatRelativeDate, formatTime, todayKey } from '@/utils/date';

export default function TaskDetail() {
  const { c, space, radius } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const settings = useSettings();
  const params = useLocalSearchParams<{ id: string }>();
  const rawId = decodeURIComponent(params.id ?? '');

  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const categories = useDataStore((s) => s.categories);
  const templates = useDataStore((s) => s.recurringTemplates);
  const scheduleRecompute = useDataStore((s) => s.scheduleRecompute);

  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const virtual = parseVirtualOccurrence(rawId);
  const today = todayKey();

  const load = useCallback(async () => {
    if (!uid || !rawId) return;
    setLoading(true);
    setError(null);
    try {
      if (virtual) {
        const template =
          templates.find((t) => t.id === virtual.templateId) ??
          (await fetchTask(uid, virtual.templateId));
        if (template) setTask(buildVirtualOccurrence(template, virtual.dateKey));
        else setError('This task no longer exists.');
      } else {
        const fetched = await fetchTask(uid, rawId);
        if (fetched) setTask(fetched);
        else setError('This task no longer exists.');
      }
    } catch (e) {
      setError(toFriendlyError(e, 'Could not load the task').message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, rawId, templates.length]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setNotes(task.notes ?? '');
    }
  }, [task?.id]);

  if (loading && !task) {
    return (
      <Screen>
        <AppHeader showBack title="Task" />
        <View style={{ padding: 16 }}>
          <SkeletonCard lines={3} />
        </View>
      </Screen>
    );
  }

  if (error || !task) {
    return (
      <Screen>
        <AppHeader showBack title="Task" />
        <View style={{ padding: 16 }}>
          <ErrorState message={error ?? 'Task not found.'} onRetry={load} />
        </View>
      </Screen>
    );
  }

  const category = categories.find((cat) => cat.id === task.categoryId);
  const done = task.status === 'completed';
  const isSeries = task.isRecurringTemplate;

  const applyPatch = async (patch: Partial<Task>) => {
    if (!uid) return;
    try {
      const previous = task.dateKey;
      const realId = await updateTask(uid, task.id, patch);
      if (previous) scheduleRecompute(previous);
      if (patch.dateKey) scheduleRecompute(patch.dateKey);
      const refreshed = await fetchTask(uid, realId);
      if (refreshed) setTask(refreshed);
    } catch (e) {
      toast.show(toFriendlyError(e, 'Could not save your change').message, 'error');
    }
  };

  const doReschedule = async (date: string | null) => {
    if (!uid) return;
    try {
      const previous = task.dateKey;
      const realId = await rescheduleTask(uid, task.id, date);
      if (previous) scheduleRecompute(previous);
      if (date) scheduleRecompute(date);
      const refreshed = await fetchTask(uid, realId);
      if (refreshed) setTask(refreshed);
      toast.show(date ? `Moved to ${formatRelativeDate(date)}.` : 'Moved to backlog.');
    } catch (e) {
      toast.show(toFriendlyError(e, 'Could not reschedule').message, 'error');
    }
  };

  const details: { label: string; value: string }[] = [
    { label: 'Status', value: done ? 'Completed' : task.status === 'skipped' ? 'Skipped' : 'Pending' },
    { label: 'Date', value: task.dateKey ? formatRelativeDate(task.dateKey) : 'Backlog' },
    ...(task.startTime
      ? [{ label: 'Time', value: formatTime(task.startTime, settings.use24HourTime) }]
      : []),
    ...(task.deadline ? [{ label: 'Deadline', value: formatRelativeDate(task.deadline) }] : []),
    ...(task.estimatedMinutes ? [{ label: 'Estimate', value: `${task.estimatedMinutes} min` }] : []),
    { label: 'Priority', value: task.priority },
    ...(category ? [{ label: 'Category', value: category.name }] : []),
    ...(task.recurrence || task.parentTaskId
      ? [
          {
            label: 'Repeats',
            value: describeSchedule(
              task.recurrence ??
                templates.find((t) => t.id === task.parentTaskId)?.recurrence ??
                null,
            ),
          },
        ]
      : []),
    ...(task.carryCount
      ? [{ label: 'Moved', value: `${task.carryCount} time${task.carryCount === 1 ? '' : 's'}` }]
      : []),
  ];

  return (
    <Screen>
      <AppHeader
        showBack
        eyebrow={isSeries ? 'Repeating task' : (category?.name ?? 'Task')}
        right={
          <IconButton
            icon="copy"
            label="Duplicate task"
            size={40}
            onPress={async () => {
              if (!uid) return;
              await duplicateTask(uid, task);
              toast.show('Duplicated.');
              if (task.dateKey) scheduleRecompute(task.dateKey);
            }}
          />
        }
      />

      <ScreenScroll>
        <View style={{ gap: space.lg, paddingTop: space.sm }}>
          <TextField
            value={title}
            onChangeText={setTitle}
            onBlur={() => {
              if (title.trim() && title !== task.title) applyPatch({ title: title.trim() });
            }}
          />

          {!isSeries ? (
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Button
                label={done ? 'Mark not done' : 'Complete'}
                icon={done ? 'rotate-ccw' : 'check'}
                style={{ flex: 1 }}
                onPress={async () => {
                  if (!uid) return;
                  const realId = await setTaskStatus(uid, task.id, done ? 'pending' : 'completed');
                  if (task.dateKey) scheduleRecompute(task.dateKey);
                  const refreshed = await fetchTask(uid, realId);
                  if (refreshed) setTask(refreshed);
                }}
              />
              <Button
                label="Skip"
                icon="slash"
                variant="outline"
                style={{ flex: 1 }}
                onPress={async () => {
                  if (!uid) return;
                  const realId = await setTaskStatus(uid, task.id, 'skipped');
                  if (task.dateKey) scheduleRecompute(task.dateKey);
                  const refreshed = await fetchTask(uid, realId);
                  if (refreshed) setTask(refreshed);
                }}
              />
            </View>
          ) : null}

          <View>
            <SectionHeader title="Details" />
            <View
              style={{
                borderWidth: StyleSheet.hairlineWidth * 2,
                borderColor: c.line,
                borderRadius: radius.card,
                overflow: 'hidden',
              }}>
              {details.map((detail, index) => (
                <View
                  key={detail.label}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: space.md,
                    backgroundColor: c.surface2,
                    borderTopWidth: index > 0 ? StyleSheet.hairlineWidth * 2 : 0,
                    borderTopColor: c.line,
                  }}>
                  <Eyebrow tone="faint" style={{ flex: 1 }}>
                    {detail.label}
                  </Eyebrow>
                  <Body style={{ textTransform: 'capitalize' }}>{detail.value}</Body>
                </View>
              ))}
            </View>
          </View>

          {!isSeries ? (
            <View style={{ gap: space.md }}>
              <SectionHeader title="Reschedule" />
              <ChipGroup>
                <Chip label="Today" onPress={() => doReschedule(today)} />
                <Chip label="Tomorrow" onPress={() => doReschedule(addDays(today, 1))} />
                <Chip label="Backlog" onPress={() => doReschedule(null)} />
              </ChipGroup>
              <View style={{ flexDirection: 'row', gap: space.md }}>
                <DateField
                  label="Date"
                  value={task.dateKey}
                  onChange={(date) => doReschedule(date)}
                  weekStart={settings.weekStart}
                  clearLabel="Backlog"
                />
                <TimeField
                  label="Time"
                  value={task.startTime}
                  onChange={(startTime) => applyPatch({ startTime })}
                  use24Hour={settings.use24HourTime}
                />
              </View>
            </View>
          ) : null}

          <View style={{ gap: space.sm }}>
            <SectionHeader title="Notes" />
            <TextField
              value={notes}
              onChangeText={setNotes}
              placeholder="Anything worth remembering"
              multiline
              onBlur={() => {
                if ((task.notes ?? '') !== notes) applyPatch({ notes: notes || null });
              }}
            />
          </View>

          <Button
            label={isSeries ? 'Delete series' : 'Delete task'}
            icon="trash-2"
            variant="danger"
            full
            onPress={() => setConfirmDelete(true)}
          />
        </View>
      </ScreenScroll>

      <ConfirmationDialog
        visible={confirmDelete}
        title={isSeries ? 'Delete this repeating task?' : 'Delete this task?'}
        message={
          isSeries
            ? 'The series and every occurrence you have already touched will be removed.'
            : task.parentTaskId
              ? 'This is one occurrence of a repeating task.'
              : 'This cannot be undone.'
        }
        destructive
        confirmLabel="Delete"
        onCancel={() => setConfirmDelete(false)}
        options={
          task.parentTaskId && !isSeries
            ? [
                {
                  label: 'Skip only this occurrence',
                  icon: 'calendar',
                  onPress: async () => {
                    if (!uid) return;
                    await deleteTask(uid, task.id);
                    if (task.dateKey) scheduleRecompute(task.dateKey);
                    setConfirmDelete(false);
                    toast.show('Occurrence skipped.');
                    router.back();
                  },
                },
                {
                  label: 'Delete the whole series',
                  icon: 'rotate-cw',
                  onPress: async () => {
                    if (!uid || !task.parentTaskId) return;
                    await deleteRecurringSeries(uid, task.parentTaskId);
                    setConfirmDelete(false);
                    toast.show('Series deleted.');
                    router.back();
                  },
                },
              ]
            : undefined
        }
        onConfirm={async () => {
          if (!uid) return;
          await cancel(task.notificationId);
          if (isSeries) await deleteRecurringSeries(uid, task.id);
          else await deleteTask(uid, task.id);
          if (task.dateKey) scheduleRecompute(task.dateKey);
          setConfirmDelete(false);
          toast.show('Deleted.');
          router.back();
        }}
      />
    </Screen>
  );
}
