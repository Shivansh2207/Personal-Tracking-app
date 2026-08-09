import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';

import { TaskForm, TaskFormValue } from '@/components/tasks/TaskForm';
import { Button, IconButton } from '@/components/ui/Button';
import { Chip, ChipGroup, InlineNote } from '@/components/ui/Controls';
import { ConfirmationDialog, useToast } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { AppHeader, Screen, ScreenScroll, SectionHeader } from '@/components/ui/Layout';
import { DateField } from '@/components/ui/Pickers';
import { ErrorState, Skeleton } from '@/components/ui/States';
import { Body, Eyebrow, Title } from '@/components/ui/Text';
import { describeRecurrence, parseVirtualOccurrence } from '@/services/analytics/recurrence';
import { toFriendlyError } from '@/services/firebase/errors';
import { cancel, scheduleTaskReminder } from '@/services/notificationService';
import {
  deleteRecurringSeries,
  deleteTask,
  duplicateTask,
  ensureRealTask,
  fetchTask,
  rescheduleTask,
  setTaskStatus,
  setTopPriority,
  toggleSubtask,
  updateTask,
} from '@/services/taskService';
import { useAuthStore, useSettings } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { useTheme } from '@/theme/ThemeProvider';
import type { Task, TaskStatus } from '@/types/models';
import {
  formatDuration,
  formatRelativeDate,
  formatTime,
  addDays,
  todayKey,
} from '@/utils/date';

const STATUS_LABELS: Record<TaskStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
  skipped: 'Skipped',
};

