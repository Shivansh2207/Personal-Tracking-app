import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import { BarChart } from '@/components/analytics/Charts';
import { Button, IconButton } from '@/components/ui/Button';
import { RatingPicker, TextField } from '@/components/ui/Controls';
import { useToast } from '@/components/ui/Feedback';
import { AppHeader, Screen, ScreenScroll, SectionHeader } from '@/components/ui/Layout';
import { MetricCard, MetricGrid, StatChangeIndicator } from '@/components/ui/MetricCard';
import { EmptyState, SkeletonCard } from '@/components/ui/States';
import { Body, Caption, Eyebrow } from '@/components/ui/Text';
import { compare } from '@/services/analytics/weekly';
import { toFriendlyError } from '@/services/firebase/errors';
import {
  WeeklyBundle,
  buildWeeklySummary,
  fetchDailySummaries,
  saveWeeklySummary,
} from '@/services/summaryService';
import { useAuthStore, useSettings } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { useTheme } from '@/theme/ThemeProvider';
import type { DailySummary } from '@/types/models';
import {
  addDays,
  dateRange,
  formatDuration,
  formatShortDate,
  isValidDateKey,
  minutesToTime,
  todayKey,
} from '@/utils/date';

export default function WeeklyReview() {
  const { c, space, radius } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const settings = useSettings();
  const params = useLocalSearchParams<{ week?: string }>();
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const subjects = useDataStore((s) => s.subjects);

  const [anchor, setAnchor] = useState(isValidDateKey(params.week) ? params.week : todayKey());
  const [bundle, setBundle] = useState<WeeklyBundle | null>(null);
  const [days, setDays] = useState<DailySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [biggestWin, setBiggestWin] = useState('');
  const [biggestProblem, setBiggestProblem] = useState('');
  const [nextWeekFocus, setNextWeekFocus] = useState('');
  const [realityScore, setRealityScore] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const result = await buildWeeklySummary(uid, anchor, settings.weekStart);
      setBundle(result);
      setDays(await fetchDailySummaries(uid, result.weekStart, result.weekEnd));
      setBiggestWin(result.saved?.biggestWin ?? '');
      setBiggestProblem(result.saved?.biggestProblem ?? '');
      setNextWeekFocus(result.saved?.nextWeekFocus ?? '');
      setRealityScore(result.saved?.realityScore ?? null);
    } catch (e) {
      toast.show(toFriendlyError(e, 'Could not build the review').message, 'error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, anchor, settings.weekStart]);

  useEffect(() => {
    load();
  }, [load]);

  const dayBars = useMemo(() => {
    if (!bundle) return [];
    const byDate = new Map(days.map((d) => [d.dateKey, d]));
    return dateRange(bundle.weekStart, bundle.weekEnd).map((dateKey) => {
      const summary = byDate.get(dateKey);
      return {
        label: formatShortDate(dateKey).split(' ')[0],
        value: summary?.overallConsistency ?? 0,
        hasData: summary?.overallConsistency !== null && summary?.overallConsistency !== undefined,
      };
    });
  }, [bundle, days]);

  const summary = bundle?.summary;
  const previous = bundle?.previous ?? null;
  const hasPrevious = !!previous;

  const save = async () => {
    if (!uid || !bundle) return;
    setSaving(true);
    try {
      await saveWeeklySummary(uid, bundle, {
        biggestWin: biggestWin.trim() || null,
        biggestProblem: biggestProblem.trim() || null,
        nextWeekFocus: nextWeekFocus.trim() || null,
        realityScore,
      });
      toast.show('Weekly review saved.', 'success');
      router.back();
    } catch (e) {
      toast.show(toFriendlyError(e, 'Could not save the review').message, 'error');
      setSaving(false);
    }
  };

  return (
    <Screen>
      <AppHeader
        title="Weekly review"
        eyebrow={bundle ? `${bundle.weekStart} → ${bundle.weekEnd}` : 'Loading'}
        showBack
        right={
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <IconButton
              icon="chevron-left"
              label="Previous week"
              size={38}
              onPress={() => setAnchor(addDays(anchor, -7))}
            />
            <IconButton
              icon="chevron-right"
              label="Next week"
              size={38}
              disabled={bundle ? bundle.weekEnd >= todayKey() : true}
              onPress={() => setAnchor(addDays(anchor, 7))}
            />
          </View>
        }
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScreenScroll bottomInset={40}>
          {loading || !summary ? (
            <View style={{ gap: space.md, paddingTop: space.sm }}>
              <SkeletonCard lines={3} />
              <SkeletonCard lines={4} />
            </View>
          ) : summary.daysWithData === 0 ? (
            <EmptyState
              icon="calendar"
              title="Nothing recorded this week"
              message="Once you have a few days logged, the weekly review fills itself in."
            />
          ) : (
            <View style={{ gap: space.xl, paddingTop: space.sm }}>
              <View>
                <SectionHeader title="The week" meta={`${summary.daysWithData} days recorded`} />
                <MetricGrid columns={2}>
                  <MetricCard
                    label="Study"
                    value={formatDuration(summary.studyMinutes, '0m')}
                    delta={
                      compare(summary.studyMinutes, previous?.studyMinutes ?? 0, {
                        hasPreviousData: hasPrevious,
                      })?.percent ?? null
                    }
                    icon="book"
                    large
                  />
                  <MetricCard
                    label="Routines"
                    value={`${summary.routineConsistency}%`}
                    delta={
                      compare(summary.routineConsistency, previous?.routineConsistency ?? 0, {
                        hasPreviousData: hasPrevious,
                      })?.delta ?? null
                    }
                    deltaSuffix=" pts"
                    icon="repeat"
                    large
                  />
                  <MetricCard
                    label="Tasks"
                    value={`${summary.tasksCompleted} / ${summary.tasksPlanned}`}
                    icon="check-square"
                  />
                  <MetricCard
                    label="Timetable"
                    value={`${summary.timetableAdherence}%`}
                    delta={
                      compare(summary.timetableAdherence, previous?.timetableAdherence ?? 0, {
                        hasPreviousData: hasPrevious,
                      })?.delta ?? null
                    }
                    deltaSuffix=" pts"
                    icon="calendar"
                  />
                  <MetricCard
                    label="Wake average"
                    value={
                      summary.wakeAverageMinutes === null
                        ? '—'
                        : minutesToTime(summary.wakeAverageMinutes)
                    }
                    icon="sunrise"
                  />
                  <MetricCard
                    label="Revisions"
                    value={`${summary.revisionCompleted}`}
                    icon="rotate-ccw"
                  />
                </MetricGrid>
                {!hasPrevious ? (
                  <Caption tone="faint" style={{ paddingTop: space.sm }}>
                    Comparisons appear once there is a previous week with data.
                  </Caption>
                ) : null}
              </View>

              <View>
                <SectionHeader title="Day by day" />
                <View
                  style={{
                    padding: space.base,
                    backgroundColor: c.surface2,
                    borderRadius: radius.card,
                    borderWidth: StyleSheet.hairlineWidth * 2,
                    borderColor: c.line,
                  }}>
                  <BarChart
                    data={dayBars}
                    highlightIndex={dayBars.reduce(
                      (best, cur, i, arr) => (cur.value > arr[best].value ? i : best),
                      0,
                    )}
                  />
                </View>
              </View>

              {Object.keys(summary.subjectBreakdown).length > 0 ? (
                <View>
                  <SectionHeader title="Study by subject" />
                  <View
                    style={{
                      padding: space.base,
                      gap: space.sm,
                      backgroundColor: c.surface2,
                      borderRadius: radius.card,
                      borderWidth: StyleSheet.hairlineWidth * 2,
                      borderColor: c.line,
                    }}>
                    {Object.entries(summary.subjectBreakdown)
                      .sort((a, b) => b[1] - a[1])
                      .map(([subjectId, minutes]) => (
                        <View
                          key={subjectId}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                          <View
                            style={{
                              width: 8,
                              height: 8,
                              backgroundColor:
                                subjects.find((s) => s.id === subjectId)?.color ?? '#7C5CFF',
                            }}
                          />
                          <Body style={{ flex: 1 }} numberOfLines={1}>
                            {subjects.find((s) => s.id === subjectId)?.name ?? 'Subject'}
                          </Body>
                          <Caption tone="meta">{formatDuration(minutes)}</Caption>
                        </View>
                      ))}
                  </View>
                </View>
              ) : null}

              <View style={{ gap: space.lg }}>
                <SectionHeader title="Reflection" />
                <TextField
                  label="Biggest win"
                  value={biggestWin}
                  onChangeText={setBiggestWin}
                  placeholder="Kept every study slot on Mon–Wed"
                  multiline
                />
                <TextField
                  label="Biggest problem"
                  value={biggestProblem}
                  onChangeText={setBiggestProblem}
                  placeholder="Late nights pushed the wake time back"
                  multiline
                />
                <TextField
                  label="Main focus next week"
                  value={nextWeekFocus}
                  onChangeText={setNextWeekFocus}
                  placeholder="Finish the Probability chapter"
                  multiline
                />
                <View style={{ gap: space.sm }}>
                  <Eyebrow tone="meta">Reality score (1–10)</Eyebrow>
                  <RatingPicker value={realityScore} onChange={setRealityScore} max={10} />
                  <Caption tone="faint">
                    Your honest read on the week, independent of the numbers.
                  </Caption>
                </View>
              </View>
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
            label={bundle?.saved ? 'Update review' : 'Save review'}
            full
            size="lg"
            loading={saving}
            disabled={!bundle || summary?.daysWithData === 0}
            onPress={save}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
