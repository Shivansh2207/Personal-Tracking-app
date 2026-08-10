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

import { isVirtualOccurrence, parseVirtualOccurrence } from '@/services/recurrence';
import { buildVirtualOccurrence, expandTasksForDate } from '@/services/recurrence/tasks';
import type { DateKey, Priority, ScheduleRule, Task, TaskStatus, TimeString } from '@/types/models';
import { todayKey } from '@/utils/date';
import { CACHE_KEYS, readCache, writeCache } from './firebase/cache';
import { db } from './firebase/config';
import { pruneUndefined, tsToMillis } from './firebase/converters';
import { taskDoc, tasksCol } from './firebase/paths';

export function mapTask(snap: any): Task {
  const data = snap.data();
  return {
    id: snap.id,
    userId: data.userId,
    title: data.title ?? '',
    description: data.description ?? null,
    categoryId: data.categoryId ?? null,
    dateKey: data.dateKey ?? null,
    startTime: data.startTime ?? null,
    estimatedMinutes: data.estimatedMinutes ?? null,
    deadline: data.deadline ?? null,
    status: data.status ?? 'pending',
    priority: data.priority ?? 'normal',
    recurrence: data.recurrence ?? null,
    isRecurringTemplate: Boolean(data.isRecurringTemplate),
    parentTaskId: data.parentTaskId ?? null,
    reminderMinutesBefore: data.reminderMinutesBefore ?? null,
    notificationId: data.notificationId ?? null,
    notes: data.notes ?? null,
    carryCount: data.carryCount ?? 0,
    createdAt: tsToMillis(data.createdAt, Date.now()),
    updatedAt: tsToMillis(data.updatedAt, Date.now()),
    completedAt: data.completedAt ? tsToMillis(data.completedAt) : null,
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export function subscribeTasksForDate(
  uid: string,
  dateKey: DateKey,
  cb: (tasks: Task[]) => void,
  onError?: (e: unknown) => void,
) {
  return onSnapshot(
    query(tasksCol(uid), where('dateKey', '==', dateKey)),
    (snap) => {
      const tasks = snap.docs.map(mapTask);
      cb(tasks);
      if (dateKey === todayKey()) writeCache(uid, CACHE_KEYS.todayTasks, tasks);
    },
    onError,
  );
}

export function subscribeRecurringTemplates(
  uid: string,
  cb: (tasks: Task[]) => void,
  onError?: (e: unknown) => void,
) {
  return onSnapshot(
    query(tasksCol(uid), where('isRecurringTemplate', '==', true)),
    (snap) => cb(snap.docs.map(mapTask)),
    onError,
  );
}

export function subscribeBacklog(
  uid: string,
  cb: (tasks: Task[]) => void,
  onError?: (e: unknown) => void,
) {
  return onSnapshot(
    query(tasksCol(uid), where('dateKey', '==', null)),
    (snap) => cb(snap.docs.map(mapTask).filter((t) => !t.isRecurringTemplate)),
    onError,
  );
}

export async function loadCachedTodayTasks(uid: string): Promise<Task[]> {
  return (await readCache<Task[]>(uid, CACHE_KEYS.todayTasks)) ?? [];
}

export async function fetchTasksInRange(
  uid: string,
  from: DateKey,
  to: DateKey,
): Promise<Task[]> {
  const snap = await getDocs(
    query(tasksCol(uid), where('dateKey', '>=', from), where('dateKey', '<=', to)),
  );
  return snap.docs.map(mapTask);
}

export async function fetchPendingBefore(uid: string, before: DateKey): Promise<Task[]> {
  const snap = await getDocs(
    query(tasksCol(uid), where('dateKey', '>=', '2000-01-01'), where('dateKey', '<', before)),
  );
  return snap.docs.map(mapTask).filter((t) => t.status === 'pending' && !t.isRecurringTemplate);
}

export async function fetchTask(uid: string, id: string): Promise<Task | null> {
  const snap = await getDoc(taskDoc(uid, id));
  return snap.exists() ? mapTask(snap) : null;
}

// ---------------------------------------------------------------------------
// Occurrence expansion
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface TaskDraft {
  title: string;
  description?: string | null;
  categoryId?: string | null;
  dateKey?: DateKey | null;
  startTime?: TimeString | null;
  estimatedMinutes?: number | null;
  deadline?: DateKey | null;
  priority?: Priority;
  recurrence?: ScheduleRule | null;
  reminderMinutesBefore?: number | null;
  notes?: string | null;
}

export async function createTask(uid: string, draft: TaskDraft): Promise<Task> {
  const ref = doc(tasksCol(uid));
  const recurring = !!draft.recurrence;
  const payload = pruneUndefined({
    userId: uid,
    title: draft.title.trim(),
    description: draft.description ?? null,
    categoryId: draft.categoryId ?? null,
    // A recurring series is stored as a dateless template.
    dateKey: recurring ? null : (draft.dateKey ?? todayKey()),
    startTime: draft.startTime ?? null,
    estimatedMinutes: draft.estimatedMinutes ?? null,
    deadline: draft.deadline ?? null,
    status: 'pending' as TaskStatus,
    priority: draft.priority ?? 'normal',
    recurrence: draft.recurrence ?? null,
    isRecurringTemplate: recurring,
    parentTaskId: null,
    reminderMinutesBefore: draft.reminderMinutesBefore ?? null,
    notificationId: null,
    notes: draft.notes ?? null,
    carryCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    completedAt: null,
  });
  await setDoc(ref, payload);
  const now = Date.now();
  return { ...(payload as any), id: ref.id, createdAt: now, updatedAt: now } as Task;
}

/** Writes a real document for an occurrence that so far existed only virtually. */
export async function materialiseOccurrence(
  uid: string,
  templateId: string,
  dateKey: DateKey,
): Promise<Task> {
  const templateSnap = await getDoc(taskDoc(uid, templateId));
  if (!templateSnap.exists()) throw new Error('This repeating task no longer exists.');
  const template = mapTask(templateSnap);

  // Guard against a double-tap creating two documents for the same day.
  // Filtering by date in memory keeps this a single-field query.
  const existing = await getDocs(
    query(tasksCol(uid), where('parentTaskId', '==', templateId)),
  );
  const already = existing.docs.map(mapTask).find((t) => t.dateKey === dateKey);
  if (already) return already;

  const occurrence = buildVirtualOccurrence(template, dateKey);
  const ref = doc(tasksCol(uid));
  const payload = pruneUndefined({
    userId: uid,
    title: occurrence.title,
    description: occurrence.description,
    categoryId: occurrence.categoryId,
    dateKey,
    startTime: occurrence.startTime,
    estimatedMinutes: occurrence.estimatedMinutes,
    deadline: occurrence.deadline,
    status: 'pending' as TaskStatus,
    priority: occurrence.priority,
    recurrence: null,
    isRecurringTemplate: false,
    parentTaskId: templateId,
    reminderMinutesBefore: occurrence.reminderMinutesBefore,
    notificationId: null,
    notes: occurrence.notes,
    carryCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    completedAt: null,
  });
  await setDoc(ref, payload);
  const now = Date.now();
  return { ...(payload as any), id: ref.id, createdAt: now, updatedAt: now } as Task;
}

/** Resolves a possibly-virtual task id to a real Firestore document id. */
export async function ensureRealTask(uid: string, taskId: string): Promise<string> {
  if (!isVirtualOccurrence(taskId)) return taskId;
  const parsed = parseVirtualOccurrence(taskId);
  if (!parsed) throw new Error('Invalid task reference.');
  const created = await materialiseOccurrence(uid, parsed.templateId, parsed.dateKey);
  return created.id;
}

export async function updateTask(
  uid: string,
  taskId: string,
  patch: Partial<Omit<Task, 'id' | 'userId' | 'createdAt'>>,
): Promise<string> {
  const realId = await ensureRealTask(uid, taskId);
  await updateDoc(taskDoc(uid, realId), pruneUndefined({ ...patch, updatedAt: serverTimestamp() }));
  return realId;
}

export async function setTaskStatus(
  uid: string,
  taskId: string,
  status: TaskStatus,
): Promise<string> {
  const realId = await ensureRealTask(uid, taskId);
  await updateDoc(taskDoc(uid, realId), {
    status,
    completedAt: status === 'completed' ? serverTimestamp() : null,
    updatedAt: serverTimestamp(),
  });
  return realId;
}

export async function deleteTask(uid: string, taskId: string): Promise<void> {
  if (isVirtualOccurrence(taskId)) {
    // Deleting a single virtual occurrence means "skip this date".
    const parsed = parseVirtualOccurrence(taskId);
    if (!parsed) return;
    const created = await materialiseOccurrence(uid, parsed.templateId, parsed.dateKey);
    await updateDoc(taskDoc(uid, created.id), {
      status: 'skipped',
      updatedAt: serverTimestamp(),
    });
    return;
  }
  await deleteDoc(taskDoc(uid, taskId));
}

export async function deleteRecurringSeries(uid: string, templateId: string): Promise<void> {
  const occurrences = await getDocs(query(tasksCol(uid), where('parentTaskId', '==', templateId)));
  const refs = [...occurrences.docs.map((d) => d.ref), taskDoc(uid, templateId)];
  for (let i = 0; i < refs.length; i += 400) {
    const batch = writeBatch(db);
    refs.slice(i, i + 400).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

/**
 * Moves a task to a new date. Rescheduling always *moves* the existing
 * document — it never creates a copy, so carry-forward cannot duplicate work.
 */
export async function rescheduleTask(
  uid: string,
  taskId: string,
  dateKey: DateKey | null,
): Promise<string> {
  const realId = await ensureRealTask(uid, taskId);
  const snap = await getDoc(taskDoc(uid, realId));
  const carryCount = (snap.data()?.carryCount ?? 0) + 1;
  await updateDoc(taskDoc(uid, realId), {
    dateKey,
    carryCount,
    updatedAt: serverTimestamp(),
  });
  return realId;
}

export async function carryForwardTasks(
  uid: string,
  fromDate: DateKey,
  toDate: DateKey,
): Promise<number> {
  const snap = await getDocs(query(tasksCol(uid), where('dateKey', '==', fromDate)));
  const pending = snap.docs.map(mapTask).filter((t) => t.status === 'pending');
  if (pending.length === 0) return 0;

  const batch = writeBatch(db);
  pending.forEach((task) => {
    batch.update(taskDoc(uid, task.id), {
      dateKey: toDate,
      carryCount: (task.carryCount ?? 0) + 1,
      updatedAt: serverTimestamp(),
    });
  });
  await batch.commit();
  return pending.length;
}

export async function duplicateTask(uid: string, task: Task): Promise<Task> {
  return createTask(uid, {
    title: `${task.title} (copy)`,
    description: task.description,
    categoryId: task.categoryId,
    dateKey: task.dateKey,
    startTime: task.startTime,
    estimatedMinutes: task.estimatedMinutes,
    deadline: task.deadline,
    priority: task.priority,
    notes: task.notes,
    reminderMinutesBefore: task.reminderMinutesBefore,
  });
}

export { buildVirtualOccurrence, expandTasksForDate, isVirtualOccurrence, parseVirtualOccurrence };
