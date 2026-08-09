import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button, IconButton } from '@/components/ui/Button';
import { Chip, ChipGroup, InlineNote, SegmentedControl, TextField } from '@/components/ui/Controls';
import { useToast } from '@/components/ui/Feedback';
import { Icon, PICKABLE_ICONS, resolveIcon } from '@/components/ui/Icon';
import { Screen } from '@/components/ui/Layout';
import { TimeField } from '@/components/ui/Pickers';
import { Body, Caption, Eyebrow, MetricLarge } from '@/components/ui/Text';
import {
  DEFAULT_CATEGORIES,
  CategorySeed,
  createCategories,
} from '@/services/categoryService';
import { toFriendlyError } from '@/services/firebase/errors';
import { createGoal } from '@/services/goalService';
import { HABIT_SUGGESTIONS, HabitDraft, createHabits } from '@/services/habitService';
import { requestPermissions, syncRoutineReminders } from '@/services/notificationService';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/theme/ThemeProvider';
import { CATEGORY_COLORS } from '@/theme/tokens';
import { todayKey } from '@/utils/date';

const STEPS = ['Welcome', 'Areas', 'Habits', 'Goal', 'Rhythm', 'Done'] as const;

export default function Onboarding() {
  const { c, space, accent } = useTheme();
  const toast = useToast();

  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const updateSettings = useAuthStore((s) => s.updateSettings);
  const finishOnboarding = useAuthStore((s) => s.finishOnboarding);

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [selectedCategories, setSelectedCategories] = useState<string[]>([
    'Study',
    'Work',
    'Gym',
    'Personal',
  ]);
  const [customCategories, setCustomCategories] = useState<CategorySeed[]>([]);
  const [customName, setCustomName] = useState('');
  const [customIcon, setCustomIcon] = useState('star');

  const [selectedHabits, setSelectedHabits] = useState<string[]>(['Gym', 'Study', 'No Zero Day']);
  const [customHabits, setCustomHabits] = useState<string[]>([]);
  const [customHabitName, setCustomHabitName] = useState('');

  const [mainGoal, setMainGoal] = useState('');

  const [wakeTime, setWakeTime] = useState<string | null>('06:30');
  const [sleepTime, setSleepTime] = useState<string | null>('23:00');
  const [weekStart, setWeekStart] = useState<'0' | '1'>('1');
  const [reminders, setReminders] = useState(true);

  const allCategories: CategorySeed[] = useMemo(
    () => [...DEFAULT_CATEGORIES, ...customCategories],
    [customCategories],
  );

  const toggle = (list: string[], setList: (v: string[]) => void, value: string) => {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  };

  const addCustomCategory = () => {
    const name = customName.trim();
    if (!name) return;
    if (allCategories.some((c2) => c2.name.toLowerCase() === name.toLowerCase())) {
      toast.show('That area already exists.', 'error');
      return;
    }
    const color = CATEGORY_COLORS[(allCategories.length + 3) % CATEGORY_COLORS.length];
    setCustomCategories((prev) => [...prev, { name, icon: customIcon, color }]);
    setSelectedCategories((prev) => [...prev, name]);
    setCustomName('');
  };

  const addCustomHabit = () => {
    const name = customHabitName.trim();
    if (!name) return;
    if ([...HABIT_SUGGESTIONS.map((h) => h.name), ...customHabits].some((h) => h.toLowerCase() === name.toLowerCase())) {
      toast.show('That habit already exists.', 'error');
      return;
    }
    setCustomHabits((prev) => [...prev, name]);
    setSelectedHabits((prev) => [...prev, name]);
    setCustomHabitName('');
  };

  const finish = async () => {
    if (!user || !profile) return;
    setSaving(true);
    try {
      const categorySeeds = allCategories
        .filter((cat) => selectedCategories.includes(cat.name))
        .map((cat, index) => ({ ...cat, order: index }));

      const created =
        categorySeeds.length > 0 ? await createCategories(user.uid, categorySeeds) : [];

      const byName = new Map(created.map((cat) => [cat.name.toLowerCase(), cat]));
      const habitDrafts: HabitDraft[] = [];

      for (const name of selectedHabits) {
        const suggestion = HABIT_SUGGESTIONS.find((h) => h.name === name);
        const linked =
          byName.get(name.toLowerCase()) ??
          (name === 'Gym' ? byName.get('gym') : undefined) ??
          (name === 'Study' || name === 'Read' ? byName.get('study') : undefined);
        habitDrafts.push({
          name,
          icon: suggestion?.icon ?? 'check',
          measurementType: suggestion?.measurementType ?? 'binary',
          target: suggestion?.target ?? 1,
          unit: suggestion?.unit ?? null,
          frequency: suggestion?.frequency ?? { type: 'daily' },
          categoryId: linked?.id ?? null,
          startDate: todayKey(),
        });
      }
      if (habitDrafts.length > 0) await createHabits(user.uid, habitDrafts);

      if (mainGoal.trim()) {
        await createGoal(user.uid, {
          title: mainGoal.trim(),
          progressType: 'manual',
          startDate: todayKey(),
        });
      }

      await updateProfile({
        mainGoal: mainGoal.trim() || null,
        wakeTime,
        sleepTime,
      });

      const settings = await updateSettings({
        weekStart: weekStart === '1' ? 1 : 0,
        notifications: {
          ...profile.settings.notifications,
          enabled: reminders,
          habitReminders: reminders,
          taskReminders: reminders,
          dailyReview: reminders,
          weeklyReview: reminders,
        },
      });

      if (reminders) {
        const permission = await requestPermissions();
        if (permission === 'granted' && settings) {
          await syncRoutineReminders(settings);
        } else if (permission === 'denied') {
          toast.show('Reminders are off — you can enable them in Settings.', 'default');
        }
      }

      await finishOnboarding();
    } catch (error) {
      toast.show(toFriendlyError(error, 'Setup could not finish').message, 'error');
      setSaving(false);
    }
  };

  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  return (
    <Screen>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.md,
          paddingHorizontal: 16,
          paddingVertical: space.md,
        }}>
        {step > 0 && step < STEPS.length - 1 ? (
          <IconButton icon="chevron-left" label="Back" size={38} onPress={back} />
        ) : (
          <View style={{ width: 38 }} />
        )}
        <View style={{ flex: 1, flexDirection: 'row', gap: 4 }}>
          {STEPS.map((_, i) => (
            <View
              key={i}
              style={{
                flex: 1,
                height: 3,
                backgroundColor: i <= step ? accent.base : c.inset,
              }}
            />
          ))}
        </View>
        <Eyebrow tone="faint">
          {step + 1}/{STEPS.length}
        </Eyebrow>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, gap: space.lg }}
          keyboardShouldPersistTaps="handled">
          {step === 0 ? (
            <View style={{ gap: space.base, paddingTop: space.xl }}>
              <Eyebrow color={accent.base}>Step 01</Eyebrow>
              <MetricLarge tone="strong">BUILD YOUR{'\n'}OWN OPERATING{'\n'}SYSTEM</MetricLarge>
              <Body tone="muted">
                DEVBEAST OS keeps your tasks, habits, study, training and goals in one place — and turns
                what you actually do into numbers you can trust.
              </Body>
              <InlineNote text="You can change everything here later. Nothing is locked in." />
            </View>
          ) : null}

          {step === 1 ? (
            <View style={{ gap: space.base, paddingTop: space.md }}>
              <Eyebrow color={accent.base}>Step 02</Eyebrow>
              <MetricLarge tone="strong">LIFE AREAS</MetricLarge>
              <Body tone="muted">Which parts of your life should DEVBEAST OS track?</Body>

              <ChipGroup>
                {allCategories.map((cat) => (
                  <Chip
                    key={cat.name}
                    label={cat.name}
                    icon={resolveIcon(cat.icon)}
                    color={cat.color}
                    selected={selectedCategories.includes(cat.name)}
                    onPress={() => toggle(selectedCategories, setSelectedCategories, cat.name)}
                  />
                ))}
              </ChipGroup>

              <View style={{ gap: space.sm, paddingTop: space.sm }}>
                <Eyebrow tone="meta">Add your own</Eyebrow>
                <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-end' }}>
                  <TextField
                    containerStyle={{ flex: 1 }}
                    value={customName}
                    onChangeText={setCustomName}
                    placeholder="Side business, Reading…"
                    onSubmitEditing={addCustomCategory}
                    returnKeyType="done"
                  />
                  <IconButton icon="plus" label="Add area" onPress={addCustomCategory} size={48} />
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: space.sm }}>
                    {PICKABLE_ICONS.slice(0, 14).map((icon) => (
                      <Pressable
                        key={icon}
                        accessibilityRole="button"
                        accessibilityLabel={`Icon ${icon}`}
                        accessibilityState={{ selected: customIcon === icon }}
                        onPress={() => setCustomIcon(icon)}
                        style={{
                          width: 38,
                          height: 38,
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderWidth: StyleSheet.hairlineWidth * 2,
                          borderColor: customIcon === icon ? accent.base : c.line,
                        }}>
                        <Icon
                          name={resolveIcon(icon)}
                          size={16}
                          color={customIcon === icon ? accent.base : c.text50}
                        />
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              </View>
            </View>
          ) : null}

          {step === 2 ? (
            <View style={{ gap: space.base, paddingTop: space.md }}>
              <Eyebrow color={accent.base}>Step 03</Eyebrow>
              <MetricLarge tone="strong">STARTING{'\n'}HABITS</MetricLarge>
              <Body tone="muted">
                Optional. Pick the few you actually intend to do — you can add more any time.
              </Body>

              <ChipGroup>
                {[...HABIT_SUGGESTIONS.map((h) => h.name), ...customHabits].map((name) => (
                  <Chip
                    key={name}
                    label={name}
                    selected={selectedHabits.includes(name)}
                    onPress={() => toggle(selectedHabits, setSelectedHabits, name)}
                  />
                ))}
              </ChipGroup>

              <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-end' }}>
                <TextField
                  containerStyle={{ flex: 1 }}
                  label="Add your own"
                  value={customHabitName}
                  onChangeText={setCustomHabitName}
                  placeholder="Journal, Stretch…"
                  onSubmitEditing={addCustomHabit}
                  returnKeyType="done"
                />
                <IconButton icon="plus" label="Add habit" onPress={addCustomHabit} size={48} />
              </View>

              <InlineNote text="Habits like Gym default to 4× per week, so missing a day never counts as a failure." />
            </View>
          ) : null}

          {step === 3 ? (
            <View style={{ gap: space.base, paddingTop: space.md }}>
              <Eyebrow color={accent.base}>Step 04</Eyebrow>
              <MetricLarge tone="strong">MAIN GOAL</MetricLarge>
              <Body tone="muted">What are you currently trying to achieve?</Body>

              <TextField
                value={mainGoal}
                onChangeText={setMainGoal}
                placeholder="Complete my semester syllabus"
                multiline
              />

              <ChipGroup>
                {[
                  'Complete my semester syllabus',
                  'Become consistent with the gym',
                  'Build three projects',
                  'Prepare for an exam',
                ].map((suggestion) => (
                  <Chip
                    key={suggestion}
                    label={suggestion}
                    size="sm"
                    selected={mainGoal === suggestion}
                    onPress={() => setMainGoal(suggestion)}
                  />
                ))}
              </ChipGroup>
              <Caption tone="faint">You can skip this and add goals later.</Caption>
            </View>
          ) : null}

          {step === 4 ? (
            <View style={{ gap: space.base, paddingTop: space.md }}>
              <Eyebrow color={accent.base}>Step 05</Eyebrow>
              <MetricLarge tone="strong">YOUR RHYTHM</MetricLarge>

              <View style={{ flexDirection: 'row', gap: space.md }}>
                <TimeField label="Wake" value={wakeTime} onChange={setWakeTime} allowClear={false} />
                <TimeField label="Sleep" value={sleepTime} onChange={setSleepTime} allowClear={false} />
              </View>

              <View style={{ gap: space.sm }}>
                <Eyebrow tone="meta">Week starts on</Eyebrow>
                <SegmentedControl
                  options={[
                    { value: '1', label: 'Monday' },
                    { value: '0', label: 'Sunday' },
                  ]}
                  value={weekStart}
                  onChange={setWeekStart}
                />
              </View>

              <View style={{ gap: space.sm }}>
                <Eyebrow tone="meta">Reminders</Eyebrow>
                <SegmentedControl
                  options={[
                    { value: 'on', label: 'Enable' },
                    { value: 'off', label: 'Not now' },
                  ]}
                  value={reminders ? 'on' : 'off'}
                  onChange={(v) => setReminders(v === 'on')}
                />
                <Caption tone="faint">
                  Task, habit and review reminders. Every category can be switched off separately.
                </Caption>
              </View>
            </View>
          ) : null}

          {step === 5 ? (
            <View style={{ gap: space.base, paddingTop: space.xl, alignItems: 'center' }}>
              <View
                style={{
                  width: 68,
                  height: 68,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: StyleSheet.hairlineWidth * 3,
                  borderColor: accent.base,
                }}>
                <Icon name="check" size={30} color={accent.base} />
              </View>
              <MetricLarge tone="strong" align="center">
                YOUR OS{'\n'}IS READY
              </MetricLarge>
              <Body tone="muted" align="center">
                {selectedCategories.length} areas · {selectedHabits.length} habits
                {mainGoal.trim() ? ' · 1 goal' : ''}
              </Body>
              <InlineNote
                icon="zap"
                text="Open the dashboard, add your first task and start executing. Everything you complete feeds today's score."
              />
            </View>
          ) : null}
        </ScrollView>

        <View
          style={{
            padding: 16,
            gap: space.sm,
            borderTopWidth: StyleSheet.hairlineWidth * 2,
            borderTopColor: c.line,
          }}>
          {step === STEPS.length - 1 ? (
            <Button label="Open my dashboard" full size="lg" loading={saving} onPress={finish} />
          ) : (
            <Button
              label={step === 0 ? 'Build my system' : 'Continue'}
              full
              size="lg"
              iconRight="arrow-right"
              onPress={next}
              disabled={step === 1 && selectedCategories.length === 0}
            />
          )}
          {step === 2 || step === 3 ? (
            <Button label="Skip this step" variant="ghost" full onPress={next} />
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
