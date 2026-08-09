import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Chip, ChipGroup, InlineNote, SegmentedControl, TextField } from '@/components/ui/Controls';
import { useToast } from '@/components/ui/Feedback';
import { Icon, PICKABLE_ICONS, resolveIcon } from '@/components/ui/Icon';
import { AppHeader, Screen, ScreenScroll } from '@/components/ui/Layout';
import { TimeField } from '@/components/ui/Pickers';
import { Caption, Eyebrow } from '@/components/ui/Text';
import { toFriendlyError } from '@/services/firebase/errors';
import { HABIT_SUGGESTIONS, createHabit , updateHabit } from '@/services/habitService';
import { requestPermissions, scheduleHabitReminder } from '@/services/notificationService';
import { useAuthStore, useSettings } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { useTheme } from '@/theme/ThemeProvider';
import type { HabitFrequencyType, HabitMeasurement } from '@/types/models';
import { DAY_LABELS_SHORT, todayKey } from '@/utils/date';

export default function NewHabit() {
  const { c, space, accent } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const settings = useSettings();
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const categories = useDataStore((s) => s.categories);
  const scheduleRecompute = useDataStore((s) => s.scheduleRecompute);

  const [name, setName] = useState('');
  const [icon, setIcon] = useState('check');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [measurement, setMeasurement] = useState<HabitMeasurement>('binary');
  const [target, setTarget] = useState('1');
  const [unit, setUnit] = useState('');
  const [frequencyType, setFrequencyType] = useState<HabitFrequencyType>('daily');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1, 3, 5]);
  const [times, setTimes] = useState('4');
  const [reminderTime, setReminderTime] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const applySuggestion = (suggestionName: string) => {
    const suggestion = HABIT_SUGGESTIONS.find((h) => h.name === suggestionName);
    if (!suggestion) return;
    setName(suggestion.name);
    setIcon(suggestion.icon);
    setMeasurement(suggestion.measurementType);
    setTarget(String(suggestion.target));
    setUnit(suggestion.unit ?? '');
    setFrequencyType(suggestion.frequency.type);
    if (suggestion.frequency.times) setTimes(String(suggestion.frequency.times));
    if (suggestion.frequency.daysOfWeek) setDaysOfWeek(suggestion.frequency.daysOfWeek);
  };

  const save = async () => {
    if (!uid) return;
    if (!name.trim()) {
      toast.show('Give the habit a name.', 'error');
      return;
    }
    const parsedTarget = measurement === 'binary' ? 1 : Math.max(1, Number(target) || 1);
    setSaving(true);
    try {
      const habit = await createHabit(uid, {
        name,
        icon,
        categoryId,
        measurementType: measurement,
        target: parsedTarget,
        unit: measurement === 'count' ? unit.trim() || null : measurement === 'duration' ? 'min' : null,
        frequency: {
          type: frequencyType,
          daysOfWeek: frequencyType === 'specific_days' ? daysOfWeek : undefined,
          times:
            frequencyType === 'times_per_week' || frequencyType === 'times_per_month'
              ? Math.max(1, Number(times) || 1)
              : undefined,
        },
        startDate: todayKey(),
        reminderTime,
      });

      if (reminderTime) {
        const permission = await requestPermissions();
        if (permission === 'granted') {
          const notificationId = await scheduleHabitReminder(habit, settings);
          if (notificationId) await updateHabit(uid, habit.id, { notificationId });
        }
      }

      scheduleRecompute(todayKey());
      toast.show('Habit created.', 'success');
      router.back();
    } catch (error) {
      toast.show(toFriendlyError(error, 'Could not create the habit').message, 'error');
      setSaving(false);
    }
  };

  return (
    <Screen>
      <AppHeader title="New habit" eyebrow="Track" showBack />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScreenScroll bottomInset={40}>
          <View style={{ gap: space.lg, paddingTop: space.sm }}>
            <View style={{ gap: space.sm }}>
              <Eyebrow tone="meta">Start from a suggestion</Eyebrow>
              <ChipGroup>
                {HABIT_SUGGESTIONS.map((suggestion) => (
                  <Chip
                    key={suggestion.name}
                    label={suggestion.name}
                    size="sm"
                    selected={name === suggestion.name}
                    onPress={() => applySuggestion(suggestion.name)}
                  />
                ))}
              </ChipGroup>
            </View>

            <TextField label="Name" value={name} onChangeText={setName} placeholder="Gym" />

            <View style={{ gap: space.sm }}>
              <Eyebrow tone="meta">Icon</Eyebrow>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                {PICKABLE_ICONS.map((option) => (
                  <Pressable
                    key={option}
                    accessibilityRole="button"
                    accessibilityLabel={`Icon ${option}`}
                    accessibilityState={{ selected: icon === option }}
                    onPress={() => setIcon(option)}
                    style={{
                      width: 42,
                      height: 42,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: StyleSheet.hairlineWidth * 2,
                      borderColor: icon === option ? accent.base : c.line,
                    }}>
                    <Icon
                      name={resolveIcon(option)}
                      size={17}
                      color={icon === option ? accent.base : c.text50}
                    />
                  </Pressable>
                ))}
              </View>
            </View>

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
              <Eyebrow tone="meta">Measure</Eyebrow>
              <SegmentedControl
                options={[
                  { value: 'binary', label: 'Yes / No' },
                  { value: 'count', label: 'Count' },
                  { value: 'duration', label: 'Minutes' },
                ]}
                value={measurement}
                onChange={(v) => setMeasurement(v as HabitMeasurement)}
              />
            </View>

            {measurement !== 'binary' ? (
              <View style={{ flexDirection: 'row', gap: space.md }}>
                <TextField
                  containerStyle={{ flex: 1 }}
                  label={measurement === 'duration' ? 'Target minutes' : 'Target count'}
                  value={target}
                  onChangeText={setTarget}
                  keyboardType="number-pad"
                />
                {measurement === 'count' ? (
                  <TextField
                    containerStyle={{ flex: 1 }}
                    label="Unit"
                    value={unit}
                    onChangeText={setUnit}
                    placeholder="glasses"
                  />
                ) : null}
              </View>
            ) : null}

            <View style={{ gap: space.sm }}>
              <Eyebrow tone="meta">Frequency</Eyebrow>
              <ChipGroup>
                {(
                  [
                    ['daily', 'Every day'],
                    ['specific_days', 'Specific days'],
                    ['times_per_week', 'X per week'],
                    ['times_per_month', 'X per month'],
                  ] as [HabitFrequencyType, string][]
                ).map(([value, label]) => (
                  <Chip
                    key={value}
                    label={label}
                    size="sm"
                    selected={frequencyType === value}
                    onPress={() => setFrequencyType(value)}
                  />
                ))}
              </ChipGroup>

              {frequencyType === 'specific_days' ? (
                <ChipGroup>
                  {DAY_LABELS_SHORT.map((day, index) => (
                    <Chip
                      key={day + index}
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

              {frequencyType === 'times_per_week' || frequencyType === 'times_per_month' ? (
                <TextField
                  label={frequencyType === 'times_per_week' ? 'Times per week' : 'Times per month'}
                  value={times}
                  onChangeText={setTimes}
                  keyboardType="number-pad"
                />
              ) : null}

              {frequencyType === 'times_per_week' || frequencyType === 'times_per_month' ? (
                <InlineNote text="Flexible habits only count against you when the remaining days no longer cover the target — so doing it on different days is fine." />
              ) : null}
            </View>

            <TimeField label="Daily reminder" value={reminderTime} onChange={setReminderTime} use24Hour={settings.use24HourTime} />
            <Caption tone="faint">Leave empty for no reminder.</Caption>
          </View>
        </ScreenScroll>

        <View
          style={{
            padding: 16,
            borderTopWidth: StyleSheet.hairlineWidth * 2,
            borderTopColor: c.line,
          }}>
          <Button label="Create habit" full size="lg" loading={saving} onPress={save} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
