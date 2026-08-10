import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { TrackingConfig, TrackingTypeSheet } from '@/components/routines/TrackingTypeSheet';
import { Button, IconButton } from '@/components/ui/Button';
import { Chip, ChipGroup, InlineNote, SegmentedControl, TextField, ToggleRow } from '@/components/ui/Controls';
import { useToast } from '@/components/ui/Feedback';
import { Icon, resolveIcon } from '@/components/ui/Icon';
import { Screen } from '@/components/ui/Layout';
import { TimeField } from '@/components/ui/Pickers';
import { Body, Caption, Eyebrow, MetricLarge, Title } from '@/components/ui/Text';
import { APP_NAME } from '@/constants/app';
import { DEFAULT_CATEGORIES, createCategories } from '@/services/categoryService';
import { toFriendlyError } from '@/services/firebase/errors';
import { requestPermissions, syncRoutineReminders } from '@/services/notificationService';
import {
  EVENING_SUGGESTIONS,
  MORNING_SUGGESTIONS,
  PRACTICE_SUGGESTIONS,
  RoutineDraft,
  RoutineSuggestion,
  createRoutines,
} from '@/services/routineService';
import { createChapters, createCourse, createSubjects } from '@/services/studyService';
import { createSlot } from '@/services/timetableService';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/theme/ThemeProvider';
import { CATEGORY_COLORS } from '@/theme/tokens';
import type { ScheduleRule, TimeString, UserType } from '@/types/models';
import { DAY_LABELS_SHORT, todayKey } from '@/utils/date';

const STEPS = [
  'Welcome',
  'You',
  'Wake',
  'Routines',
  'Study',
  'Timetable',
  'Done',
] as const;

const USER_TYPES: { value: UserType; label: string }[] = [
  { value: 'student', label: 'Student' },
  { value: 'student_work', label: 'Student + Work' },
  { value: 'work', label: 'Work' },
  { value: 'personal', label: 'Personal routine' },
  { value: 'other', label: 'Other' },
];

interface DraftRoutine extends TrackingConfig {
  key: string;
  name: string;
  icon: string;
  selected: boolean;
}

function fromSuggestion(suggestion: RoutineSuggestion): DraftRoutine {
  return {
    key: suggestion.name,
    name: suggestion.name,
    icon: suggestion.icon,
    selected: false,
    trackingType: suggestion.trackingType,
    targetValue: suggestion.targetValue,
    unit: suggestion.unit,
    targetTime: suggestion.targetTime,
    preferredTime: suggestion.preferredTime,
    schedule: {
      startDate: todayKey(),
      ...suggestion.schedule,
    } as ScheduleRule,
  };
}

