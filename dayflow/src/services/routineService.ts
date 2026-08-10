import {
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

import { deriveStatus } from '@/services/analytics/routines';
import type {
  DateKey,
  DayPart,
  Routine,
  RoutineLog,
  RoutineLogStatus,
  ScheduleRule,
  TimeString,
  TrackingType,
} from '@/types/models';
import { dayPartForTime, todayKey } from '@/utils/date';
import { CACHE_KEYS, readCache, writeCache } from './firebase/cache';
import { db } from './firebase/config';
import { pruneUndefined, tsToMillis } from './firebase/converters';
import { routineDoc, routineLogDoc, routineLogId, routineLogsCol, routinesCol } from './firebase/paths';

// ---------------------------------------------------------------------------
// Suggestions offered during onboarding
// ---------------------------------------------------------------------------

export interface RoutineSuggestion {
  name: string;
  icon: string;
  trackingType: TrackingType;
  targetValue: number | null;
  unit: string | null;
  targetTime: TimeString | null;
  schedule: Partial<ScheduleRule> & { type: ScheduleRule['type'] };
  dayPart: DayPart;
  preferredTime: TimeString | null;
}

export const MORNING_SUGGESTIONS: RoutineSuggestion[] = [
  { name: 'Face Routine', icon: 'droplet', trackingType: 'check', targetValue: null, unit: null, targetTime: null, schedule: { type: 'daily' }, dayPart: 'morning', preferredTime: '07:15' },
  { name: 'Breakfast', icon: 'coffee', trackingType: 'check', targetValue: null, unit: null, targetTime: null, schedule: { type: 'daily' }, dayPart: 'morning', preferredTime: '08:00' },
  { name: 'Vitamins', icon: 'heart', trackingType: 'check', targetValue: null, unit: null, targetTime: null, schedule: { type: 'daily' }, dayPart: 'morning', preferredTime: '08:15' },
  { name: 'Exercise', icon: 'activity', trackingType: 'session', targetValue: null, unit: 'sessions', targetTime: null, schedule: { type: 'times_per_week', times: 4 }, dayPart: 'morning', preferredTime: null },
  { name: 'Water', icon: 'droplet', trackingType: 'count', targetValue: 8, unit: 'glasses', targetTime: null, schedule: { type: 'daily' }, dayPart: 'anytime', preferredTime: null },
];

export const EVENING_SUGGESTIONS: RoutineSuggestion[] = [
  { name: 'Reading', icon: 'book-open', trackingType: 'count', targetValue: 20, unit: 'pages', targetTime: null, schedule: { type: 'daily' }, dayPart: 'evening', preferredTime: '20:00' },
  { name: 'Skincare', icon: 'droplet', trackingType: 'check', targetValue: null, unit: null, targetTime: null, schedule: { type: 'daily' }, dayPart: 'night', preferredTime: '22:30' },
  { name: 'Plan Tomorrow', icon: 'edit-3', trackingType: 'check', targetValue: null, unit: null, targetTime: null, schedule: { type: 'daily' }, dayPart: 'night', preferredTime: '22:45' },
  { name: 'Meditation', icon: 'moon', trackingType: 'duration', targetValue: 15, unit: 'min', targetTime: null, schedule: { type: 'daily' }, dayPart: 'night', preferredTime: '22:00' },
];

export const PRACTICE_SUGGESTIONS: RoutineSuggestion[] = [
  { name: 'Maths Practice', icon: 'target', trackingType: 'count', targetValue: 20, unit: 'questions', targetTime: null, schedule: { type: 'specific_days', daysOfWeek: [3, 6] }, dayPart: 'evening', preferredTime: '20:00' },
  { name: 'Coding Practice', icon: 'code', trackingType: 'count', targetValue: 2, unit: 'problems', targetTime: null, schedule: { type: 'weekdays' }, dayPart: 'evening', preferredTime: '21:00' },
];

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

export function mapRoutine(snap: any): Routine {
  const data = snap.data();
  return {
    id: snap.id,
    userId: data.userId,
    name: data.name ?? '',
    icon: data.icon ?? 'circle',
    categoryId: data.categoryId ?? null,
    trackingType: data.trackingType ?? 'check',
    targetValue: data.targetValue ?? null,
    unit: data.unit ?? null,
    targetTime: data.targetTime ?? null,
    schedule: data.schedule ?? { type: 'daily', startDate: todayKey() },
    preferredTime: data.preferredTime ?? null,
    dayPart: data.dayPart ?? dayPartForTime(data.preferredTime),
    reminderEnabled: Boolean(data.reminderEnabled),
    reminderTime: data.reminderTime ?? null,
    notificationId: data.notificationId ?? null,
    linkedSubjectId: data.linkedSubjectId ?? null,
    active: data.active !== false,
    order: data.order ?? 0,
    createdAt: tsToMillis(data.createdAt, Date.now()),
    updatedAt: tsToMillis(data.updatedAt, Date.now()),
    archivedAt: data.archivedAt ? tsToMillis(data.archivedAt) : null,
  };
}

export function mapRoutineLog(snap: any): RoutineLog {
  const data = snap.data();
  return {
    id: snap.id,
    userId: data.userId,
    routineId: data.routineId,
    dateKey: data.dateKey,
    actualValue: data.actualValue ?? 0,
    targetValueSnapshot: data.targetValueSnapshot ?? null,
    actualTime: data.actualTime ?? null,
    status: data.status ?? 'completed',
    startedAt: data.startedAt ? tsToMillis(data.startedAt) : null,
    completedAt: tsToMillis(data.completedAt, Date.now()),
    notes: data.notes ?? null,
    createdAt: tsToMillis(data.createdAt, Date.now()),
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export function subscribeRoutines(
  uid: string,
  cb: (routines: Routine[]) => void,
  onError?: (e: unknown) => void,
) {
  return onSnapshot(
    routinesCol(uid),
    (snap) => {
      const routines = snap.docs.map(mapRoutine).sort((a, b) => a.order - b.order);
      cb(routines);
      writeCache(uid, CACHE_KEYS.routines, routines);
    },
    onError,
  );
}

export function subscribeRoutineLogsForDate(
  uid: string,
  dateKey: DateKey,
  cb: (logs: RoutineLog[]) => void,
  onError?: (e: unknown) => void,
) {
  return onSnapshot(
    query(routineLogsCol(uid), where('dateKey', '==', dateKey)),
    (snap) => {
      const logs = snap.docs.map(mapRoutineLog);
      cb(logs);
      if (dateKey === todayKey()) writeCache(uid, CACHE_KEYS.todayRoutineLogs, logs);
    },
    onError,
  );
}

/**
 * Logs for the current period, needed so flexible weekly targets can be scored
 * on the Today screen without loading history.
 */
export function subscribeRoutineLogsInRange(
  uid: string,
  from: DateKey,
  to: DateKey,
  cb: (logs: RoutineLog[]) => void,
  onError?: (e: unknown) => void,
) {
  return onSnapshot(
    query(routineLogsCol(uid), where('dateKey', '>=', from), where('dateKey', '<=', to)),
    (snap) => cb(snap.docs.map(mapRoutineLog)),
    onError,
  );
}

export async function loadCachedRoutines(uid: string): Promise<Routine[]> {
  return (await readCache<Routine[]>(uid, CACHE_KEYS.routines)) ?? [];
}

export async function loadCachedTodayLogs(uid: string): Promise<RoutineLog[]> {
  return (await readCache<RoutineLog[]>(uid, CACHE_KEYS.todayRoutineLogs)) ?? [];
}

export async function fetchRoutines(uid: string): Promise<Routine[]> {
  const snap = await getDocs(routinesCol(uid));
  return snap.docs.map(mapRoutine).sort((a, b) => a.order - b.order);
}

export async function fetchRoutine(uid: string, id: string): Promise<Routine | null> {
  const snap = await getDoc(routineDoc(uid, id));
  return snap.exists() ? mapRoutine(snap) : null;
}

export async function fetchRoutineLogsInRange(
  uid: string,
  from: DateKey,
  to: DateKey,
): Promise<RoutineLog[]> {
  const snap = await getDocs(
    query(routineLogsCol(uid), where('dateKey', '>=', from), where('dateKey', '<=', to)),
  );
  return snap.docs.map(mapRoutineLog);
}

export async function fetchLogsForRoutine(uid: string, routineId: string): Promise<RoutineLog[]> {
  const snap = await getDocs(query(routineLogsCol(uid), where('routineId', '==', routineId)));
  return snap.docs.map(mapRoutineLog).sort((a, b) => (a.dateKey < b.dateKey ? -1 : 1));
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface RoutineDraft {
  name: string;
  icon?: string;
  categoryId?: string | null;
  trackingType: TrackingType;
  targetValue?: number | null;
  unit?: string | null;
  targetTime?: TimeString | null;
  schedule: ScheduleRule;
  preferredTime?: TimeString | null;
  dayPart?: DayPart;
  reminderEnabled?: boolean;
  reminderTime?: TimeString | null;
  linkedSubjectId?: string | null;
  order?: number;
}

function routinePayload(uid: string, draft: RoutineDraft, order: number) {
  return pruneUndefined({
    userId: uid,
    name: draft.name.trim(),
    icon: draft.icon ?? 'circle',
    categoryId: draft.categoryId ?? null,
    trackingType: draft.trackingType,
    targetValue: draft.targetValue ?? null,
    unit: draft.unit ?? null,
    targetTime: draft.targetTime ?? null,
    schedule: draft.schedule,
    preferredTime: draft.preferredTime ?? null,
    dayPart: draft.dayPart ?? dayPartForTime(draft.preferredTime ?? null),
    reminderEnabled: Boolean(draft.reminderEnabled),
    reminderTime: draft.reminderTime ?? null,
    notificationId: null,
    linkedSubjectId: draft.linkedSubjectId ?? null,
    active: true,
    order,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    archivedAt: null,
  });
}

export async function createRoutine(uid: string, draft: RoutineDraft): Promise<Routine> {
  const ref = doc(routinesCol(uid));
  const payload = routinePayload(uid, draft, draft.order ?? Date.now() % 100000);
  await setDoc(ref, payload);
  const now = Date.now();
  return { ...(payload as any), id: ref.id, createdAt: now, updatedAt: now } as Routine;
}

export async function createRoutines(uid: string, drafts: RoutineDraft[]): Promise<Routine[]> {
  const batch = writeBatch(db);
  const created: Routine[] = [];
  drafts.forEach((draft, index) => {
    const ref = doc(routinesCol(uid));
    const payload = routinePayload(uid, draft, index);
    batch.set(ref, payload);
    created.push({ ...(payload as any), id: ref.id, createdAt: Date.now(), updatedAt: Date.now() });
  });
  await batch.commit();
  return created;
}

export async function updateRoutine(
  uid: string,
  id: string,
  patch: Partial<Omit<Routine, 'id' | 'userId' | 'createdAt'>>,
): Promise<void> {
  await updateDoc(routineDoc(uid, id), pruneUndefined({ ...patch, updatedAt: serverTimestamp() }));
}

export async function archiveRoutine(uid: string, id: string): Promise<void> {
  await updateDoc(routineDoc(uid, id), {
    active: false,
    archivedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/** Deletes a routine and every log it produced. */
export async function deleteRoutine(uid: string, id: string): Promise<void> {
  const logs = await getDocs(query(routineLogsCol(uid), where('routineId', '==', id)));
  const refs = [...logs.docs.map((d) => d.ref), routineDoc(uid, id)];
  for (let i = 0; i < refs.length; i += 400) {
    const batch = writeBatch(db);
    refs.slice(i, i + 400).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

export async function reorderRoutines(uid: string, orderedIds: string[]): Promise<void> {
  const batch = writeBatch(db);
  orderedIds.forEach((id, index) => batch.update(routineDoc(uid, id), { order: index }));
  await batch.commit();
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

export interface LogParams {
  actualValue?: number;
  actualTime?: TimeString | null;
  status?: RoutineLogStatus;
  notes?: string | null;
  startedAt?: number | null;
}

/**
 * Writes a routine log. The id is deterministic, so tapping twice can never
 * produce two records for the same day.
 */
export async function logRoutine(
  uid: string,
  routine: Routine,
  dateKey: DateKey,
  params: LogParams = {},
): Promise<RoutineLog> {
  const id = routineLogId(routine.id, dateKey);
  const actualValue =
    params.actualValue ??
    (routine.trackingType === 'check' || routine.trackingType === 'session'
      ? 1
      : (routine.targetValue ?? 1));
  const status = deriveStatus(routine, actualValue, params.status);

  const payload = pruneUndefined({
    userId: uid,
    routineId: routine.id,
    dateKey,
    actualValue,
    targetValueSnapshot: routine.targetValue ?? null,
    actualTime: params.actualTime ?? null,
    status,
    startedAt: params.startedAt ?? null,
    completedAt: serverTimestamp(),
    notes: params.notes ?? null,
    createdAt: serverTimestamp(),
  });

  await setDoc(routineLogDoc(uid, id), payload, { merge: true });
  return { ...(payload as any), id, completedAt: Date.now(), createdAt: Date.now() } as RoutineLog;
}

export async function clearRoutineLog(
  uid: string,
  routineId: string,
  dateKey: DateKey,
): Promise<void> {
  await deleteDoc(routineLogDoc(uid, routineLogId(routineId, dateKey))).catch(() => {});
}

/** One-tap toggle for `check` and `session` routines. */
export async function toggleRoutine(
  uid: string,
  routine: Routine,
  dateKey: DateKey,
  currentlyComplete: boolean,
): Promise<void> {
  if (currentlyComplete) await clearRoutineLog(uid, routine.id, dateKey);
  else await logRoutine(uid, routine, dateKey, { actualValue: 1, status: 'completed' });
}

/** Increment for `count` and `duration` routines. */
export async function incrementRoutine(
  uid: string,
  routine: Routine,
  dateKey: DateKey,
  current: number,
  delta: number,
): Promise<void> {
  const next = Math.max(0, current + delta);
  if (next === 0) {
    await clearRoutineLog(uid, routine.id, dateKey);
    return;
  }
  await logRoutine(uid, routine, dateKey, { actualValue: next });
}

/** Marks a scheduled day as an intentional rest/skip rather than a miss. */
export async function skipRoutine(
  uid: string,
  routine: Routine,
  dateKey: DateKey,
  rest = false,
): Promise<void> {
  await logRoutine(uid, routine, dateKey, {
    actualValue: 0,
    status: rest ? 'rest' : 'skipped',
  });
}

/** Records the actual clock time for a `time` routine (wake, bedtime). */
export async function logRoutineTime(
  uid: string,
  routine: Routine,
  dateKey: DateKey,
  time: TimeString,
): Promise<void> {
  await logRoutine(uid, routine, dateKey, {
    actualValue: 1,
    actualTime: time,
    status: 'completed',
  });
}
