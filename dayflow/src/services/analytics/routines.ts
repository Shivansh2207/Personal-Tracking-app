/**
 * Routine analytics.
 *
 * Each tracking type is scored on its own terms — there is deliberately no
 * single universal habit formula:
 *
 *   check     completed / scheduled days
 *   count     actual / target, partial credit retained (15/20 = 75%)
 *   duration  minutes / target minutes, partial credit retained
 *   session   sessions completed / sessions targeted, per period
 *   time      adherence derived from deviation against the target time
 *   numeric   measurement only — never scored
 *
 * Rules that hold everywhere:
 *   - a day the routine was not scheduled on is never a miss
 *   - `skipped` and `rest` days leave the denominator, they are not failures
 *   - a flexible weekly target is measured per week, never per day
 */

import type {
  DateKey,
  Routine,
  RoutineLog,
  RoutineLogStatus,
  ScheduleRule,
  TrackingType,
} from '@/types/models';
import { isFlexibleSchedule } from '@/types/models';
import { isAvailableOn, isScheduledOn } from '@/services/recurrence';
import {
  addDays,
  clockDeviationMinutes,
  endOfMonth,
  endOfWeek,
  startOfMonth,
  startOfWeek,
} from '@/utils/date';

/** Beyond the tolerance, a `time` routine decays to zero over this window. */
const TIME_DECAY_MINUTES = 60;

export function indexLogsByDate(logs: RoutineLog[]): Map<DateKey, RoutineLog> {
  const map = new Map<DateKey, RoutineLog>();
  for (const log of logs) map.set(log.dateKey, log);
  return map;
}

export function groupLogsByRoutine(logs: RoutineLog[]): Map<string, RoutineLog[]> {
  const map = new Map<string, RoutineLog[]>();
  for (const log of logs) {
    const list = map.get(log.routineId);
    if (list) list.push(log);
    else map.set(log.routineId, [log]);
  }
  return map;
}

/** Statuses that remove a day from the denominator rather than failing it. */
export function isExcusedStatus(status: RoutineLogStatus | undefined): boolean {
  return status === 'skipped' || status === 'rest';
}

// ---------------------------------------------------------------------------
// Per-day progress
// ---------------------------------------------------------------------------

export function calculateCountProgress(actual: number, target: number | null): number {
  if (!target || target <= 0) return actual > 0 ? 1 : 0;
  return Math.max(0, Math.min(1, actual / target));
}

export const calculateDurationProgress = calculateCountProgress;

/**
 * Adherence for a `time` routine. Inside the tolerance counts as fully on
 * target; past it, credit decays linearly to zero across an hour.
 */
export function calculateTimeAdherence(
  deviationMinutes: number | null,
  toleranceMinutes = 0,
): number {
  if (deviationMinutes === null) return 0;
  const overshoot = Math.abs(deviationMinutes) - Math.abs(toleranceMinutes);
  if (overshoot <= 0) return 1;
  return Math.max(0, 1 - overshoot / TIME_DECAY_MINUTES);
}

/** 0–1 credit earned by a single day's log. */
export function calculateDayProgress(
  routine: Routine,
  log: RoutineLog | undefined,
  toleranceMinutes = 0,
): number {
  if (!log) return 0;
  if (isExcusedStatus(log.status)) return 0;

  switch (routine.trackingType) {
    case 'check':
      return log.status === 'completed' ? 1 : 0;
    case 'count':
    case 'duration':
      return calculateCountProgress(log.actualValue, log.targetValueSnapshot ?? routine.targetValue);
    case 'time':
      return calculateTimeAdherence(
        clockDeviationMinutes(log.actualTime, routine.targetTime),
        toleranceMinutes,
      );
    case 'session':
      return log.actualValue > 0 ? 1 : 0;
    case 'numeric':
      return 0;
    default:
      return 0;
  }
}

/** The status a log should carry, given what was recorded. */
export function deriveStatus(
  routine: Routine,
  actualValue: number,
  explicit?: RoutineLogStatus,
): RoutineLogStatus {
  if (explicit === 'skipped' || explicit === 'rest') return explicit;
  const target = routine.targetValue;
  switch (routine.trackingType) {
    case 'check':
    case 'session':
      return actualValue > 0 ? 'completed' : 'missed';
    case 'count':
    case 'duration':
      if (actualValue <= 0) return 'missed';
      return !target || actualValue >= target ? 'completed' : 'partial';
    case 'time':
      return 'completed';
    case 'numeric':
      return 'completed';
    default:
      return 'completed';
  }
}

