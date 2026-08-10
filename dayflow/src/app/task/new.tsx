import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Button, IconButton } from '@/components/ui/Button';
import { Chip, ChipGroup, InlineNote, TextField } from '@/components/ui/Controls';
import { useToast } from '@/components/ui/Feedback';
import { Icon, resolveIcon } from '@/components/ui/Icon';
import { AppHeader, Screen, ScreenScroll } from '@/components/ui/Layout';
import { DateField, DurationField, TimeField } from '@/components/ui/Pickers';
import { Caption, Eyebrow } from '@/components/ui/Text';
import { describeSchedule } from '@/services/recurrence';
import { toFriendlyError } from '@/services/firebase/errors';
import { requestPermissions, scheduleTaskReminder } from '@/services/notificationService';
import { createTask, updateTask } from '@/services/taskService';
import { useAuthStore, useSettings } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { useTheme } from '@/theme/ThemeProvider';
import type { Priority, ScheduleRule, ScheduleType } from '@/types/models';
import { DAY_LABELS_SHORT, isValidDateKey, todayKey } from '@/utils/date';

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

const RECURRENCE_OPTIONS: { value: ScheduleType | 'none'; label: string }[] = [
  { value: 'none', label: 'Never' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekends', label: 'Weekends' },
  { value: 'specific_days', label: 'Specific days' },
  { value: 'every_n_weeks', label: 'Every N weeks' },
  { value: 'monthly_day', label: 'Monthly' },
  { value: 'monthly_nth_weekday', label: 'Nth weekday' },
];

/**
 * Task capture. Only the title is required — everything else is collapsed
 * behind "More options" so a task can be saved in a couple of seconds.
 */
export default function NewTask() {
  const { c, space, accent } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const settings = useSettings();
  const params = useLocalSearchParams<{ date?: string; backlog?: string; recurring?: string }>();

  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const categories = useDataStore((s) => s.categories);
  const scheduleRecompute = useDataStore((s) => s.scheduleRecompute);

  const [title, setTitle] = useState('');
  const [dateKey, setDateKey] = useState<string | null>(
    params.backlog === '1' ? null : isValidDateKey(params.date) ? params.date : todayKey(),
  );
  const [startTime, setStartTime] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [priority, setPriority] = useState<Priority>('normal');
  const [deadline, setDeadline] = useState<string | null>(null);
  const [estimatedMinutes, setEstimatedMinutes] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [reminderMinutes, setReminderMinutes] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(params.recurring === '1');

  const [recurrenceType, setRecurrenceType] = useState<ScheduleType | 'none'>(
    params.recurring === '1' ? 'weekdays' : 'none',
  );
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1, 4]);
  const [interval, setInterval] = useState('2');
  const [saving, setSaving] = useState(false);

  const buildRecurrence = (): ScheduleRule | null => {
    if (recurrenceType === 'none') return null;
    const start = dateKey ?? todayKey();
    const anchor = new Date(start);
    return {
      type: recurrenceType,
      startDate: start,
      daysOfWeek:
        recurrenceType === 'specific_days' || recurrenceType === 'every_n_weeks'
          ? daysOfWeek
          : undefined,
      interval: recurrenceType === 'every_n_weeks' ? Math.max(1, Number(interval) || 1) : undefined,
      dayOfMonth: recurrenceType === 'monthly_day' ? anchor.getDate() : undefined,
      nth: recurrenceType === 'monthly_nth_weekday' ? 1 : undefined,
      weekday: recurrenceType === 'monthly_nth_weekday' ? anchor.getDay() : undefined,
      endDate: null,
    };
  };

  const save = async () => {
    if (!uid) return;
    if (!title.trim()) {
      toast.show('Give the task a name.', 'error');
      return;
    }
    setSaving(true);
    try {
      const recurrence = buildRecurrence();
      const task = await createTask(uid, {
        title,
        dateKey: recurrence ? null : dateKey,
        startTime,
        categoryId,
        priority,
        deadline,
        estimatedMinutes,
        notes: notes.trim() || null,
        reminderMinutesBefore: reminderMinutes,
        recurrence,
      });

      if (!recurrence && task.startTime && task.dateKey && reminderMinutes !== null) {
        const permission = await requestPermissions();
        if (permission === 'granted') {
          const notificationId = await scheduleTaskReminder(task, settings);
          if (notificationId) await updateTask(uid, task.id, { notificationId });
        }
      }
      if (task.dateKey) scheduleRecompute(task.dateKey);
      toast.show('Task added.', 'success');
      router.back();
    } catch (error) {
      toast.show(toFriendlyError(error, 'Could not save the task').message, 'error');
      setSaving(false);
    }
  };

  return (
    <Screen>
      <AppHeader title="New task" eyebrow="Plan" showBack />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScreenScroll bottomInset={40}>
          <View style={{ gap: space.lg, paddingTop: space.sm }}>
            <TextField
              label="Task"
              value={title}
              onChangeText={setTitle}
              placeholder="Submit DBMS assignment"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={save}
            />

            <View style={{ flexDirection: 'row', gap: space.md }}>
              <DateField
                value={dateKey}
                onChange={setDateKey}
                weekStart={settings.weekStart}
                clearLabel="Backlog"
              />
              <TimeField
                value={startTime}
                onChange={setStartTime}
                use24Hour={settings.use24HourTime}
              />
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              accessibilityLabel={expanded ? 'Hide more options' : 'Show more options'}
              onPress={() => setExpanded((v) => !v)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.sm,
                paddingVertical: space.md,
                borderTopWidth: StyleSheet.hairlineWidth * 2,
                borderTopColor: c.line,
              }}>
              <Eyebrow color={accent.base} style={{ flex: 1 }}>
                {expanded ? 'Fewer options' : 'More options'}
              </Eyebrow>
              <Icon
                name={expanded ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={accent.base}
              />
            </Pressable>

            {expanded ? (
              <View style={{ gap: space.lg }}>
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
                  <Eyebrow tone="meta">Priority</Eyebrow>
                  <ChipGroup>
                    {PRIORITIES.map((p) => (
                      <Chip
                        key={p.value}
                        label={p.label}
                        size="sm"
                        selected={priority === p.value}
                        onPress={() => setPriority(p.value)}
                      />
                    ))}
                  </ChipGroup>
                </View>

                <View style={{ flexDirection: 'row', gap: space.md }}>
                  <DateField
                    label="Deadline"
                    value={deadline}
                    onChange={setDeadline}
                    weekStart={settings.weekStart}
                    clearLabel="No deadline"
                  />
                  <DurationField
                    label="Estimate"
                    value={estimatedMinutes}
                    onChange={setEstimatedMinutes}
                  />
                </View>

                <View style={{ gap: space.sm }}>
                  <Eyebrow tone="meta">Repeat</Eyebrow>
                  <ChipGroup>
                    {RECURRENCE_OPTIONS.map((option) => (
                      <Chip
                        key={option.value}
                        label={option.label}
                        size="sm"
                        selected={recurrenceType === option.value}
                        onPress={() => setRecurrenceType(option.value)}
                      />
                    ))}
                  </ChipGroup>

                  {recurrenceType === 'specific_days' || recurrenceType === 'every_n_weeks' ? (
                    <ChipGroup>
                      {DAY_LABELS_SHORT.map((day, index) => (
                        <Chip
                          key={`${day}-${index}`}
                          label={day}
                          size="sm"
                          selected={daysOfWeek.includes(index)}
                          onPress={() =>
                            setDaysOfWeek((prev) =>
                              prev.includes(index)
                                ? prev.filter((d) => d !== index)
                                : [...prev, index].sort((a, b) => a - b),
                            )
                          }
                        />
                      ))}
                    </ChipGroup>
                  ) : null}

                  {recurrenceType === 'every_n_weeks' ? (
                    <TextField
                      label="Every N weeks"
                      value={interval}
                      onChangeText={setInterval}
                      keyboardType="number-pad"
                    />
                  ) : null}

                  {recurrenceType !== 'none' ? (
                    <InlineNote
                      icon="rotate-cw"
                      text={`${describeSchedule(buildRecurrence())}. Occurrences are generated as needed — completing one never completes the rest.`}
                    />
                  ) : null}
                </View>

                <View style={{ gap: space.sm }}>
                  <Eyebrow tone="meta">Reminder</Eyebrow>
                  <ChipGroup>
                    {[null, 0, 5, 15, 30, 60].map((minutes) => (
                      <Chip
                        key={String(minutes)}
                        size="sm"
                        label={
                          minutes === null
                            ? 'None'
                            : minutes === 0
                              ? 'At start'
                              : `${minutes} min before`
                        }
                        selected={reminderMinutes === minutes}
                        onPress={() => setReminderMinutes(minutes)}
                      />
                    ))}
                  </ChipGroup>
                  {!startTime && reminderMinutes !== null ? (
                    <Caption tone="faint">Set a time for the reminder to fire.</Caption>
                  ) : null}
                </View>

                <TextField
                  label="Notes"
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Anything worth remembering"
                  multiline
                />
              </View>
            ) : null}
          </View>
        </ScreenScroll>

        <View
          style={{
            padding: 16,
            borderTopWidth: StyleSheet.hairlineWidth * 2,
            borderTopColor: c.line,
          }}>
          <Button label="Save task" full size="lg" loading={saving} onPress={save} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
