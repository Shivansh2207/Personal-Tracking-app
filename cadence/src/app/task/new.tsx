import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { TaskForm, TaskFormValue, emptyTaskForm } from '@/components/tasks/TaskForm';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Feedback';
import { AppHeader, Screen } from '@/components/ui/Layout';
import { toFriendlyError } from '@/services/firebase/errors';
import { scheduleTaskReminder } from '@/services/notificationService';
import { createTask, updateTask } from '@/services/taskService';
import { useAuthStore, useSettings } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { useTheme } from '@/theme/ThemeProvider';
import { isValidDateKey, todayKey } from '@/utils/date';

export default function NewTask() {
  const { c, space } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ date?: string; goalId?: string; categoryId?: string }>();

  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const settings = useSettings();
  const categories = useDataStore((s) => s.categories);
  const goals = useDataStore((s) => s.goals);
  const scheduleRecompute = useDataStore((s) => s.scheduleRecompute);

  const initialDate = isValidDateKey(params.date) ? params.date : todayKey();
  const [form, setForm] = useState<TaskFormValue>(() => ({
    ...emptyTaskForm(initialDate),
    goalId: params.goalId ?? null,
    categoryId: params.categoryId ?? null,
  }));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!uid) return;
    if (!form.title.trim()) {
      toast.show('Give the task a name.', 'error');
      return;
    }
    setSaving(true);
    try {
      const task = await createTask(uid, form);
      if (task.startTime && task.scheduledDate && form.reminderMinutesBefore !== null) {
        const id = await scheduleTaskReminder(task, settings);
        if (id) await updateTask(uid, task.id, { notificationId: id });
      }
      if (task.scheduledDate) scheduleRecompute(task.scheduledDate);
      toast.show('Task added.', 'success');
      router.back();
    } catch (error) {
      toast.show(toFriendlyError(error, 'Could not save that task').message, 'error');
      setSaving(false);
    }
  };

  return (
    <Screen>
      <AppHeader title="New task" eyebrow="Plan" showBack />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={12}>
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled">
          <TaskForm
            value={form}
            onChange={setForm}
            categories={categories}
            goals={goals}
            use24Hour={settings.use24HourTime}
            weekStart={settings.weekStart}
            autoFocus
          />
        </ScrollView>
        <View
          style={{
            padding: 16,
            gap: space.sm,
            borderTopWidth: StyleSheet.hairlineWidth * 2,
            borderTopColor: c.line,
          }}>
          <Button label="Save task" full size="lg" loading={saving} onPress={save} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
