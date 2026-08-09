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

import type {
  DateKey,
  Habit,
  HabitFrequency,
  HabitLog,
  HabitLogStatus,
  HabitMeasurement,
} from '@/types/models';
import { todayKey } from '@/utils/date';
import { CACHE_KEYS, readCache, writeCache } from './firebase/cache';
import { db } from './firebase/config';
import { pruneUndefined, tsToMillis } from './firebase/converters';
import { habitDoc, habitLogDoc, habitLogId, habitLogsCol, habitsCol } from './firebase/paths';

export interface HabitSuggestion {
  name: string;
  icon: string;
  measurementType: HabitMeasurement;
  target: number;
  unit?: string;
  frequency: HabitFrequency;
}

/** Offered during onboarding — nothing is forced on the user. */
export const HABIT_SUGGESTIONS: HabitSuggestion[] = [
  {
    name: 'Gym',
    icon: 'activity',
    measurementType: 'binary',
    target: 1,
    frequency: { type: 'times_per_week', times: 4 },
  },
  {
    name: 'Study',
    icon: 'book',
    measurementType: 'duration',
    target: 60,
    unit: 'min',
    frequency: { type: 'daily' },
  },
  {
    name: 'No Zero Day',
    icon: 'zap',
    measurementType: 'binary',
    target: 1,
    frequency: { type: 'daily' },
  },
  {
    name: 'Read',
    icon: 'book-open',
    measurementType: 'duration',
    target: 20,
    unit: 'min',
    frequency: { type: 'daily' },
  },
  {
    name: 'Skill Practice',
    icon: 'target',
    measurementType: 'duration',
    target: 30,
    unit: 'min',
    frequency: { type: 'times_per_week', times: 5 },
  },
  {
    name: 'Family Time',
    icon: 'heart',
    measurementType: 'binary',
    target: 1,
    frequency: { type: 'daily' },
  },
  {
    name: 'Drink Water',
    icon: 'droplet',
    measurementType: 'count',
    target: 8,
    unit: 'glasses',
    frequency: { type: 'daily' },
  },
  {
    name: 'Sleep On Time',
    icon: 'moon',
    measurementType: 'binary',
    target: 1,
    frequency: { type: 'daily' },
  },
];

export function mapHabit(snap: any): Habit {
  const data = snap.data();
  return {
    id: snap.id,
    userId: data.userId,
    name: data.name ?? '',
    categoryId: data.categoryId ?? null,
    icon: data.icon ?? 'check',
    color: data.color ?? null,
    measurementType: data.measurementType ?? 'binary',
    target: data.target ?? 1,
    unit: data.unit ?? null,
    frequency: data.frequency ?? { type: 'daily' },
    startDate: data.startDate ?? todayKey(),
    reminderTime: data.reminderTime ?? null,
    notificationId: data.notificationId ?? null,
    active: data.active !== false,
    order: data.order ?? 0,
    createdAt: tsToMillis(data.createdAt, Date.now()),
    archivedAt: data.archivedAt ? tsToMillis(data.archivedAt) : null,
  };
}

export function mapHabitLog(snap: any): HabitLog {
  const data = snap.data();
  return {
    id: snap.id,
    userId: data.userId,
    habitId: data.habitId,
    date: data.date,
    value: data.value ?? 0,
    status: data.status ?? 'completed',
    notes: data.notes ?? null,
    completedAt: tsToMillis(data.completedAt, Date.now()),
  };
}

export function subscribeHabits(
  uid: string,
  cb: (habits: Habit[]) => void,
  onError?: (e: unknown) => void,
) {
  return onSnapshot(
    habitsCol(uid),
    (snap) => {
      const habits = snap.docs.map(mapHabit).sort((a, b) => a.order - b.order);
      cb(habits);
      writeCache(uid, CACHE_KEYS.habits, habits);
    },
    onError,
  );
}

