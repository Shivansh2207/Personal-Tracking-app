/**
 * Local-day date utilities.
 *
 * The whole product is organised around "what did I do on this local day", so
 * every persisted grouping key is a `YYYY-MM-DD` string built from local
 * calendar fields — never from `toISOString()`, which would silently shift a
 * 23:55 completion into tomorrow.
 */

import type { DateKey, TimeString, WeekKey } from '@/types/models';

export const MS_PER_DAY = 86_400_000;

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

/** `YYYY-MM-DD` from a Date's *local* calendar fields. */
export function toDateKey(date: Date = new Date()): DateKey {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Parses `YYYY-MM-DD` into a local Date at midnight. */
export function fromDateKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
}

export function isValidDateKey(key: string | null | undefined): key is DateKey {
  if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const d = fromDateKey(key);
  return !Number.isNaN(d.getTime()) && toDateKey(d) === key;
}

export function todayKey(): DateKey {
  return toDateKey(new Date());
}

export function addDays(key: DateKey, days: number): DateKey {
  const d = fromDateKey(key);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

export function addMonths(key: DateKey, months: number): DateKey {
  const d = fromDateKey(key);
  const targetMonth = d.getMonth() + months;
  const anchor = new Date(d.getFullYear(), targetMonth, 1);
  const lastDay = daysInMonth(anchor.getFullYear(), anchor.getMonth());
  anchor.setDate(Math.min(d.getDate(), lastDay));
  return toDateKey(anchor);
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** Whole local days between two keys (`b - a`). */
export function diffDays(a: DateKey, b: DateKey): number {
  const da = fromDateKey(a).getTime();
  const db = fromDateKey(b).getTime();
  return Math.round((db - da) / MS_PER_DAY);
}

export function compareDateKeys(a: DateKey, b: DateKey): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isBefore(a: DateKey, b: DateKey): boolean {
  return a < b;
}

export function isAfter(a: DateKey, b: DateKey): boolean {
  return a > b;
}

export function isSameOrBefore(a: DateKey, b: DateKey): boolean {
  return a <= b;
}

/** Inclusive list of date keys from `start` to `end`. */
export function dateRange(start: DateKey, end: DateKey): DateKey[] {
  if (end < start) return [];
  const out: DateKey[] = [];
  let cursor = start;
  // Guard against pathological ranges (>10 years).
  for (let i = 0; i <= 3700 && cursor <= end; i += 1) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

/** The last `count` days ending at (and including) `end`. */
export function lastNDays(count: number, end: DateKey = todayKey()): DateKey[] {
  return dateRange(addDays(end, -(count - 1)), end);
}

/** 0 = Sunday … 6 = Saturday, in local time. */
export function dayOfWeek(key: DateKey): number {
  return fromDateKey(key).getDay();
}

/** First day of the week containing `key`, honouring `weekStart` (0=Sun,1=Mon). */
export function startOfWeek(key: DateKey, weekStart: 0 | 1 = 1): DateKey {
  const dow = dayOfWeek(key);
  const delta = (dow - weekStart + 7) % 7;
  return addDays(key, -delta);
}

export function endOfWeek(key: DateKey, weekStart: 0 | 1 = 1): DateKey {
  return addDays(startOfWeek(key, weekStart), 6);
}

export function startOfMonth(key: DateKey): DateKey {
  const d = fromDateKey(key);
  return toDateKey(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function endOfMonth(key: DateKey): DateKey {
  const d = fromDateKey(key);
  return toDateKey(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

/**
 * Stable week identifier used as the weeklyReviews document id.
 * Derived from the week's start date so it never disagrees with `weekStart`.
 */
export function weekKey(key: DateKey, weekStart: 0 | 1 = 1): WeekKey {
  const start = startOfWeek(key, weekStart);
  const startDate = fromDateKey(start);
  const yearStart = new Date(startDate.getFullYear(), 0, 1);
  const week = Math.floor(diffDays(toDateKey(yearStart), start) / 7) + 1;
  return `${startDate.getFullYear()}-W${pad(week)}`;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const DAYS_LONG = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export const DAY_LABELS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAY_LABELS_MIN = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function monthName(monthIndex: number): string {
  return MONTHS[monthIndex] ?? '';
}

export function dayName(dow: number): string {
  return DAYS_LONG[dow] ?? '';
}

/** "Sunday, 9 August" */
export function formatLongDate(key: DateKey): string {
  const d = fromDateKey(key);
  return `${DAYS_LONG[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "9 Aug" */
export function formatShortDate(key: DateKey): string {
  const d = fromDateKey(key);
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
}

/** "Today" / "Tomorrow" / "Yesterday" / "Sat 9 Aug" */
export function formatRelativeDate(key: DateKey, today: DateKey = todayKey()): string {
  const delta = diffDays(today, key);
  if (delta === 0) return 'Today';
  if (delta === 1) return 'Tomorrow';
  if (delta === -1) return 'Yesterday';
  const d = fromDateKey(key);
  if (Math.abs(delta) < 7) {
    return `${DAY_LABELS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
  }
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}${
    d.getFullYear() !== fromDateKey(today).getFullYear() ? ` ${d.getFullYear()}` : ''
  }`;
}

/** Minutes since local midnight from `HH:mm`. Returns null on malformed input. */
export function timeToMinutes(time: TimeString | null | undefined): number | null {
  if (!time) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!m) return null;
  const h = Number(m[1]);
  const mins = Number(m[2]);
  if (h > 23 || mins > 59) return null;
  return h * 60 + mins;
}

export function minutesToTime(minutes: number): TimeString {
  const clamped = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(clamped / 60))}:${pad(clamped % 60)}`;
}

/** "7:00 PM" or "19:00" depending on preference. */
export function formatTime(time: TimeString | null | undefined, use24 = false): string {
  const mins = timeToMinutes(time);
  if (mins === null) return '';
  if (use24) return minutesToTime(mins);
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${pad(m)} ${suffix}`;
}

/** "2h 45m" / "45m" / "—" */
export function formatDuration(minutes: number | null | undefined, dash = '—'): string {
  if (minutes === null || minutes === undefined || Number.isNaN(minutes)) return dash;
  const total = Math.max(0, Math.round(minutes));
  if (total === 0) return '0m';
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** "01:23:45" for the running focus timer. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/** Day part used for the "Morning / Afternoon / Evening" grouping. */
export type DayPart = 'morning' | 'afternoon' | 'evening' | 'anytime';

export function dayPartForTime(time: TimeString | null | undefined): DayPart {
  const mins = timeToMinutes(time);
  if (mins === null) return 'anytime';
  if (mins < 12 * 60) return 'morning';
  if (mins < 17 * 60) return 'afternoon';
  return 'evening';
}

export const DAY_PART_LABELS: Record<DayPart, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  anytime: 'Anytime',
};

export function greetingForHour(hour: number = new Date().getHours()): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Combines a date key + `HH:mm` into an absolute local timestamp. */
export function dateTimeToTimestamp(key: DateKey, time?: TimeString | null): number {
  const d = fromDateKey(key);
  const mins = timeToMinutes(time);
  if (mins !== null) {
    d.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
  }
  return d.getTime();
}

export function resolveTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** "This Weekend" shortcut — the coming Saturday (today if already Saturday). */
export function nextWeekendKey(today: DateKey = todayKey()): DateKey {
  const dow = dayOfWeek(today);
  if (dow === 6) return today;
  return addDays(today, (6 - dow + 7) % 7);
}

/** "Next Week" shortcut — the start of the following week. */
export function nextWeekKey(today: DateKey = todayKey(), weekStart: 0 | 1 = 1): DateKey {
  return addDays(startOfWeek(today, weekStart), 7);
}

/** Calendar grid (always 6 rows x 7 columns) for the month containing `key`. */
export function monthGrid(key: DateKey, weekStart: 0 | 1 = 1): DateKey[] {
  const first = startOfMonth(key);
  const gridStart = startOfWeek(first, weekStart);
  const cells: DateKey[] = [];
  for (let i = 0; i < 42; i += 1) cells.push(addDays(gridStart, i));
  return cells;
}

export function weekdayHeaders(weekStart: 0 | 1 = 1): string[] {
  return Array.from({ length: 7 }, (_, i) => DAY_LABELS_MIN[(i + weekStart) % 7]);
}
