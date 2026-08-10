/**
 * Centralised aggregation layer.
 *
 * Raw records are the source of truth; daily and weekly summary documents exist
 * only to make analytics fast. Nothing else in the app writes these documents —
 * every mutation funnels through `recomputeDailySummary`, which is what keeps
 * the Today screen, the calendar, the insights and the weekly review agreeing
 * with each other.
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

import { computeDailySummary, type ComputedDailySummary, type DayRecords } from './analytics/daily';
import { calculateWeeklySummary } from './analytics/weekly';
import type {
  DailyReflection,
  DailySummary,
  DateKey,
  UserSettings,
  WeeklySummary,
  WeekKey,
} from '@/types/models';
import { endOfWeek, lastNDays, startOfWeek, todayKey, weekKey } from '@/utils/date';
import { CACHE_KEYS, readCache, writeCache } from './firebase/cache';
import { pruneUndefined, tsToMillis } from './firebase/converters';
import {
  dailySummariesCol,
  dailySummaryDoc,
  reflectionDoc,
  reflectionsCol,
  revisionItemsCol,
  routineLogsCol,
  routinesCol,
  studySessionsCol,
  subjectsCol,
  tasksCol,
  timetableSlotsCol,
  weeklySummariesCol,
  weeklySummaryDoc,
} from './firebase/paths';
import { mapRevision } from './revisionService';
import { mapRoutine, mapRoutineLog } from './routineService';
import { mapSession, mapSubject } from './studyService';
import { expandTasksForDate, mapTask } from './taskService';
import { mapSlot } from './timetableService';

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

export function mapDailySummary(snap: any): DailySummary {
  const data = snap.data();
  return {
    id: snap.id,
    userId: data.userId,
    dateKey: data.dateKey ?? snap.id,
    wakeTarget: data.wakeTarget ?? null,
    wakeActual: data.wakeActual ?? null,
    wakeDeviationMinutes: data.wakeDeviationMinutes ?? null,
    sleepTarget: data.sleepTarget ?? null,
    sleepActual: data.sleepActual ?? null,
    sleepDeviationMinutes: data.sleepDeviationMinutes ?? null,
    routinesScheduled: data.routinesScheduled ?? 0,
    routinesCompleted: data.routinesCompleted ?? 0,
    routinesPartial: data.routinesPartial ?? 0,
    routinesSkipped: data.routinesSkipped ?? 0,
    routineConsistency: data.routineConsistency ?? 0,
    tasksPlanned: data.tasksPlanned ?? 0,
    tasksCompleted: data.tasksCompleted ?? 0,
    studyPlannedMinutes: data.studyPlannedMinutes ?? 0,
    studyActualMinutes: data.studyActualMinutes ?? 0,
    studyExtraMinutes: data.studyExtraMinutes ?? 0,
    timetableSlots: data.timetableSlots ?? 0,
    timetableCompleted: data.timetableCompleted ?? 0,
    timetablePartial: data.timetablePartial ?? 0,
    revisionDue: data.revisionDue ?? 0,
    revisionCompleted: data.revisionCompleted ?? 0,
    categoryMinutes: data.categoryMinutes ?? {},
    overallConsistency: data.overallConsistency ?? null,
    isRestDay: Boolean(data.isRestDay),
    createdAt: tsToMillis(data.createdAt, Date.now()),
    updatedAt: tsToMillis(data.updatedAt, Date.now()),
  };
}

export function mapWeeklySummary(snap: any): WeeklySummary {
  const data = snap.data();
  return {
    id: snap.id,
    userId: data.userId,
    weekStart: data.weekStart,
    weekEnd: data.weekEnd,
    studyMinutes: data.studyMinutes ?? 0,
    studyPlannedMinutes: data.studyPlannedMinutes ?? 0,
    routineConsistency: data.routineConsistency ?? 0,
    tasksPlanned: data.tasksPlanned ?? 0,
    tasksCompleted: data.tasksCompleted ?? 0,
    timetableAdherence: data.timetableAdherence ?? 0,
    wakeAverageMinutes: data.wakeAverageMinutes ?? null,
    revisionCompleted: data.revisionCompleted ?? 0,
    daysWithData: data.daysWithData ?? 0,
    subjectBreakdown: data.subjectBreakdown ?? {},
    biggestWin: data.biggestWin ?? null,
    biggestProblem: data.biggestProblem ?? null,
    nextWeekFocus: data.nextWeekFocus ?? null,
    realityScore: data.realityScore ?? null,
    createdAt: tsToMillis(data.createdAt, Date.now()),
    updatedAt: tsToMillis(data.updatedAt, Date.now()),
  };
}

export function mapReflection(snap: any): DailyReflection {
  const data = snap.data();
  return {
    id: snap.id,
    userId: data.userId,
    dateKey: data.dateKey ?? snap.id,
    dayRating: data.dayRating ?? null,
    energy: data.energy ?? null,
    mood: data.mood ?? null,
    biggestWin: data.biggestWin ?? null,
    tomorrowFocus: data.tomorrowFocus ?? null,
    isRestDay: Boolean(data.isRestDay),
    createdAt: tsToMillis(data.createdAt, Date.now()),
    updatedAt: tsToMillis(data.updatedAt, Date.now()),
  };
}

// ---------------------------------------------------------------------------
// Loading raw records for a day
// ---------------------------------------------------------------------------

export async function loadDayRecords(uid: string, dateKey: DateKey): Promise<DayRecords> {
  const [
    routineSnap,
    logSnap,
    storedTaskSnap,
    templateSnap,
    sessionSnap,
    slotSnap,
    revisionSnap,
    subjectSnap,
    reflectionSnap,
  ] = await Promise.all([
    getDocs(routinesCol(uid)),
    getDocs(query(routineLogsCol(uid), where('dateKey', '==', dateKey))),
    getDocs(query(tasksCol(uid), where('dateKey', '==', dateKey))),
    getDocs(query(tasksCol(uid), where('isRecurringTemplate', '==', true))),
    getDocs(query(studySessionsCol(uid), where('dateKey', '==', dateKey))),
    getDocs(timetableSlotsCol(uid)),
    getDocs(query(revisionItemsCol(uid), where('dueDateKey', '==', dateKey))),
    getDocs(subjectsCol(uid)),
    getDoc(reflectionDoc(uid, dateKey)),
  ]);

  const routines = routineSnap.docs.map(mapRoutine);
  const routineLogs = logSnap.docs.map(mapRoutineLog);

  // Wake and sleep are `time` routines; their logged clock time is what the
  // summary records.
  const wakeRoutine = routines.find((r) => r.trackingType === 'time' && isWake(r.name));
  const sleepRoutine = routines.find((r) => r.trackingType === 'time' && isSleep(r.name));
  const wakeLog = wakeRoutine
    ? routineLogs.find((l) => l.routineId === wakeRoutine.id)
    : undefined;
  const sleepLog = sleepRoutine
    ? routineLogs.find((l) => l.routineId === sleepRoutine.id)
    : undefined;

  return {
    routines,
    routineLogs,
    tasks: expandTasksForDate(
      storedTaskSnap.docs.map(mapTask),
      templateSnap.docs.map(mapTask),
      dateKey,
    ),
    sessions: sessionSnap.docs.map(mapSession),
    slots: slotSnap.docs.map(mapSlot),
    revisions: revisionSnap.docs.map(mapRevision),
    subjects: subjectSnap.docs.map(mapSubject),
    wakeActual: wakeLog?.actualTime ?? null,
    sleepActual: sleepLog?.actualTime ?? null,
    isRestDay: Boolean(reflectionSnap.data()?.isRestDay),
  };
}

/** The two `time` routines the app creates for itself get special treatment. */
export function isWake(name: string): boolean {
  return /wake/i.test(name);
}
export function isSleep(name: string): boolean {
  return /sleep|bed/i.test(name);
}