export default function Onboarding() {
  const { c, space, accent, radius } = useTheme();
  const toast = useToast();

  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const updateSettings = useAuthStore((s) => s.updateSettings);
  const finishOnboarding = useAuthStore((s) => s.finishOnboarding);

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Step 2
  const [userType, setUserType] = useState<UserType | null>(null);

  // Step 3
  const [wakeTarget, setWakeTarget] = useState<TimeString | null>('07:00');
  const [wakeReminder, setWakeReminder] = useState(true);
  const [trackSleep, setTrackSleep] = useState(false);
  const [sleepTarget, setSleepTarget] = useState<TimeString | null>('23:30');

  // Steps 4 + 5
  const [routines, setRoutines] = useState<DraftRoutine[]>(() => {
    const all = [...MORNING_SUGGESTIONS, ...EVENING_SUGGESTIONS, ...PRACTICE_SUGGESTIONS].map(
      fromSuggestion,
    );
    const preselected = new Set(['Face Routine', 'Reading', 'Water', 'Exercise']);
    return all.map((r) => ({ ...r, selected: preselected.has(r.name) }));
  });
  const [customRoutineName, setCustomRoutineName] = useState('');
  const [editingRoutine, setEditingRoutine] = useState<string | null>(null);

  // Step 6
  const [setupStudy, setSetupStudy] = useState(true);
  const [courseName, setCourseName] = useState('');
  const [subjectsText, setSubjectsText] = useState('');

  // Step 7
  const [buildTimetable, setBuildTimetable] = useState(false);
  const [slotSubject, setSlotSubject] = useState(0);
  const [slotDays, setSlotDays] = useState<number[]>([1, 3]);
  const [slotTime, setSlotTime] = useState<TimeString | null>('19:00');
  const [slotDuration, setSlotDuration] = useState('60');
  const [pendingSlots, setPendingSlots] = useState<
    { subjectIndex: number; days: number[]; time: TimeString; duration: number }[]
  >([]);

  const subjectNames = useMemo(
    () =>
      subjectsText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
    [subjectsText],
  );

  const selectedRoutines = routines.filter((r) => r.selected);
  const editing = routines.find((r) => r.key === editingRoutine) ?? null;

  const toggleRoutine = (key: string) =>
    setRoutines((prev) =>
      prev.map((r) => (r.key === key ? { ...r, selected: !r.selected } : r)),
    );

  const addCustomRoutine = () => {
    const name = customRoutineName.trim();
    if (!name) return;
    if (routines.some((r) => r.name.toLowerCase() === name.toLowerCase())) {
      toast.show('That routine already exists.', 'error');
      return;
    }
    setRoutines((prev) => [
      ...prev,
      {
        key: `custom-${name}`,
        name,
        icon: 'circle',
        selected: true,
        trackingType: 'check',
        targetValue: null,
        unit: null,
        targetTime: null,
        preferredTime: null,
        schedule: { type: 'daily', startDate: todayKey() },
      },
    ]);
    setCustomRoutineName('');
  };

  const addPendingSlot = () => {
    if (subjectNames.length === 0 || slotDays.length === 0 || !slotTime) return;
    setPendingSlots((prev) => [
      ...prev,
      {
        subjectIndex: slotSubject,
        days: [...slotDays],
        time: slotTime,
        duration: Math.max(5, Number(slotDuration) || 60),
      },
    ]);
  };

  const finish = async () => {
    if (!user || !profile) return;
    setSaving(true);
    try {
      const categories = await createCategories(user.uid, DEFAULT_CATEGORIES);
      const byName = new Map(categories.map((cat) => [cat.name.toLowerCase(), cat]));

      // The wake (and optional sleep) routines are `time` routines like any
      // other, which is what lets wake analytics reuse the routine pipeline.
      const drafts: RoutineDraft[] = [];
      if (wakeTarget) {
        drafts.push({
          name: 'Wake Up',
          icon: 'sunrise',
          trackingType: 'time',
          targetValue: null,
          unit: null,
          targetTime: wakeTarget,
          schedule: { type: 'daily', startDate: todayKey() },
          preferredTime: wakeTarget,
          dayPart: 'morning',
          categoryId: byName.get('personal')?.id ?? null,
          reminderEnabled: wakeReminder,
          reminderTime: wakeTarget,
        });
      }
      if (trackSleep && sleepTarget) {
        drafts.push({
          name: 'Sleep',
          icon: 'moon',
          trackingType: 'time',
          targetValue: null,
          unit: null,
          targetTime: sleepTarget,
          schedule: { type: 'daily', startDate: todayKey() },
          preferredTime: sleepTarget,
          dayPart: 'night',
          categoryId: byName.get('personal')?.id ?? null,
        });
      }

      for (const routine of selectedRoutines) {
        drafts.push({
          name: routine.name,
          icon: routine.icon,
          trackingType: routine.trackingType,
          targetValue: routine.targetValue,
          unit: routine.unit,
          targetTime: routine.targetTime,
          schedule: routine.schedule,
          preferredTime: routine.preferredTime,
          categoryId:
            byName.get(guessCategory(routine.name))?.id ?? byName.get('personal')?.id ?? null,
        });
      }
      if (drafts.length > 0) await createRoutines(user.uid, drafts);

      // Study
      if (setupStudy && subjectNames.length > 0) {
        const course = courseName.trim()
          ? await createCourse(user.uid, courseName.trim())
          : null;
        const subjects = await createSubjects(
          user.uid,
          subjectNames,
          course?.id ?? null,
          CATEGORY_COLORS as unknown as string[],
        );

        for (const pending of pendingSlots) {
          const subject = subjects[pending.subjectIndex];
          if (!subject) continue;
          await createSlot(user.uid, {
            subjectId: subject.id,
            daysOfWeek: pending.days,
            startTime: pending.time,
            durationMinutes: pending.duration,
            chapterMode: 'next_incomplete',
          });
        }
      }

      await updateProfile({ userType });
      const settings = await updateSettings({
        wakeTarget,
        trackSleep,
        sleepTarget: trackSleep ? sleepTarget : null,
        notifications: {
          ...profile.settings.notifications,
          wake: wakeReminder,
        },
      });

      if (settings) {
        const permission = await requestPermissions();
        if (permission === 'granted') await syncRoutineReminders(settings);
        else if (permission === 'denied') {
          toast.show('Reminders are off — you can enable them in settings.', 'default');
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
              style={{ flex: 1, height: 3, backgroundColor: i <= step ? accent.base : c.inset }}
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
              <MetricLarge tone="strong">BUILD A DAY{'\n'}THAT RUNS{'\n'}ITSELF</MetricLarge>
              <Body tone="muted">
                Plan your routines, study timetable and responsibilities once. {APP_NAME} prepares
                each day and tracks how consistently you follow it.
              </Body>
              <InlineNote text="Setup takes a few minutes. After that, a normal day is a handful of taps." />
            </View>
          ) : null}

          {step === 1 ? (
            <View style={{ gap: space.base, paddingTop: space.md }}>
              <Eyebrow color={accent.base}>Step 02</Eyebrow>
              <MetricLarge tone="strong">WHAT ARE YOU{'\n'}USING IT FOR?</MetricLarge>
              <Body tone="muted">
                This only shapes the suggestions you see. Every feature stays available.
              </Body>
              <ChipGroup>
                {USER_TYPES.map((option) => (
                  <Chip
                    key={option.value}
                    label={option.label}
                    selected={userType === option.value}
                    onPress={() => setUserType(option.value)}
                  />
                ))}
              </ChipGroup>
            </View>
          ) : null}

          {step === 2 ? (
            <View style={{ gap: space.lg, paddingTop: space.md }}>
              <View style={{ gap: space.base }}>
                <Eyebrow color={accent.base}>Step 03</Eyebrow>
                <MetricLarge tone="strong">WAKE TARGET</MetricLarge>
                <Body tone="muted">What time do you want to be up?</Body>
              </View>
              <TimeField
                label="Wake up at"
                value={wakeTarget}
                onChange={setWakeTarget}
                allowClear={false}
              />
              <View
                style={{
                  paddingHorizontal: space.base,
                  backgroundColor: c.surface2,
                  borderRadius: radius.card,
                  borderWidth: StyleSheet.hairlineWidth * 2,
                  borderColor: c.line,
                }}>
                <ToggleRow
                  label="Wake reminder"
                  subtitle="A nudge to log your wake time"
                  icon="bell"
                  value={wakeReminder}
                  onChange={setWakeReminder}
                />
                <View style={{ height: StyleSheet.hairlineWidth * 2, backgroundColor: c.line }} />
                <ToggleRow
                  label="Track bedtime"
                  subtitle="Log when you actually went to sleep"
                  icon="moon"
                  value={trackSleep}
                  onChange={setTrackSleep}
                />
              </View>
              {trackSleep ? (
                <TimeField
                  label="Target bedtime"
                  value={sleepTarget}
                  onChange={setSleepTarget}
                  allowClear={false}
                />
              ) : null}
            </View>
          ) : null}

          {step === 3 ? (
            <View style={{ gap: space.base, paddingTop: space.md }}>
              <Eyebrow color={accent.base}>Step 04</Eyebrow>
              <MetricLarge tone="strong">DAILY{'\n'}ROUTINES</MetricLarge>
              <Body tone="muted">
                Pick what you want to track, then tap a routine to change how it is measured.
              </Body>

              <View style={{ gap: space.sm }}>
                {routines.map((routine) => (
                  <Pressable
                    key={routine.key}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: routine.selected }}
                    accessibilityLabel={routine.name}
                    onPress={() => toggleRoutine(routine.key)}
                    onLongPress={() => setEditingRoutine(routine.key)}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: space.md,
                      padding: space.md,
                      backgroundColor: pressed ? c.surface3 : c.surface2,
                      borderRadius: radius.card,
                      borderWidth: StyleSheet.hairlineWidth * 2,
                      borderColor: routine.selected ? accent.base : c.line,
                    })}>
                    <Icon
                      name={routine.selected ? 'check-square' : 'square'}
                      size={18}
                      color={routine.selected ? accent.base : c.text40}
                    />
                    <Icon name={resolveIcon(routine.icon)} size={16} color={c.text50} />
                    <View style={{ flex: 1 }}>
                      <Title>{routine.name}</Title>
                      <Caption tone="faint">{describeConfig(routine)}</Caption>
                    </View>
                    <IconButton
                      icon="settings"
                      label={`Configure ${routine.name}`}
                      size={34}
                      bordered={false}
                      onPress={() => setEditingRoutine(routine.key)}
                    />
                  </Pressable>
                ))}
              </View>

              <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-end' }}>
                <TextField
                  containerStyle={{ flex: 1 }}
                  label="Add your own"
                  value={customRoutineName}
                  onChangeText={setCustomRoutineName}
                  placeholder="Journal, stretch, call parents…"
                  onSubmitEditing={addCustomRoutine}
                  returnKeyType="done"
                />
                <IconButton icon="plus" label="Add routine" size={48} onPress={addCustomRoutine} />
              </View>
            </View>
          ) : null}

          {step === 4 ? (
            <View style={{ gap: space.base, paddingTop: space.md }}>
              <Eyebrow color={accent.base}>Step 05</Eyebrow>
              <MetricLarge tone="strong">STUDY SETUP</MetricLarge>
              <SegmentedControl
                options={[
                  { value: 'yes', label: 'Set up now' },
                  { value: 'no', label: 'Later' },
                ]}
                value={setupStudy ? 'yes' : 'no'}
                onChange={(v) => setSetupStudy(v === 'yes')}
              />
              {setupStudy ? (
                <>
                  <TextField
                    label="Course or semester"
                    value={courseName}
                    onChangeText={setCourseName}
                    placeholder="Semester 3"
                  />
                  <TextField
                    label="Subjects"
                    value={subjectsText}
                    onChangeText={setSubjectsText}
                    placeholder={'Engineering Mathematics\nDBMS\nData Structures\nOperating Systems'}
                    multiline
                    hint="One per line. Chapters can wait until later."
                  />
                </>
              ) : (
                <InlineNote text="You can add subjects any time from the Study tab." />
              )}
            </View>
          ) : null}

          {step === 5 ? (
            <View style={{ gap: space.base, paddingTop: space.md }}>
              <Eyebrow color={accent.base}>Step 06</Eyebrow>
              <MetricLarge tone="strong">WEEKLY{'\n'}TIMETABLE</MetricLarge>
              {subjectNames.length === 0 ? (
                <InlineNote text="Add subjects in the previous step to build a timetable, or create one later from the Study tab." />
              ) : (
                <>
                  <SegmentedControl
                    options={[
                      { value: 'yes', label: 'Create now' },
                      { value: 'no', label: 'Later' },
                    ]}
                    value={buildTimetable ? 'yes' : 'no'}
                    onChange={(v) => setBuildTimetable(v === 'yes')}
                  />
                  {buildTimetable ? (
                    <>
                      <View style={{ gap: space.sm }}>
                        <Eyebrow tone="meta">Subject</Eyebrow>
                        <ChipGroup>
                          {subjectNames.map((name, index) => (
                            <Chip
                              key={name}
                              label={name}
                              size="sm"
                              selected={slotSubject === index}
                              onPress={() => setSlotSubject(index)}
                            />
                          ))}
                        </ChipGroup>
                      </View>
                      <View style={{ gap: space.sm }}>
                        <Eyebrow tone="meta">Days</Eyebrow>
                        <ChipGroup>
                          {DAY_LABELS_SHORT.map((day, index) => (
                            <Chip
                              key={`${day}-${index}`}
                              label={day}
                              size="sm"
                              selected={slotDays.includes(index)}
                              onPress={() =>
                                setSlotDays((prev) =>
                                  prev.includes(index)
                                    ? prev.filter((d) => d !== index)
                                    : [...prev, index].sort((a, b) => a - b),
                                )
                              }
                            />
                          ))}
                        </ChipGroup>
                      </View>
                      <View style={{ flexDirection: 'row', gap: space.md }}>
                        <TimeField
                          label="Start"
                          value={slotTime}
                          onChange={setSlotTime}
                          allowClear={false}
                        />
                        <TextField
                          containerStyle={{ flex: 1 }}
                          label="Minutes"
                          value={slotDuration}
                          onChangeText={setSlotDuration}
                          keyboardType="number-pad"
                        />
                      </View>
                      <Button
                        label="Add slot"
                        icon="plus"
                        variant="outline"
                        full
                        onPress={addPendingSlot}
                      />
                      {pendingSlots.length > 0 ? (
                        <View style={{ gap: space.sm }}>
                          {pendingSlots.map((slot, index) => (
                            <View
                              key={index}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: space.md,
                                padding: space.md,
                                borderWidth: StyleSheet.hairlineWidth * 2,
                                borderColor: c.line,
                                borderRadius: radius.card,
                              }}>
                              <Icon name="calendar" size={15} color={c.text40} />
                              <Body style={{ flex: 1 }} numberOfLines={1}>
                                {subjectNames[slot.subjectIndex]} ·{' '}
                                {slot.days.map((d) => DAY_LABELS_SHORT[d]).join(' ')} {slot.time}
                              </Body>
                              <IconButton
                                icon="x"
                                label="Remove slot"
                                size={32}
                                bordered={false}
                                onPress={() =>
                                  setPendingSlots((prev) => prev.filter((_, i) => i !== index))
                                }
                              />
                            </View>
                          ))}
                        </View>
                      ) : null}
                    </>
                  ) : null}
                </>
              )}
            </View>
          ) : null}

          {step === 6 ? (
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
                YOUR {APP_NAME.toUpperCase()}{'\n'}IS READY
              </MetricLarge>
              <Body tone="muted" align="center">
                {selectedRoutines.length + (wakeTarget ? 1 : 0) + (trackSleep ? 1 : 0)} routines
                {subjectNames.length > 0 ? ` · ${subjectNames.length} subjects` : ''}
                {pendingSlots.length > 0 ? ` · ${pendingSlots.length} timetable slots` : ''}
              </Body>
              <InlineNote
                icon="zap"
                text="Tomorrow morning your day will already be prepared. Log your wake time and go."
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
            <Button label="Open my day" full size="lg" loading={saving} onPress={finish} />
          ) : (
            <Button
              label={step === 0 ? 'Get started' : 'Continue'}
              full
              size="lg"
              iconRight="arrow-right"
              onPress={next}
            />
          )}
          {step === 1 || step === 3 || step === 4 || step === 5 ? (
            <Button label="Skip this step" variant="ghost" full onPress={next} />
          ) : null}
        </View>
      </KeyboardAvoidingView>

      <TrackingTypeSheet
        visible={!!editing}
        title={editing?.name ?? ''}
        value={
          editing ?? {
            trackingType: 'check',
            targetValue: null,
            unit: null,
            targetTime: null,
            preferredTime: null,
            schedule: { type: 'daily', startDate: todayKey() },
          }
        }
        onClose={() => setEditingRoutine(null)}
        onSave={(config) =>
          setRoutines((prev) =>
            prev.map((r) => (r.key === editingRoutine ? { ...r, ...config, selected: true } : r)),
          )
        }
      />
    </Screen>
  );
}