// ---------------------------------------------------------------------------
// Scheduling questions
// ---------------------------------------------------------------------------

export interface RoutineDayContext {
  logsByDate: Map<DateKey, RoutineLog>;
  weekStart: 0 | 1;
  today: DateKey;
}

/** May the routine be logged on this day? */
export function isRoutineAvailableOn(routine: Routine, date: DateKey): boolean {
  if (!routine.active && !routine.archivedAt) return false;
  return isAvailableOn(routine.schedule, date);
}

/**
 * Does this day carry an obligation?
 *
 * Fixed schedules: yes on scheduled days. Flexible targets: only once the
 * remaining days in the period no longer cover the outstanding sessions — so a
 * 4×/week routine is never reported as three misses.
 */
export function isRoutineDueOn(
  routine: Routine,
  date: DateKey,
  ctx: RoutineDayContext,
): boolean {
  if (!isRoutineAvailableOn(routine, date)) return false;

  const log = ctx.logsByDate.get(date);
  if (isExcusedStatus(log?.status)) return false;
  if (log && log.status === 'completed') return true;

  if (!isFlexibleSchedule(routine.schedule)) return true;

  const { done, remainingDays } = flexiblePeriodState(routine, date, ctx);
  const target = Math.max(1, routine.schedule.times ?? 1);
  const outstanding = target - done;
  if (outstanding <= 0) return false;
  return outstanding >= remainingDays;
}

function flexiblePeriodState(
  routine: Routine,
  date: DateKey,
  ctx: RoutineDayContext,
): { done: number; remainingDays: number; periodStart: DateKey; periodEnd: DateKey } {
  const weekly = routine.schedule.type === 'times_per_week';
  const periodStart = weekly ? startOfWeek(date, ctx.weekStart) : startOfMonth(date);
  const periodEnd = weekly ? endOfWeek(date, ctx.weekStart) : endOfMonth(date);

  let done = 0;
  let cursor = periodStart;
  while (cursor < date) {
    const log = ctx.logsByDate.get(cursor);
    if (log && log.status === 'completed') done += 1;
    cursor = addDays(cursor, 1);
  }

  let remainingDays = 0;
  cursor = date;
  while (cursor <= periodEnd) {
    if (isRoutineAvailableOn(routine, cursor)) remainingDays += 1;
    cursor = addDays(cursor, 1);
  }

  return { done, remainingDays, periodStart, periodEnd };
}

export interface RoutineDaySnapshot {
  routine: Routine;
  dateKey: DateKey;
  available: boolean;
  due: boolean;
  log: RoutineLog | null;
  status: RoutineLogStatus | 'pending';
  actualValue: number;
  targetValue: number | null;
  /** 0–1. */
  progress: number;
  /** For session routines: how far through the period the user is. */
  periodDone?: number;
  periodTarget?: number;
}

export function snapshotRoutineDay(
  routine: Routine,
  date: DateKey,
  ctx: RoutineDayContext,
  toleranceMinutes = 0,
): RoutineDaySnapshot {
  const log = ctx.logsByDate.get(date) ?? null;
  const snapshot: RoutineDaySnapshot = {
    routine,
    dateKey: date,
    available: isRoutineAvailableOn(routine, date),
    due: isRoutineDueOn(routine, date, ctx),
    log,
    status: log?.status ?? 'pending',
    actualValue: log?.actualValue ?? 0,
    targetValue: log?.targetValueSnapshot ?? routine.targetValue,
    progress: calculateDayProgress(routine, log ?? undefined, toleranceMinutes),
  };

  if (isFlexibleSchedule(routine.schedule)) {
    const state = flexiblePeriodState(routine, date, ctx);
    const doneIncludingToday = state.done + (log?.status === 'completed' ? 1 : 0);
    snapshot.periodDone = doneIncludingToday;
    snapshot.periodTarget = Math.max(1, routine.schedule.times ?? 1);
  }

  return snapshot;
}

// ---------------------------------------------------------------------------
// Range analytics
// ---------------------------------------------------------------------------

export interface RoutineConsistency {
  /** 0–100. */
  rate: number;
  /** Days (or sessions) that carried an obligation. */
  scheduled: number;
  /** Credit earned, in the same unit as `scheduled`. */
  earned: number;
  completed: number;
  partial: number;
  missed: number;
  skipped: number;
  /** Total quantity recorded — pages, minutes, sessions. */
  actualTotal: number;
  /** Total quantity targeted across scheduled days. */
  targetTotal: number;
}

