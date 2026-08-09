/**
 * Pure day-scoring step.
 *
 * Kept free of any Firebase import so it can be unit tested directly and reused
 * by the dashboard to render an optimistic score before the aggregate write
 * lands. `statsService` supplies the I/O around it.
 */

import type {
  ActivityLog,
  DateKey,
  DayState,
  Habit,
  HabitLog,
  StudySession,
  Subject,
  Task,
  UserSettings,
} from '@/types/models';
import { todayKey } from '@/utils/date';
import { groupLogsByHabit, summariseHabitsForDay } from './habits';
import {
  calculateDailyScore,
  isFocusApplicable,
  resolveDayState,
  type DailyScoreResult,
} from './score';

export interface DayRecords {
  tasks: Task[];
  habits: Habit[];
  habitLogs: HabitLog[];
  sessions: StudySession[];
  activities: ActivityLog[];
  subjects: Subject[];
  isRestDay: boolean;
}

export interface ComputedDay {
  date: DateKey;
  productivityScore: number;
  tasksPlanned: number;
  tasksCompleted: number;
  habitsScheduled: number;
  habitsCompleted: number;
  focusMinutes: number;
  studyMinutes: number;
  activityMinutes: number;
  activityCount: number;
  categoryMinutes: Record<string, number>;
  categoryTasks: Record<string, number>;
  dayState: DayState;
  /** Full breakdown, for the "how was this calculated" sheet. */
  breakdown: DailyScoreResult;
}

/** Synthetic bucket used for activity minutes, which have no user category. */
export const ACTIVITY_BUCKET = 'activity';
export const UNCATEGORISED_BUCKET = 'uncategorised';

export function computeDayStats(
  date: DateKey,
  records: DayRecords,
  settings: UserSettings,
  today: DateKey = todayKey(),
): ComputedDay {
  const realTasks = records.tasks.filter((t) => !t.isRecurringTemplate);
  const plannedTasks = realTasks.filter((t) => t.status !== 'skipped');
  const completedTasks = realTasks.filter((t) => t.status === 'completed');

  const logsByHabit = groupLogsByHabit(records.habitLogs);
  const habitSummary = summariseHabitsForDay(
    records.habits.filter((h) => h.active),
    date,
    logsByHabit,
    settings.weekStart,
    today,
  );

  const studyMinutes = records.sessions.reduce((a, s) => a + s.durationMinutes, 0);
  const activityMinutes = records.activities
    .filter((a) => a.completed)
    .reduce((acc, a) => acc + a.durationMinutes, 0);
  const activityCount = records.activities.filter((a) => a.completed).length;
  const focusMinutes = studyMinutes;

  const subjectCategory = new Map(records.subjects.map((s) => [s.id, s.categoryId ?? null]));

  const categoryMinutes: Record<string, number> = {};
  const categoryTasks: Record<string, number> = {};
  const addMinutes = (categoryId: string | null | undefined, minutes: number) => {
    if (!minutes) return;
    const key = categoryId ?? UNCATEGORISED_BUCKET;
    categoryMinutes[key] = (categoryMinutes[key] ?? 0) + minutes;
  };

  for (const session of records.sessions) {
    const categoryId =
      session.categoryId ?? (session.subjectId ? subjectCategory.get(session.subjectId) : null);
    addMinutes(categoryId, session.durationMinutes);
  }
  for (const activity of records.activities) {
    if (!activity.completed) continue;
    addMinutes(ACTIVITY_BUCKET, activity.durationMinutes);
  }
  for (const task of completedTasks) {
    // Only real recorded time counts — estimates are never treated as fact.
    if (task.actualMinutes) addMinutes(task.categoryId, task.actualMinutes);
    const key = task.categoryId ?? UNCATEGORISED_BUCKET;
    categoryTasks[key] = (categoryTasks[key] ?? 0) + 1;
  }

  const breakdown = calculateDailyScore({
    tasksPlanned: plannedTasks.length,
    tasksCompleted: completedTasks.length,
    habitsScheduled: habitSummary.scheduled,
    habitsCompleted: habitSummary.completed,
    focusMinutes,
    focusGoalMinutes: settings.dailyFocusGoalMinutes,
    focusApplicable: isFocusApplicable({
      focusMinutes,
      plannedTasks,
      hasDurationHabit: records.habits.some(
        (h) => h.active && h.measurementType === 'duration',
      ),
    }),
  });

  const dayState = resolveDayState({
    score: breakdown.score,
    hasData: breakdown.hasData,
    threshold: settings.productivityThreshold,
    isRestDay: records.isRestDay,
  });

  return {
    date,
    productivityScore: breakdown.score,
    tasksPlanned: plannedTasks.length,
    tasksCompleted: completedTasks.length,
    habitsScheduled: habitSummary.scheduled,
    habitsCompleted: habitSummary.completed,
    focusMinutes,
    studyMinutes,
    activityMinutes,
    activityCount,
    categoryMinutes,
    categoryTasks,
    dayState,
    breakdown,
  };
}