function describeConfig(routine: DraftRoutine): string {
  const parts: string[] = [];
  switch (routine.trackingType) {
    case 'check':
      parts.push('Done / not done');
      break;
    case 'count':
      parts.push(`${routine.targetValue ?? 0}${routine.unit ? ` ${routine.unit}` : ''}`);
      break;
    case 'duration':
      parts.push(`${routine.targetValue ?? 0} min`);
      break;
    case 'time':
      parts.push(`Target ${routine.targetTime ?? '—'}`);
      break;
    case 'session':
      parts.push(`${routine.schedule.times ?? 0}× per week`);
      break;
    default:
      break;
  }
  if (routine.schedule.type === 'specific_days') {
    parts.push((routine.schedule.daysOfWeek ?? []).map((d) => DAY_LABELS_SHORT[d]).join(' '));
  } else if (routine.schedule.type === 'daily') {
    parts.push('Every day');
  } else if (routine.schedule.type === 'weekdays') {
    parts.push('Weekdays');
  }
  return parts.join('  ·  ');
}

function guessCategory(name: string): string {
  const n = name.toLowerCase();
  if (/gym|exercise|run|workout/.test(n)) return 'gym';
  if (/study|maths|practice|coding|read/.test(n)) return 'study';
  return 'personal';
}
