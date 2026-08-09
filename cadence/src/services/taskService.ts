import {
  QueryDocumentSnapshot,
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
  Priority,
  RecurrenceRule,
  Subtask,
  Task,
  TaskStatus,
} from '@/types/models';
import { PRIORITY_ORDER } from '@/types/models';
import { addDays, dayPartForTime, timeToMinutes, todayKey } from '@/utils/date';
import {
  buildVirtualOccurrence,
  isVirtualOccurrence,
  occursOn,
  parseVirtualOccurrence,
} from './analytics/recurrence';
import { CACHE_KEYS, readCache, writeCache } from './firebase/cache';
import { db } from './firebase/config';
import { pruneUndefined, tsToMillis } from './firebase/converters';
import { taskDoc, tasksCol } from './firebase/paths';

export interface TaskDraft {
  title: string;
  description?: string | null;
  categoryId?: string | null;
  goalId?: string | null;
  scheduledDate: DateKey | null;
  startTime?: string | null;
  endTime?: string | null;
  estimatedMinutes?: number | null;
  priority?: Priority;
  isTopPriority?: boolean;
  recurrenceRule?: RecurrenceRule | null;
  subtasks?: Subtask[];
  notes?: string | null;
  reminderMinutesBefore?: number | null;
}

export function mapTask(snap: QueryDocumentSnapshot | any): Task {
  const data = snap.data();
  return {
    id: snap.id,
    userId: data.userId,
    title: data.title ?? '',
    description: data.description ?? null,
    categoryId: data.categoryId ?? null,
    goalId: data.goalId ?? null,
    scheduledDate: data.scheduledDate ?? null,
    startTime: data.startTime ?? null,
    endTime: data.endTime ?? null,
    estimatedMinutes: data.estimatedMinutes ?? null,
    actualMinutes: data.actualMinutes ?? null,
    priority: data.priority ?? 'medium',
    status: data.status ?? 'not_started',
    isTopPriority: Boolean(data.isTopPriority),
    topPriorityOrder: data.topPriorityOrder ?? null,
    recurrenceRule: data.recurrenceRule ?? null,
    parentRecurringTaskId: data.parentRecurringTaskId ?? null,
    isRecurringTemplate: Boolean(data.isRecurringTemplate),
    subtasks: Array.isArray(data.subtasks) ? data.subtasks : [],
    notes: data.notes ?? null,
    reminderMinutesBefore: data.reminderMinutesBefore ?? null,
    notificationId: data.notificationId ?? null,
    carryCount: data.carryCount ?? 0,
    createdAt: tsToMillis(data.createdAt, Date.now()),
    updatedAt: tsToMillis(data.updatedAt, Date.now()),
    completedAt: data.completedAt ? tsToMillis(data.completedAt) : null,
  };
}

/** Live tasks stored for one date (recurring occurrences are merged by the store). */
export function subscribeTasksForDate(
  uid: string,
  date: DateKey,
  cb: (tasks: Task[]) => void,
  onError?: (e: unknown) => void,
) {
  const q = query(tasksCol(uid), where('scheduledDate', '==', date));
  return onSnapshot(
    q,
    (snap) => {
      const tasks = snap.docs.map(mapTask);
      cb(tasks);
      if (date === todayKey()) writeCache(uid, CACHE_KEYS.todayTasks, tasks);
    },
    onError,
  );
}

/** Live recurring templates — always a small set. */
export function subscribeRecurringTemplates(
  uid: string,
  cb: (tasks: Task[]) => void,
  onError?: (e: unknown) => void,
) {
  const q = query(tasksCol(uid), where('isRecurringTemplate', '==', true));
  return onSnapshot(q, (snap) => cb(snap.docs.map(mapTask)), onError);
}

export function subscribeBacklog(
  uid: string,
  cb: (tasks: Task[]) => void,
  onError?: (e: unknown) => void,
) {
  const q = query(tasksCol(uid), where('scheduledDate', '==', null));
  return onSnapshot(
    q,
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
    query(tasksCol(uid), where('scheduledDate', '>=', from), where('scheduledDate', '<=', to)),
  );
  return snap.docs.map(mapTask);
}

export async function fetchUpcoming(uid: string, from: DateKey, days = 30): Promise<Task[]> {
  return fetchTasksInRange(uid, from, addDays(from, days));
}

export async function fetchTasksForGoal(uid: string, goalId: string): Promise<Task[]> {
  const snap = await getDocs(query(tasksCol(uid), where('goalId', '==', goalId)));
  return snap.docs.map(mapTask);
}

export async function fetchTask(uid: string, id: string): Promise<Task | null> {
  const snap = await getDoc(taskDoc(uid, id));
  if (!snap.exists()) return null;
  return mapTask(snap);
}