export default function TaskDetail() {
  const { c, space, accent, radius } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ id: string }>();
  const rawId = decodeURIComponent(params.id ?? '');

  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const settings = useSettings();
  const categories = useDataStore((s) => s.categories);
  const goals = useDataStore((s) => s.goals);
  const dayTasks = useDataStore((s) => s.dayTasks);
  const templates = useDataStore((s) => s.recurringTemplates);
  const scheduleRecompute = useDataStore((s) => s.scheduleRecompute);

  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<TaskFormValue | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);

  const virtual = parseVirtualOccurrence(rawId);

  const load = useCallback(async () => {
    if (!uid || !rawId) return;
    setLoading(true);
    setError(null);
    try {
      if (virtual) {
        // A not-yet-materialised recurring occurrence: build it from the
        // template rather than writing a document just to view it.
        const template = templates.find((t) => t.id === virtual.templateId);
        const local = dayTasks.find((t) => t.id === rawId);
        if (local) setTask(local);
        else if (template) {
          const { buildVirtualOccurrence } = await import('@/services/analytics/recurrence');
          setTask(buildVirtualOccurrence(template, virtual.date));
        } else {
          const fetched = await fetchTask(uid, virtual.templateId);
          if (fetched) {
            const { buildVirtualOccurrence } = await import('@/services/analytics/recurrence');
            setTask(buildVirtualOccurrence(fetched, virtual.date));
          } else setError('This task no longer exists.');
        }
      } else {
        const fetched = await fetchTask(uid, rawId);
        if (fetched) setTask(fetched);
        else setError('This task no longer exists.');
      }
    } catch (e) {
      setError(toFriendlyError(e, 'Could not load that task').message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, rawId, templates.length, dayTasks.length]);

  useEffect(() => {
    load();
  }, [load]);

  const category = useMemo(
    () => categories.find((cat) => cat.id === task?.categoryId) ?? null,
    [categories, task?.categoryId],
  );
  const goal = useMemo(
    () => goals.find((g) => g.id === task?.goalId) ?? null,
    [goals, task?.goalId],
  );

  const startEdit = () => {
    if (!task) return;
    setForm({
      title: task.title,
      description: task.description ?? null,
      categoryId: task.categoryId ?? null,
      goalId: task.goalId ?? null,
      scheduledDate: task.scheduledDate,
      startTime: task.startTime ?? null,
      endTime: task.endTime ?? null,
      estimatedMinutes: task.estimatedMinutes ?? null,
      priority: task.priority,
      isTopPriority: task.isTopPriority,
      recurrenceRule: task.isRecurringTemplate ? task.recurrenceRule : null,
      subtasks: task.subtasks,
      notes: task.notes ?? null,
      reminderMinutesBefore: task.reminderMinutesBefore ?? null,
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!uid || !task || !form) return;
    if (!form.title.trim()) {
      toast.show('Give the task a name.', 'error');
      return;
    }
    setSaving(true);
    try {
      await cancel(task.notificationId);
      const realId = await updateTask(uid, task.id, {
        title: form.title.trim(),
        description: form.description ?? null,
        categoryId: form.categoryId ?? null,
        goalId: form.goalId ?? null,
        scheduledDate: form.scheduledDate,
        startTime: form.startTime ?? null,
        estimatedMinutes: form.estimatedMinutes ?? null,
        priority: form.priority,
        subtasks: form.subtasks,
        notes: form.notes ?? null,
        reminderMinutesBefore: form.reminderMinutesBefore ?? null,
        notificationId: null,
        ...(task.isRecurringTemplate ? { recurrenceRule: form.recurrenceRule } : {}),
      });

      const refreshed = await fetchTask(uid, realId);
      if (refreshed && refreshed.startTime && refreshed.scheduledDate && form.reminderMinutesBefore !== null) {
        const notificationId = await scheduleTaskReminder(refreshed, settings);
        if (notificationId) await updateTask(uid, realId, { notificationId });
      }
      if (task.scheduledDate) scheduleRecompute(task.scheduledDate);
      if (form.scheduledDate && form.scheduledDate !== task.scheduledDate) {
        scheduleRecompute(form.scheduledDate);
      }
      setEditing(false);
      await load();
      toast.show('Task updated.', 'success');
    } catch (e) {
      toast.show(toFriendlyError(e, 'Could not save your changes').message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (status: TaskStatus) => {
    if (!uid || !task) return;
    try {
      const realId = await setTaskStatus(uid, task.id, status);
      if (task.scheduledDate) scheduleRecompute(task.scheduledDate);
      const refreshed = await fetchTask(uid, realId);
      if (refreshed) setTask(refreshed);
    } catch (e) {
      toast.show(toFriendlyError(e, 'Could not update the task').message, 'error');
    }
  };

  const doReschedule = async (date: string | null) => {
    if (!uid || !task) return;
    try {
      const previous = task.scheduledDate;
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

  const doDelete = async (series: boolean) => {
    if (!uid || !task) return;
    try {
      await cancel(task.notificationId);
      if (series && (task.isRecurringTemplate || task.parentRecurringTaskId)) {
        await deleteRecurringSeries(uid, task.parentRecurringTaskId ?? task.id);
      } else {
        await deleteTask(uid, task.id);
      }
      if (task.scheduledDate) scheduleRecompute(task.scheduledDate);
      setConfirmDelete(false);
      toast.show(series ? 'Series deleted.' : 'Task deleted.');
      router.back();
    } catch (e) {
      toast.show(toFriendlyError(e, 'Could not delete').message, 'error');
    }
  };

  const startFocus = async () => {
    if (!uid || !task) return;
    try {
      const realId = await ensureRealTask(uid, task.id);
      router.push(`/focus/setup?taskId=${realId}&title=${encodeURIComponent(task.title)}`);
    } catch (e) {
      toast.show(toFriendlyError(e, 'Could not start the timer').message, 'error');
    }
  };

  if (loading) {
    return (
      <Screen>
        <AppHeader showBack title="Task" />
        <View style={{ padding: 16, gap: 12 }}>
          <Skeleton height={28} width="70%" />
          <Skeleton height={16} width="45%" />
          <Skeleton height={120} />
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

  if (editing && form) {
    return (
      <Screen>
        <AppHeader
          showBack
          title="Edit task"
          onBack={() => setEditing(false)}
          eyebrow={task.isRecurringTemplate ? 'Repeating series' : undefined}
        />
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScreenScroll bottomInset={40}>
            <View style={{ paddingTop: 16 }}>
              <TaskForm
                value={form}
                onChange={setForm}
                categories={categories}
                goals={goals}
                use24Hour={settings.use24HourTime}
                weekStart={settings.weekStart}
                allowRecurrence={task.isRecurringTemplate}
              />
            </View>
          </ScreenScroll>
          <View
            style={{
              padding: 16,
              borderTopWidth: StyleSheet.hairlineWidth * 2,
              borderTopColor: c.line,
            }}>
            <Button label="Save changes" full size="lg" loading={saving} onPress={saveEdit} />
          </View>
        </KeyboardAvoidingView>
      </Screen>
    );
  }

  const completed = task.status === 'completed';
  const details: { label: string; value: string }[] = [
    { label: 'Status', value: STATUS_LABELS[task.status] },
    {
      label: 'Date',
      value: task.scheduledDate ? formatRelativeDate(task.scheduledDate) : 'Backlog',
    },
    ...(task.startTime
      ? [{ label: 'Time', value: formatTime(task.startTime, settings.use24HourTime) }]
      : []),
    ...(task.estimatedMinutes
      ? [{ label: 'Estimated', value: formatDuration(task.estimatedMinutes) }]
      : []),
    ...(task.actualMinutes
      ? [{ label: 'Actual', value: formatDuration(task.actualMinutes) }]
      : []),
    { label: 'Priority', value: task.priority },
    ...(category ? [{ label: 'Category', value: category.name }] : []),
    ...(goal ? [{ label: 'Goal', value: goal.title }] : []),
    ...(task.recurrenceRule || task.parentRecurringTaskId
      ? [
          {
            label: 'Repeats',
            value: describeRecurrence(
              task.recurrenceRule ??
                templates.find((t) => t.id === task.parentRecurringTaskId)?.recurrenceRule,
            ),
          },
        ]
      : []),
    ...(task.carryCount
      ? [{ label: 'Rescheduled', value: `${task.carryCount} time${task.carryCount === 1 ? '' : 's'}` }]
      : []),
  ];

  return (
    <Screen>
      <AppHeader
        showBack
        eyebrow={category?.name ?? 'Task'}
        right={
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <IconButton
              icon={task.isTopPriority ? 'bookmark' : 'bookmark'}
              label={task.isTopPriority ? 'Unpin priority' : 'Pin as top priority'}
              active={task.isTopPriority}
              size={40}
              onPress={async () => {
                if (!uid) return;
                try {
                  const pinned = dayTasks.filter((t) => t.isTopPriority).length;
                  await setTopPriority(uid, task.id, !task.isTopPriority, pinned);
                  await load();
                } catch (e) {
                  toast.show(e instanceof Error ? e.message : 'Could not pin.', 'error');
                }
              }}
            />
            <IconButton icon="edit-3" label="Edit task" size={40} onPress={startEdit} />
          </View>
        }
      />

      <ScreenScroll>
        <View style={{ gap: space.md, paddingTop: space.sm }}>
          <Title
            tone="strong"
            style={{ fontSize: 24, lineHeight: 30, textDecorationLine: completed ? 'line-through' : 'none' }}>
            {task.title}
          </Title>

          {task.notes ? <Body tone="muted">{task.notes}</Body> : null}

          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button
              label={completed ? 'Mark not done' : 'Complete'}
              icon={completed ? 'rotate-ccw' : 'check'}
              style={{ flex: 1 }}
              onPress={() => changeStatus(completed ? 'not_started' : 'completed')}
            />
            <Button
              label="Focus"
              icon="play"
              variant="outline"
              style={{ flex: 1 }}
              onPress={startFocus}
            />
          </View>
        </View>

        {task.subtasks.length > 0 ? (
          <View style={{ paddingTop: space.xl }}>
            <SectionHeader
              title="Subtasks"
              meta={`${task.subtasks.filter((s) => s.done).length}/${task.subtasks.length}`}
            />
            <View
              style={{
                borderWidth: StyleSheet.hairlineWidth * 2,
                borderColor: c.line,
                borderRadius: radius.card,
                overflow: 'hidden',
              }}>
              {task.subtasks.map((subtask, i) => (
                <Pressable
                  key={subtask.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: subtask.done }}
                  accessibilityLabel={subtask.title}
                  onPress={async () => {
                    if (!uid) return;
                    await toggleSubtask(uid, task, subtask.id);
                    await load();
                  }}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.md,
                    padding: space.md,
                    backgroundColor: pressed ? c.surface3 : c.surface2,
                    borderTopWidth: i > 0 ? StyleSheet.hairlineWidth * 2 : 0,
                    borderTopColor: c.line,
                  })}>
                  <Icon
                    name={subtask.done ? 'check-square' : 'square'}
                    size={17}
                    color={subtask.done ? accent.base : c.text40}
                  />
                  <Body
                    tone={subtask.done ? 'faint' : 'default'}
                    style={{ flex: 1, textDecorationLine: subtask.done ? 'line-through' : 'none' }}>
                    {subtask.title}
                  </Body>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        <View style={{ paddingTop: space.xl }}>
          <SectionHeader title="Details" />
          <View
            style={{
              borderWidth: StyleSheet.hairlineWidth * 2,
              borderColor: c.line,
              borderRadius: radius.card,
              overflow: 'hidden',
            }}>
            {details.map((detail, i) => (
              <View
                key={detail.label}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: space.md,
                  backgroundColor: c.surface2,
                  borderTopWidth: i > 0 ? StyleSheet.hairlineWidth * 2 : 0,
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

        <View style={{ paddingTop: space.xl, gap: space.md }}>
          <SectionHeader title="Reschedule" />
          <ChipGroup>
            <Chip label="Today" onPress={() => doReschedule(todayKey())} />
            <Chip label="Tomorrow" onPress={() => doReschedule(addDays(todayKey(), 1))} />
            <Chip label="Backlog" onPress={() => doReschedule(null)} />
            <Chip label="Pick date" icon="calendar" onPress={() => setRescheduling(true)} />
          </ChipGroup>
          {rescheduling ? (
            <DateField
              label="New date"
              value={task.scheduledDate}
              onChange={(date) => {
                setRescheduling(false);
                doReschedule(date);
              }}
              weekStart={settings.weekStart}
            />
          ) : null}
        </View>

        <View style={{ paddingTop: space.xl, gap: space.sm }}>
          <SectionHeader title="Actions" />
          <Button
            label="Duplicate"
            icon="copy"
            variant="outline"
            full
            onPress={async () => {
              if (!uid) return;
              await duplicateTask(uid, task);
              toast.show('Duplicated.');
              if (task.scheduledDate) scheduleRecompute(task.scheduledDate);
            }}
          />
          <Button
            label="Skip this task"
            icon="slash"
            variant="outline"
            full
            onPress={() => changeStatus('skipped')}
          />
          <Button
            label="Delete"
            icon="trash-2"
            variant="danger"
            full
            onPress={() => setConfirmDelete(true)}
          />
        </View>

        {task.parentRecurringTaskId || task.isRecurringTemplate ? (
          <View style={{ paddingTop: space.base }}>
            <InlineNote
              icon="repeat"
              text="This task repeats. Deleting can remove just this occurrence or the whole series."
            />
          </View>
        ) : null}
      </ScreenScroll>

      <ConfirmationDialog
        visible={confirmDelete}
        title="Delete task?"
        message={
          task.parentRecurringTaskId || task.isRecurringTemplate
            ? 'This task is part of a repeating series.'
            : 'This cannot be undone.'
        }
        destructive
        confirmLabel={task.isRecurringTemplate ? 'Delete series' : 'Delete'}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => doDelete(!!task.isRecurringTemplate)}
        options={
          task.parentRecurringTaskId && !task.isRecurringTemplate
            ? [
                { label: 'Delete this occurrence only', icon: 'calendar', onPress: () => doDelete(false) },
                { label: 'Delete the whole series', icon: 'repeat', onPress: () => doDelete(true) },
              ]
            : undefined
        }
      />
    </Screen>
  );
}