// ---------------------------------------------------------------------------
// Recompute
// ---------------------------------------------------------------------------

export async function recomputeDailySummary(
  uid: string,
  dateKey: DateKey,
  settings: UserSettings,
): Promise<ComputedDailySummary> {
  const records = await loadDayRecords(uid, dateKey);
  const computed = computeDailySummary(dateKey, records, settings, todayKey());
  await setDoc(
    dailySummaryDoc(uid, dateKey),
    pruneUndefined({ userId: uid, ...computed, updatedAt: serverTimestamp() }),
    { merge: true },
  );
  return computed;
}

export async function fetchDailySummaries(
  uid: string,
  from: DateKey,
  to: DateKey,
): Promise<DailySummary[]> {
  const snap = await getDocs(
    query(dailySummariesCol(uid), where('dateKey', '>=', from), where('dateKey', '<=', to)),
  );
  return snap.docs.map(mapDailySummary).sort((a, b) => (a.dateKey < b.dateKey ? -1 : 1));
}

export async function fetchDailySummary(
  uid: string,
  dateKey: DateKey,
): Promise<DailySummary | null> {
  const snap = await getDoc(dailySummaryDoc(uid, dateKey));
  return snap.exists() ? mapDailySummary(snap) : null;
}

/** Bounded live window used by the Today screen and streak calculation. */
export function subscribeRecentSummaries(
  uid: string,
  days: number,
  cb: (summaries: DailySummary[]) => void,
  onError?: (e: unknown) => void,
) {
  const window = lastNDays(days);
  return onSnapshot(
    query(
      dailySummariesCol(uid),
      where('dateKey', '>=', window[0]),
      where('dateKey', '<=', window[window.length - 1]),
    ),
    (snap) => {
      const summaries = snap.docs
        .map(mapDailySummary)
        .sort((a, b) => (a.dateKey < b.dateKey ? -1 : 1));
      cb(summaries);
      writeCache(uid, CACHE_KEYS.recentSummaries, summaries);
    },
    onError,
  );
}

export async function loadCachedSummaries(uid: string): Promise<DailySummary[]> {
  return (await readCache<DailySummary[]>(uid, CACHE_KEYS.recentSummaries)) ?? [];
}

