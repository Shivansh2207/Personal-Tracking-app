/**
 * Wake and sleep analytics.
 *
 * Missing data is never treated as midnight or zero — a day with no wake log is
 * excluded from the average rather than dragging it toward 00:00.
 */

import type { DailySummary, DateKey, TimeString } from '@/types/models';
import {
  averageClockMinutes,
  clockDeviationMinutes,
  dayOfWeek,
  minutesToTime,
  timeToMinutes,
} from '@/utils/date';

export interface WakePoint {
  dateKey: DateKey;
  actual: TimeString;
  minutes: number;
  deviationMinutes: number | null;
  withinTarget: boolean;
}

export interface WakeAnalytics {
  /** Days that actually have a wake log. */
  logged: number;
  /** Days in the range, whether logged or not. */
  totalDays: number;
  target: TimeString | null;
  averageMinutes: number | null;
  average: TimeString | null;
  averageDeviationMinutes: number | null;
  weekdayAverage: TimeString | null;
  weekendAverage: TimeString | null;
  earliest: WakePoint | null;
  latest: WakePoint | null;
  /** Share of logged days inside the tolerance, 0–100. */
  adherence: number | null;
  points: WakePoint[];
}

export function calculateWakeDeviation(
  actual: TimeString | null | undefined,
  target: TimeString | null | undefined,
): number | null {
  return clockDeviationMinutes(actual, target);
}

/** Was the actual time inside the tolerance window around the target? */
export function isWithinTarget(
  actual: TimeString | null | undefined,
  target: TimeString | null | undefined,
  toleranceMinutes: number,
): boolean {
  const deviation = clockDeviationMinutes(actual, target);
  if (deviation === null) return false;
  return Math.abs(deviation) <= Math.abs(toleranceMinutes);
}

function buildPoints(
  entries: { dateKey: DateKey; actual: TimeString | null }[],
  target: TimeString | null,
  toleranceMinutes: number,
): WakePoint[] {
  const points: WakePoint[] = [];
  for (const entry of entries) {
    const minutes = timeToMinutes(entry.actual);
    if (minutes === null || !entry.actual) continue;
    const deviationMinutes = clockDeviationMinutes(entry.actual, target);
    points.push({
      dateKey: entry.dateKey,
      actual: entry.actual,
      minutes,
      deviationMinutes,
      withinTarget:
        deviationMinutes !== null && Math.abs(deviationMinutes) <= Math.abs(toleranceMinutes),
    });
  }
  return points;
}

function analyse(
  entries: { dateKey: DateKey; actual: TimeString | null }[],
  target: TimeString | null,
  toleranceMinutes: number,
): WakeAnalytics {
  const points = buildPoints(entries, target, toleranceMinutes);

  if (points.length === 0) {
    return {
      logged: 0,
      totalDays: entries.length,
      target,
      averageMinutes: null,
      average: null,
      averageDeviationMinutes: null,
      weekdayAverage: null,
      weekendAverage: null,
      earliest: null,
      latest: null,
      adherence: null,
      points: [],
    };
  }

  const averageMinutes = averageClockMinutes(points.map((p) => p.actual));
  const weekdayPoints = points.filter((p) => {
    const dow = dayOfWeek(p.dateKey);
    return dow >= 1 && dow <= 5;
  });
  const weekendPoints = points.filter((p) => {
    const dow = dayOfWeek(p.dateKey);
    return dow === 0 || dow === 6;
  });

  const deviations = points
    .map((p) => p.deviationMinutes)
    .filter((d): d is number => d !== null);

  const sortedByMinutes = [...points].sort((a, b) => {
    // Sort on the same shifted scale the average uses so a 00:10 wake reads as
    // "very early" rather than "earliest of the day".
    const shift = (m: number) => (m >= 20 * 60 ? m - 1440 : m);
    return shift(a.minutes) - shift(b.minutes);
  });

  const weekdayAvg = averageClockMinutes(weekdayPoints.map((p) => p.actual));
  const weekendAvg = averageClockMinutes(weekendPoints.map((p) => p.actual));

  return {
    logged: points.length,
    totalDays: entries.length,
    target,
    averageMinutes,
    average: averageMinutes === null ? null : minutesToTime(averageMinutes),
    averageDeviationMinutes:
      deviations.length > 0
        ? Math.round(deviations.reduce((a, b) => a + b, 0) / deviations.length)
        : null,
    weekdayAverage: weekdayAvg === null ? null : minutesToTime(weekdayAvg),
    weekendAverage: weekendAvg === null ? null : minutesToTime(weekendAvg),
    earliest: sortedByMinutes[0] ?? null,
    latest: sortedByMinutes[sortedByMinutes.length - 1] ?? null,
    adherence:
      target === null
        ? null
        : Math.round((points.filter((p) => p.withinTarget).length / points.length) * 100),
    points,
  };
}

export function calculateWakeAnalytics(
  summaries: DailySummary[],
  target: TimeString | null,
  toleranceMinutes: number,
): WakeAnalytics {
  return analyse(
    summaries.map((s) => ({ dateKey: s.dateKey, actual: s.wakeActual })),
    target,
    toleranceMinutes,
  );
}

export function calculateSleepAnalytics(
  summaries: DailySummary[],
  target: TimeString | null,
  toleranceMinutes: number,
): WakeAnalytics {
  return analyse(
    summaries.map((s) => ({ dateKey: s.dateKey, actual: s.sleepActual })),
    target,
    toleranceMinutes,
  );
}
