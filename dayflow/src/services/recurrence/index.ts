/**
 * Recurrence engine.
 *
 * Two kinds of schedule exist and they must never be confused:
 *
 *  - **Fixed** (`daily`, `specific_days`, `every_n_days`, monthly rules …)
 *    names the days an activity is *owed* on. Missing one is a miss.
 *  - **Flexible** (`times_per_week`, `times_per_month`) names only how many
 *    times per period. No individual day can be a miss; only the period can
 *    fall short.
 *
 * Occurrences are computed on demand from the rule. A ten-year daily routine is
 * one document, not 3650.
 */

import type { DateKey, ScheduleRule } from '@/types/models';
import { isFlexibleSchedule } from '@/types/models';
import { addDays, dayOfWeek, daysInMonth, diffDays, fromDateKey } from '@/utils/date';

/** Is the rule active at all on this date (window check only)? */
function inWindow(rule: ScheduleRule, date: DateKey): boolean {
  if (date < rule.startDate) return false;
  if (rule.endDate && date > rule.endDate) return false;
  return true;
}

/**
 * True when a *fixed* schedule places the activity on this day.
 * Flexible schedules always return false here — they are never owed on a
 * specific day. Use `isAvailableOn` to decide whether logging is allowed.
 */
export function isScheduledOn(rule: ScheduleRule, date: DateKey): boolean {
  if (!inWindow(rule, date)) return false;
  if (isFlexibleSchedule(rule)) return false;

  const dow = dayOfWeek(date);

  switch (rule.type) {
    case 'daily':
      return true;
    case 'weekdays':
      return dow >= 1 && dow <= 5;
    case 'weekends':
      return dow === 0 || dow === 6;
    case 'specific_days':
      return (rule.daysOfWeek ?? []).includes(dow);
    case 'every_n_days': {
      const step = Math.max(1, Math.round(rule.interval ?? 1));
      return diffDays(rule.startDate, date) % step === 0;
    }
    case 'every_n_weeks': {
      const step = Math.max(1, Math.round(rule.interval ?? 1));
      const days = (rule.daysOfWeek ?? [dayOfWeek(rule.startDate)]);
      if (!days.includes(dow)) return false;
      // Count whole weeks from the week containing the anchor.
      const weeksApart = Math.floor(diffDays(rule.startDate, date) / 7);
      return weeksApart % step === 0;
    }
    case 'monthly_day': {
      const anchor = rule.dayOfMonth ?? fromDateKey(rule.startDate).getDate();
      const d = fromDateKey(date);
      const lastDay = daysInMonth(d.getFullYear(), d.getMonth());
      // "31st monthly" still fires on 30 April and 28 February.
      return d.getDate() === Math.min(anchor, lastDay);
    }
    case 'monthly_nth_weekday': {
      const targetWeekday = rule.weekday ?? dayOfWeek(rule.startDate);
      if (dow !== targetWeekday) return false;
      const d = fromDateKey(date);
      const nth = rule.nth ?? 1;
      const occurrence = Math.floor((d.getDate() - 1) / 7) + 1;
      if (nth === 5) {
        // "Last" — no further same-weekday date exists in this month.
        return d.getDate() + 7 > daysInMonth(d.getFullYear(), d.getMonth());
      }
      return occurrence === nth;
    }
    default:
      return false;
  }
}

/**
 * True when the activity may be logged on this day. Flexible activities are
 * available every day inside their window; fixed ones only on scheduled days.
 */
export function isAvailableOn(rule: ScheduleRule, date: DateKey): boolean {
  if (!inWindow(rule, date)) return false;
  if (isFlexibleSchedule(rule)) return true;
  return isScheduledOn(rule, date);
}

/** Scheduled dates inside an inclusive window (fixed schedules only). */
export function occurrencesInRange(
  rule: ScheduleRule,
  from: DateKey,
  to: DateKey,
  limit = 400,
): DateKey[] {
  const out: DateKey[] = [];
  let cursor = from < rule.startDate ? rule.startDate : from;
  let guard = 0;
  while (cursor <= to && out.length < limit && guard < 2000) {
    guard += 1;
    if (isScheduledOn(rule, cursor)) out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

export function nextOccurrence(rule: ScheduleRule, after: DateKey): DateKey | null {
  let cursor = addDays(after, 1);
  if (cursor < rule.startDate) cursor = rule.startDate;
  for (let i = 0; i < 800; i += 1) {
    if (rule.endDate && cursor > rule.endDate) return null;
    if (isScheduledOn(rule, cursor)) return cursor;
    cursor = addDays(cursor, 1);
  }
  return null;
}

/** How many times a fixed schedule fires inside a window. */
export function countScheduledDays(rule: ScheduleRule, dates: DateKey[]): number {
  return dates.filter((d) => isScheduledOn(rule, d)).length;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ORDINALS = ['', 'first', 'second', 'third', 'fourth', 'last'];

export function describeSchedule(rule: ScheduleRule | null | undefined): string {
  if (!rule) return 'No schedule';
  switch (rule.type) {
    case 'daily':
      return 'Every day';
    case 'weekdays':
      return 'Weekdays';
    case 'weekends':
      return 'Weekends';
    case 'specific_days': {
      const days = (rule.daysOfWeek ?? []).slice().sort((a, b) => a - b);
      if (days.length === 0) return 'Specific days';
      if (days.length === 7) return 'Every day';
      return days.map((d) => DAY_NAMES[d]).join(' · ');
    }
    case 'times_per_week':
      return `${rule.times ?? 1}× per week`;
    case 'times_per_month':
      return `${rule.times ?? 1}× per month`;
    case 'every_n_days': {
      const n = Math.max(1, rule.interval ?? 1);
      return n === 1 ? 'Every day' : `Every ${n} days`;
    }
    case 'every_n_weeks': {
      const n = Math.max(1, rule.interval ?? 1);
      const days = (rule.daysOfWeek ?? []).map((d) => DAY_NAMES[d]).join(' · ');
      return n === 1 ? `Weekly on ${days}` : `Every ${n} weeks on ${days}`;
    }
    case 'monthly_day':
      return `Monthly on day ${rule.dayOfMonth ?? fromDateKey(rule.startDate).getDate()}`;
    case 'monthly_nth_weekday':
      return `The ${ORDINALS[rule.nth ?? 1]} ${DAY_NAMES[rule.weekday ?? 0]} each month`;
    default:
      return 'Custom';
  }
}

// ---------------------------------------------------------------------------
// Virtual task occurrences
// ---------------------------------------------------------------------------

/**
 * A recurring task is stored once as a template. An occurrence only becomes a
 * real document when the user touches it (completes, edits, reschedules), and
 * that document carries `parentTaskId` so the template knows the day is already
 * materialised.
 */
export function virtualOccurrenceId(templateId: string, date: DateKey): string {
  return `virtual:${templateId}:${date}`;
}

export function isVirtualOccurrence(id: string): boolean {
  return id.startsWith('virtual:');
}

export function parseVirtualOccurrence(
  id: string,
): { templateId: string; dateKey: DateKey } | null {
  if (!isVirtualOccurrence(id)) return null;
  const parts = id.split(':');
  if (parts.length !== 3) return null;
  return { templateId: parts[1], dateKey: parts[2] };
}