// ---------------------------------------------------------------------------
// Weekly
// ---------------------------------------------------------------------------

export interface WeeklyBundle {
  weekId: WeekKey;
  weekStart: DateKey;
  weekEnd: DateKey;
  summary: ReturnType<typeof calculateWeeklySummary>;
  previous: ReturnType<typeof calculateWeeklySummary> | null;
  saved: WeeklySummary | null;
}

export async function buildWeeklySummary(
  uid: string,
  anchor: DateKey,
  weekStart: 0 | 1,
): Promise<WeeklyBundle> {
  const start = startOfWeek(anchor, weekStart);
  const end = endOfWeek(anchor, weekStart);
  const prevStart = shiftWeeks(start, -1);
  const prevEnd = shiftWeeks(end, -1);

  const [summaries, prevSummaries, sessions, savedSnap] = await Promise.all([
    fetchDailySummaries(uid, start, end),
    fetchDailySummaries(uid, prevStart, prevEnd),
    getDocs(
      query(studySessionsCol(uid), where('dateKey', '>=', start), where('dateKey', '<=', end)),
    ),
    getDoc(weeklySummaryDoc(uid, weekKey(anchor, weekStart))),
  ]);

  const subjectMinutes: Record<string, number> = {};
  for (const doc of sessions.docs) {
    const session = mapSession(doc);
    if (!session.subjectId) continue;
    subjectMinutes[session.subjectId] =
      (subjectMinutes[session.subjectId] ?? 0) + session.actualMinutes;
  }

  const previousHasData = prevSummaries.some(
    (s) => s.overallConsistency !== null || s.studyActualMinutes > 0,
  );

  return {
    weekId: weekKey(anchor, weekStart),
    weekStart: start,
    weekEnd: end,
    summary: calculateWeeklySummary(start, end, summaries, subjectMinutes),
    previous: previousHasData
      ? calculateWeeklySummary(prevStart, prevEnd, prevSummaries)
      : null,
    saved: savedSnap.exists() ? mapWeeklySummary(savedSnap) : null,
  };
}

export interface WeeklyReflectionDraft {
  biggestWin?: string | null;
  biggestProblem?: string | null;
  nextWeekFocus?: string | null;
  realityScore?: number | null;
}

export async function saveWeeklySummary(
  uid: string,
  bundle: WeeklyBundle,
  draft: WeeklyReflectionDraft,
): Promise<void> {
  const existing = await getDoc(weeklySummaryDoc(uid, bundle.weekId));
  await setDoc(
    weeklySummaryDoc(uid, bundle.weekId),
    pruneUndefined({
      userId: uid,
      ...bundle.summary,
      biggestWin: draft.biggestWin ?? null,
      biggestProblem: draft.biggestProblem ?? null,
      nextWeekFocus: draft.nextWeekFocus ?? null,
      realityScore: draft.realityScore ?? null,
      createdAt: existing.exists() ? existing.data()?.createdAt : serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
    { merge: true },
  );
}

export async function fetchWeeklySummaries(uid: string): Promise<WeeklySummary[]> {
  const snap = await getDocs(weeklySummariesCol(uid));
  return snap.docs.map(mapWeeklySummary).sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1));
}

function shiftWeeks(key: DateKey, weeks: number): DateKey {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + weeks * 7);
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// ---------------------------------------------------------------------------
// Reflections
// ---------------------------------------------------------------------------

export interface ReflectionDraft {
  dayRating?: number | null;
  energy?: number | null;
  mood?: number | null;
  biggestWin?: string | null;
  tomorrowFocus?: string | null;
  isRestDay?: boolean;
}

export async function saveReflection(
  uid: string,
  dateKey: DateKey,
  draft: ReflectionDraft,
  settings: UserSettings,
): Promise<void> {
  const existing = await getDoc(reflectionDoc(uid, dateKey));
  await setDoc(
    reflectionDoc(uid, dateKey),
    pruneUndefined({
      userId: uid,
      dateKey,
      dayRating: draft.dayRating ?? null,
      energy: draft.energy ?? null,
      mood: draft.mood ?? null,
      biggestWin: draft.biggestWin ?? null,
      tomorrowFocus: draft.tomorrowFocus ?? null,
      isRestDay: Boolean(draft.isRestDay),
      createdAt: existing.exists() ? existing.data()?.createdAt : serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
    { merge: true },
  );
  // A rest-day flag changes the day's classification.
  await recomputeDailySummary(uid, dateKey, settings).catch(() => {});
}

export async function fetchReflection(
  uid: string,
  dateKey: DateKey,
): Promise<DailyReflection | null> {
  const snap = await getDoc(reflectionDoc(uid, dateKey));
  return snap.exists() ? mapReflection(snap) : null;
}

export async function fetchReflections(
  uid: string,
  from: DateKey,
  to: DateKey,
): Promise<DailyReflection[]> {
  const snap = await getDocs(
    query(reflectionsCol(uid), where('dateKey', '>=', from), where('dateKey', '<=', to)),
  );
  return snap.docs.map(mapReflection);
}

export type { ComputedDailySummary, DayRecords };
export { computeDailySummary };
