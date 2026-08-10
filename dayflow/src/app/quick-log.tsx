import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { TimeLogSheet } from '@/components/today/WakeCard';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Feedback';
import { Icon, resolveIcon } from '@/components/ui/Icon';
import { Body, Caption, Eyebrow } from '@/components/ui/Text';
import { describeProgress } from '@/services/analytics/routines';
import { useSettings } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { useTheme, withAlpha } from '@/theme/ThemeProvider';
import type { Routine } from '@/types/models';

/**
 * Quick Log — reachable from anywhere by long-pressing the + button.
 *
 * Surfaces whatever is still outstanding today, so the common case (tick a
 * routine, add pages, log the wake time) is a single tap from any screen.
 */
export default function QuickLog() {
  const { c, space, accent, radius } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const settings = useSettings();

  const { routineSnapshots, toggleRoutine, adjustRoutine, logRoutineTime } = useDataStore();
  const [timeRoutine, setTimeRoutine] = useState<Routine | null>(null);

  const snapshots = routineSnapshots();

  // Outstanding first, then everything else — the list stays short and useful.
  const ordered = useMemo(() => {
    const outstanding = snapshots.filter(
      (s) => s.status !== 'completed' && s.status !== 'skipped' && s.status !== 'rest',
    );
    const done = snapshots.filter((s) => s.status === 'completed');
    return [...outstanding, ...done].slice(0, 10);
  }, [snapshots]);

  const close = () => router.back();

  return (
    <>
      <BottomSheet visible onClose={close} title="Quick log" eyebrow="Today">
        <View style={{ gap: space.sm, paddingBottom: space.base }}>
          {ordered.length === 0 ? (
            <Caption tone="faint">
              Nothing to log right now. Create a routine to see it here.
            </Caption>
          ) : (
            ordered.map((snapshot) => {
              const { routine } = snapshot;
              const done = snapshot.status === 'completed';
              return (
                <Pressable
                  key={routine.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${routine.name}, ${describeProgress(snapshot)}`}
                  onPress={() => {
                    if (routine.trackingType === 'time') {
                      setTimeRoutine(routine);
                      return;
                    }
                    if (routine.trackingType === 'count' || routine.trackingType === 'duration') {
                      adjustRoutine(routine, routine.trackingType === 'duration' ? 5 : 1);
                      toast.show(`${routine.name} updated.`);
                      return;
                    }
                    toggleRoutine(routine);
                    toast.show(done ? `${routine.name} cleared.` : `${routine.name} done.`);
                  }}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.md,
                    padding: space.md,
                    backgroundColor: pressed ? c.surface3 : c.surface2,
                    borderRadius: radius.card,
                    borderWidth: StyleSheet.hairlineWidth * 2,
                    borderColor: done ? withAlpha(accent.base, 0.4) : c.line,
                  })}>
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: done ? accent.base : c.inset,
                    }}>
                    <Icon
                      name={done ? 'check' : resolveIcon(routine.icon)}
                      size={15}
                      color={done ? accent.on : c.text50}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Body numberOfLines={1}>{routine.name}</Body>
                    <Caption tone="faint">{describeProgress(snapshot)}</Caption>
                  </View>
                  <Eyebrow tone="meta">
                    {routine.trackingType === 'count'
                      ? '+1'
                      : routine.trackingType === 'duration'
                        ? '+5'
                        : routine.trackingType === 'time'
                          ? 'Log'
                          : done
                            ? 'Undo'
                            : 'Done'}
                  </Eyebrow>
                </Pressable>
              );
            })
          )}

          <View style={{ flexDirection: 'row', gap: space.sm, paddingTop: space.sm }}>
            <Button
              label="Log study"
              icon="book"
              variant="outline"
              style={{ flex: 1 }}
              onPress={() => {
                router.back();
                setTimeout(() => router.push('/study/log'), 220);
              }}
            />
            <Button
              label="Start focus"
              icon="play"
              style={{ flex: 1 }}
              onPress={() => {
                router.back();
                setTimeout(() => router.push('/focus/setup'), 220);
              }}
            />
          </View>
        </View>
      </BottomSheet>

      <TimeLogSheet
        visible={!!timeRoutine}
        title={timeRoutine?.name ?? ''}
        initial={
          timeRoutine
            ? (snapshots.find((s) => s.routine.id === timeRoutine.id)?.log?.actualTime ?? null)
            : null
        }
        use24Hour={settings.use24HourTime}
        onClose={() => setTimeRoutine(null)}
        onSave={(time) => {
          if (timeRoutine) {
            logRoutineTime(timeRoutine, time);
            toast.show(`${timeRoutine.name} logged.`);
          }
          setTimeRoutine(null);
        }}
      />
    </>
  );
}
