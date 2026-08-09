import {
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';

import type {
  DailyReview,
  DailyStats,
  DateKey,
  Reflection,
  UserSettings,
  WeeklyReview,
} from '@/types/models';
import { addDays, endOfWeek, startOfWeek, todayKey, weekKey } from '@/utils/date';
import { calculateWeeklySummary } from './analytics/aggregate';
import { pruneUndefined, tsToMillis } from './firebase/converters';
import {
  dailyReviewDoc,
  dailyReviewsCol,
  reflectionDoc,
  reflectionsCol,
  weeklyReviewDoc,
  weeklyReviewsCol,
} from './firebase/paths';
import { fetchStatsInRange, recomputeDailyStats } from './statsService';

export function mapDailyReview(snap: any): DailyReview {
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
    activityMinutes: data.activityMinutes ?? 0,
    biggestWin: data.biggestWin ?? null,
    improvement: data.improvement ?? null,
    tomorrowFocus: data.tomorrowFocus ?? null,
    energyScore: data.energyScore ?? null,
    moodScore: data.moodScore ?? null,
    isRestDay: Boolean(data.isRestDay),
    createdAt: tsToMillis(data.createdAt, Date.now()),
    updatedAt: tsToMillis(data.updatedAt, Date.now()),
  };
}

export function mapWeeklyReview(snap: any): WeeklyReview {
  const data = snap.data();
  return {
    id: snap.id,
    userId: data.userId,
    weekStart: data.weekStart,
    weekEnd: data.weekEnd,
    productivityScore: data.productivityScore ?? 0,
    taskCompletionRate: data.taskCompletionRate ?? 0,
    tasksPlanned: data.tasksPlanned ?? 0,
    tasksCompleted: data.tasksCompleted ?? 0,
    habitConsistency: data.habitConsistency ?? 0,
    focusMinutes: data.focusMinutes ?? 0,
    studyMinutes: data.studyMinutes ?? 0,
    activityCount: data.activityCount ?? 0,
    goalProgress: data.goalProgress ?? 0,
    bestDay: data.bestDay ?? null,
    weakestCategory: data.weakestCategory ?? null,
    biggestWin: data.biggestWin ?? null,
    biggestMistake: data.biggestMistake ?? null,
    slowdown: data.slowdown ?? null,
    improvement: data.improvement ?? null,
    nextWeekFocus: data.nextWeekFocus ?? null,
    realityScore: data.realityScore ?? null,
    notes: data.notes ?? null,
    createdAt: tsToMillis(data.createdAt, Date.now()),
    updatedAt: tsToMillis(data.updatedAt, Date.now()),
  };
}

export async function fetchDailyReview(
  uid: string,
  date: DateKey,
): Promise<DailyReview | null> {
  const snap = await getDoc(dailyReviewDoc(uid, date));
  return snap.exists() ? mapDailyReview(snap) : null;
}

export async function fetchDailyReviewsInRange(
  uid: string,
  from: DateKey,
  to: DateKey,
): Promise<DailyReview[]> {
  const snap = await getDocs(
    query(dailyReviewsCol(uid), where('date', '>=', from), where('date', '<=', to)),
  );
  return snap.docs.map(mapDailyReview);
}

export interface DailyReviewAnswers {
  biggestWin?: string | null;
  improvement?: string | null;
  tomorrowFocus?: string | null;
  energyScore?: number | null;
  moodScore?: number | null;
  isRestDay?: boolean;
}

/**
 * Saves the subjective half of the daily review. The objective metrics are
 * copied from the already-computed daily stats — the user never retypes a
 * number the app already knows.
 */
