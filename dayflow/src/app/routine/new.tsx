import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';

import { TrackingConfig, TrackingTypeSheet } from '@/components/routines/TrackingTypeSheet';
import { Button, IconButton } from '@/components/ui/Button';
import { Chip, ChipGroup, TextField, ToggleRow } from '@/components/ui/Controls';
import { useToast } from '@/components/ui/Feedback';
import { Icon, PICKABLE_ICONS, resolveIcon } from '@/components/ui/Icon';
import { AppHeader, Screen, ScreenScroll } from '@/components/ui/Layout';
import { TimeField } from '@/components/ui/Pickers';
import { Body, Caption, Eyebrow, Title } from '@/components/ui/Text';
import { targetLabel } from '@/services/analytics/routines';
import { toFriendlyError } from '@/services/firebase/errors';
import { requestPermissions, scheduleRoutineReminder } from '@/services/notificationService';
import { createRoutine, updateRoutine } from '@/services/routineService';
import { describeSchedule } from '@/services/recurrence';
import { useAuthStore, useSettings } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { useTheme } from '@/theme/ThemeProvider';
import { dayPartForTime, todayKey } from '@/utils/date';

export default function NewRoutine() {
  const { c, space, accent } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const settings = useSettings();
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const categories = useDataStore((s) => s.categories);
  const subjects = useDataStore((s) => s.subjects);
  const routines = useDataStore((s) => s.routines);
  const scheduleRecompute = useDataStore((s) => s.scheduleRecompute);

  const [name, setName] = useState('');
  const [icon, setIcon] = useState('circle');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [linkedSubjectId, setLinkedSubjectId] = useState<string | null>(null);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState<string | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [config, setConfig] = useState<TrackingConfig>({
    trackingType: 'check',
    targetValue: null,
    unit: null,
    targetTime: null,
    preferredTime: null,
    schedule: { type: 'daily', startDate: todayKey() },
  });

  const save = async () => {
    if (!uid) return;
    if (!name.trim()) {
      toast.show('Give the routine a name.', 'error');
      return;
    }
    setSaving(true);
    try {
      const routine = await createRoutine(uid, {
        name,
        icon,
        categoryId,
        linkedSubjectId,
        trackingType: config.trackingType,
        targetValue: config.targetValue,
        unit: config.unit,
        targetTime: config.targetTime,
        schedule: config.schedule,
        preferredTime: config.preferredTime,
        dayPart: dayPartForTime(config.preferredTime),
        reminderEnabled,
        reminderTime: reminderTime ?? config.preferredTime,
        order: routines.length,
      });

      if (reminderEnabled) {
        const permission = await requestPermissions();
        if (permission === 'granted') {
          const notificationId = await scheduleRoutineReminder(routine, settings);
          if (notificationId) await updateRoutine(uid, routine.id, { notificationId });
        }
      }

      scheduleRecompute(todayKey());
      toast.show('Routine created.', 'success');
      router.back();
    } catch (error) {
      toast.show(toFriendlyError(error, 'Could not create the routine').message, 'error');
      setSaving(false);
    }
  };

  return (
    <Screen>
      <AppHeader title="New routine" eyebrow="Plan" showBack />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScreenScroll bottomInset={40}>
          <View style={{ gap: space.lg, paddingTop: space.sm }}>
            <TextField
              label="Name"
              value={name}
              onChangeText={setName}
              placeholder="Reading, face routine, gym…"
              autoFocus
            />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Change how this routine is tracked"
              onPress={() => setConfigOpen(true)}
              style={({ pressed }) => ({
                padding: space.base,
                gap: 4,
                backgroundColor: pressed ? c.surface3 : c.surface2,
                borderWidth: StyleSheet.hairlineWidth * 2,
                borderColor: accent.base,
              })}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <Eyebrow color={accent.base} style={{ flex: 1 }}>
                  Tracking
                </Eyebrow>
                <Icon name="edit-3" size={13} color={accent.base} />
              </View>
              <Title tone="strong">
                {targetLabel({
                  ...config,
                  name,
                  schedule: config.schedule,
                } as never)}
              </Title>
              <Caption tone="faint">{describeSchedule(config.schedule)}</Caption>
            </Pressable>

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

            {subjects.length > 0 ? (
              <View style={{ gap: space.sm }}>
                <Eyebrow tone="meta">Link to a subject</Eyebrow>
                <ChipGroup>
                  {subjects.map((subject) => (
                    <Chip
                      key={subject.id}
                      label={subject.name}
                      size="sm"
                      color={subject.color}
                      selected={linkedSubjectId === subject.id}
                      onPress={() =>
                        setLinkedSubjectId(linkedSubjectId === subject.id ? null : subject.id)
                      }
                    />
                  ))}
                </ChipGroup>
                <Caption tone="faint">
                  Practice routines linked to a subject appear in that subject&apos;s statistics.
                </Caption>
              </View>
            ) : null}

            <View
              style={{
                paddingHorizontal: space.base,
                backgroundColor: c.surface2,
                borderWidth: StyleSheet.hairlineWidth * 2,
                borderColor: c.line,
              }}>
              <ToggleRow
                label="Reminder"
                subtitle="A daily nudge at the time below"
                icon="bell"
                value={reminderEnabled}
                onChange={setReminderEnabled}
              />
            </View>
            {reminderEnabled ? (
              <TimeField
                label="Remind me at"
                value={reminderTime ?? config.preferredTime}
                onChange={setReminderTime}
                use24Hour={settings.use24HourTime}
              />
            ) : null}
          </View>
        </ScreenScroll>

        <View
          style={{
            padding: 16,
            borderTopWidth: StyleSheet.hairlineWidth * 2,
            borderTopColor: c.line,
          }}>
          <Button label="Create routine" full size="lg" loading={saving} onPress={save} />
        </View>
      </KeyboardAvoidingView>

      <TrackingTypeSheet
        visible={configOpen}
        title={name || 'Routine'}
        value={config}
        onClose={() => setConfigOpen(false)}
        onSave={setConfig}
        use24Hour={settings.use24HourTime}
        allowNumeric
      />
    </Screen>
  );
}
