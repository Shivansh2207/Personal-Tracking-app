/**
 * Task analytics.
 *
 * Kept separate from routine analytics on purpose: a task completion rate and a
 * routine consistency rate measure different things and must never be blended
 * into one number.
 */

import type { Category, DateKey, Task } from '@/types/models';
import { PRIORITY_ORDER } from '@/types/models';
import { timeToMinutes } from '@/utils/date';

export interface TaskStats {
  planned: number;
  completed: number;
  /** 0–100, or null when nothing was planned. */
  completionRate: number | null;
  skipped: number;
  overdue: number;
  carriedForward: number;
  byCategory: { categoryId: string; name: string; color: string; planned: number; completed: number }[];
}

export function calculateTaskCompletion(
  tasks: Task[],
  categories: Category[],
  today: DateKey,
): TaskStats {
  const real = tasks.filter((t) => !t.isRecurringTemplate);
  const planned = real.filter((t) => t.status !== 'skipped');
  const completed = real.filter((t) => t.status === 'completed');
  const byId = new Map(categories.map((c) => [c.id, c]));

  const buckets = new Map<string, { planned: number; completed: number }>();
  for (const task of planned) {
    const key = task.categoryId ?? 'uncategorised';
    const entry = buckets.get(key) ?? { planned: 0, completed: 0 };
    entry.planned += 1;
    if (task.status === 'completed') entry.completed += 1;
    buckets.set(key, entry);
  }

  return {
    planned: planned.length,
    completed: completed.length,
    completionRate:
      planned.length > 0 ? Math.round((completed.length / planned.length) * 100) : null,
    skipped: real.filter((t) => t.status === 'skipped').length,
    overdue: real.filter(
      (t) => t.status === 'pending' && t.deadline !== null && t.deadline < today,
    ).length,
    carriedForward: real.filter((t) => (t.carryCount ?? 0) > 0).length,
    byCategory: [...buckets.entries()]
      .map(([categoryId, value]) => ({
        categoryId,
        name: byId.get(categoryId)?.name ?? 'Uncategorised',
        color: byId.get(categoryId)?.color ?? '#7C5CFF',
        ...value,
      }))
      .sort((a, b) => b.planned - a.planned),
  };
}

/** Tasks that were left pending on a past day. */
export function findMissedTasks(tasks: Task[], beforeDate: DateKey): Task[] {
  return tasks.filter(
    (t) =>
      !t.isRecurringTemplate &&
      t.status === 'pending' &&
      t.dateKey !== null &&
      t.dateKey < beforeDate,
  );
}

/** Ordering used everywhere a task list is rendered. */
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