export async function saveDailyReview(
  uid: string,
  date: DateKey,
  stats: DailyStats | null,
  answers: DailyReviewAnswers,
  settings: UserSettings,
): Promise<DailyReview> {
  const existing = await getDoc(dailyReviewDoc(uid, date));
  const payload = pruneUndefined({
    userId: uid,
    date,
    productivityScore: stats?.productivityScore ?? 0,
    tasksPlanned: stats?.tasksPlanned ?? 0,
    tasksCompleted: stats?.tasksCompleted ?? 0,
    habitsScheduled: stats?.habitsScheduled ?? 0,
    habitsCompleted: stats?.habitsCompleted ?? 0,
    focusMinutes: stats?.focusMinutes ?? 0,
    activityMinutes: stats?.activityMinutes ?? 0,
    biggestWin: answers.biggestWin ?? null,
    improvement: answers.improvement ?? null,
    tomorrowFocus: answers.tomorrowFocus ?? null,
    energyScore: answers.energyScore ?? null,
    moodScore: answers.moodScore ?? null,
    isRestDay: Boolean(answers.isRestDay),
    createdAt: existing.exists() ? existing.data()?.createdAt : serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await setDoc(dailyReviewDoc(uid, date), payload, { merge: true });

  // Rest-day flag changes the day's classification, so refresh the aggregate.
  await recomputeDailyStats(uid, date, settings).catch(() => {});

  return mapDailyReview({ id: date, data: () => payload });
}

export async function deleteDailyReview(uid: string, date: DateKey): Promise<void> {
  await deleteDoc(dailyReviewDoc(uid, date));
}

export interface WeeklyReviewDraft {
  biggestWin?: string | null;
  biggestMistake?: string | null;
  slowdown?: string | null;
  improvement?: string | null;
  nextWeekFocus?: string | null;
  realityScore?: number | null;
  notes?: string | null;
}

export interface WeeklyReviewBundle {
  weekId: string;
  weekStart: DateKey;
  weekEnd: DateKey;
  summary: ReturnType<typeof calculateWeeklySummary>;
  previous: ReturnType<typeof calculateWeeklySummary> | null;
  saved: WeeklyReview | null;
}

/**
 * Builds the objective half of the weekly review, plus the previous week for
 * comparison. Returns `previous: null` when last week has no data, so the UI
 * can suppress a meaningless percentage change.
 */
export async function buildWeeklyReview(
  uid: string,
  anchor: DateKey,
  weekStart: 0 | 1,
): Promise<WeeklyReviewBundle> {
  const start = startOfWeek(anchor, weekStart);
  const end = endOfWeek(anchor, weekStart);
  const prevStart = addDays(start, -7);
  const prevEnd = addDays(end, -7);

  const [stats, prevStats, savedSnap] = await Promise.all([
    fetchStatsInRange(uid, start, end),
    fetchStatsInRange(uid, prevStart, prevEnd),
    getDoc(weeklyReviewDoc(uid, weekKey(anchor, weekStart))),
  ]);

  const summary = calculateWeeklySummary(start, end, stats);
  const prevHasData = prevStats.some((s) => s.dayState !== 'no_data');
  const previous = prevHasData
    ? calculateWeeklySummary(prevStart, prevEnd, prevStats)
    : null;

  return {
    weekId: weekKey(anchor, weekStart),
    weekStart: start,
    weekEnd: end,
    summary,
    previous,
    saved: savedSnap.exists() ? mapWeeklyReview(savedSnap) : null,
  };
}

export async function saveWeeklyReview(
  uid: string,
  bundle: WeeklyReviewBundle,
  draft: WeeklyReviewDraft,
  extras: { goalProgress: number; weakestCategory: string | null },
): Promise<WeeklyReview> {
  const ref = weeklyReviewDoc(uid, bundle.weekId);
  const existing = await getDoc(ref);
  const payload = pruneUndefined({
    userId: uid,
    weekStart: bundle.weekStart,
    weekEnd: bundle.weekEnd,
    productivityScore: bundle.summary.productivityScore,
    taskCompletionRate: bundle.summary.taskCompletionRate,
    tasksPlanned: bundle.summary.tasksPlanned,
    tasksCompleted: bundle.summary.tasksCompleted,
    habitConsistency: bundle.summary.habitConsistency,
    focusMinutes: bundle.summary.focusMinutes,
    studyMinutes: bundle.summary.studyMinutes,
    activityCount: bundle.summary.activityCount,
    goalProgress: extras.goalProgress,
    bestDay: bundle.summary.bestDay,
    weakestCategory: extras.weakestCategory,
    biggestWin: draft.biggestWin ?? null,
    biggestMistake: draft.biggestMistake ?? null,
    slowdown: draft.slowdown ?? null,
    improvement: draft.improvement ?? null,
    nextWeekFocus: draft.nextWeekFocus ?? null,
    realityScore: draft.realityScore ?? null,
    notes: draft.notes ?? null,
    createdAt: existing.exists() ? existing.data()?.createdAt : serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await setDoc(ref, payload, { merge: true });
  return mapWeeklyReview({ id: bundle.weekId, data: () => payload });
}

export async function fetchWeeklyReviews(uid: string): Promise<WeeklyReview[]> {
  const snap = await getDocs(weeklyReviewsCol(uid));
  return snap.docs.map(mapWeeklyReview).sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1));
}

/** Is the weekly review due? True once the configured review day has arrived. */
export function isWeeklyReviewDue(settings: UserSettings, today: DateKey = todayKey()): boolean {
  const start = startOfWeek(today, settings.weekStart);
  const end = endOfWeek(today, settings.weekStart);
  const reviewDate = (() => {
    let cursor = start;
    for (let i = 0; i < 7; i += 1) {
      if (new Date(cursor).getDay() === settings.weeklyReviewDay) return cursor;
      cursor = addDays(cursor, 1);
    }
    return end;
  })();
  return today >= reviewDate;
}

export function mapReflection(snap: any): Reflection {
  const data = snap.data();
  return {
    id: snap.id,
    userId: data.userId,
    date: data.date,
    text: data.text ?? '',
    categoryId: data.categoryId ?? null,
    createdAt: tsToMillis(data.createdAt, Date.now()),
  };
}

export async function saveReflection(
  uid: string,
  date: DateKey,
  text: string,
  categoryId?: string | null,
): Promise<Reflection> {
  const ref = doc(reflectionsCol(uid));
  const payload = pruneUndefined({
    userId: uid,
    date,
    text: text.trim(),
    categoryId: categoryId ?? null,
    createdAt: serverTimestamp(),
  });
  await setDoc(ref, payload);
  return { ...(payload as any), id: ref.id, createdAt: Date.now() } as Reflection;
}

export async function fetchReflections(
  uid: string,
  from: DateKey,
  to: DateKey,
): Promise<Reflection[]> {
  const snap = await getDocs(
    query(reflectionsCol(uid), where('date', '>=', from), where('date', '<=', to)),
  );
  return snap.docs.map(mapReflection).sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteReflection(uid: string, id: string): Promise<void> {
  await deleteDoc(reflectionDoc(uid, id));
}
