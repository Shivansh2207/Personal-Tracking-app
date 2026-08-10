import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Chip, ChipGroup, InlineNote, TextField } from '@/components/ui/Controls';
import { TimeField } from '@/components/ui/Pickers';
import { Caption, Eyebrow } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import type { ScheduleRule, TimeString, TrackingType } from '@/types/models';
import { TRACKING_TYPE_LABELS } from '@/types/models';
import { DAY_LABELS_SHORT } from '@/utils/date';

export interface TrackingConfig {
  trackingType: TrackingType;
  targetValue: number | null;
  unit: string | null;
  targetTime: TimeString | null;
  schedule: ScheduleRule;
  preferredTime: TimeString | null;
}

interface Props {
  visible: boolean;
  title: string;
  value: TrackingConfig;
  onClose: () => void;
  onSave: (next: TrackingConfig) => void;
  use24Hour?: boolean;
  /** `numeric` is hidden during onboarding to keep the flow short. */
  allowNumeric?: boolean;
}

const TYPES: TrackingType[] = ['check', 'count', 'duration', 'time', 'session'];

const SCHEDULE_OPTIONS: { value: ScheduleRule['type']; label: string }[] = [
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekends', label: 'Weekends' },
  { value: 'specific_days', label: 'Specific days' },
  { value: 'times_per_week', label: 'X per week' },
  { value: 'times_per_month', label: 'X per month' },
  { value: 'every_n_days', label: 'Every N days' },
];

/**
 * How a routine is measured and when it is owed. Keeping these two questions
 * together is what makes "Gym, 4× per week" and "Maths practice, Wed + Sat"
 * both expressible without inventing separate concepts.
 */