export async function createTask(uid: string, draft: TaskDraft): Promise<Task> {
  const ref = doc(tasksCol(uid));
  const recurring = draft.recurrenceRule && draft.recurrenceRule.type !== 'none';
  const payload = pruneUndefined({
    userId: uid,
    title: draft.title.trim(),
    description: draft.description ?? null,
    categoryId: draft.categoryId ?? null,
    goalId: draft.goalId ?? null,
    // A recurring series is stored as a dateless template.
    scheduledDate: recurring ? null : (draft.scheduledDate ?? null),
    startTime: draft.startTime ?? null,
    endTime: draft.endTime ?? null,
    estimatedMinutes: draft.estimatedMinutes ?? null,
    actualMinutes: null,
    priority: draft.priority ?? 'medium',
    status: 'not_started' as TaskStatus,
    isTopPriority: Boolean(draft.isTopPriority) && !recurring,
    topPriorityOrder: draft.isTopPriority && !recurring ? Date.now() : null,
    recurrenceRule: recurring ? draft.recurrenceRule : null,
    parentRecurringTaskId: null,
    isRecurringTemplate: Boolean(recurring),
    subtasks: draft.subtasks ?? [],
    notes: draft.notes ?? null,
    reminderMinutesBefore: draft.reminderMinutesBefore ?? null,
    notificationId: null,
    carryCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    completedAt: null,
  });
  await setDoc(ref, payload);
  const now = Date.now();
  return { ...(payload as any), id: ref.id, createdAt: now, updatedAt: now } as Task;
}

/**
 * Writes a real document for a recurring occurrence that has so far only
 * existed virtually. Returns the new task id.
 */
