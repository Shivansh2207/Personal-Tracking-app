import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Chip, ChipGroup, InlineNote, SegmentedControl, TextField } from '@/components/ui/Controls';
import { ConfirmationDialog, useToast } from '@/components/ui/Feedback';
import { AppHeader, Screen, ScreenScroll } from '@/components/ui/Layout';
import { DurationField, TimeField } from '@/components/ui/Pickers';
import { Caption, Eyebrow } from '@/components/ui/Text';
import { toFriendlyError } from '@/services/firebase/errors';
import { cancel, requestPermissions, scheduleSlotReminders } from '@/services/notificationService';
import { fetchChapters } from '@/services/studyService';
import { createSlot, deleteSlot, updateSlot } from '@/services/timetableService';
import { useAuthStore, useSettings } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { useTheme } from '@/theme/ThemeProvider';
import type { Chapter, ChapterMode } from '@/types/models';
import { DAY_LABELS_SHORT } from '@/utils/date';

export default function TimetableSlotEditor() {
  const { c, space } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const settings = useSettings();
  const params = useLocalSearchParams<{ edit?: string }>();
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const subjects = useDataStore((s) => s.subjects);
  const slots = useDataStore((s) => s.slots);

  const existing = params.edit ? slots.find((s) => s.id === params.edit) : undefined;

  const [subjectId, setSubjectId] = useState<string | null>(
    existing?.subjectId ?? subjects[0]?.id ?? null,
  );
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(existing?.daysOfWeek ?? [1]);
  const [startTime, setStartTime] = useState<string | null>(existing?.startTime ?? '19:00');
  const [duration, setDuration] = useState<number | null>(existing?.durationMinutes ?? 60);
  const [chapterMode, setChapterMode] = useState<ChapterMode>(
    existing?.chapterMode ?? 'next_incomplete',
  );
  const [fixedChapterId, setFixedChapterId] = useState<string | null>(
    existing?.fixedChapterId ?? null,
  );
  const [reminderOffset, setReminderOffset] = useState<number | null>(
    existing?.reminderOffsetMinutes ?? settings.notifications.timetableOffsetMinutes,
  );
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!uid || !subjectId) {
        setChapters([]);
        return;
      }
      const list = await fetchChapters(uid, subjectId).catch(() => [] as Chapter[]);
      if (!cancelled) setChapters(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, subjectId]);

  const save = async () => {
    if (!uid) return;
    if (!subjectId) {
      toast.show('Pick a subject first.', 'error');
      return;
    }
    if (daysOfWeek.length === 0) {
      toast.show('Choose at least one day.', 'error');
      return;
    }
    if (!startTime) {
      toast.show('Choose a start time.', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        subjectId,
        daysOfWeek,
        startTime,
        durationMinutes: duration ?? 60,
        chapterMode,
        fixedChapterId: chapterMode === 'fixed' ? fixedChapterId : null,
        reminderOffsetMinutes: reminderOffset,
      };

      const slot = existing
        ? (await updateSlot(uid, existing.id, payload), { ...existing, ...payload })
        : await createSlot(uid, payload);

      if (existing?.notificationId) await cancel(existing.notificationId);
      if (reminderOffset !== null) {
        const permission = await requestPermissions();
        if (permission === 'granted') {
          const subjectName = subjects.find((s) => s.id === subjectId)?.name ?? 'Study';
          const ids = await scheduleSlotReminders(slot as never, subjectName, settings);
          if (ids.length > 0) {
            await updateSlot(uid, (slot as never as { id: string }).id, {
              notificationId: ids[0],
            });
          }
        }
      }

      toast.show(existing ? 'Slot updated.' : 'Slot added.', 'success');
      router.back();
    } catch (error) {
      toast.show(toFriendlyError(error, 'Could not save the slot').message, 'error');
      setSaving(false);
    }
  };

  return (
    <Screen>
      <AppHeader
        title={existing ? 'Edit slot' : 'New study slot'}
        eyebrow="Timetable"
        showBack
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScreenScroll bottomInset={40}>
          <View style={{ gap: space.lg, paddingTop: space.sm }}>
            <View style={{ gap: space.sm }}>
              <Eyebrow tone="meta">Subject</Eyebrow>
              {subjects.length === 0 ? (
                <InlineNote text="Create a subject before building a timetable." />
              ) : (
                <ChipGroup>
                  {subjects.map((subject) => (
                    <Chip
                      key={subject.id}
                      label={subject.name}
                      color={subject.color}
                      selected={subjectId === subject.id}
                      onPress={() => {
                        setSubjectId(subject.id);
                        setFixedChapterId(null);
                      }}
                    />
                  ))}
                </ChipGroup>
              )}
            </View>

            <View style={{ gap: space.sm }}>
              <Eyebrow tone="meta">Days</Eyebrow>
              <ChipGroup>
                {DAY_LABELS_SHORT.map((day, index) => (
                  <Chip
                    key={`${day}-${index}`}
                    label={day}
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
            </View>

            <View style={{ flexDirection: 'row', gap: space.md }}>
              <TimeField
                label="Start"
                value={startTime}
                onChange={setStartTime}
                allowClear={false}
                use24Hour={settings.use24HourTime}
              />
              <DurationField
                label="Length"
                value={duration}
                onChange={setDuration}
                allowClear={false}
                presets={[30, 45, 60, 75, 90, 120]}
              />
            </View>

            <View style={{ gap: space.sm }}>
              <Eyebrow tone="meta">Which chapter?</Eyebrow>
              <SegmentedControl
                options={[
                  { value: 'next_incomplete', label: 'Next incomplete' },
                  { value: 'fixed', label: 'Fixed chapter' },
                ]}
                value={chapterMode}
                onChange={(v) => setChapterMode(v as ChapterMode)}
              />
              {chapterMode === 'fixed' ? (
                chapters.length === 0 ? (
                  <InlineNote text="This subject has no chapters yet." />
                ) : (
                  <ChipGroup>
                    {chapters.map((chapter) => (
                      <Chip
                        key={chapter.id}
                        label={chapter.name}
                        size="sm"
                        selected={fixedChapterId === chapter.id}
                        onPress={() => setFixedChapterId(chapter.id)}
                      />
                    ))}
                  </ChipGroup>
                )
              ) : (
                <Caption tone="faint">
                  Each session suggests the first chapter that is not finished. It never marks one
                  complete for you.
                </Caption>
              )}
            </View>

            <View style={{ gap: space.sm }}>
              <Eyebrow tone="meta">Reminder</Eyebrow>
              <ChipGroup>
                {[null, 0, 5, 10, 15, 30].map((minutes) => (
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
                    selected={reminderOffset === minutes}
                    onPress={() => setReminderOffset(minutes)}
                  />
                ))}
              </ChipGroup>
            </View>

            {existing ? (
              <Button
                label="Delete slot"
                icon="trash-2"
                variant="danger"
                full
                onPress={() => setConfirmDelete(true)}
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
          <Button
            label={existing ? 'Save slot' : 'Add slot'}
            full
            size="lg"
            loading={saving}
            disabled={subjects.length === 0}
            onPress={save}
          />
        </View>
      </KeyboardAvoidingView>

      <ConfirmationDialog
        visible={confirmDelete}
        title="Delete this slot?"
        message="Past study sessions stay in your history; only the schedule is removed."
        destructive
        confirmLabel="Delete"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          if (!uid || !existing) return;
          await cancel(existing.notificationId);
          await deleteSlot(uid, existing.id);
          setConfirmDelete(false);
          toast.show('Slot deleted.');
          router.back();
        }}
      />
    </Screen>
  );
}
