import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Chip, ChipGroup, InlineNote, RatingPicker, TextField } from '@/components/ui/Controls';
import { useToast } from '@/components/ui/Feedback';
import { AppHeader, Screen, ScreenScroll } from '@/components/ui/Layout';
import { DateField, DurationField, TimeField } from '@/components/ui/Pickers';
import { Body, Caption, Eyebrow } from '@/components/ui/Text';
import { chapterProgress, nextIncompleteChapter } from '@/services/analytics/study';
import { toFriendlyError } from '@/services/firebase/errors';
import { fetchChapters, saveStudySession, setChapterStatus } from '@/services/studyService';
import { useAuthStore, useSettings } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { useTheme } from '@/theme/ThemeProvider';
import { CHAPTER_STATUS_LABELS, CHAPTER_STATUS_ORDER } from '@/types/models';
import type { Chapter, ChapterStatus } from '@/types/models';
import { dateTimeToTimestamp, todayKey } from '@/utils/date';

/**
 * Manual study log — for study that happened away from the app.
 *
 * Designed to take under twenty seconds: subject, chapter, duration, save.
 * Everything else is optional. A slot id can be passed in so a missed timetable
 * session is credited to that slot rather than counted as unscheduled study.
 */
export default function StudyLog() {
  const { c, space, accent } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const settings = useSettings();
  const params = useLocalSearchParams<{
    subjectId?: string;
    chapterId?: string;
    slotId?: string;
    minutes?: string;
  }>();

  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const subjects = useDataStore((s) => s.subjects);
  const scheduleRecompute = useDataStore((s) => s.scheduleRecompute);
  const refreshChapters = useDataStore((s) => s.refreshChapters);

  const [subjectId, setSubjectId] = useState<string | null>(
    params.subjectId ?? subjects[0]?.id ?? null,
  );
  const [chapterId, setChapterId] = useState<string | null>(params.chapterId ?? null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [minutes, setMinutes] = useState<number | null>(
    Number(params.minutes) || settings.defaultStudyMinutes,
  );
  const [dateKey, setDateKey] = useState<string | null>(todayKey());
  const [startTime, setStartTime] = useState<string | null>(null);
  const [status, setStatus] = useState<ChapterStatus | null>(null);
  const [progress, setProgress] = useState('');
  const [confidence, setConfidence] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!uid || !subjectId) {
        setChapters([]);
        return;
      }
      const list = await fetchChapters(uid, subjectId).catch(() => [] as Chapter[]);
      if (cancelled) return;
      setChapters(list);
      if (!params.chapterId) setChapterId(nextIncompleteChapter(list)?.id ?? null);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, subjectId]);

  const chapter = chapters.find((ch) => ch.id === chapterId) ?? null;

  useEffect(() => {
    if (chapter) {
      setStatus(chapter.status === 'not_started' ? 'learning' : chapter.status);
      setProgress(String(chapterProgress(chapter)));
      setConfidence(chapter.confidence);
    }
  }, [chapter?.id]);

  const save = async () => {
    if (!uid) return;
    if (!minutes || minutes <= 0) {
      toast.show('How long did you study?', 'error');
      return;
    }
    const day = dateKey ?? todayKey();
    setSaving(true);
    try {
      const startedAt = dateTimeToTimestamp(day, startTime ?? '12:00');
      await saveStudySession(uid, {
        subjectId,
        chapterId,
        topicIds: [],
        startedAt,
        endedAt: startedAt + minutes * 60_000,
        actualMinutes: minutes,
        plannedMinutes: null,
        source: 'manual',
        timetableSlotId: params.slotId ?? null,
        confidence,
        progressBefore: chapter ? chapterProgress(chapter) : null,
        progressAfter: chapter ? Math.max(0, Math.min(100, Number(progress) || 0)) : null,
        notes: notes.trim() || null,
        dateKey: day,
      });

      if (chapter && status && status !== chapter.status) {
        await setChapterStatus(uid, chapter, status).catch(() => {});
      }

      scheduleRecompute(day);
      await refreshChapters();
      toast.show('Study logged.', 'success');
      router.back();
    } catch (error) {
      toast.show(toFriendlyError(error, 'Could not log the session').message, 'error');
      setSaving(false);
    }
  };

  return (
    <Screen>
      <AppHeader title="Log study" eyebrow="Study" showBack />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScreenScroll bottomInset={40}>
          <View style={{ gap: space.lg, paddingTop: space.sm }}>
            {params.slotId ? (
              <InlineNote
                icon="calendar"
                text="This will be credited to the scheduled slot it belongs to, so your timetable adherence stays accurate."
              />
            ) : null}

            {subjects.length > 0 ? (
              <View style={{ gap: space.sm }}>
                <Eyebrow tone="meta">Subject</Eyebrow>
                <ChipGroup>
                  {subjects.map((subject) => (
                    <Chip
                      key={subject.id}
                      label={subject.name}
                      color={subject.color}
                      selected={subjectId === subject.id}
                      onPress={() => {
                        setSubjectId(subject.id);
                        setChapterId(null);
                      }}
                    />
                  ))}
                </ChipGroup>
              </View>
            ) : (
              <InlineNote text="Add a subject to attribute study time to it. You can still log time without one." />
            )}

            {chapters.length > 0 ? (
              <View style={{ gap: space.sm }}>
                <Eyebrow tone="meta">Chapter</Eyebrow>
                <ChipGroup>
                  {chapters.map((ch) => (
                    <Chip
                      key={ch.id}
                      label={ch.name}
                      size="sm"
                      selected={chapterId === ch.id}
                      onPress={() => setChapterId(chapterId === ch.id ? null : ch.id)}
                    />
                  ))}
                </ChipGroup>
              </View>
            ) : null}

            <DurationField
              label="How long?"
              value={minutes}
              onChange={setMinutes}
              allowClear={false}
              presets={[15, 25, 30, 45, 60, 90, 120]}
            />

            <View style={{ flexDirection: 'row', gap: space.md }}>
              <DateField
                label="Date"
                value={dateKey}
                onChange={setDateKey}
                allowClear={false}
                weekStart={settings.weekStart}
              />
              <TimeField
                label="Started"
                value={startTime}
                onChange={setStartTime}
                use24Hour={settings.use24HourTime}
              />
            </View>

            {chapter ? (
              <>
                <View style={{ gap: space.sm }}>
                  <Eyebrow tone="meta">Chapter status</Eyebrow>
                  <ChipGroup>
                    {CHAPTER_STATUS_ORDER.map((option) => (
                      <Chip
                        key={option}
                        label={CHAPTER_STATUS_LABELS[option]}
                        size="sm"
                        selected={status === option}
                        onPress={() => setStatus(option)}
                      />
                    ))}
                  </ChipGroup>
                </View>

                <View style={{ gap: space.sm }}>
                  <Eyebrow tone="meta">Progress</Eyebrow>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                    <Caption tone="faint">{chapterProgress(chapter)}%</Caption>
                    <Body tone="faint">→</Body>
                    <TextField
                      containerStyle={{ flex: 1 }}
                      value={progress}
                      onChangeText={setProgress}
                      keyboardType="number-pad"
                    />
                  </View>
                </View>

                <View style={{ gap: space.sm }}>
                  <Eyebrow tone="meta">Confidence</Eyebrow>
                  <RatingPicker value={confidence} onChange={setConfidence} />
                </View>
              </>
            ) : null}

            <TextField
              label="Notes"
              value={notes}
              onChangeText={setNotes}
              placeholder="Optional"
              multiline
            />
          </View>
        </ScreenScroll>

        <View
          style={{
            padding: 16,
            borderTopWidth: StyleSheet.hairlineWidth * 2,
            borderTopColor: c.line,
          }}>
          <Button label="Save session" full size="lg" loading={saving} onPress={save} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
