import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Chip, ChipGroup, InlineNote, TextField } from '@/components/ui/Controls';
import { useToast } from '@/components/ui/Feedback';
import { resolveIcon } from '@/components/ui/Icon';
import { AppHeader, Screen, ScreenScroll } from '@/components/ui/Layout';
import { DateField } from '@/components/ui/Pickers';
import { Caption, Eyebrow } from '@/components/ui/Text';
import { toFriendlyError } from '@/services/firebase/errors';
import { PROGRESS_TYPE_LABELS, createGoal } from '@/services/goalService';
import { requestPermissions, scheduleGoalDeadline } from '@/services/notificationService';
import { useAuthStore, useSettings } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { useTheme } from '@/theme/ThemeProvider';
import type { GoalProgressType } from '@/types/models';
import { todayKey } from '@/utils/date';

const PROGRESS_TYPES: GoalProgressType[] = ['manual', 'tasks', 'habits', 'topics', 'numeric'];

const PROGRESS_HINTS: Record<GoalProgressType, string> = {
  manual: 'You set the percentage yourself.',
  tasks: 'Progress = completed tasks linked to this goal.',
  habits: 'Progress = consistency of the linked habits since the start date.',
  topics: 'Progress = syllabus completion across the linked subjects.',
  numeric: 'Progress = current value against a numeric target.',
};

export default function NewGoal() {
  const { c, space } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const settings = useSettings();
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const categories = useDataStore((s) => s.categories);
  const habits = useDataStore((s) => s.habits);
  const subjects = useDataStore((s) => s.subjects);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [progressType, setProgressType] = useState<GoalProgressType>('manual');
  const [targetValue, setTargetValue] = useState('');
  const [targetDate, setTargetDate] = useState<string | null>(null);
  const [linkedHabitIds, setLinkedHabitIds] = useState<string[]>([]);
  const [linkedSubjectIds, setLinkedSubjectIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const toggle = (list: string[], set: (v: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const save = async () => {
    if (!uid) return;
    if (!title.trim()) {
      toast.show('Give the goal a title.', 'error');
      return;
    }
    setSaving(true);
    try {
      const goal = await createGoal(uid, {
        title,
        description: description.trim() || null,
        categoryId,
        progressType,
        targetValue: progressType === 'numeric' ? Number(targetValue) || null : null,
        targetDate,
        startDate: todayKey(),
        linkedHabitIds: progressType === 'habits' ? linkedHabitIds : [],
        linkedSubjectIds: progressType === 'topics' ? linkedSubjectIds : [],
      });

      if (targetDate) {
        const permission = await requestPermissions();
        if (permission === 'granted') await scheduleGoalDeadline(goal, settings);
      }

      toast.show('Goal created.', 'success');
      router.replace(`/goal/${goal.id}`);
    } catch (error) {
      toast.show(toFriendlyError(error, 'Could not create the goal').message, 'error');
      setSaving(false);
    }
  };

  return (
    <Screen>
      <AppHeader title="New goal" eyebrow="Track" showBack />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScreenScroll bottomInset={40}>
          <View style={{ gap: space.lg, paddingTop: space.sm }}>
            <TextField
              label="Goal"
              value={title}
              onChangeText={setTitle}
              placeholder="Complete Quant syllabus by September"
              autoFocus
            />

            <TextField
              label="Why it matters"
              value={description}
              onChangeText={setDescription}
              placeholder="Optional"
              multiline
            />

            {categories.filter((cat) => cat.active).length > 0 ? (
              <View style={{ gap: space.sm }}>
                <Eyebrow tone="meta">Category</Eyebrow>
                <ChipGroup>
                  {categories
                    .filter((cat) => cat.active)
                    .map((cat) => (
                      <Chip
                        key={cat.id}
                        label={cat.name}
                        color={cat.color}
                        icon={resolveIcon(cat.icon)}
                        selected={categoryId === cat.id}
                        onPress={() => setCategoryId(categoryId === cat.id ? null : cat.id)}
                      />
                    ))}
                </ChipGroup>
              </View>
            ) : null}

            <View style={{ gap: space.sm }}>
              <Eyebrow tone="meta">How is progress measured?</Eyebrow>
              <ChipGroup>
                {PROGRESS_TYPES.map((type) => (
                  <Chip
                    key={type}
                    label={PROGRESS_TYPE_LABELS[type]}
                    size="sm"
                    selected={progressType === type}
                    onPress={() => setProgressType(type)}
                  />
                ))}
              </ChipGroup>
              <Caption tone="faint">{PROGRESS_HINTS[progressType]}</Caption>
            </View>

            {progressType === 'numeric' ? (
              <TextField
                label="Target value"
                value={targetValue}
                onChangeText={setTargetValue}
                keyboardType="number-pad"
                placeholder="e.g. 3 projects"
              />
            ) : null}

            {progressType === 'habits' ? (
              habits.filter((h) => h.active).length === 0 ? (
                <InlineNote text="Create a habit first to measure this goal from habits." />
              ) : (
                <View style={{ gap: space.sm }}>
                  <Eyebrow tone="meta">Linked habits</Eyebrow>
                  <ChipGroup>
                    {habits
                      .filter((h) => h.active)
                      .map((habit) => (
                        <Chip
                          key={habit.id}
                          label={habit.name}
                          size="sm"
                          selected={linkedHabitIds.includes(habit.id)}
                          onPress={() => toggle(linkedHabitIds, setLinkedHabitIds, habit.id)}
                        />
                      ))}
                  </ChipGroup>
                </View>
              )
            ) : null}

            {progressType === 'topics' ? (
              subjects.length === 0 ? (
                <InlineNote text="Create a subject first to measure this goal from a syllabus." />
              ) : (
                <View style={{ gap: space.sm }}>
                  <Eyebrow tone="meta">Linked subjects</Eyebrow>
                  <ChipGroup>
                    {subjects.map((subject) => (
                      <Chip
                        key={subject.id}
                        label={subject.name}
                        size="sm"
                        color={subject.color}
                        selected={linkedSubjectIds.includes(subject.id)}
                        onPress={() => toggle(linkedSubjectIds, setLinkedSubjectIds, subject.id)}
                      />
                    ))}
                  </ChipGroup>
                </View>
              )
            ) : null}

            {progressType === 'tasks' ? (
              <InlineNote
                icon="link"
                text="Link tasks to this goal from the task screen. Progress updates as those tasks are completed."
              />
            ) : null}

            <DateField
              label="Target date"
              value={targetDate}
              onChange={setTargetDate}
              weekStart={settings.weekStart}
              clearLabel="No target date"
            />
          </View>
        </ScreenScroll>
        <View
          style={{
            padding: 16,
            borderTopWidth: StyleSheet.hairlineWidth * 2,
            borderTopColor: c.line,
          }}>
          <Button label="Create goal" full size="lg" loading={saving} onPress={save} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
