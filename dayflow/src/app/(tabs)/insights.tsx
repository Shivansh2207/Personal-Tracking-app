import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  BarChart,
  ChartEmpty,
  Heatmap,
  LineChart,
  RankedBars,
} from '@/components/analytics/Charts';
import { IntensityLegend, intensityLevel, useIntensityColors } from '@/components/ui/Calendar';
import { SegmentedControl } from '@/components/ui/Controls';
import { useToast } from '@/components/ui/Feedback';
import { GUTTER, Screen, ScreenScroll, SectionHeader } from '@/components/ui/Layout';
import { MetricCard, MetricGrid, StatChangeIndicator } from '@/components/ui/MetricCard';
import { EmptyState, SkeletonCard } from '@/components/ui/States';
import { Body, Caption, Display, Eyebrow, MetricSmall } from '@/components/ui/Text';
import {
  buildTrend,
  calculateRoutineConsistency,
  calculateSubjectProgress,
  calculateTaskCompletion,
  calculateTimetableAdherence,
  calculateWakeAnalytics,
  calculateWeekdayAverages,
  calculateWeeklySummary,
  compare,
  evaluateSlots,
  slotOccurrences,
  splitPlannedAndExtra,
  targetLabel,
} from '@/services/analytics';
import { fetchRoutineLogsInRange } from '@/services/routineService';
import { fetchSessionsInRange } from '@/services/studyService';
import { fetchDailySummaries } from '@/services/summaryService';
import { fetchTasksInRange } from '@/services/taskService';
import { slotLabel } from '@/services/timetableService';
import { useAuthStore, useSettings } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { useTheme } from '@/theme/ThemeProvider';
import type { DailySummary, RoutineLog, StudySession, Task } from '@/types/models';
import {
  addDays,
  dateRange,
  endOfWeek,
  formatDuration,
  formatShortDate,
  lastNDays,
  minutesToTime,
  startOfWeek,
  todayKey,
} from '@/utils/date';

type Section = 'overview' | 'study' | 'routines' | 'schedule' | 'tasks' | 'sleep';
type Range = '7' | '30' | '90' | '365';
const RANGE_DAYS: Record<Range, number> = { '7': 7, '30': 30, '90': 90, '365': 365 };