export function TrackingTypeSheet({
  visible,
  title,
  value,
  onClose,
  onSave,
  use24Hour,
  allowNumeric = false,
}: Props) {
  const { space } = useTheme();
  const [draft, setDraft] = useState<TrackingConfig>(value);
  const [targetText, setTargetText] = useState(String(value.targetValue ?? ''));
  const [timesText, setTimesText] = useState(String(value.schedule.times ?? 4));
  const [intervalText, setIntervalText] = useState(String(value.schedule.interval ?? 2));

  useEffect(() => {
    if (visible) {
      setDraft(value);
      setTargetText(value.targetValue !== null ? String(value.targetValue) : '');
      setTimesText(String(value.schedule.times ?? 4));
      setIntervalText(String(value.schedule.interval ?? 2));
    }
  }, [visible, value]);

  const types = allowNumeric ? [...TYPES, 'numeric' as TrackingType] : TYPES;

  const setType = (trackingType: TrackingType) => {
    setDraft((prev) => {
      const next: TrackingConfig = { ...prev, trackingType };
      // Session routines are inherently flexible; time routines need a target.
      if (trackingType === 'session' && !isFlexible(prev.schedule.type)) {
        next.schedule = { ...prev.schedule, type: 'times_per_week', times: 4 };
      }
      if (trackingType === 'time' && !prev.targetTime) next.targetTime = '07:00';
      if (trackingType === 'count' && prev.targetValue === null) next.targetValue = 10;
      if (trackingType === 'duration' && prev.targetValue === null) next.targetValue = 30;
      return next;
    });
  };

  const setScheduleType = (type: ScheduleRule['type']) => {
    setDraft((prev) => ({
      ...prev,
      schedule: {
        ...prev.schedule,
        type,
        daysOfWeek: prev.schedule.daysOfWeek ?? [1, 3, 5],
        times: prev.schedule.times ?? 4,
        interval: prev.schedule.interval ?? 2,
      },
    }));
  };

  const toggleDay = (day: number) => {
    setDraft((prev) => {
      const days = prev.schedule.daysOfWeek ?? [];
      const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day];
      return { ...prev, schedule: { ...prev.schedule, daysOfWeek: next.sort((a, b) => a - b) } };
    });
  };

  const save = () => {
    const parsedTarget = Number(targetText);
    const next: TrackingConfig = {
      ...draft,
      targetValue:
        draft.trackingType === 'count' || draft.trackingType === 'duration'
          ? Number.isFinite(parsedTarget) && parsedTarget > 0
            ? Math.round(parsedTarget)
            : 1
          : null,
      unit:
        draft.trackingType === 'duration'
          ? 'min'
          : draft.trackingType === 'count'
            ? (draft.unit ?? null)
            : draft.unit,
      schedule: {
        ...draft.schedule,
        times: Math.max(1, Number(timesText) || 1),
        interval: Math.max(1, Number(intervalText) || 1),
      },
    };
    onSave(next);
    onClose();
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={title}
      eyebrow="How do you want to track it?"
      footer={<Button label="Save" full onPress={save} />}>
      <View style={{ gap: space.lg, paddingBottom: space.base }}>
        <View style={{ gap: space.sm }}>
          <Eyebrow tone="meta">Tracking</Eyebrow>
          <ChipGroup>
            {types.map((type) => (
              <Chip
                key={type}
                label={TRACKING_TYPE_LABELS[type]}
                size="sm"
                selected={draft.trackingType === type}
                onPress={() => setType(type)}
              />
            ))}
          </ChipGroup>
        </View>

        {draft.trackingType === 'count' ? (
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <TextField
              containerStyle={{ flex: 1 }}
              label="Target"
              value={targetText}
              onChangeText={setTargetText}
              keyboardType="number-pad"
              placeholder="20"
            />
            <TextField
              containerStyle={{ flex: 1 }}
              label="Unit"
              value={draft.unit ?? ''}
              onChangeText={(unit) => setDraft((p) => ({ ...p, unit }))}
              placeholder="pages"
            />
          </View>
        ) : null}

        {draft.trackingType === 'duration' ? (
          <TextField
            label="Target minutes"
            value={targetText}
            onChangeText={setTargetText}
            keyboardType="number-pad"
            placeholder="30"
          />
        ) : null}

        {draft.trackingType === 'time' ? (
          <TimeField
            label="Target time"
            value={draft.targetTime}
            onChange={(targetTime) => setDraft((p) => ({ ...p, targetTime }))}
            allowClear={false}
            use24Hour={use24Hour}
          />
        ) : null}

        <View style={{ gap: space.sm }}>
          <Eyebrow tone="meta">Schedule</Eyebrow>
          <ChipGroup>
            {SCHEDULE_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                size="sm"
                selected={draft.schedule.type === option.value}
                onPress={() => setScheduleType(option.value)}
              />
            ))}
          </ChipGroup>

          {draft.schedule.type === 'specific_days' ? (
            <ChipGroup>
              {DAY_LABELS_SHORT.map((day, index) => (
                <Chip
                  key={`${day}-${index}`}
                  label={day}
                  size="sm"
                  selected={(draft.schedule.daysOfWeek ?? []).includes(index)}
                  onPress={() => toggleDay(index)}
                />
              ))}
            </ChipGroup>
          ) : null}

          {isFlexible(draft.schedule.type) ? (
            <>
              <TextField
                label={draft.schedule.type === 'times_per_week' ? 'Times per week' : 'Times per month'}
                value={timesText}
                onChangeText={setTimesText}
                keyboardType="number-pad"
              />
              <InlineNote text="A flexible target is never a miss on any single day — only the period can fall short." />
            </>
          ) : null}

          {draft.schedule.type === 'every_n_days' ? (
            <TextField
              label="Every N days"
              value={intervalText}
              onChangeText={setIntervalText}
              keyboardType="number-pad"
            />
          ) : null}
        </View>

        <TimeField
          label="Preferred time"
          value={draft.preferredTime}
          onChange={(preferredTime) => setDraft((p) => ({ ...p, preferredTime }))}
          use24Hour={use24Hour}
        />
        <Caption tone="faint">Used to place the routine on your day timeline. Optional.</Caption>
      </View>
    </BottomSheet>
  );
}

function isFlexible(type: ScheduleRule['type']): boolean {
  return type === 'times_per_week' || type === 'times_per_month';
}
