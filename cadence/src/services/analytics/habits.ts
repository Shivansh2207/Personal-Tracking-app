/**
 * Habit scheduling, consistency and streak maths.
 *
 * Two distinct questions are answered separately, which is what makes flexible
 * habits behave fairly:
 *
 *  - "available"  — may this habit be logged on this day at all?
 *  - "required"   — should this day count in the *denominator* of the score?
 *
 * A "3× per week" habit is available every day but only becomes required when
 * skipping it would make the weekly target unreachable. It is therefore never
 * marked failed simply because it was not done daily.
 */

import type { DateKey, Habit, HabitLog, HabitLogStatus } from '@/types/models';
import {
  addDays,
  dayOfWeek,
  endOfMonth,
  endOfWeek,
  isSameOrBefore,
  startOfMonth,
  startOfWeek,
} from '@/utils/date';

export interface HabitEvaluationContext {
  /** All logs for the habit, keyed by date. */
  logsByDate: Map<DateKey, HabitLog>;
  weekStart: 0 | 1;
  /** Days after this key are treated as "not yet happened". */
  today: DateKey;
}

export function indexLogsByDate(logs: HabitLog[]): Map<DateKey, HabitLog> {
  const map = new Map<DateKey, HabitLog>();
  for (const log of logs) map.set(log.date, log);
  return map;
}

export function groupLogsByHabit(logs: HabitLog[]): Map<string, HabitLog[]> {
  const map = new Map<string, HabitLog[]>();
  for (const log of logs) {
    const list = map.get(log.habitId);
    if (list) list.push(log);
    else map.set(log.habitId, [log]);
  }
  return map;
}

/** Does this log represent a finished day for the habit? */
export function isLogComplete(log: HabitLog | undefined, habit: Habit): boolean {
  if (!log) return false;
  if (log.status === 'completed') return true;
  if (log.status === 'skipped' || log.status === 'missed') return false;
  // `partial` still counts once it reaches the target (defensive).
  return log.value >= habit.target;
}

/** True when the habit can be logged on this day (ignores weekly quotas). */
export function isHabitAvailableOn(habit: Habit, date: DateKey): boolean {
  if (date < habit.startDate) return false;
  if (!habit.active && !habit.archivedAt) return false;
  const freq = habit.frequency;
  if (freq.type === 'specific_days') {
    return (freq.daysOfWeek ?? []).includes(dayOfWeek(date));
  }
  return true;
}

/**
 * True when the day counts toward the habit's scheduled denominator.
 * Flexible habits become required only when the quota is still reachable and
 * the remaining days exactly match the remaining completions.
 */
export function isHabitRequiredOn(
  habit: Habit,
  date: DateKey,
  ctx: HabitEvaluationContext,
): boolean {
  if (!isHabitAvailableOn(habit, date)) return false;

  const log = ctx.logsByDate.get(date);
  if (log?.status === 'skipped') return false;
  // Already done — always give credit for it.
  if (isLogComplete(log, habit)) return true;

  const freq = habit.frequency;
  if (freq.type === 'daily' || freq.type === 'specific_days') return true;

  const times = Math.max(1, freq.times ?? 1);
  const periodStart =
    freq.type === 'times_per_week' ? startOfWeek(date, ctx.weekStart) : startOfMonth(date);
  const periodEnd =
    freq.type === 'times_per_week' ? endOfWeek(date, ctx.weekStart) : endOfMonth(date);

  let done = 0;
  let cursor = periodStart;
  while (cursor < date) {
    if (isLogComplete(ctx.logsByDate.get(cursor), habit)) done += 1;
    cursor = addDays(cursor, 1);
  }

  const remainingNeeded = times - done;
  if (remainingNeeded <= 0) return false;

  // Days left in the period, including today.
  let daysLeft = 0;
  cursor = date;
  while (isSameOrBefore(cursor, periodEnd)) {
    if (isHabitAvailableOn(habit, cursor)) daysLeft += 1;
    cursor = addDays(cursor, 1);
  }

  return remainingNeeded >= daysLeft;
}

export interface HabitDaySnapshot {
  habitId: string;
  date: DateKey;
  available: boolean;
  required: boolean;
  completed: boolean;
  status: HabitLogStatus | 'pending';
  value: number;
}

export function snapshotHabitDay(
  habit: Habit,
  date: DateKey,
  ctx: HabitEvaluationContext,
): HabitDaySnapshot {
  const log = ctx.logsByDate.get(date);
  const available = isHabitAvailableOn(habit, date);
  const completed = isLogComplete(log, habit);
  return {
    habitId: habit.id,
    date,
    available,
    required: isHabitRequiredOn(habit, date, ctx),
    completed,
    status: log?.status ?? 'pending',
    value: log?.value ?? 0,
  };
}

export interface HabitConsistency {
  /** 0–100. */
  rate: number;
  scheduled: number;
  completed: number;
  skipped: number;
}

/**
 * Consistency across an inclusive date range.
 *
 * Fixed-schedule habits use completed/required days. Quota habits are measured
 * per period as `min(completions, target) / target`, which is the only fair way
 * to score "3× per week".
 */