export default function Insights() {
  const { c, space, radius, accent } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const settings = useSettings();
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const { routines, subjects, chapters, slots, categories } = useDataStore();
  const intensityColors = useIntensityColors();

  const [section, setSection] = useState<Section>('overview');
  const [range, setRange] = useState<Range>('30');
  const [loading, setLoading] = useState(true);
  const [summaries, setSummaries] = useState<DailySummary[]>([]);
  const [previousSummaries, setPreviousSummaries] = useState<DailySummary[]>([]);
  const [routineLogs, setRoutineLogs] = useState<RoutineLog[]>([]);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [yearSummaries, setYearSummaries] = useState<DailySummary[]>([]);

  const today = todayKey();
  const days = RANGE_DAYS[range];
  const from = addDays(today, -(days - 1));
  const prevFrom = addDays(from, -days);
  const prevTo = addDays(from, -1);
  const rangeDates = useMemo(() => dateRange(from, today), [from, today]);

  const load = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const [current, previous, logs, sessionList, taskList, year] = await Promise.all([
        fetchDailySummaries(uid, from, today),
        fetchDailySummaries(uid, prevFrom, prevTo),
        fetchRoutineLogsInRange(uid, from, today),
        fetchSessionsInRange(uid, from, today),
        fetchTasksInRange(uid, from, today),
        range === '365'
          ? Promise.resolve([] as DailySummary[])
          : fetchDailySummaries(uid, addDays(today, -364), today),
      ]);
      setSummaries(current);
      setPreviousSummaries(previous);
      setRoutineLogs(logs);
      setSessions(sessionList);
      setTasks(taskList.filter((t) => !t.isRecurringTemplate));
      setYearSummaries(range === '365' ? current : year);
    } catch {
      toast.show('Could not load insights.', 'error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, range]);

  useFocusEffect(
    useCallback(() => {
      load();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [range]),
  );

  const hasData = summaries.some((s) => s.overallConsistency !== null || s.studyActualMinutes > 0);
  const previousHasData = previousSummaries.some(
    (s) => s.overallConsistency !== null || s.studyActualMinutes > 0,
  );

  const weekStartKey = startOfWeek(today, settings.weekStart);
  const weekSummary = useMemo(
    () => calculateWeeklySummary(weekStartKey, endOfWeek(today, settings.weekStart), summaries),
    [weekStartKey, today, settings.weekStart, summaries],
  );
  const lastWeekSummary = useMemo(
    () =>
      calculateWeeklySummary(
        addDays(weekStartKey, -7),
        addDays(weekStartKey, -1),
        [...summaries, ...previousSummaries],
      ),
    [weekStartKey, summaries, previousSummaries],
  );

  const studySplit = useMemo(() => splitPlannedAndExtra(sessions), [sessions]);
  const prevStudyMinutes = previousSummaries.reduce((a, s) => a + s.studyActualMinutes, 0);

  const routineRows = useMemo(
    () =>
      routines
        .filter((r) => r.active && r.trackingType !== 'numeric')
        .map((routine) => {
          const logs = routineLogs.filter((l) => l.routineId === routine.id);
          const consistency = calculateRoutineConsistency(
            routine,
            rangeDates,
            logs,
            settings.weekStart,
            today,
            settings.wakeToleranceMinutes,
          );
          return { routine, consistency };
        })
        .filter((r) => r.consistency.scheduled > 0)
        .sort((a, b) => b.consistency.rate - a.consistency.rate),
    [routines, routineLogs, rangeDates, settings, today],
  );

  const slotResults = useMemo(
    () => evaluateSlots(slotOccurrences(slots, rangeDates), sessions, today),
    [slots, rangeDates, sessions, today],
  );
  const adherence = useMemo(
    () => calculateTimetableAdherence(slotResults, (slot) => slotLabel(slot, subjects)),
    [slotResults, subjects],
  );

  const taskStats = useMemo(
    () => calculateTaskCompletion(tasks, categories, today),
    [tasks, categories, today],
  );

  const wake = useMemo(
    () => calculateWakeAnalytics(summaries, settings.wakeTarget, settings.wakeToleranceMinutes),
    [summaries, settings.wakeTarget, settings.wakeToleranceMinutes],
  );

  const subjectStats = useMemo(
    () =>
      subjects
        .map((subject) => calculateSubjectProgress(subject, chapters, sessions))
        .filter((s) => s.minutes > 0)
        .sort((a, b) => b.minutes - a.minutes),
    [subjects, chapters, sessions],
  );

  const consistencyTrend = useMemo(
    () =>
      buildTrend(
        summaries,
        lastNDays(Math.min(days, 60), today),
        (s) => s.overallConsistency,
        (d) => formatShortDate(d),
      ),
    [summaries, days, today],
  );

  const studyTrend = useMemo(
    () =>
      buildTrend(
        summaries,
        lastNDays(Math.min(days, 60), today),
        (s) => (s.studyActualMinutes > 0 ? s.studyActualMinutes : null),
        (d) => formatShortDate(d),
      ),
    [summaries, days, today],
  );

  const heatmapCells = useMemo(() => {
    const byDate = new Map(yearSummaries.map((s) => [s.dateKey, s]));
    const start = startOfWeek(addDays(today, -363), settings.weekStart);
    return dateRange(start, today).map((dateKey) => {
      const summary = byDate.get(dateKey);
      return { date: dateKey, level: intensityLevel(summary?.overallConsistency ?? null) };
    });
  }, [yearSummaries, today, settings.weekStart]);

  const weekdayConsistency = useMemo(
    () => calculateWeekdayAverages(summaries, (s) => s.overallConsistency),
    [summaries],
  );

  return (
    <Screen>
      <View style={{ paddingHorizontal: GUTTER, paddingVertical: space.md }}>
        <Eyebrow tone="faint">Insights</Eyebrow>
        <Display tone="strong">{TITLES[section]}</Display>
      </View>

      <View style={{ paddingHorizontal: GUTTER, paddingBottom: space.sm }}>
        <SegmentedControl
          scrollable
          options={[
            { value: 'overview', label: 'Overview' },
            { value: 'study', label: 'Study' },
            { value: 'routines', label: 'Routines' },
            { value: 'schedule', label: 'Schedule' },
            { value: 'tasks', label: 'Tasks' },
            { value: 'sleep', label: 'Wake & sleep' },
          ]}
          value={section}
          onChange={(v) => setSection(v as Section)}
        />
      </View>
      <View style={{ paddingHorizontal: GUTTER, paddingBottom: space.md }}>
        <SegmentedControl
          options={[
            { value: '7', label: '7d' },
            { value: '30', label: '30d' },
            { value: '90', label: '3m' },
            { value: '365', label: '1y' },
          ]}
          value={range}
          onChange={(v) => setRange(v as Range)}
        />
      </View>

      <ScreenScroll>
        {loading && summaries.length === 0 ? (
          <View style={{ gap: space.md }}>
            <SkeletonCard lines={3} />
            <SkeletonCard lines={4} />
          </View>
        ) : !hasData ? (
          <EmptyState
            icon="bar-chart-2"
            title="Not enough data yet"
            message="Complete a few days to unlock meaningful trends."
            actionLabel="Go to today"
            onAction={() => router.push('/(tabs)')}
          />
        ) : (
          <View style={{ gap: space.xl }}>
            {section === 'overview' ? (
              <>
                <View>
                  <SectionHeader title="This week" />
                  <MetricGrid columns={2}>
                    <MetricCard
                      label="Study"
                      value={formatDuration(weekSummary.studyMinutes, '0m')}
                      delta={
                        compare(weekSummary.studyMinutes, lastWeekSummary.studyMinutes, {
                          hasPreviousData: previousHasData,
                        })?.percent ?? null
                      }
                      icon="book"
                      large
                    />
                    <MetricCard
                      label="Routines"
                      value={`${weekSummary.routineConsistency}%`}
                      delta={
                        compare(
                          weekSummary.routineConsistency,
                          lastWeekSummary.routineConsistency,
                          { hasPreviousData: previousHasData },
                        )?.delta ?? null
                      }
                      icon="repeat"
                      large
                    />
                    <MetricCard
                      label="Tasks"
                      value={`${weekSummary.tasksCompleted} / ${weekSummary.tasksPlanned}`}
                      icon="check-square"
                    />
                    <MetricCard
                      label="Timetable"
                      value={`${weekSummary.timetableAdherence}%`}
                      icon="calendar"
                    />
                    <MetricCard
                      label="Wake average"
                      value={
                        weekSummary.wakeAverageMinutes === null
                          ? '—'
                          : minutesToTime(weekSummary.wakeAverageMinutes)
                      }
                      icon="sunrise"
                    />
                    <MetricCard
                      label="Revisions"
                      value={`${weekSummary.revisionCompleted}`}
                      icon="rotate-ccw"
                    />
                  </MetricGrid>
                  {!previousHasData ? (
                    <Caption tone="faint" style={{ paddingTop: space.sm }}>
                      Comparisons appear once there is a previous period to compare against.
                    </Caption>
                  ) : null}
                </View>

                <View>
                  <SectionHeader title="Day consistency" index={1} />
                  {consistencyTrend.filter((p) => p.hasData).length < 2 ? (
                    <ChartEmpty message="Two or more recorded days are needed to draw a trend." />
                  ) : (
                    <Panel>
                      <LineChart data={consistencyTrend} height={180} />
                    </Panel>
                  )}
                </View>

                <View>
                  <SectionHeader title="Consistency calendar" index={2} />
                  <Panel>
                    <Heatmap
                      cells={heatmapCells}
                      colors={intensityColors}
                      onSelect={(date) => router.push(`/history/${date}`)}
                    />
                    <View style={{ paddingTop: space.md }}>
                      <IntensityLegend />
                    </View>
                  </Panel>
                </View>

                <View>
                  <SectionHeader title="By weekday" index={3} />
                  <Panel>
                    <BarChart
                      data={weekdayConsistency.map((w) => ({
                        label: w.label,
                        value: w.value,
                        hasData: w.samples > 0,
                      }))}
                      height={140}
                    />
                  </Panel>
                </View>
              </>
            ) : null}

            {section === 'study' ? (
              <>
                <MetricGrid columns={2}>
                  <MetricCard
                    label="Total study"
                    value={formatDuration(studySplit.totalMinutes, '0m')}
                    delta={
                      compare(studySplit.totalMinutes, prevStudyMinutes, {
                        hasPreviousData: previousHasData,
                      })?.percent ?? null
                    }
                    icon="clock"
                    large
                  />
                  <MetricCard
                    label="Sessions"
                    value={`${studySplit.sessionCount}`}
                    caption={`avg ${formatDuration(studySplit.averageSessionMinutes, '0m')}`}
                    icon="activity"
                    large
                  />
                  <MetricCard
                    label="Planned"
                    value={formatDuration(studySplit.plannedMinutes, '0m')}
                    caption="from timetable"
                    icon="calendar"
                  />
                  <MetricCard
                    label="Extra"
                    value={formatDuration(studySplit.extraMinutes, '0m')}
                    caption="spontaneous"
                    icon="zap"
                  />
                </MetricGrid>

                <View>
                  <SectionHeader title="Daily study" index={1} />
                  {studyTrend.filter((p) => p.hasData).length < 2 ? (
                    <ChartEmpty message="Record study on two or more days to see a trend." />
                  ) : (
                    <Panel>
                      <LineChart
                        data={studyTrend}
                        height={170}
                        suffix=" min"
                        max={Math.max(60, ...studyTrend.map((p) => p.value))}
                      />
                    </Panel>
                  )}
                </View>

                {subjectStats.length > 0 ? (
                  <View>
                    <SectionHeader title="Subject distribution" index={2} />
                    <Panel>
                      <RankedBars
                        suffix=""
                        items={subjectStats.map((s) => ({
                          label: s.name,
                          value: s.minutes,
                          color: s.color,
                          caption: `${s.chaptersCompleted}/${s.chaptersTotal} chapters`,
                        }))}
                      />
                    </Panel>
                  </View>
                ) : null}

                <View>
                  <SectionHeader title="Planned vs actual" index={3} />
                  <Panel>
                    <View style={{ gap: space.md }}>
                      <Row label="Planned by timetable" value={formatDuration(adherence.plannedMinutes, '0m')} />
                      <Row label="Studied in those slots" value={formatDuration(adherence.actualMinutes, '0m')} />
                      <Row label="Extra study" value={formatDuration(studySplit.extraMinutes, '0m')} />
                      <Row
                        label="Total"
                        value={formatDuration(studySplit.totalMinutes, '0m')}
                        strong
                      />
                    </View>
                    <Caption tone="faint" style={{ paddingTop: space.md }}>
                      Spontaneous study counts toward your total but never toward timetable
                      adherence.
                    </Caption>
                  </Panel>
                </View>
              </>
            ) : null}

            {section === 'routines' ? (
              routineRows.length === 0 ? (
                <ChartEmpty message="Routine analytics appear once a routine has been scheduled for a few days." />
              ) : (
                <View style={{ gap: space.lg }}>
                  {routineRows.map(({ routine, consistency }) => (
                    <View
                      key={routine.id}
                      style={{
                        padding: space.base,
                        gap: space.sm,
                        backgroundColor: c.surface2,
                        borderRadius: radius.card,
                        borderWidth: StyleSheet.hairlineWidth * 2,
                        borderColor: c.line,
                      }}>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm }}>
                        <Body style={{ flex: 1 }} numberOfLines={1}>
                          {routine.name}
                        </Body>
                        <MetricSmall tone="strong">{consistency.rate}%</MetricSmall>
                      </View>
                      <View style={{ height: 6, backgroundColor: c.inset }}>
                        <View
                          style={{
                            width: `${consistency.rate}%`,
                            height: 6,
                            backgroundColor: accent.base,
                          }}
                        />
                      </View>
                      <Caption tone="faint">
                        {describeConsistency(routine.trackingType, consistency)} ·{' '}
                        {targetLabel(routine)}
                        {consistency.skipped > 0 ? ` · ${consistency.skipped} rest` : ''}
                      </Caption>
                    </View>
                  ))}
                  <Caption tone="faint">
                    Each type is scored on its own terms. Days a routine was not scheduled on are
                    never counted as misses.
                  </Caption>
                </View>
              )
            ) : null}

            {section === 'schedule' ? (
              adherence.scheduled === 0 ? (
                <ChartEmpty message="Timetable adherence appears once scheduled slots have come around." />
              ) : (
                <View style={{ gap: space.lg }}>
                  <MetricGrid columns={2}>
                    <MetricCard label="Adherence" value={`${adherence.rate}%`} icon="calendar" large />
                    <MetricCard
                      label="Slots"
                      value={`${adherence.completed}/${adherence.scheduled}`}
                      caption={`${adherence.partial} partial · ${adherence.missed} missed`}
                      icon="check-square"
                      large
                    />
                  </MetricGrid>

                  <View>
                    <SectionHeader title="By subject" />
                    <Panel>
                      <RankedBars
                        items={bySubjectAdherence(slotResults, subjects)}
                      />
                    </Panel>
                  </View>

                  {adherence.weakestSlot ? (
                    <View
                      style={{
                        padding: space.base,
                        borderLeftWidth: 2,
                        borderLeftColor: accent.base,
                        backgroundColor: c.surface1,
                        gap: 4,
                      }}>
                      <Eyebrow color={accent.base}>Most missed slot</Eyebrow>
                      <Body>{adherence.weakestSlot.label}</Body>
                      <Caption tone="faint">
                        {adherence.weakestSlot.rate}% of these sessions happened. Worth moving?
                      </Caption>
                    </View>
                  ) : null}
                </View>
              )
            ) : null}

            {section === 'tasks' ? (
              <View style={{ gap: space.lg }}>
                <MetricGrid columns={2}>
                  <MetricCard
                    label="Completion"
                    value={taskStats.completionRate === null ? '—' : `${taskStats.completionRate}%`}
                    caption={`${taskStats.completed}/${taskStats.planned}`}
                    icon="check-square"
                    large
                  />
                  <MetricCard
                    label="Carried forward"
                    value={`${taskStats.carriedForward}`}
                    caption={`${taskStats.overdue} overdue`}
                    icon="corner-down-right"
                    large
                  />
                </MetricGrid>

                {taskStats.byCategory.length > 0 ? (
                  <View>
                    <SectionHeader title="By category" />
                    <Panel>
                      <RankedBars
                        items={taskStats.byCategory.map((cat) => ({
                          label: cat.name,
                          value:
                            cat.planned > 0 ? Math.round((cat.completed / cat.planned) * 100) : 0,
                          color: cat.color,
                          caption: `${cat.completed}/${cat.planned}`,
                        }))}
                      />
                    </Panel>
                  </View>
                ) : null}

                <Caption tone="faint">
                  Task completion is kept separate from routine consistency — they measure
                  different things.
                </Caption>
              </View>
            ) : null}

            {section === 'sleep' ? (
              wake.logged === 0 ? (
                <ChartEmpty message="Log your wake time for a few days to see the pattern." />
              ) : (
                <View style={{ gap: space.lg }}>
                  <MetricGrid columns={2}>
                    <MetricCard
                      label="Average wake"
                      value={wake.average ?? '—'}
                      caption={`${wake.logged} of ${wake.totalDays} days logged`}
                      icon="sunrise"
                      large
                    />
                    <MetricCard
                      label="vs target"
                      value={
                        wake.averageDeviationMinutes === null
                          ? '—'
                          : `${wake.averageDeviationMinutes > 0 ? '+' : ''}${wake.averageDeviationMinutes}m`
                      }
                      caption={wake.target ? `target ${wake.target}` : 'no target set'}
                      icon="target"
                      large
                    />
                    <MetricCard label="Weekdays" value={wake.weekdayAverage ?? '—'} icon="briefcase" />
                    <MetricCard label="Weekends" value={wake.weekendAverage ?? '—'} icon="coffee" />
                    <MetricCard label="Earliest" value={wake.earliest?.actual ?? '—'} icon="arrow-up" />
                    <MetricCard label="Latest" value={wake.latest?.actual ?? '—'} icon="arrow-down" />
                  </MetricGrid>

                  {wake.adherence !== null ? (
                    <View
                      style={{
                        padding: space.base,
                        gap: 4,
                        backgroundColor: c.surface2,
                        borderRadius: radius.card,
                        borderWidth: StyleSheet.hairlineWidth * 2,
                        borderColor: c.line,
                      }}>
                      <Eyebrow tone="faint">Within target</Eyebrow>
                      <MetricSmall tone="strong" style={{ fontSize: 28, lineHeight: 30 }}>
                        {wake.adherence}%
                      </MetricSmall>
                      <Caption tone="faint">
                        Days within {settings.wakeToleranceMinutes} minutes of your target.
                      </Caption>
                    </View>
                  ) : null}

                  <View>
                    <SectionHeader title="Wake time" />
                    <Panel>
                      <BarChart
                        data={wake.points.slice(-14).map((p) => ({
                          label: formatShortDate(p.dateKey).split(' ')[0],
                          value: Math.max(0, Math.min(720, p.minutes)),
                        }))}
                        height={150}
                        max={720}
                        suffix=" min"
                        showValues={false}
                      />
                      <Caption tone="faint" style={{ paddingTop: space.sm }}>
                        Bar height is minutes after midnight — shorter is earlier.
                      </Caption>
                    </Panel>
                  </View>
                </View>
              )
            ) : null}
          </View>
        )}
      </ScreenScroll>
    </Screen>
  );
}