const EMPTY_CONSISTENCY: RoutineConsistency = {
  rate: 0,
  scheduled: 0,
  earned: 0,
  completed: 0,
  partial: 0,
  missed: 0,
  skipped: 0,
  actualTotal: 0,
  targetTotal: 0,
};

export function calculateRoutineConsistency(
  routine: Routine,
  range: DateKey[],
  logs: RoutineLog[],
  weekStart: 0 | 1,
  today: DateKey,
  toleranceMinutes = 0,
): RoutineConsistency {
  const logsByDate = indexLogsByDate(logs);
  const ctx: RoutineDayContext = { logsByDate, weekStart, today };
  const days = range.filter((d) => d >= routine.schedule.startDate && d <= today);
  if (days.length === 0) return { ...EMPTY_CONSISTENCY };

  if (routine.trackingType === 'numeric') {
    const values = days
      .map((d) => logsByDate.get(d))
      .filter((l): l is RoutineLog => !!l)
      .map((l) => l.actualValue);
    return {
      ...EMPTY_CONSISTENCY,
      actualTotal: values.reduce((a, b) => a + b, 0),
      completed: values.length,
    };
  }

  if (isFlexibleSchedule(routine.schedule)) {
    return flexibleConsistency(routine, days, logsByDate, weekStart);
  }

  let scheduled = 0;
  let earned = 0;
  let completed = 0;
  let partial = 0;
  let missed = 0;
  let skipped = 0;
  let actualTotal = 0;
  let targetTotal = 0;

  for (const day of days) {
    const log = logsByDate.get(day);
    if (isExcusedStatus(log?.status)) {
      skipped += 1;
      continue;
    }
    if (!isScheduledOn(routine.schedule, day)) {
      // Not owed — but anything logged still counts toward the totals.
      if (log) actualTotal += log.actualValue;
      continue;
    }

    scheduled += 1;
    targetTotal += log?.targetValueSnapshot ?? routine.targetValue ?? 0;
    actualTotal += log?.actualValue ?? 0;

    const progress = calculateDayProgress(routine, log, toleranceMinutes);
    earned += progress;
    if (!log || log.status === 'missed') missed += 1;
    else if (log.status === 'completed') completed += 1;
    else if (log.status === 'partial') partial += 1;
  }

  return {
    rate: scheduled > 0 ? Math.round((earned / scheduled) * 100) : 0,
    scheduled,
    earned: Math.round(earned * 100) / 100,
    completed,
    partial,
    missed,
    skipped,
    actualTotal,
    targetTotal,
  };
}

/** Flexible targets are measured per period, pro-rated for a partial period. */
function flexibleConsistency(
  routine: Routine,
  days: DateKey[],
  logsByDate: Map<DateKey, RoutineLog>,
  weekStart: 0 | 1,
): RoutineConsistency {
  const weekly = routine.schedule.type === 'times_per_week';
  const target = Math.max(1, routine.schedule.times ?? 1);
  const periodLength = weekly ? 7 : 30;

  const periods = new Map<DateKey, { done: number; days: number; skipped: number }>();
  for (const day of days) {
    const key = weekly ? startOfWeek(day, weekStart) : startOfMonth(day);
    const entry = periods.get(key) ?? { done: 0, days: 0, skipped: 0 };
    entry.days += 1;
    const log = logsByDate.get(day);
    if (isExcusedStatus(log?.status)) entry.skipped += 1;
    else if (log?.status === 'completed') entry.done += 1;
    periods.set(key, entry);
  }

  let scheduled = 0;
  let earned = 0;
  let completed = 0;
  let skipped = 0;

  for (const [, entry] of periods) {
    const weight = Math.min(1, entry.days / periodLength);
    const periodTarget = target * weight;
    scheduled += periodTarget;
    earned += Math.min(entry.done, periodTarget);
    completed += entry.done;
    skipped += entry.skipped;
  }

  return {
    rate: scheduled > 0 ? Math.round((earned / scheduled) * 100) : 0,
    scheduled: Math.round(scheduled),
    earned: Math.round(earned * 100) / 100,
    completed,
    partial: 0,
    missed: Math.max(0, Math.round(scheduled) - completed),
    skipped,
    actualTotal: completed,
    targetTotal: Math.round(scheduled),
  };
}

