import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, IconButton } from '@/components/ui/Button';
import { Chip, ChipGroup, InlineNote, TextField } from '@/components/ui/Controls';
import { Icon, resolveIcon } from '@/components/ui/Icon';
import { DateField, DurationField, TimeField } from '@/components/ui/Pickers';
import { Body, Caption, Eyebrow } from '@/components/ui/Text';
import { describeRecurrence } from '@/services/analytics/recurrence';
import type { TaskDraft } from '@/services/taskService';
import { useTheme } from '@/theme/ThemeProvider';
import type {
  Category,
  Goal,
  Priority,
  RecurrenceRule,
  RecurrenceType,
  Subtask,
} from '@/types/models';
import { DAY_LABELS_SHORT, todayKey } from '@/utils/date';

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

const RECURRENCE_OPTIONS: { value: RecurrenceType; label: string }[] = [
  { value: 'none', label: 'Never' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekends', label: 'Weekends' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'specific_days', label: 'Custom days' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'interval', label: 'Every N days' },
];

export interface TaskFormValue extends TaskDraft {
  priority: Priority;
  subtasks: Subtask[];
}

interface Props {
  value: TaskFormValue;
  onChange: (next: TaskFormValue) => void;
  categories: Category[];
  goals: Goal[];
  use24Hour?: boolean;
  weekStart?: 0 | 1;
  /** Recurring tasks are stored as a template and cannot be pinned. */
  allowRecurrence?: boolean;
  autoFocus?: boolean;
}

/**
 * Everything except the title is collapsed behind "More options" so a task can
 * be captured in a couple of seconds.
 */
export function TaskForm({
  value,
  onChange,
  categories,
  goals,
  use24Hour,
  weekStart = 1,
  allowRecurrence = true,
  autoFocus,
}: Props) {
  const { c, space, accent } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [subtaskText, setSubtaskText] = useState('');

  const patch = (next: Partial<TaskFormValue>) => onChange({ ...value, ...next });

  const recurrence = value.recurrenceRule;
  const recurrenceType: RecurrenceType = recurrence?.type ?? 'none';

  const activeCategories = useMemo(() => categories.filter((cat) => cat.active), [categories]);
  const activeGoals = useMemo(() => goals.filter((g) => g.status === 'active'), [goals]);

  const setRecurrence = (type: RecurrenceType) => {
    if (type === 'none') {
      patch({ recurrenceRule: null });
      return;
    }
    const base: RecurrenceRule = {
      type,
      startDate: value.scheduledDate ?? todayKey(),
      daysOfWeek: recurrence?.daysOfWeek ?? [new Date().getDay()],
      dayOfMonth: recurrence?.dayOfMonth ?? new Date().getDate(),
      interval: recurrence?.interval ?? 2,
      endDate: recurrence?.endDate ?? null,
    };
    patch({ recurrenceRule: base });
  };

  const toggleWeekday = (day: number) => {
    if (!recurrence) return;
    const days = recurrence.daysOfWeek ?? [];
    const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day];
    patch({ recurrenceRule: { ...recurrence, daysOfWeek: next.sort((a, b) => a - b) } });
  };

  const addSubtask = () => {
    const title = subtaskText.trim();
    if (!title) return;
    patch({
      subtasks: [
        ...value.subtasks,
        { id: `st_${Date.now().toString(36)}_${value.subtasks.length}`, title, done: false },
      ],
    });
    setSubtaskText('');
  };

  return (
    <View style={{ gap: space.lg }}>
      <TextField
        label="Task"
        value={value.title}
        onChangeText={(title) => patch({ title })}
        placeholder="Finish presentation"
        autoFocus={autoFocus}
        returnKeyType="done"
      />

      <View style={{ flexDirection: 'row', gap: space.md }}>
        <DateField
          value={value.scheduledDate}
          onChange={(scheduledDate) => patch({ scheduledDate })}
          weekStart={weekStart}
        />
        <TimeField
          value={value.startTime ?? null}
          onChange={(startTime) => patch({ startTime })}
          use24Hour={use24Hour}
        />
      </View>

      {activeCategories.length > 0 ? (
        <View style={{ gap: space.sm }}>
          <Eyebrow tone="meta">Category</Eyebrow>
          <ChipGroup>
            {activeCategories.map((cat) => (
              <Chip
                key={cat.id}
                label={cat.name}
                icon={resolveIcon(cat.icon)}
                color={cat.color}
                selected={value.categoryId === cat.id}
                onPress={() =>
                  patch({ categoryId: value.categoryId === cat.id ? null : cat.id })
                }
              />
            ))}
          </ChipGroup>
        </View>
      ) : null}

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
        <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={accent.base} />
      </Pressable>

      {expanded ? (
        <View style={{ gap: space.lg }}>
          <View style={{ gap: space.sm }}>
            <Eyebrow tone="meta">Priority</Eyebrow>
            <ChipGroup>
              {PRIORITIES.map((p) => (
                <Chip
                  key={p.value}
                  label={p.label}
                  size="sm"
                  selected={value.priority === p.value}
                  onPress={() => patch({ priority: p.value })}
                />
              ))}
            </ChipGroup>
          </View>

          <DurationField
            label="Estimated time"
            value={value.estimatedMinutes ?? null}
            onChange={(estimatedMinutes) => patch({ estimatedMinutes })}
          />

          {allowRecurrence ? (
            <View style={{ gap: space.sm }}>
              <Eyebrow tone="meta">Repeat</Eyebrow>
              <ChipGroup>
                {RECURRENCE_OPTIONS.map((option) => (
                  <Chip
                    key={option.value}
                    label={option.label}
                    size="sm"
                    selected={recurrenceType === option.value}
                    onPress={() => setRecurrence(option.value)}
                  />
                ))}
              </ChipGroup>

              {recurrenceType === 'specific_days' && recurrence ? (
                <ChipGroup>
                  {DAY_LABELS_SHORT.map((day, index) => (
                    <Chip
                      key={day + index}
                      label={day}
                      size="sm"
                      selected={(recurrence.daysOfWeek ?? []).includes(index)}
                      onPress={() => toggleWeekday(index)}
                    />
                  ))}
                </ChipGroup>
              ) : null}

              {recurrenceType === 'interval' && recurrence ? (
                <TextField
                  label="Every N days"
                  value={String(recurrence.interval ?? 2)}
                  keyboardType="number-pad"
                  onChangeText={(text) =>
                    patch({
                      recurrenceRule: {
                        ...recurrence,
                        interval: Math.max(1, Number(text) || 1),
                      },
                    })
                  }
                />
              ) : null}

              {recurrenceType !== 'none' ? (
                <InlineNote
                  icon="repeat"
                  text={`${describeRecurrence(recurrence)}. Occurrences are generated as needed — completing one day never completes the rest.`}
                />
              ) : null}
            </View>
          ) : null}

          {activeGoals.length > 0 ? (
            <View style={{ gap: space.sm }}>
              <Eyebrow tone="meta">Linked goal</Eyebrow>
              <ChipGroup>
                {activeGoals.map((goal) => (
                  <Chip
                    key={goal.id}
                    label={goal.title}
                    size="sm"
                    selected={value.goalId === goal.id}
                    onPress={() => patch({ goalId: value.goalId === goal.id ? null : goal.id })}
                  />
                ))}
              </ChipGroup>
            </View>
          ) : null}

          <View style={{ gap: space.sm }}>
            <Eyebrow tone="meta">Subtasks</Eyebrow>
            {value.subtasks.map((subtask) => (
              <View
                key={subtask.id}
                style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <Icon name="corner-down-right" size={14} color={c.text30} />
                <Body style={{ flex: 1 }}>{subtask.title}</Body>
                <IconButton
                  icon="x"
                  label={`Remove ${subtask.title}`}
                  size={34}
                  bordered={false}
                  onPress={() =>
                    patch({ subtasks: value.subtasks.filter((s) => s.id !== subtask.id) })
                  }
                />
              </View>
            ))}
            <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-end' }}>
              <TextField
                containerStyle={{ flex: 1 }}
                value={subtaskText}
                onChangeText={setSubtaskText}
                placeholder="Add a step"
                onSubmitEditing={addSubtask}
                returnKeyType="done"
              />
              <IconButton icon="plus" label="Add subtask" size={48} onPress={addSubtask} />
            </View>
          </View>

          <TextField
            label="Notes"
            value={value.notes ?? ''}
            onChangeText={(notes) => patch({ notes })}
            placeholder="Anything worth remembering"
            multiline
          />

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
                  selected={(value.reminderMinutesBefore ?? null) === minutes}
                  onPress={() => patch({ reminderMinutesBefore: minutes })}
                />
              ))}
            </ChipGroup>
            {!value.startTime && value.reminderMinutesBefore !== null ? (
              <Caption tone="faint">Set a time for the reminder to fire.</Caption>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

export function emptyTaskForm(scheduledDate: string | null): TaskFormValue {
  return {
    title: '',
    description: null,
    categoryId: null,
    goalId: null,
    scheduledDate,
    startTime: null,
    endTime: null,
    estimatedMinutes: null,
    priority: 'medium',
    isTopPriority: false,
    recurrenceRule: null,
    subtasks: [],
    notes: null,
    reminderMinutesBefore: null,
  };
}

export { Button };
