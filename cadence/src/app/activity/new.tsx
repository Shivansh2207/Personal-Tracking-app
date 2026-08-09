import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Chip, ChipGroup, InlineNote, TextField } from '@/components/ui/Controls';
import { useToast } from '@/components/ui/Feedback';
import { resolveIcon } from '@/components/ui/Icon';
import { AppHeader, Screen, ScreenScroll } from '@/components/ui/Layout';
import { DateField, DurationField } from '@/components/ui/Pickers';
import { Caption, Eyebrow } from '@/components/ui/Text';
import { ACTIVITY_TYPES, logActivity } from '@/services/activityService';
import { toFriendlyError } from '@/services/firebase/errors';
import { useAuthStore, useSettings } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { useTheme } from '@/theme/ThemeProvider';
import type { ActivityType } from '@/types/models';
import { todayKey } from '@/utils/date';

const QUICK_LABELS = ['Push', 'Pull', 'Legs', 'Upper', 'Lower', 'Full body', 'Cardio'];

export default function NewActivity() {
  const { c, space } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const settings = useSettings();
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const scheduleRecompute = useDataStore((s) => s.scheduleRecompute);

  const [type, setType] = useState<ActivityType>('gym');
  const [date, setDate] = useState<string | null>(todayKey());
  const [label, setLabel] = useState('');
  const [duration, setDuration] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!uid || !date) return;
    setSaving(true);
    try {
      await logActivity(uid, {
        date,
        type,
        label: label.trim() || null,
        durationMinutes: duration ?? 0,
        notes: notes.trim() || null,
        completed: true,
      });
      scheduleRecompute(date);
      toast.show('Activity logged.', 'success');
      router.back();
    } catch (error) {
      toast.show(toFriendlyError(error, 'Could not log the activity').message, 'error');
      setSaving(false);
    }
  };

  return (
    <Screen>
      <AppHeader title="Log activity" eyebrow="Track" showBack />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScreenScroll bottomInset={40}>
          <View style={{ gap: space.lg, paddingTop: space.sm }}>
            <View style={{ gap: space.sm }}>
              <Eyebrow tone="meta">Type</Eyebrow>
              <ChipGroup>
                {ACTIVITY_TYPES.map((option) => (
                  <Chip
                    key={option.value}
                    label={option.label}
                    icon={resolveIcon(option.icon)}
                    selected={type === option.value}
                    onPress={() => setType(option.value)}
                  />
                ))}
              </ChipGroup>
            </View>

            <DateField
              label="Date"
              value={date}
              onChange={setDate}
              allowClear={false}
              weekStart={settings.weekStart}
            />

            <View style={{ gap: space.sm }}>
              <TextField
                label="Label"
                value={label}
                onChangeText={setLabel}
                placeholder="Push day"
              />
              {type === 'gym' ? (
                <ChipGroup>
                  {QUICK_LABELS.map((quick) => (
                    <Chip
                      key={quick}
                      label={quick}
                      size="sm"
                      selected={label === quick}
                      onPress={() => setLabel(quick)}
                    />
                  ))}
                </ChipGroup>
              ) : null}
              <Caption tone="faint">Optional.</Caption>
            </View>

            <DurationField
              label="Duration"
              value={duration}
              onChange={setDuration}
              presets={[20, 30, 45, 60, 75, 90]}
            />

            <TextField
              label="Notes"
              value={notes}
              onChangeText={setNotes}
              placeholder="Optional"
              multiline
            />

            <InlineNote text="Only the date is required. If you just want to record that you turned up, hit save." />
          </View>
        </ScreenScroll>
        <View
          style={{
            padding: 16,
            borderTopWidth: StyleSheet.hairlineWidth * 2,
            borderTopColor: c.line,
          }}>
          <Button label="Log activity" full size="lg" loading={saving} onPress={save} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
