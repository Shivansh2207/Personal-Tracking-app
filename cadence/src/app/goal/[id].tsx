import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { TaskRow } from '@/components/tasks/TaskCard';
import { Button, IconButton } from '@/components/ui/Button';
import { Chip, ChipGroup, TextField } from '@/components/ui/Controls';
import { ConfirmationDialog, useToast } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { AppHeader, Screen, ScreenScroll, SectionHeader } from '@/components/ui/Layout';
import { ProgressRing } from '@/components/ui/Progress';
import { ErrorState, SkeletonCard } from '@/components/ui/States';
import { Body, Caption, Eyebrow, Metric, Title } from '@/components/ui/Text';
import { toFriendlyError } from '@/services/firebase/errors';
import {
  PROGRESS_TYPE_LABELS,
  deleteGoal,
  fetchGoal,
  recalculateGoalProgress,
  setGoalStatus,
  toggleMilestone,
  updateGoal,
} from '@/services/goalService';
import { fetchHabitLogsInRange } from '@/services/habitService';
import { fetchTasksForGoal } from '@/services/taskService';
import { useAuthStore, useSettings } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { useTheme } from '@/theme/ThemeProvider';
import type { Goal, Task } from '@/types/models';
import { diffDays, formatRelativeDate, todayKey } from '@/utils/date';