const TITLES: Record<Section, string> = {
  overview: 'Overview',
  study: 'Study',
  routines: 'Routines',
  schedule: 'Schedule',
  tasks: 'Tasks',
  sleep: 'Wake & sleep',
};

function Panel({ children }: { children: React.ReactNode }) {
  const { c, space, radius } = useTheme();
  return (
    <View
      style={{
        padding: space.base,
        backgroundColor: c.surface2,
        borderRadius: radius.card,
        borderWidth: StyleSheet.hairlineWidth * 2,
        borderColor: c.line,
      }}>
      {children}
    </View>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Body tone="muted" style={{ flex: 1 }}>
        {label}
      </Body>
      <MetricSmall tone={strong ? 'strong' : 'meta'}>{value}</MetricSmall>
    </View>
  );
}

function describeConsistency(
  trackingType: string,
  consistency: { completed: number; scheduled: number; actualTotal: number; targetTotal: number },
): string {
  if (trackingType === 'count' || trackingType === 'duration') {
    return `${consistency.actualTotal} / ${consistency.targetTotal}`;
  }
  return `${consistency.completed} / ${consistency.scheduled}`;
}

function bySubjectAdherence(
  results: ReturnType<typeof evaluateSlots>,
  subjects: { id: string; name: string; color: string }[],
) {
  const map = new Map<string, { earned: number; count: number }>();
  for (const result of results) {
    const entry = map.get(result.slot.subjectId) ?? { earned: 0, count: 0 };
    entry.earned +=
      result.plannedMinutes > 0 ? Math.min(1, result.actualMinutes / result.plannedMinutes) : 0;
    entry.count += 1;
    map.set(result.slot.subjectId, entry);
  }
  return [...map.entries()]
    .map(([subjectId, entry]) => {
      const subject = subjects.find((s) => s.id === subjectId);
      return {
        label: subject?.name ?? 'Subject',
        value: Math.round((entry.earned / entry.count) * 100),
        color: subject?.color,
        caption: `${entry.count} slots`,
      };
    })
    .sort((a, b) => b.value - a.value);
}
