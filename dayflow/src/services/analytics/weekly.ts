/**
 * Weekly aggregation and comparison.
 *
 * Comparisons are only produced when the previous period has enough data to be
 * meaningful — an empty week never becomes "down 100%".
 */

import type { DailySummary, DateKey, WeeklySummary } from '@/types/models';
import { averageClockMinutes, dayOfWeek, minutesToTime, timeToMinutes } from '@/utils/date';

export type ComputedWeeklySummary = Omit<
  WeeklySummary,
  | 'id'
  | 'userId'
  | 'createdAt'
  | 'updatedAt'
  | 'biggestWin'
  | 'biggestProblem'
  | 'nextWeekFocus'
  | 'realityScore'
>;

export function calculateWeeklySummary(
  weekStart: DateKey,
  weekEnd: DateKey,
  summaries: DailySummary[],
  subjectMinutes: Record<string, number> = {},
): ComputedWeeklySummary {
  const inWeek = summaries.filter((s) => s.dateKey >= weekStart && s.dateKey <= weekEnd);
  const withData = inWeek.filter((s) => s.overallConsistency !== null || s.studyActualMinutes > 0);

  const sum = (pick: (s: DailySummary) => number) =>
    inWeek.reduce((acc, s) => acc + (pick(s) || 0), 0);

  const routineDays = inWeek.filter((s) => s.routinesScheduled > 0);
  const routineConsistency =
    routineDays.length > 0
      ? Math.round(
          routineDays.reduce((a, s) => a + s.routineConsistency, 0) / routineDays.length,
        )
      : 0;

  const slotDays = inWeek.filter((s) => s.timetableSlots > 0);
  const scheduledSlots = sum((s) => s.timetableSlots);
  const metSlots = slotDays.reduce(
    (a, s) => a + s.timetableCompleted + s.timetablePartial * 0.5,
    0,
  );

  const wakeAverageMinutes = averageClockMinutes(inWeek.map((s) => s.wakeActual));

  return {
    weekStart,
    weekEnd,
    studyMinutes: sum((s) => s.studyActualMinutes),
    studyPlannedMinutes: sum((s) => s.studyPlannedMinutes),
    routineConsistency,
    tasksPlanned: sum((s) => s.tasksPlanned),
    tasksCompleted: sum((s) => s.tasksCompleted),
    timetableAdherence: scheduledSlots > 0 ? Math.round((metSlots / scheduledSlots) * 100) : 0,
    wakeAverageMinutes,
    revisionCompleted: sum((s) => s.revisionCompleted),
    daysWithData: withData.length,
    subjectBreakdown: subjectMinutes,
  };
}

export interface Comparison {
  current: number;
  previous: number;
  delta: number;
  /** Percentage change; null when the previous value was zero. */
  percent: number | null;
}

/**
 * Builds a comparison only when the previous period is substantial enough.
 * Returns null otherwise, so the UI can suppress the row entirely.
 */
export function compare(
  current: number,
  previous: number,
  options: { minimumPrevious?: number; hasPreviousData: boolean } = { hasPreviousData: true },
): Comparison | null {
  if (!options.hasPreviousData) return null;
  if (previous < (options.minimumPrevious ?? 0)) return null;
  return {
    current,
    previous,
    delta: current - previous,
    percent: previous > 0 ? Math.round(((current - previous) / previous) * 100) : null,
  };
}

export interface WeekdayAverage {
  dow: number;
  label: string;
  value: number;
  samples: number;
}

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function calculateWeekdayAverages(
  summaries: DailySummary[],
  pick: (s: DailySummary) => number | null,
): WeekdayAverage[] {
  const buckets = DOW_LABELS.map((label, dow) => ({ dow, label, total: 0, samples: 0 }));
  for (const summary of summaries) {
    const value = pick(summary);
    if (value === null) continue;
    const bucket = buckets[dayOfWeek(summary.dateKey)];
    bucket.total += value;
    bucket.samples += 1;
  }
  return buckets.map((b) => ({
    dow: b.dow,
    label: b.label,
    value: b.samples > 0 ? Math.round(b.total / b.samples) : 0,
    samples: b.samples,
  }));
}

export interface TrendPoint {
  dateKey: DateKey;
  label: string;
  value: number;
  hasData: boolean;
}

export function buildTrend(
  summaries: DailySummary[],
  dates: DateKey[],
  pick: (s: DailySummary) => number | null,
  labelFor: (d: DateKey) => string,
): TrendPoint[] {
  const byDate = new Map(summaries.map((s) => [s.dateKey, s]));
  return dates.map((dateKey) => {
    const summary = byDate.get(dateKey);
    const value = summary ? pick(summary) : null;
    return {
      dateKey,
      label: labelFor(dateKey),
      value: value ?? 0,
      hasData: value !== null,
    };
  });
}

/** Consecutive days meeting a predicate, ending today. Today is never a miss. */
export function calculateDayStreak(
  summaries: DailySummary[],
  today: DateKey,
  qualifies: (s: DailySummary) => boolean,
  options: { maxNeutralRun?: number } = {},
): number {
  const byDate = new Map(summaries.map((s) => [s.dateKey, s]));
  const maxNeutralRun = options.maxNeutralRun ?? 3;
  let streak = 0;
  let neutral = 0;
  let cursor = today;

  for (let i = 0; i < 800; i += 1) {
    const summary = byDate.get(cursor);
    if (summary && qualifies(summary)) {
      streak += 1;
      neutral = 0;
    } else if (cursor === today) {
      // In progress.
    } else if (summary?.isRestDay) {
      neutral = 0;
    } else if (!summary || summary.overallConsistency === null) {
      neutral += 1;
      if (neutral >= maxNeutralRun) break;
    } else break;

    cursor = shiftBack(cursor);
  }
  return streak;
}

function shiftBack(key: DateKey): DateKey {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - 1);
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatAverageWake(minutes: number | null): string {
  return minutes === null ? '—' : minutesToTime(minutes);
}

export { timeToMinutes };
