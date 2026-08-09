/**
 * Daily aggregate pipeline.
 *
 * This is the single place that turns raw records into the numbers the rest of
 * the app reads. Completing a task, ticking a habit, saving a focus session or
 * logging a workout all funnel through `recomputeDailyStats`, which is what
 * makes one action update the score, the streak, the category split, the
 * weekly rollup and the calendar at the same time.
 */

import {
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';

import type { Category, DailyStats, DateKey, DayState, UserSettings } from '@/types/models';
import { lastNDays } from '@/utils/date';
import { computeDayStats, type ComputedDay, type DayRecords } from './analytics/day';
import { expandTasksForDate } from './analytics/recurrence';
import { CACHE_KEYS, readCache, writeCache } from './firebase/cache';
import { pruneUndefined, tsToMillis } from './firebase/converters';
import {
  activityLogsCol,
  dailyReviewDoc,
  dailyStatsCol,
  dailyStatsDoc,
  habitLogsCol,
  habitsCol,
  studySessionsCol,
  subjectsCol,
  tasksCol,
} from './firebase/paths';
import { mapActivity } from './activityService';
import { mapHabit, mapHabitLog } from './habitService';
import { mapSession, mapSubject } from './studyService';
import { mapTask } from './taskService';

export function mapStats(snap: any): DailyStats {
  const data = snap.data();
  return {
    id: snap.id,
    userId: data.userId,
    date: data.date ?? snap.id,
    productivityScore: data.productivityScore ?? 0,
    tasksPlanned: data.tasksPlanned ?? 0,
    tasksCompleted: data.tasksCompleted ?? 0,
    habitsScheduled: data.habitsScheduled ?? 0,
    habitsCompleted: data.habitsCompleted ?? 0,
    focusMinutes: data.focusMinutes ?? 0,
    studyMinutes: data.studyMinutes ?? 0,
    activityMinutes: data.activityMinutes ?? 0,
    activityCount: data.activityCount ?? 0,
    categoryMinutes: data.categoryMinutes ?? {},
    categoryTasks: data.categoryTasks ?? {},
    dayState: (data.dayState ?? 'no_data') as DayState,
    updatedAt: tsToMillis(data.updatedAt, Date.now()),
  };
}

export type { DayRecords, ComputedDay };
export { computeDayStats };

/** Loads every raw record needed to score one day. */
export async function loadDayRecords(uid: string, date: DateKey): Promise<DayRecords> {
  const [
    storedSnap,
    templateSnap,
    habitSnap,
    logSnap,
    sessionSnap,
    activitySnap,
    subjectSnap,
    reviewSnap,
  ] = await Promise.all([
    getDocs(query(tasksCol(uid), where('scheduledDate', '==', date))),
    getDocs(query(tasksCol(uid), where('isRecurringTemplate', '==', true))),
    getDocs(habitsCol(uid)),
    getDocs(query(habitLogsCol(uid), where('date', '==', date))),
    getDocs(query(studySessionsCol(uid), where('date', '==', date))),
    getDocs(query(activityLogsCol(uid), where('date', '==', date))),
    getDocs(subjectsCol(uid)),
    getDoc(dailyReviewDoc(uid, date)),
  ]);

  const stored = storedSnap.docs.map(mapTask);
  const templates = templateSnap.docs.map(mapTask);

  return {
    tasks: expandTasksForDate(stored, templates, date),
    habits: habitSnap.docs.map(mapHabit),
    habitLogs: logSnap.docs.map(mapHabitLog),
    sessions: sessionSnap.docs.map(mapSession),
    activities: activitySnap.docs.map(mapActivity),
    subjects: subjectSnap.docs.map(mapSubject),
    isRestDay: Boolean(reviewSnap.data()?.isRestDay),
  };
}

/** Recomputes a day from raw records and persists the aggregate. */
export async function recomputeDailyStats(
  uid: string,
  date: DateKey,
  settings: UserSettings,
): Promise<ComputedDay> {
  const records = await loadDayRecords(uid, date);
  const computed = computeDayStats(date, records, settings);
  await setDoc(
    dailyStatsDoc(uid, date),
    pruneUndefined({
      userId: uid,
      date,
      productivityScore: computed.productivityScore,
      tasksPlanned: computed.tasksPlanned,
      tasksCompleted: computed.tasksCompleted,
      habitsScheduled: computed.habitsScheduled,
      habitsCompleted: computed.habitsCompleted,
      focusMinutes: computed.focusMinutes,
      studyMinutes: computed.studyMinutes,
      activityMinutes: computed.activityMinutes,
      activityCount: computed.activityCount,
      categoryMinutes: computed.categoryMinutes,
      categoryTasks: computed.categoryTasks,
      dayState: computed.dayState,
      updatedAt: serverTimestamp(),
    }),
    { merge: true },
  );
  return computed;
}

export async function fetchStatsInRange(
  uid: string,
  from: DateKey,
  to: DateKey,
): Promise<DailyStats[]> {
  const snap = await getDocs(
    query(dailyStatsCol(uid), where('date', '>=', from), where('date', '<=', to)),
  );
  return snap.docs.map(mapStats).sort((a, b) => (a.date < b.date ? -1 : 1));
}

export async function fetchStatsForDate(
  uid: string,
  date: DateKey,
): Promise<DailyStats | null> {
  const snap = await getDoc(dailyStatsDoc(uid, date));
  return snap.exists() ? mapStats(snap) : null;
}

/**
 * Live window used by the dashboard for the streak and the insight card.
 * Deliberately bounded — the whole history is never streamed.
 */
export function subscribeRecentStats(
  uid: string,
  days: number,
  cb: (stats: DailyStats[]) => void,
  onError?: (e: unknown) => void,
) {
  const window = lastNDays(days);
  const q = query(
    dailyStatsCol(uid),
    where('date', '>=', window[0]),
    where('date', '<=', window[window.length - 1]),
  );
  return onSnapshot(
    q,
    (snap) => {
      const stats = snap.docs.map(mapStats).sort((a, b) => (a.date < b.date ? -1 : 1));
      cb(stats);
      writeCache(uid, CACHE_KEYS.recentStats, stats);
    },
    onError,
  );
}

export async function loadCachedRecentStats(uid: string): Promise<DailyStats[]> {
  return (await readCache<DailyStats[]>(uid, CACHE_KEYS.recentStats)) ?? [];
}

/** Category ids that are synthesised rather than user-created. */
export const VIRTUAL_CATEGORY_LABELS: Record<string, string> = {
  activity: 'Activity',
  uncategorised: 'Uncategorised',
};

export function resolveCategoryName(
  categoryId: string,
  categories: Category[],
): string {
  if (VIRTUAL_CATEGORY_LABELS[categoryId]) return VIRTUAL_CATEGORY_LABELS[categoryId];
  return categories.find((c) => c.id === categoryId)?.name ?? 'Uncategorised';
}