export async function materialiseOccurrence(
  uid: string,
  templateId: string,
  date: DateKey,
): Promise<Task> {
  const templateSnap = await getDoc(taskDoc(uid, templateId));
  if (!templateSnap.exists()) throw new Error('This repeating task no longer exists.');
  const template = mapTask(templateSnap);

  // Guard against a double-tap creating two documents for the same day.
  // Filtering by date in memory keeps this a single-field query, so no
  // composite index has to be deployed for the app to work.
  const existing = await getDocs(
    query(tasksCol(uid), where('parentRecurringTaskId', '==', templateId)),
  );
  const already = existing.docs.map(mapTask).find((t) => t.scheduledDate === date);
  if (already) return already;

  const occurrence = buildVirtualOccurrence(template, date);
  const ref = doc(tasksCol(uid));
  const payload = pruneUndefined({
    userId: uid,
    title: occurrence.title,
    description: occurrence.description ?? null,
    categoryId: occurrence.categoryId ?? null,
    goalId: occurrence.goalId ?? null,
    scheduledDate: date,
    startTime: occurrence.startTime ?? null,
    endTime: occurrence.endTime ?? null,
    estimatedMinutes: occurrence.estimatedMinutes ?? null,
    actualMinutes: null,
    priority: occurrence.priority,
    status: 'not_started' as TaskStatus,
    isTopPriority: false,
    topPriorityOrder: null,
    recurrenceRule: null,
    parentRecurringTaskId: templateId,
    isRecurringTemplate: false,
    subtasks: occurrence.subtasks,
    notes: occurrence.notes ?? null,
    reminderMinutesBefore: occurrence.reminderMinutesBefore ?? null,
    notificationId: null,
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
  const created = await materialiseOccurrence(uid, parsed.templateId, parsed.date);
  return created.id;
}

export async function updateTask(
  uid: string,
  taskId: string,
  patch: Partial<Omit<Task, 'id' | 'userId' | 'createdAt'>>,
): Promise<string> {
  const realId = await ensureRealTask(uid, taskId);
  await updateDoc(
    taskDoc(uid, realId),
    pruneUndefined({ ...patch, updatedAt: serverTimestamp() }),
  );
  return realId;
}

export async function setTaskStatus(
  uid: string,
  taskId: string,
  status: TaskStatus,
  extra: { actualMinutes?: number | null } = {},
): Promise<string> {
  const realId = await ensureRealTask(uid, taskId);
  await updateDoc(
    taskDoc(uid, realId),
    pruneUndefined({
      status,
      completedAt: status === 'completed' ? serverTimestamp() : null,
      actualMinutes: extra.actualMinutes ?? undefined,
      updatedAt: serverTimestamp(),
    }),
  );
  return realId;
}

export async function toggleTaskComplete(
  uid: string,
  task: Task,
): Promise<{ id: string; status: TaskStatus }> {
  const next: TaskStatus = task.status === 'completed' ? 'not_started' : 'completed';
  const id = await setTaskStatus(uid, task.id, next);
  return { id, status: next };
}

export async function deleteTask(uid: string, taskId: string): Promise<void> {
  if (isVirtualOccurrence(taskId)) {
    // Deleting a single virtual occurrence means "skip this date".
    const parsed = parseVirtualOccurrence(taskId);
    if (!parsed) return;
    const created = await materialiseOccurrence(uid, parsed.templateId, parsed.date);
    await updateDoc(taskDoc(uid, created.id), {
      status: 'skipped',
      updatedAt: serverTimestamp(),
    });
    return;
  }
  await deleteDoc(taskDoc(uid, taskId));
}

/** Deletes a recurring series: the template plus every materialised occurrence. */
export async function deleteRecurringSeries(uid: string, templateId: string): Promise<void> {
  const occurrences = await getDocs(
    query(tasksCol(uid), where('parentRecurringTaskId', '==', templateId)),
  );
  const refs = [...occurrences.docs.map((d) => d.ref), taskDoc(uid, templateId)];
  for (let i = 0; i < refs.length; i += 400) {
    const batch = writeBatch(db);
    refs.slice(i, i + 400).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

export async function rescheduleTask(
  uid: string,
  taskId: string,
  date: DateKey | null,
): Promise<string> {
  const realId = await ensureRealTask(uid, taskId);
  const snap = await getDoc(taskDoc(uid, realId));
  const carryCount = (snap.data()?.carryCount ?? 0) + 1;
  await updateDoc(taskDoc(uid, realId), {
    scheduledDate: date,
    carryCount,
    updatedAt: serverTimestamp(),
  });
  return realId;
}

export async function duplicateTask(uid: string, task: Task): Promise<Task> {
  return createTask(uid, {
    title: `${task.title} (copy)`,
    description: task.description,
    categoryId: task.categoryId,
    goalId: task.goalId,
    scheduledDate: task.scheduledDate,
    startTime: task.startTime,
    endTime: task.endTime,
    estimatedMinutes: task.estimatedMinutes,
    priority: task.priority,
    recurrenceRule: null,
    subtasks: task.subtasks.map((s) => ({ ...s, done: false })),
    notes: task.notes,
    reminderMinutesBefore: task.reminderMinutesBefore,
  });
}

const MAX_TOP_PRIORITIES = 3;

export async function setTopPriority(
  uid: string,
  taskId: string,
  pinned: boolean,
  currentPinnedCount: number,
): Promise<string> {
  if (pinned && currentPinnedCount >= MAX_TOP_PRIORITIES) {
    throw new Error(`You can pin up to ${MAX_TOP_PRIORITIES} priorities a day.`);
  }
  const realId = await ensureRealTask(uid, taskId);
  await updateDoc(taskDoc(uid, realId), {
    isTopPriority: pinned,
    topPriorityOrder: pinned ? Date.now() : null,
    updatedAt: serverTimestamp(),
  });
  return realId;
}

export async function reorderTopPriorities(uid: string, orderedIds: string[]): Promise<void> {
  const batch = writeBatch(db);
  orderedIds.forEach((id, index) => {
    if (isVirtualOccurrence(id)) return;
    batch.update(taskDoc(uid, id), { topPriorityOrder: index });
  });
  await batch.commit();
}

/**
 * Rolls unfinished tasks from a past day onto a new date. Only touches real
 * documents so a recurring series is never duplicated.
 */
export async function carryForwardTasks(
  uid: string,
  fromDate: DateKey,
  toDate: DateKey,
): Promise<number> {
  const snap = await getDocs(query(tasksCol(uid), where('scheduledDate', '==', fromDate)));
  const pending = snap.docs
    .map(mapTask)
    .filter((t) => t.status !== 'completed' && t.status !== 'skipped');
  if (pending.length === 0) return 0;

  const batch = writeBatch(db);
  pending.forEach((task) => {
    batch.update(taskDoc(uid, task.id), {
      scheduledDate: toDate,
      carryCount: (task.carryCount ?? 0) + 1,
      updatedAt: serverTimestamp(),
    });
  });
  await batch.commit();
  return pending.length;
}

export async function addSubtask(uid: string, task: Task, title: string): Promise<void> {
  const subtasks = [
    ...task.subtasks,
    { id: `st_${Date.now().toString(36)}`, title: title.trim(), done: false },
  ];
  await updateTask(uid, task.id, { subtasks });
}

export async function toggleSubtask(
  uid: string,
  task: Task,
  subtaskId: string,
): Promise<void> {
  const subtasks = task.subtasks.map((s) =>
    s.id === subtaskId ? { ...s, done: !s.done } : s,
  );
  await updateTask(uid, task.id, { subtasks });
}

/** Sorting used everywhere a task list is rendered. */
export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.status === 'completed' && b.status !== 'completed') return 1;
    if (b.status === 'completed' && a.status !== 'completed') return -1;
    const at = timeToMinutes(a.startTime);
    const bt = timeToMinutes(b.startTime);
    if (at !== null && bt !== null && at !== bt) return at - bt;
    if (at !== null && bt === null) return -1;
    if (at === null && bt !== null) return 1;
    const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (p !== 0) return p;
    return a.createdAt - b.createdAt;
  });
}

export function groupTasksByDayPart(tasks: Task[]) {
  const groups: Record<string, Task[]> = {
    morning: [],
    afternoon: [],
    evening: [],
    anytime: [],
  };
  for (const task of tasks) groups[dayPartForTime(task.startTime)].push(task);
  return groups;
}

export function countPlanned(tasks: Task[]): number {
  return tasks.filter((t) => t.status !== 'skipped' && !t.isRecurringTemplate).length;
}

export function countCompleted(tasks: Task[]): number {
  return tasks.filter((t) => t.status === 'completed').length;
}

export { occursOn };