export function subscribeHabitLogsForDate(
  uid: string,
  date: DateKey,
  cb: (logs: HabitLog[]) => void,
  onError?: (e: unknown) => void,
) {
  return onSnapshot(
    query(habitLogsCol(uid), where('date', '==', date)),
    (snap) => {
      const logs = snap.docs.map(mapHabitLog);
      cb(logs);
      if (date === todayKey()) writeCache(uid, CACHE_KEYS.todayHabitLogs, logs);
    },
    onError,
  );
}

export async function loadCachedHabits(uid: string): Promise<Habit[]> {
  return (await readCache<Habit[]>(uid, CACHE_KEYS.habits)) ?? [];
}

export async function loadCachedTodayLogs(uid: string): Promise<HabitLog[]> {
  return (await readCache<HabitLog[]>(uid, CACHE_KEYS.todayHabitLogs)) ?? [];
}

export async function fetchHabits(uid: string): Promise<Habit[]> {
  const snap = await getDocs(habitsCol(uid));
  return snap.docs.map(mapHabit).sort((a, b) => a.order - b.order);
}

export async function fetchHabitLogsInRange(
  uid: string,
  from: DateKey,
  to: DateKey,
): Promise<HabitLog[]> {
  const snap = await getDocs(
    query(habitLogsCol(uid), where('date', '>=', from), where('date', '<=', to)),
  );
  return snap.docs.map(mapHabitLog);
}

export async function fetchLogsForHabit(uid: string, habitId: string): Promise<HabitLog[]> {
  const snap = await getDocs(query(habitLogsCol(uid), where('habitId', '==', habitId)));
  return snap.docs.map(mapHabitLog);
}

export interface HabitDraft {
  name: string;
  icon?: string;
  categoryId?: string | null;
  color?: string | null;
  measurementType?: HabitMeasurement;
  target?: number;
  unit?: string | null;
  frequency?: HabitFrequency;
  startDate?: DateKey;
  reminderTime?: string | null;
  order?: number;
}

export async function createHabit(uid: string, draft: HabitDraft): Promise<Habit> {
  const ref = doc(habitsCol(uid));
  const payload = pruneUndefined({
    userId: uid,
    name: draft.name.trim(),
    icon: draft.icon ?? 'check',
    categoryId: draft.categoryId ?? null,
    color: draft.color ?? null,
    measurementType: draft.measurementType ?? 'binary',
    target: draft.target ?? 1,
    unit: draft.unit ?? null,
    frequency: draft.frequency ?? { type: 'daily' },
    startDate: draft.startDate ?? todayKey(),
    reminderTime: draft.reminderTime ?? null,
    notificationId: null,
    active: true,
    order: draft.order ?? Date.now() % 100000,
    createdAt: serverTimestamp(),
    archivedAt: null,
  });
  await setDoc(ref, payload);
  return { ...(payload as any), id: ref.id, createdAt: Date.now() } as Habit;
}

export async function createHabits(uid: string, drafts: HabitDraft[]): Promise<Habit[]> {
  const batch = writeBatch(db);
  const created: Habit[] = [];
  drafts.forEach((draft, index) => {
    const ref = doc(habitsCol(uid));
    const payload = {
      userId: uid,
      name: draft.name.trim(),
      icon: draft.icon ?? 'check',
      categoryId: draft.categoryId ?? null,
      color: draft.color ?? null,
      measurementType: draft.measurementType ?? 'binary',
      target: draft.target ?? 1,
      unit: draft.unit ?? null,
      frequency: draft.frequency ?? { type: 'daily' },
      startDate: draft.startDate ?? todayKey(),
      reminderTime: draft.reminderTime ?? null,
      notificationId: null,
      active: true,
      order: index,
      createdAt: serverTimestamp(),
      archivedAt: null,
    };
    batch.set(ref, payload);
    created.push({ ...(payload as any), id: ref.id, createdAt: Date.now() });
  });
  await batch.commit();
  return created;
}

