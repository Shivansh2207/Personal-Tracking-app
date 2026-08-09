import { useKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button, IconButton } from '@/components/ui/Button';
import { RatingPicker, TextField } from '@/components/ui/Controls';
import { ConfirmationDialog, useToast } from '@/components/ui/Feedback';
import { Screen } from '@/components/ui/Layout';
import { ProgressRing } from '@/components/ui/Progress';
import { Body, Caption, Eyebrow, MetricHero, Title } from '@/components/ui/Text';
import { toFriendlyError } from '@/services/firebase/errors';
import { saveStudySession } from '@/services/studyService';
import { setTaskStatus, updateTask } from '@/services/taskService';
import { useAuthStore } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { computeElapsed, useTimerStore } from '@/store/timerStore';
import { useTheme, withAlpha } from '@/theme/ThemeProvider';
import { formatClock, formatDuration, todayKey } from '@/utils/date';

/**
 * Distraction-free focus mode.
 *
 * Elapsed time is always recomputed from the stored `startedAt` timestamp, so
 * backgrounding the app, locking the phone or an outright crash cannot corrupt
 * the recorded duration.
 */
export default function FocusRun() {
  useKeepAwake();
  const { c, space, accent, semantic } = useTheme();
  const router = useRouter();
  const toast = useToast();

  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const scheduleRecompute = useDataStore((s) => s.scheduleRecompute);
  const subjects = useDataStore((s) => s.subjects);

  const session = useTimerStore((s) => s.session);
  const pause = useTimerStore((s) => s.pause);
  const resume = useTimerStore((s) => s.resume);
  const finish = useTimerStore((s) => s.finish);
  const discard = useTimerStore((s) => s.discard);

  const [tick, setTick] = useState(0);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [wrapUp, setWrapUp] = useState<{ elapsedMs: number; session: NonNullable<typeof session> } | null>(
    null,
  );
  const [rating, setRating] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [markTaskDone, setMarkTaskDone] = useState(true);
  const [saving, setSaving] = useState(false);

  // A 1s repaint driven off the shared clock, not off an accumulating counter.
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Recompute immediately when returning to the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setTick((t) => t + 1);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!session && !wrapUp) router.replace('/focus/setup');
  }, [session, wrapUp, router]);

  const elapsedMs = useMemo(() => {
    // `tick` intentionally invalidates this timestamp-based calculation once
    // per second without accumulating elapsed time in component state.
    void tick;
    return computeElapsed(session);
  }, [session, tick]);
  const elapsedSeconds = Math.floor(elapsedMs / 1000);
  const targetSeconds = session?.targetMinutes ? session.targetMinutes * 60 : null;
  const remaining = targetSeconds !== null ? Math.max(0, targetSeconds - elapsedSeconds) : null;
  const progress =
    targetSeconds !== null ? Math.min(100, (elapsedSeconds / targetSeconds) * 100) : 0;
  const overrun = targetSeconds !== null && elapsedSeconds > targetSeconds;

  const subjectName = subjects.find((s) => s.id === session?.subjectId)?.name ?? null;

  const endSession = useCallback(async () => {
    const result = await finish();
    if (!result) return;
    if (Math.round(result.elapsedMs / 60000) < 1) {
      toast.show('Session was under a minute — nothing recorded.');
      router.back();
      return;
    }
    setWrapUp(result);
  }, [finish, router, toast]);

  const saveSession = async () => {
    if (!uid || !wrapUp) return;
    setSaving(true);
    const durationMinutes = Math.max(1, Math.round(wrapUp.elapsedMs / 60000));
    try {
      await saveStudySession(uid, {
        subjectId: wrapUp.session.subjectId,
        topicId: wrapUp.session.topicId,
        categoryId: wrapUp.session.categoryId,
        taskId: wrapUp.session.taskId,
        label: wrapUp.session.label,
        date: wrapUp.session.date || todayKey(),
        startedAt: wrapUp.session.startedAt,
        endedAt: wrapUp.session.startedAt + wrapUp.elapsedMs,
        durationMinutes,
        productivityRating: rating,
        notes: note.trim() || null,
      });

      if (wrapUp.session.taskId) {
        await updateTask(uid, wrapUp.session.taskId, { actualMinutes: durationMinutes }).catch(
          () => {},
        );
        if (markTaskDone) {
          await setTaskStatus(uid, wrapUp.session.taskId, 'completed', {
            actualMinutes: durationMinutes,
          }).catch(() => {});
        }
      }

      scheduleRecompute(wrapUp.session.date || todayKey());
      toast.show(`${formatDuration(durationMinutes)} recorded.`, 'success');
      setWrapUp(null);
      router.replace('/(tabs)');
    } catch (e) {
      toast.show(toFriendlyError(e, 'Could not save the session').message, 'error');
      setSaving(false);
    }
  };

  if (wrapUp) {
    const durationMinutes = Math.max(1, Math.round(wrapUp.elapsedMs / 60000));
    return (
      <Screen>
        <BottomSheet
          visible
          onClose={saveSession}
          title="Session complete"
          eyebrow={formatDuration(durationMinutes)}
          footer={
            <View style={{ gap: space.sm, paddingBottom: space.sm }}>
              <Button label="Save session" full loading={saving} onPress={saveSession} />
            </View>
          }>
          <View style={{ gap: space.lg, paddingBottom: space.base }}>
            <View style={{ gap: space.sm }}>
              <Eyebrow tone="meta">How productive was this session?</Eyebrow>
              <RatingPicker value={rating} onChange={setRating} />
              <Caption tone="faint">Optional — skip it if you would rather not rate.</Caption>
            </View>

            <TextField
              label="What did you accomplish?"
              value={note}
              onChangeText={setNote}
              placeholder="Finished conditional probability exercises"
              multiline
            />

            {wrapUp.session.taskId ? (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: markTaskDone }}
                accessibilityLabel="Mark the linked task complete"
                onPress={() => setMarkTaskDone((v) => !v)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderWidth: StyleSheet.hairlineWidth * 3,
                    borderColor: markTaskDone ? accent.base : c.lineStrong,
                    backgroundColor: markTaskDone ? accent.base : 'transparent',
                  }}
                />
                <Body style={{ flex: 1 }}>Mark the linked task complete</Body>
              </Pressable>
            ) : null}
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
        <IconButton
          icon="chevron-down"
          label="Minimise"
          size={40}
          onPress={() => router.back()}
        />
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
          <Eyebrow tone="faint">{subjectName ?? 'Focus'}</Eyebrow>
          <Title tone="strong" align="center" style={{ fontSize: 20, paddingHorizontal: 32 }}>
            {session.label}
          </Title>
        </View>

        <ProgressRing
          value={targetSeconds !== null ? progress : running ? 100 : 40}
          size={248}
          thickness={4}
          color={overrun ? semantic.warning : accent.base}
          animate={false}>
          <View style={{ alignItems: 'center', gap: 4 }}>
            <MetricHero tone="strong" style={{ fontSize: 58, lineHeight: 58 }}>
              {remaining !== null && !overrun ? formatClock(remaining) : formatClock(elapsedSeconds)}
            </MetricHero>
            <Eyebrow tone="faint">
              {remaining !== null && !overrun
                ? 'Remaining'
                : overrun
                  ? 'Over target'
                  : 'Elapsed'}
            </Eyebrow>
          </View>
        </ProgressRing>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.base }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={running ? 'Pause' : 'Resume'}
            onPress={() => (running ? pause() : resume())}
            style={({ pressed }) => ({
              width: 68,
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
