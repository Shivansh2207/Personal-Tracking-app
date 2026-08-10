import { useKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button, IconButton } from '@/components/ui/Button';
import { Chip, ChipGroup, RatingPicker, TextField } from '@/components/ui/Controls';
import { ConfirmationDialog, useToast } from '@/components/ui/Feedback';
import { Screen } from '@/components/ui/Layout';
import { ProgressRing } from '@/components/ui/Progress';
import { Body, Caption, Eyebrow, MetricHero, Title } from '@/components/ui/Text';
import { chapterProgress } from '@/services/analytics/study';
import { toFriendlyError } from '@/services/firebase/errors';
import { scheduleRevisionForChapter } from '@/services/revisionService';
import { fetchChapter, saveStudySession, setChapterStatus } from '@/services/studyService';
import { useAuthStore } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { computeElapsed, useTimerStore, type ActiveStudySession } from '@/store/timerStore';
import { useTheme, withAlpha } from '@/theme/ThemeProvider';
import { CHAPTER_STATUS_LABELS, CHAPTER_STATUS_ORDER } from '@/types/models';
import type { Chapter, ChapterStatus } from '@/types/models';
import { formatClock, formatDuration } from '@/utils/date';

/**
 * Distraction-free focus mode.
 *
 * Elapsed time is always recomputed from the stored `startedAt` timestamp, so
 * backgrounding, locking the phone or an outright crash cannot corrupt the
 * recorded duration.
 */
