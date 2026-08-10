import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { RatingPicker, TextField } from '@/components/ui/Controls';
import { useToast } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { AppHeader, Screen, ScreenScroll, SectionHeader } from '@/components/ui/Layout';
import { MetricCard, MetricGrid } from '@/components/ui/MetricCard';
import { SkeletonCard } from '@/components/ui/States';
import { Body, Caption, Eyebrow } from '@/components/ui/Text';
import { toFriendlyError } from '@/services/firebase/errors';
import {
  fetchDailySummary,
  fetchReflection,
  recomputeDailySummary,
  saveReflection,
} from '@/services/summaryService';
import { useAuthStore, useSettings } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { useTheme, withAlpha } from '@/theme/ThemeProvider';
import type { DailyReflection, DailySummary } from '@/types/models';
import {
  formatDeviation,
  formatDuration,
  formatLongDate,
  formatTime,
  isValidDateKey,
  todayKey,
} from '@/utils/date';

/**
 * End-of-day summary. Every number is filled in from the day's records — the
 * user only writes what the app cannot know, and even that is optional.
 */
export default function DailyReview() {
  const { c, space, accent, radius } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const settings = useSettings();
  const params = useLocalSearchParams<{ date?: string }>();
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const scheduleRecompute = useDataStore((s) => s.scheduleRecompute);

  const dateKey = isValidDateKey(params.date) ? params.date : todayKey();

  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [existing, setExisting] = useState<DailyReflection | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [dayRating, setDayRating] = useState<number | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const [biggestWin, setBiggestWin] = useState('');
  const [tomorrowFocus, setTomorrowFocus] = useState('');
  const [isRestDay, setIsRestDay] = useState(false);

  const load = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    try {
      await recomputeDailySummary(uid, dateKey, settings).catch(() => {});
      const [s, r] = await Promise.all([
        fetchDailySummary(uid, dateKey),
        fetchReflection(uid, dateKey),
      ]);
      setSummary(s);
      setExisting(r);
      if (r) {
        setDayRating(r.dayRating);
        setEnergy(r.energy);
        setBiggestWin(r.biggestWin ?? '');
        setTomorrowFocus(r.tomorrowFocus ?? '');
        setIsRestDay(r.isRestDay);
      }
    } catch {
      toast.show('Could not load the day.', 'error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, dateKey]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!uid) return;
    setSaving(true);
    try {
      await saveReflection(
        uid,
        dateKey,
        {
          dayRating,
          energy,
          biggestWin: biggestWin.trim() || null,
          tomorrowFocus: tomorrowFocus.trim() || null,
          isRestDay,
        },
        settings,
      );
      scheduleRecompute(dateKey);
      toast.show('Day closed out.', 'success');
      router.back();
    } catch (e) {
      toast.show(toFriendlyError(e, 'Could not save').message, 'error');
      setSaving(false);
    }
  };

  return (
    <Screen>
      <AppHeader title="Daily review" eyebrow={formatLongDate(dateKey)} showBack />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScreenScroll bottomInset={40}>
          {loading ? (
            <View style={{ gap: space.md, paddingTop: space.sm }}>
              <SkeletonCard lines={3} />
              <SkeletonCard lines={3} />
            </View>
          ) : (
            <View style={{ gap: space.xl, paddingTop: space.sm }}>
              <View>
                <SectionHeader title="Your day" />
                <MetricGrid columns={2}>
                  <MetricCard
                    label="Wake"
                    value={
                      summary?.wakeActual
                        ? formatTime(summary.wakeActual, settings.use24HourTime)
                        : '—'
                    }
                    caption={
                      summary?.wakeActual
                        ? formatDeviation(
                            summary.wakeDeviationMinutes,
                            settings.wakeToleranceMinutes,
                          )
                        : 'not logged'
                    }
                    icon="sunrise"
                  />
                  <MetricCard
                    label="Routines"
                    value={`${summary?.routinesCompleted ?? 0}/${summary?.routinesScheduled ?? 0}`}
                    caption={`${summary?.routineConsistency ?? 0}%`}
                    icon="repeat"
                  />
                  <MetricCard
                    label="Tasks"
                    value={`${summary?.tasksCompleted ?? 0}/${summary?.tasksPlanned ?? 0}`}
                    icon="check-square"
                  />
                  <MetricCard
                    label="Study"
                    value={formatDuration(summary?.studyActualMinutes ?? 0, '0m')}
                    caption={
                      summary?.studyPlannedMinutes
                        ? `planned ${formatDuration(summary.studyPlannedMinutes)}`
                        : undefined
                    }
                    icon="book"
                  />
                  <MetricCard
                    label="Timetable"
                    value={`${summary?.timetableCompleted ?? 0}/${summary?.timetableSlots ?? 0}`}
                    icon="calendar"
                  />
                  <MetricCard
                    label="Revisions"
                    value={`${summary?.revisionCompleted ?? 0}/${summary?.revisionDue ?? 0}`}
                    icon="rotate-ccw"
                  />
                </MetricGrid>
                <Caption tone="faint" style={{ paddingTop: space.sm }}>
                  Nothing above needs typing — it comes from what you logged today.
                </Caption>
              </View>

              <View style={{ gap: space.lg }}>
                <SectionHeader title="Reflection (optional)" />

                <View style={{ gap: space.sm }}>
                  <Eyebrow tone="meta">How was your day?</Eyebrow>
                  <RatingPicker value={dayRating} onChange={setDayRating} />
                </View>

                <View style={{ gap: space.sm }}>
                  <Eyebrow tone="meta">Energy</Eyebrow>
                  <RatingPicker value={energy} onChange={setEnergy} />
                </View>

                <TextField
                  label="Biggest win"
                  value={biggestWin}
                  onChangeText={setBiggestWin}
                  placeholder="Finished the probability chapter"
                  multiline
                />

                <TextField
                  label="Tomorrow's main focus"
                  value={tomorrowFocus}
                  onChangeText={setTomorrowFocus}
                  placeholder="Start the DBMS assignment before noon"
                  multiline
                />

                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isRestDay }}
                  accessibilityLabel="Mark as a planned rest day"
                  onPress={() => setIsRestDay((v) => !v)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.md,
                    padding: space.md,
                    borderWidth: StyleSheet.hairlineWidth * 2,
                    borderColor: isRestDay ? withAlpha(accent.base, 0.5) : c.line,
                    backgroundColor: isRestDay ? withAlpha(accent.base, 0.1) : 'transparent',
                    borderRadius: radius.card,
                  }}>
                  <Icon
                    name={isRestDay ? 'check-square' : 'square'}
                    size={17}
                    color={isRestDay ? accent.base : c.text40}
                  />
                  <View style={{ flex: 1 }}>
                    <Body>Planned rest day</Body>
                    <Caption tone="faint">
                      Rest days are excluded from consistency averages rather than counted as
                      failures.
                    </Caption>
                  </View>
                </Pressable>
              </View>

              {existing ? (
                <Caption tone="faint">
                  Last saved {new Date(existing.updatedAt).toLocaleString()}
                </Caption>
              ) : null}
            </View>
          )}
        </ScreenScroll>

        <View
          style={{
            padding: 16,
            borderTopWidth: StyleSheet.hairlineWidth * 2,
            borderTopColor: c.line,
          }}>
          <Button
            label={existing ? 'Update' : 'Save'}
            full
            size="lg"
            loading={saving}
            onPress={save}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