export default function GoalDetail() {
  const { c, space, accent, semantic, radius } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const settings = useSettings();
  const params = useLocalSearchParams<{ id: string }>();
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const categories = useDataStore((s) => s.categories);
  const habits = useDataStore((s) => s.habits);
  const subjects = useDataStore((s) => s.subjects);

  const [goal, setGoal] = useState<Goal | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [manualValue, setManualValue] = useState('');
  const [milestoneText, setMilestoneText] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const today = todayKey();

  const load = useCallback(async () => {
    if (!uid || !params.id) return;
    setLoading(true);
    setError(null);
    try {
      const fetched = await fetchGoal(uid, params.id);
      if (!fetched) {
        setError('This goal no longer exists.');
        return;
      }
      setGoal(fetched);
      setManualValue(
        fetched.progressType === 'numeric'
          ? String(fetched.currentValue)
          : String(fetched.progress),
      );

      const linkedTasks = await fetchTasksForGoal(uid, fetched.id).catch(() => [] as Task[]);
      setTasks(linkedTasks.filter((t) => !t.isRecurringTemplate));

      // Recompute derived progress so the number is never stale.
      if (fetched.progressType !== 'manual' && fetched.progressType !== 'numeric') {
        const habitLogs =
          fetched.progressType === 'habits'
            ? await fetchHabitLogsInRange(uid, fetched.startDate, today).catch(() => [])
            : [];
        const progress = await recalculateGoalProgress(uid, fetched, {
          habits,
          habitLogs,
          weekStart: settings.weekStart,
        });
        setGoal({ ...fetched, progress });
      }
    } catch (e) {
      setError(toFriendlyError(e, 'Could not load the goal').message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, params.id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !goal) {
    return (
      <Screen>
        <AppHeader showBack title="Goal" />
        <View style={{ padding: 16, gap: 12 }}>
          <SkeletonCard lines={3} />
        </View>
      </Screen>
    );
  }

  if (error || !goal) {
    return (
      <Screen>
        <AppHeader showBack title="Goal" />
        <View style={{ padding: 16 }}>
          <ErrorState message={error ?? 'Goal not found.'} onRetry={load} />
        </View>
      </Screen>
    );
  }

  const category = categories.find((cat) => cat.id === goal.categoryId);
  const daysLeft = goal.targetDate ? diffDays(today, goal.targetDate) : null;
  const completedTasks = tasks.filter((t) => t.status === 'completed').length;

  const saveManual = async () => {
    if (!uid) return;
    const parsed = Number(manualValue);
    if (!Number.isFinite(parsed)) return;
    try {
      if (goal.progressType === 'numeric') {
        const progress = goal.targetValue
          ? Math.max(0, Math.min(100, Math.round((parsed / goal.targetValue) * 100)))
          : goal.progress;
        await updateGoal(uid, goal.id, { currentValue: parsed, progress });
      } else {
        await updateGoal(uid, goal.id, {
          progress: Math.max(0, Math.min(100, Math.round(parsed))),
        });
      }
      await load();
      toast.show('Progress updated.');
    } catch (e) {
      toast.show(toFriendlyError(e, 'Could not update progress').message, 'error');
    }
  };

  const addMilestone = async () => {
    if (!uid || !milestoneText.trim()) return;
    await updateGoal(uid, goal.id, {
      milestones: [
        ...goal.milestones,
        { id: `ms_${Date.now().toString(36)}`, title: milestoneText.trim(), done: false },
      ],
    });
    setMilestoneText('');
    await load();
  };

  return (
    <Screen>
      <AppHeader
        showBack
        eyebrow={category?.name ?? 'Goal'}
        title={goal.title}
        right={
          <IconButton
            icon="trash-2"
            label="Delete goal"
            size={40}
            onPress={() => setConfirmDelete(true)}
          />
        }
      />

      <ScreenScroll>
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
            <ProgressRing value={goal.progress} size={96} thickness={7}>
              <Metric tone="strong">{goal.progress}</Metric>
            </ProgressRing>
            <View style={{ flex: 1, gap: 6 }}>
              <Eyebrow tone="faint">{PROGRESS_TYPE_LABELS[goal.progressType]}</Eyebrow>
              <Title tone="strong" style={{ textTransform: 'capitalize' }}>
                {goal.status}
              </Title>
              {goal.targetDate ? (
                <Caption
                  color={daysLeft !== null && daysLeft < 0 ? semantic.warning : undefined}
                  tone="faint">
                  {daysLeft !== null && daysLeft >= 0
                    ? `${daysLeft} day${daysLeft === 1 ? '' : 's'} left · ${formatRelativeDate(goal.targetDate)}`
                    : `Target date passed (${formatRelativeDate(goal.targetDate)})`}
                </Caption>
              ) : (
                <Caption tone="faint">No target date</Caption>
              )}
            </View>
          </View>

          {goal.description ? <Body tone="muted">{goal.description}</Body> : null}

          {goal.progressType === 'manual' || goal.progressType === 'numeric' ? (
            <View style={{ gap: space.sm }}>
              <SectionHeader title="Update progress" />
              <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-end' }}>
                <TextField
                  containerStyle={{ flex: 1 }}
                  label={goal.progressType === 'numeric' ? 'Current value' : 'Percent complete'}
                  value={manualValue}
                  onChangeText={setManualValue}
                  keyboardType="number-pad"
                  hint={
                    goal.progressType === 'numeric' && goal.targetValue
                      ? `Target: ${goal.targetValue}`
                      : undefined
                  }
                />
                <Button label="Save" onPress={saveManual} style={{ marginBottom: 2 }} />
              </View>
            </View>
          ) : null}

          {goal.progressType === 'tasks' ? (
            <View>
              <SectionHeader
                title="Linked tasks"
                meta={`${completedTasks}/${tasks.length}`}
                action={{
                  label: 'Add',
                  icon: 'plus',
                  onPress: () => router.push(`/task/new?goalId=${goal.id}`),
                }}
              />
              {tasks.length === 0 ? (
                <Body tone="faint" style={{ fontSize: 13 }}>
                  No tasks linked yet. Add one and this goal starts moving on its own.
                </Body>
              ) : (
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
                        category={categories.find((cat) => cat.id === task.categoryId)}
                        onPress={() => router.push(`/task/${encodeURIComponent(task.id)}`)}
                      />
                    </View>
                  ))}
                </View>
              )}
            </View>
          ) : null}

          {goal.progressType === 'habits' && goal.linkedHabitIds.length > 0 ? (
            <View style={{ gap: space.sm }}>
              <SectionHeader title="Linked habits" />
              <ChipGroup>
                {goal.linkedHabitIds.map((id) => {
                  const habit = habits.find((h) => h.id === id);
                  if (!habit) return null;
                  return (
                    <Chip
                      key={id}
                      label={habit.name}
                      size="sm"
                      onPress={() => router.push(`/habit/${id}`)}
                    />
                  );
                })}
              </ChipGroup>
            </View>
          ) : null}

          {goal.progressType === 'topics' && goal.linkedSubjectIds.length > 0 ? (
            <View style={{ gap: space.sm }}>
              <SectionHeader title="Linked subjects" />
              <ChipGroup>
                {goal.linkedSubjectIds.map((id) => {
                  const subject = subjects.find((s) => s.id === id);
                  if (!subject) return null;
                  return (
                    <Chip
                      key={id}
                      label={subject.name}
                      size="sm"
                      color={subject.color}
                      onPress={() => router.push(`/subject/${id}`)}
                    />
                  );
                })}
              </ChipGroup>
            </View>
          ) : null}

          <View>
            <SectionHeader title="Milestones" meta={`${goal.milestones.filter((m) => m.done).length}/${goal.milestones.length}`} />
            <View style={{ gap: space.sm }}>
              {goal.milestones.map((milestone) => (
                <Pressable
                  key={milestone.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: milestone.done }}
                  accessibilityLabel={milestone.title}
                  onPress={async () => {
                    if (!uid) return;
                    await toggleMilestone(uid, goal, milestone.id);
                    await load();
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.md,
                    padding: space.md,
                    borderWidth: StyleSheet.hairlineWidth * 2,
                    borderColor: c.line,
                    borderRadius: radius.card,
                  }}>
                  <Icon
                    name={milestone.done ? 'check-square' : 'square'}
                    size={16}
                    color={milestone.done ? accent.base : c.text40}
                  />
                  <Body
                    style={{
                      flex: 1,
                      textDecorationLine: milestone.done ? 'line-through' : 'none',
                    }}
                    tone={milestone.done ? 'faint' : 'default'}>
                    {milestone.title}
                  </Body>
                </Pressable>
              ))}
              <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-end' }}>
                <TextField
                  containerStyle={{ flex: 1 }}
                  value={milestoneText}
                  onChangeText={setMilestoneText}
                  placeholder="Add a milestone"
                  onSubmitEditing={addMilestone}
                  returnKeyType="done"
                />
                <IconButton icon="plus" label="Add milestone" size={48} onPress={addMilestone} />
              </View>
            </View>
          </View>

          <View style={{ gap: space.sm }}>
            <SectionHeader title="Manage" />
            {goal.status === 'active' ? (
              <>
                <Button
                  label="Mark complete"
                  icon="check"
                  full
                  onPress={async () => {
                    if (!uid) return;
                    await setGoalStatus(uid, goal.id, 'completed');
                    await load();
                    toast.show('Goal completed.', 'success');
                  }}
                />
                <Button
                  label="Pause goal"
                  icon="pause"
                  variant="outline"
                  full
                  onPress={async () => {
                    if (!uid) return;
                    await setGoalStatus(uid, goal.id, 'paused');
                    await load();
                  }}
                />
              </>
            ) : (
              <Button
                label="Reactivate goal"
                icon="rotate-ccw"
                variant="outline"
                full
                onPress={async () => {
                  if (!uid) return;
                  await setGoalStatus(uid, goal.id, 'active');
                  await load();
                }}
              />
            )}
            <Button
              label="Delete goal"
              icon="trash-2"
              variant="danger"
              full
              onPress={() => setConfirmDelete(true)}
            />
          </View>
        </View>
      </ScreenScroll>

      <ConfirmationDialog
        visible={confirmDelete}
        title="Delete this goal?"
        message={
          tasks.length > 0
            ? `${tasks.length} linked task${tasks.length === 1 ? '' : 's'} will be kept but unlinked.`
            : 'This cannot be undone.'
        }
        destructive
        confirmLabel="Delete"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          if (!uid) return;
          await deleteGoal(uid, goal.id);
          setConfirmDelete(false);
          toast.show('Goal deleted.');
          router.back();
        }}
      />
    </Screen>
  );
}