export default function FocusRun() {
  useKeepAwake();
  const { c, space, accent, semantic } = useTheme();
  const router = useRouter();
  const toast = useToast();

  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const scheduleRecompute = useDataStore((s) => s.scheduleRecompute);
  const refreshChapters = useDataStore((s) => s.refreshChapters);

  const session = useTimerStore((s) => s.session);
  const pause = useTimerStore((s) => s.pause);
  const resume = useTimerStore((s) => s.resume);
  const finish = useTimerStore((s) => s.finish);
  const discard = useTimerStore((s) => s.discard);

  const [tick, setTick] = useState(0);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [wrapUp, setWrapUp] = useState<{ session: ActiveStudySession; elapsedMs: number } | null>(
    null,
  );
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [status, setStatus] = useState<ChapterStatus | null>(null);
  const [progress, setProgress] = useState('');
  const [confidence, setConfidence] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [scheduleRevision, setScheduleRevision] = useState(false);
  const [saving, setSaving] = useState(false);

  // A 1s repaint driven off the shared clock, not an accumulating counter.
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setTick((t) => t + 1);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!session && !wrapUp) router.replace('/focus/setup');
  }, [session, wrapUp, router]);

  const elapsedMs = useMemo(() => computeElapsed(session), [session, tick]);
  const elapsedSeconds = Math.floor(elapsedMs / 1000);
  const targetSeconds = session?.plannedMinutes ? session.plannedMinutes * 60 : null;
  const remaining = targetSeconds !== null ? Math.max(0, targetSeconds - elapsedSeconds) : null;
  const ringValue =
    targetSeconds !== null ? Math.min(100, (elapsedSeconds / targetSeconds) * 100) : 100;
  const overrun = targetSeconds !== null && elapsedSeconds > targetSeconds;

  const endSession = useCallback(async () => {
    const result = await finish();
    if (!result) return;
    if (Math.round(result.elapsedMs / 60000) < 1) {
      toast.show('Under a minute — nothing recorded.');
      router.back();
      return;
    }
    if (uid && result.session.subjectId && result.session.chapterId) {
      const loaded = await fetchChapter(
        uid,
        result.session.subjectId,
        result.session.chapterId,
      ).catch(() => null);
      if (loaded) {
        setChapter(loaded);
        setStatus(loaded.status === 'not_started' ? 'learning' : loaded.status);
        setProgress(String(chapterProgress(loaded)));
        setConfidence(loaded.confidence);
      }
    }
    setWrapUp(result);
  }, [finish, router, toast, uid]);

  const saveSession = async () => {
    if (!uid || !wrapUp) return;
    setSaving(true);
    const actualMinutes = Math.max(1, Math.round(wrapUp.elapsedMs / 60000));
    try {
      const progressAfter = chapter ? Math.max(0, Math.min(100, Number(progress) || 0)) : null;

      await saveStudySession(uid, {
        subjectId: wrapUp.session.subjectId,
        chapterId: wrapUp.session.chapterId,
        topicIds: wrapUp.session.topicIds,
        startedAt: wrapUp.session.startedAt,
        endedAt: wrapUp.session.startedAt + wrapUp.elapsedMs,
        actualMinutes,
        plannedMinutes: wrapUp.session.plannedMinutes,
        source: wrapUp.session.source,
        timetableSlotId: wrapUp.session.timetableSlotId,
        confidence,
        progressBefore: chapter ? chapterProgress(chapter) : null,
        progressAfter,
        notes: notes.trim() || null,
        dateKey: wrapUp.session.dateKey,
      });

      if (chapter && status && status !== chapter.status) {
        await setChapterStatus(uid, chapter, status).catch(() => {});
      }
      if (chapter && scheduleRevision) {
        await scheduleRevisionForChapter(uid, chapter, 3).catch(() => {});
      }

      scheduleRecompute(wrapUp.session.dateKey);
      await refreshChapters();
      toast.show(`${formatDuration(actualMinutes)} recorded.`, 'success');
      setWrapUp(null);
      router.replace('/(tabs)');
    } catch (e) {
      toast.show(toFriendlyError(e, 'Could not save the session').message, 'error');
      setSaving(false);
    }
  };

  if (wrapUp) {
    const actualMinutes = Math.max(1, Math.round(wrapUp.elapsedMs / 60000));
    return (
      <Screen>
        <BottomSheet
          visible
          onClose={saveSession}
          title="Session complete"
          eyebrow={formatDuration(actualMinutes)}
          footer={<Button label="Save session" full loading={saving} onPress={saveSession} />}>
          <View style={{ gap: space.lg, paddingBottom: space.base }}>
            {chapter ? (
              <>
                <View style={{ gap: space.sm }}>
                  <Eyebrow tone="meta">What did you study?</Eyebrow>
                  <Title tone="strong">{chapter.name}</Title>
                </View>

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
                  <Caption tone="faint">
                    Time spent never updates this on its own — you set it.
                  </Caption>
                </View>

                <View style={{ gap: space.sm }}>
                  <Eyebrow tone="meta">Confidence</Eyebrow>
                  <RatingPicker value={confidence} onChange={setConfidence} />
                </View>

                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: scheduleRevision }}
                  accessibilityLabel="Schedule a revision in three days"
                  onPress={() => setScheduleRevision((v) => !v)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderWidth: StyleSheet.hairlineWidth * 3,
                      borderColor: scheduleRevision ? accent.base : c.lineStrong,
                      backgroundColor: scheduleRevision ? accent.base : 'transparent',
                    }}
                  />
                  <Body style={{ flex: 1 }}>Schedule a revision in 3 days</Body>
                </Pressable>
              </>
            ) : (
              <Caption tone="faint">
                No chapter was linked to this session — the time still counts toward your totals.
              </Caption>
            )}

            <TextField
              label="Notes"
              value={notes}
              onChangeText={setNotes}
              placeholder="What did you get through?"
              multiline
            />
          </View>
        </BottomSheet>
      </Screen>
    );
  }

  if (!session) return <Screen>{null}</Screen>;

  const running = session.runningSince !== null;

  return (
    <Screen>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: space.md,
        }}>
        <IconButton icon="chevron-down" label="Minimise" size={40} onPress={() => router.back()} />
        <View style={{ flex: 1 }} />
        <IconButton
          icon="trash-2"
          label="Discard session"
          size={40}
          onPress={() => setConfirmDiscard(true)}
        />
      </View>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.h1 }}>
        <View style={{ alignItems: 'center', gap: space.xs }}>
          <Eyebrow tone="faint">{session.subjectName ?? 'Focus'}</Eyebrow>
          <Title tone="strong" align="center" style={{ fontSize: 20, paddingHorizontal: 32 }}>
            {session.chapterName ?? session.subjectName ?? 'Deep work'}
          </Title>
        </View>

        <ProgressRing
          value={ringValue}
          size={248}
          thickness={4}
          color={overrun ? semantic.warning : accent.base}
          animate={false}>
          <View style={{ alignItems: 'center', gap: 4 }}>
            <MetricHero tone="strong" style={{ fontSize: 58, lineHeight: 58 }}>
              {remaining !== null && !overrun ? formatClock(remaining) : formatClock(elapsedSeconds)}
            </MetricHero>
            <Eyebrow tone="faint">
              {remaining !== null && !overrun ? 'Remaining' : overrun ? 'Over target' : 'Elapsed'}
            </Eyebrow>
          </View>
        </ProgressRing>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.base }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={running ? 'Pause' : 'Resume'}
            onPress={() => (running ? pause() : resume())}
            style={({ pressed }) => ({
              width: 72,
              height: 68,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: StyleSheet.hairlineWidth * 3,
              borderColor: pressed ? accent.base : c.lineStrong,
              backgroundColor: pressed ? withAlpha(accent.base, 0.12) : 'transparent',
            })}>
            <Eyebrow tone="default">{running ? 'PAUSE' : 'RESUME'}</Eyebrow>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Finish session"
            onPress={endSession}
            style={({ pressed }) => ({
              width: 96,
              height: 68,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed ? accent.soft : accent.base,
            })}>
            <Eyebrow color={accent.on}>FINISH</Eyebrow>
          </Pressable>
        </View>

        {!running ? <Caption tone="faint">Paused — the clock is not counting.</Caption> : null}
      </View>

      <ConfirmationDialog
        visible={confirmDiscard}
        title="Discard this session?"
        message="The elapsed time will not be recorded anywhere."
        destructive
        confirmLabel="Discard"
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={async () => {
          await discard();
          setConfirmDiscard(false);
          router.replace('/(tabs)');
        }}
      />
    </Screen>
  );
}
