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
  Goal,
  GoalMilestone,
  GoalProgressType,
  GoalStatus,
  Habit,
  HabitLog,
  Topic,
} from '@/types/models';
import { todayKey } from '@/utils/date';
import { calculateGoalProgress } from './analytics/aggregate';
import { CACHE_KEYS, readCache, writeCache } from './firebase/cache';
import { db } from './firebase/config';
import { pruneUndefined, tsToMillis } from './firebase/converters';
import { goalDoc, goalsCol, tasksCol } from './firebase/paths';
import { fetchTasksForGoal, mapTask } from './taskService';
import { fetchTopics } from './studyService';

export function mapGoal(snap: any): Goal {
  const data = snap.data();
  return {
    id: snap.id,
    userId: data.userId,
    title: data.title ?? '',
    description: data.description ?? null,
    categoryId: data.categoryId ?? null,
    startDate: data.startDate ?? todayKey(),
    targetDate: data.targetDate ?? null,
    status: data.status ?? 'active',
    progressType: data.progressType ?? 'manual',
    targetValue: data.targetValue ?? null,
    currentValue: data.currentValue ?? 0,
    progress: data.progress ?? 0,
    linkedHabitIds: Array.isArray(data.linkedHabitIds) ? data.linkedHabitIds : [],
    linkedSubjectIds: Array.isArray(data.linkedSubjectIds) ? data.linkedSubjectIds : [],
    milestones: Array.isArray(data.milestones) ? data.milestones : [],
    createdAt: tsToMillis(data.createdAt, Date.now()),
    updatedAt: tsToMillis(data.updatedAt, Date.now()),
    completedAt: data.completedAt ? tsToMillis(data.completedAt) : null,
  };
}

export function subscribeGoals(
  uid: string,
  cb: (goals: Goal[]) => void,
  onError?: (e: unknown) => void,
) {
  return onSnapshot(
    goalsCol(uid),
    (snap) => {
      const goals = snap.docs.map(mapGoal).sort((a, b) => b.createdAt - a.createdAt);
      cb(goals);
      writeCache(uid, CACHE_KEYS.goals, goals);
    },
    onError,
  );
}

export async function loadCachedGoals(uid: string): Promise<Goal[]> {
  return (await readCache<Goal[]>(uid, CACHE_KEYS.goals)) ?? [];
}

export async function fetchGoals(uid: string): Promise<Goal[]> {
  const snap = await getDocs(goalsCol(uid));
  return snap.docs.map(mapGoal).sort((a, b) => b.createdAt - a.createdAt);
}

export async function fetchGoal(uid: string, id: string): Promise<Goal | null> {
  const snap = await getDoc(goalDoc(uid, id));
  return snap.exists() ? mapGoal(snap) : null;
}

export interface GoalDraft {
  title: string;
  description?: string | null;
  categoryId?: string | null;
  startDate?: DateKey;
  targetDate?: DateKey | null;
  progressType?: GoalProgressType;
  targetValue?: number | null;
  linkedHabitIds?: string[];
  linkedSubjectIds?: string[];
  milestones?: GoalMilestone[];
}