/** Sessions completed against the target inside the period containing `date`. */
export function calculateSessionProgress(
  routine: Routine,
  date: DateKey,
  logs: RoutineLog[],
  weekStart: 0 | 1,
): { done: number; target: number; rate: number } {
  const weekly = routine.schedule.type !== 'times_per_month';
  const periodStart = weekly ? startOfWeek(date, weekStart) : startOfMonth(date);
  const periodEnd = weekly ? endOfWeek(date, weekStart) : endOfMonth(date);
  const target = Math.max(1, routine.schedule.times ?? 1);
  const done = logs.filter(
    (l) => l.dateKey >= periodStart && l.dateKey <= periodEnd && l.status === 'completed',
  ).length;
  return { done, target, rate: Math.round((Math.min(done, target) / target) * 100) };
}

export interface RoutineStreaks {
  current: number;
  longest: number;
}

/**
 * Streak walk over scheduled days only. Unscheduled days, rest days and an
 * unfinished today are all transparent.
 */
export function calculateStreak(
  routine: Routine,
  logs: RoutineLog[],
  weekStart: 0 | 1,
  today: DateKey,
): RoutineStreaks {
  const logsByDate = indexLogsByDate(logs);
  const ctx: RoutineDayContext = { logsByDate, weekStart, today };

  const counts = (log: RoutineLog | undefined) =>
    !!log && (log.status === 'completed' || log.status === 'partial');

  let current = 0;
  let cursor = today;
  let guard = 0;
  while (cursor >= routine.schedule.startDate && guard < 1000) {
    guard += 1;
    const log = logsByDate.get(cursor);
    if (counts(log)) current += 1;
    else if (cursor === today) {
      // Day still in progress.
    } else if (isExcusedStatus(log?.status) || !isRoutineDueOn(routine, cursor, ctx)) {
      // Transparent day.
    } else break;
    cursor = addDays(cursor, -1);
  }

  let longest = 0;
  let run = 0;
  const sorted = [...logs].sort((a, b) => (a.dateKey < b.dateKey ? -1 : 1));
  let previous: DateKey | null = null;
  for (const log of sorted) {
    if (log.dateKey > today) continue;
    if (previous) {
      let gap = addDays(previous, 1);
      let broken = false;
      let gapGuard = 0;
      while (gap < log.dateKey && gapGuard < 400) {
        gapGuard += 1;
        const gapLog = logsByDate.get(gap);
        if (!isExcusedStatus(gapLog?.status) && isRoutineDueOn(routine, gap, ctx)) {
          broken = true;
          break;
        }
        gap = addDays(gap, 1);
      }
      if (broken) run = 0;
    }
    if (counts(log)) {
      run += 1;
      longest = Math.max(longest, run);
    } else if (!isExcusedStatus(log.status)) {
      run = 0;
    }
    previous = log.dateKey;
  }

  return { current, longest: Math.max(longest, current) };
}

/** Rolling average of a numeric series, used by measurement charts. */
export function calculateRollingAverage(values: number[], window: number): number[] {
  if (window <= 1) return [...values];
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}

/** Human label for the progress of a routine on a given day. */
export function describeProgress(snapshot: RoutineDaySnapshot): string {
  const { routine, actualValue, targetValue } = snapshot;
  switch (routine.trackingType) {
    case 'check':
      return snapshot.status === 'completed' ? 'Done' : 'Not done';
    case 'count':
      return `${actualValue} / ${targetValue ?? '—'}${routine.unit ? ` ${routine.unit}` : ''}`;
    case 'duration':
      return `${actualValue} / ${targetValue ?? '—'} min`;
    case 'time':
      return snapshot.log?.actualTime ?? '--:--';
    case 'session':
      return `${snapshot.periodDone ?? 0} / ${snapshot.periodTarget ?? 0} this ${
        routine.schedule.type === 'times_per_month' ? 'month' : 'week'
      }`;
    case 'numeric':
      return actualValue ? `${actualValue}${routine.unit ? ` ${routine.unit}` : ''}` : '—';
    default:
      return '';
  }
}

export function targetLabel(routine: Routine): string {
  switch (routine.trackingType) {
    case 'check':
      return 'Done / not done';
    case 'count':
      return `${routine.targetValue ?? 0}${routine.unit ? ` ${routine.unit}` : ''} per day`;
    case 'duration':
      return `${routine.targetValue ?? 0} min per day`;
    case 'time':
      return routine.targetTime ? `Target ${routine.targetTime}` : 'No target time';
    case 'session':
      return `${routine.schedule.times ?? 0}× per ${
        routine.schedule.type === 'times_per_month' ? 'month' : 'week'
      }`;
    case 'numeric':
      return routine.unit ? `Measured in ${routine.unit}` : 'Measurement';
    default:
      return '';
  }
}

export type { ScheduleRule, TrackingType };