export async function updateHabit(
  uid: string,
  id: string,
  patch: Partial<Omit<Habit, 'id' | 'userId' | 'createdAt'>>,
): Promise<void> {
  await updateDoc(habitDoc(uid, id), pruneUndefined(patch));
}

export async function archiveHabit(uid: string, id: string): Promise<void> {
  await updateDoc(habitDoc(uid, id), { active: false, archivedAt: serverTimestamp() });
}

/** Deletes the habit and every log it produced. */
export async function deleteHabit(uid: string, id: string): Promise<void> {
  const logs = await getDocs(query(habitLogsCol(uid), where('habitId', '==', id)));
  const refs = [...logs.docs.map((d) => d.ref), habitDoc(uid, id)];
  for (let i = 0; i < refs.length; i += 400) {
    const batch = writeBatch(db);
    refs.slice(i, i + 400).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

export async function fetchHabit(uid: string, id: string): Promise<Habit | null> {
  const snap = await getDoc(habitDoc(uid, id));
  return snap.exists() ? mapHabit(snap) : null;
}

/**
 * Writes (or clears) a habit log for a day. The document id is deterministic,
 * so tapping twice can never create two records for the same day.
 */
export async function logHabit(
  uid: string,
  habit: Habit,
  date: DateKey,
  params: { value?: number; status?: HabitLogStatus; notes?: string | null },
): Promise<void> {
  const id = habitLogId(habit.id, date);
  const status = params.status ?? 'completed';
  const value = params.value ?? (habit.measurementType === 'binary' ? 1 : habit.target);
  await setDoc(
    habitLogDoc(uid, id),
    pruneUndefined({
      userId: uid,
      habitId: habit.id,
      date,
      value,
      status,
      notes: params.notes ?? null,
      completedAt: serverTimestamp(),
    }),
  );
}

export async function clearHabitLog(
  uid: string,
  habitId: string,
  date: DateKey,
): Promise<void> {
  await deleteDoc(habitLogDoc(uid, habitLogId(habitId, date))).catch(() => {});
}

/** One-tap toggle used on the dashboard chip row. */
export async function toggleHabit(
  uid: string,
  habit: Habit,
  date: DateKey,
  currentlyComplete: boolean,
): Promise<void> {
  if (currentlyComplete) {
    await clearHabitLog(uid, habit.id, date);
  } else {
    await logHabit(uid, habit, date, { status: 'completed', value: habit.target });
  }
}

export async function skipHabit(uid: string, habit: Habit, date: DateKey): Promise<void> {
  await logHabit(uid, habit, date, { status: 'skipped', value: 0 });
}

export async function incrementHabit(
  uid: string,
  habit: Habit,
  date: DateKey,
  current: number,
  step = 1,
): Promise<void> {
  const value = Math.max(0, current + step);
  if (value === 0) {
    await clearHabitLog(uid, habit.id, date);
    return;
  }
  await logHabit(uid, habit, date, {
    value,
    status: value >= habit.target ? 'completed' : 'partial',
  });
}

export function describeFrequency(freq: HabitFrequency): string {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  switch (freq.type) {
    case 'daily':
      return 'Every day';
    case 'specific_days': {
      const days = (freq.daysOfWeek ?? []).slice().sort((a, b) => a - b);
      if (days.length === 7) return 'Every day';
      if (days.length === 0) return 'Specific days';
      return days.map((d) => dayNames[d]).join(' · ');
    }
    case 'times_per_week':
      return `${freq.times ?? 1}× per week`;
    case 'times_per_month':
      return `${freq.times ?? 1}× per month`;
    default:
      return 'Custom';
  }
}

export function describeTarget(habit: Habit): string {
  switch (habit.measurementType) {
    case 'duration':
      return `${habit.target} min`;
    case 'count':
      return `${habit.target}${habit.unit ? ` ${habit.unit}` : ''}`;
    default:
      return 'Done / not done';
  }
}