export async function createGoal(uid: string, draft: GoalDraft): Promise<Goal> {
  const ref = doc(goalsCol(uid));
  const payload = pruneUndefined({
    userId: uid,
    title: draft.title.trim(),
    description: draft.description ?? null,
    categoryId: draft.categoryId ?? null,
    startDate: draft.startDate ?? todayKey(),
    targetDate: draft.targetDate ?? null,
    status: 'active' as GoalStatus,
    progressType: draft.progressType ?? 'manual',
    targetValue: draft.targetValue ?? null,
    currentValue: 0,
    progress: 0,
    linkedHabitIds: draft.linkedHabitIds ?? [],
    linkedSubjectIds: draft.linkedSubjectIds ?? [],
    milestones: draft.milestones ?? [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    completedAt: null,
  });
  await setDoc(ref, payload);
  const now = Date.now();
  return { ...(payload as any), id: ref.id, createdAt: now, updatedAt: now } as Goal;
}

export async function updateGoal(
  uid: string,
  id: string,
  patch: Partial<Omit<Goal, 'id' | 'userId' | 'createdAt'>>,
): Promise<void> {
  await updateDoc(goalDoc(uid, id), pruneUndefined({ ...patch, updatedAt: serverTimestamp() }));
}

export async function setGoalStatus(
  uid: string,
  id: string,
  status: GoalStatus,
): Promise<void> {
  await updateDoc(goalDoc(uid, id), {
    status,
    completedAt: status === 'completed' ? serverTimestamp() : null,
    progress: status === 'completed' ? 100 : undefined,
    updatedAt: serverTimestamp(),
  });
}

/** Unlinks dependent tasks so nothing points at a deleted goal. */
export async function deleteGoal(uid: string, id: string): Promise<void> {
  const linked = await getDocs(query(tasksCol(uid), where('goalId', '==', id)));
  for (let i = 0; i < linked.docs.length; i += 400) {
    const batch = writeBatch(db);
    linked.docs.slice(i, i + 400).forEach((d) => batch.update(d.ref, { goalId: null }));
    await batch.commit();
  }
  await deleteDoc(goalDoc(uid, id));
}

export async function toggleMilestone(
  uid: string,
  goal: Goal,
  milestoneId: string,
): Promise<void> {
  const milestones = goal.milestones.map((m) =>
    m.id === milestoneId ? { ...m, done: !m.done } : m,
  );
  await updateGoal(uid, goal.id, { milestones });
}

/**
 * Recomputes and persists a goal's cached progress. Called after any action
 * that could move it — completing a linked task, logging a habit, finishing a
 * topic — so `Goal.progress` never drifts from reality.
 */
export async function recalculateGoalProgress(
  uid: string,
  goal: Goal,
  ctx: {
    habits?: Habit[];
    habitLogs?: HabitLog[];
    weekStart?: 0 | 1;
  } = {},
): Promise<number> {
  let topics: Topic[] = [];
  if (goal.progressType === 'topics' && goal.linkedSubjectIds.length) {
    const lists = await Promise.all(
      goal.linkedSubjectIds.map((sid) => fetchTopics(uid, sid).catch(() => [] as Topic[])),
    );
    topics = lists.flat();
  }

  const linkedTasks =
    goal.progressType === 'tasks' ? await fetchTasksForGoal(uid, goal.id) : [];

  const progress = calculateGoalProgress(goal, {
    linkedTasks,
    topics,
    habits: ctx.habits,
    habitLogs: ctx.habitLogs,
    weekStart: ctx.weekStart ?? 1,
    today: todayKey(),
  });

  if (progress !== goal.progress) {
    await updateDoc(goalDoc(uid, goal.id), {
      progress,
      updatedAt: serverTimestamp(),
      ...(progress >= 100 && goal.status === 'active'
        ? { status: 'completed' as GoalStatus, completedAt: serverTimestamp() }
        : {}),
    }).catch(() => {});
  }
  return progress;
}

/** Refreshes every active goal — cheap, since goal counts are small. */
export async function recalculateAllGoals(
  uid: string,
  ctx: { habits?: Habit[]; habitLogs?: HabitLog[]; weekStart?: 0 | 1 } = {},
): Promise<void> {
  const goals = await fetchGoals(uid);
  await Promise.all(
    goals
      .filter((g) => g.status === 'active')
      .map((g) => recalculateGoalProgress(uid, g, ctx).catch(() => 0)),
  );
}

export const PROGRESS_TYPE_LABELS: Record<GoalProgressType, string> = {
  manual: 'Manual %',
  tasks: 'Linked tasks',
  habits: 'Linked habits',
  numeric: 'Numeric target',
  topics: 'Syllabus topics',
};

export { mapTask };