export function calculateHabitConsistency(
  habit: Habit,
  range: DateKey[],
  logs: HabitLog[],
  weekStart: 0 | 1,
  today: DateKey,
): HabitConsistency {
  const logsByDate = indexLogsByDate(logs);
  const ctx: HabitEvaluationContext = { logsByDate, weekStart, today };
  const days = range.filter((d) => d >= habit.startDate && d <= today);

  if (days.length === 0) return { rate: 0, scheduled: 0, completed: 0, skipped: 0 };

  const freq = habit.frequency;
  if (freq.type === 'times_per_week' || freq.type === 'times_per_month') {
    const times = Math.max(1, freq.times ?? 1);
    const periods = new Map<DateKey, { done: number; days: number }>();
    for (const day of days) {
      const key =
        freq.type === 'times_per_week' ? startOfWeek(day, weekStart) : startOfMonth(day);
      const entry = periods.get(key) ?? { done: 0, days: 0 };
      entry.days += 1;
      if (isLogComplete(logsByDate.get(day), habit)) entry.done += 1;
      periods.set(key, entry);
    }
    let scheduled = 0;
    let completed = 0;
    for (const [, entry] of periods) {
      // Pro-rate partial periods so an in-progress week is not scored as a miss.
      const periodLength = freq.type === 'times_per_week' ? 7 : 30;
      const weight = Math.min(1, entry.days / periodLength);
      scheduled += times * weight;
      completed += Math.min(entry.done, times * weight);
    }
    const skipped = days.filter((d) => logsByDate.get(d)?.status === 'skipped').length;
    return {
      rate: scheduled > 0 ? clampPct((completed / scheduled) * 100) : 0,
      scheduled: Math.round(scheduled),
      completed: Math.round(completed),
      skipped,
    };
  }

  let scheduled = 0;
  let completed = 0;
  let skipped = 0;
  for (const day of days) {
    const log = logsByDate.get(day);
    if (log?.status === 'skipped') {
      skipped += 1;
      continue;
    }
    if (!isHabitRequiredOn(habit, day, ctx)) continue;
    scheduled += 1;
    if (isLogComplete(log, habit)) completed += 1;
  }
  return {
    rate: scheduled > 0 ? clampPct((completed / scheduled) * 100) : 0,
    scheduled,
    completed,
    skipped,
  };
}

export interface HabitStreaks {
  current: number;
  longest: number;
}

/**
 * Streak walk. Non-required days and explicit rest days are transparent — they
 * neither extend nor break a streak. Today is never treated as a miss because
 * the day is not over yet.
 */
export function calculateHabitStreaks(
  habit: Habit,
  logs: HabitLog[],
  weekStart: 0 | 1,
  today: DateKey,
): HabitStreaks {
  const logsByDate = indexLogsByDate(logs);
  const ctx: HabitEvaluationContext = { logsByDate, weekStart, today };

  let current = 0;
  let cursor = today;
  let guard = 0;
  while (cursor >= habit.startDate && guard < 1000) {
    guard += 1;
    const log = logsByDate.get(cursor);
    if (isLogComplete(log, habit)) {
      current += 1;
    } else if (cursor === today) {
      // Day still in progress.
    } else if (log?.status === 'skipped' || !isHabitRequiredOn(habit, cursor, ctx)) {
      // Transparent day.
    } else {
      break;
    }
    cursor = addDays(cursor, -1);
  }

  // Longest streak scans forward across the full logged history.
  const sorted = [...logs].sort((a, b) => (a.date < b.date ? -1 : 1));
  let longest = 0;
  let run = 0;
  let prev: DateKey | null = null;
  for (const log of sorted) {
    if (log.date > today) continue;
    if (prev) {
      let gap = addDays(prev, 1);
      let broken = false;
      let gapGuard = 0;
      while (gap < log.date && gapGuard < 400) {
        gapGuard += 1;
        const gapLog = logsByDate.get(gap);
        if (gapLog?.status !== 'skipped' && isHabitRequiredOn(habit, gap, ctx)) {
          broken = true;
          break;
        }
        gap = addDays(gap, 1);
      }
      if (broken) run = 0;
    }
    if (isLogComplete(log, habit)) {
      run += 1;
      longest = Math.max(longest, run);
    } else if (log.status !== 'skipped') {
      run = 0;
    }
    prev = log.date;
  }

  return { current, longest: Math.max(longest, current) };
}

/** Habits that count toward today's score, plus how many are already done. */
export function summariseHabitsForDay(
  habits: Habit[],
  date: DateKey,
  logsByHabit: Map<string, HabitLog[]>,
  weekStart: 0 | 1,
  today: DateKey,
): { scheduled: number; completed: number; snapshots: HabitDaySnapshot[] } {
  const snapshots: HabitDaySnapshot[] = [];
  let scheduled = 0;
  let completed = 0;
  for (const habit of habits) {
    if (!habit.active) continue;
    const ctx: HabitEvaluationContext = {
      logsByDate: indexLogsByDate(logsByHabit.get(habit.id) ?? []),
      weekStart,
      today,
    };
    const snap = snapshotHabitDay(habit, date, ctx);
    snapshots.push(snap);
    if (snap.required) {
      scheduled += 1;
      if (snap.completed) completed += 1;
    }
  }
  return { scheduled, completed, snapshots };
}

export function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}
