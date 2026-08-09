/**
 * Range aggregation: weekly metrics, category distribution, trends, study
 * analytics and goal progress. Everything here is a pure function over already
 * fetched records so it can be unit tested and reused by both the Analytics
 * screen and the Weekly Review generator.
 */

import type {
  ActivityLog,
  Category,
  DailyStats,
  DateKey,
  Goal,
  Habit,
  HabitLog,
  StudySession,
  Subject,
  Task,
  Topic,
} from '@/types/models';
import { dayOfWeek, diffDays, formatShortDate, lastNDays } from '@/utils/date';
import { calculateHabitConsistency, groupLogsByHabit, isLogComplete } from './habits';

export interface WeeklySummary {
  weekStart: DateKey;
  weekEnd: DateKey;
  productivityScore: number;
  tasksPlanned: number;
  tasksCompleted: number;
  taskCompletionRate: number;
  habitsScheduled: number;
  habitsCompleted: number;
  habitConsistency: number;
  focusMinutes: number;
  studyMinutes: number;
  activityMinutes: number;
  activityCount: number;
  bestDay: DateKey | null;
  worstDay: DateKey | null;
  daysWithData: number;
  categoryMinutes: Record<string, number>;
  categoryTasks: Record<string, number>;
  strongestCategoryId: string | null;
  weakestCategoryId: string | null;
}

export function calculateWeeklySummary(
  weekStart: DateKey,
  weekEnd: DateKey,
  stats: DailyStats[],
): WeeklySummary {
  const inWeek = stats.filter((s) => s.date >= weekStart && s.date <= weekEnd);
  const withData = inWeek.filter((s) => s.dayState !== 'no_data');

  const sum = (pick: (s: DailyStats) => number) =>
    inWeek.reduce((acc, s) => acc + (pick(s) || 0), 0);

  const tasksPlanned = sum((s) => s.tasksPlanned);
  const tasksCompleted = sum((s) => s.tasksCompleted);
  const habitsScheduled = sum((s) => s.habitsScheduled);
  const habitsCompleted = sum((s) => s.habitsCompleted);

  const categoryMinutes: Record<string, number> = {};
  const categoryTasks: Record<string, number> = {};
  for (const s of inWeek) {
    for (const [k, v] of Object.entries(s.categoryMinutes ?? {})) {
      categoryMinutes[k] = (categoryMinutes[k] ?? 0) + v;
    }
    for (const [k, v] of Object.entries(s.categoryTasks ?? {})) {
      categoryTasks[k] = (categoryTasks[k] ?? 0) + v;
    }
  }

  const scored = withData.filter((s) => s.dayState !== 'rest');
  const productivityScore =
    scored.length > 0
      ? Math.round(scored.reduce((acc, s) => acc + s.productivityScore, 0) / scored.length)
      : 0;

  const sortedByScore = [...scored].sort((a, b) => b.productivityScore - a.productivityScore);

  const catEntries = Object.entries(categoryMinutes);
  const strongest = catEntries.sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const weakest =
    catEntries.length > 1 ? catEntries[catEntries.length - 1][0] : null;

  return {
    weekStart,
    weekEnd,
    productivityScore,
    tasksPlanned,
    tasksCompleted,
    taskCompletionRate: tasksPlanned > 0 ? Math.round((tasksCompleted / tasksPlanned) * 100) : 0,
    habitsScheduled,
    habitsCompleted,
    habitConsistency:
      habitsScheduled > 0 ? Math.round((habitsCompleted / habitsScheduled) * 100) : 0,
    focusMinutes: sum((s) => s.focusMinutes),
    studyMinutes: sum((s) => s.studyMinutes),
    activityMinutes: sum((s) => s.activityMinutes),
    activityCount: sum((s) => s.activityCount),
    bestDay: sortedByScore[0]?.date ?? null,
    worstDay: sortedByScore.length > 1 ? sortedByScore[sortedByScore.length - 1].date : null,
    daysWithData: withData.length,
    categoryMinutes,
    categoryTasks,
    strongestCategoryId: strongest,
    weakestCategoryId: weakest,
  };
}

export interface TrendPoint {
  date: DateKey;
  label: string;
  value: number;
  hasData: boolean;
}

export function buildScoreTrend(stats: DailyStats[], dates: DateKey[]): TrendPoint[] {
  const byDate = new Map(stats.map((s) => [s.date, s]));
  return dates.map((date) => {
    const s = byDate.get(date);
    return {
      date,
      label: formatShortDate(date),
      value: s?.productivityScore ?? 0,
      hasData: !!s && s.dayState !== 'no_data',
    };
  });
}

export interface WeekdayAverage {
  dow: number;
  label: string;
  average: number;
  samples: number;
}

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function calculateWeekdayAverages(stats: DailyStats[]): WeekdayAverage[] {
  const buckets = DOW_LABELS.map((label, dow) => ({ dow, label, total: 0, samples: 0 }));
  for (const s of stats) {
    if (s.dayState === 'no_data' || s.dayState === 'rest') continue;
    const b = buckets[dayOfWeek(s.date)];
    b.total += s.productivityScore;
    b.samples += 1;
  }
  return buckets.map((b) => ({
    dow: b.dow,
    label: b.label,
    average: b.samples > 0 ? Math.round(b.total / b.samples) : 0,
    samples: b.samples,
  }));
}

export type DistributionMode = 'time' | 'activities';

export interface DistributionSlice {
  categoryId: string;
  name: string;
  color: string;
  value: number;
  percent: number;
}

export function calculateCategoryDistribution(
  stats: DailyStats[],
  categories: Category[],
  mode: DistributionMode,
): DistributionSlice[] {
  const totals = new Map<string, number>();
  for (const s of stats) {
    const source = mode === 'time' ? s.categoryMinutes : s.categoryTasks;
    for (const [id, value] of Object.entries(source ?? {})) {
      if (!value) continue;
      totals.set(id, (totals.get(id) ?? 0) + value);
    }
  }

  const grand = [...totals.values()].reduce((a, b) => a + b, 0);
  if (grand === 0) return [];

  const byId = new Map(categories.map((c) => [c.id, c]));
  return [...totals.entries()]
    .map(([categoryId, value]) => {
      const cat = byId.get(categoryId);
      return {
        categoryId,
        name: cat?.name ?? 'Uncategorised',
        color: cat?.color ?? '#7C5CFF',
        value,
        percent: Math.round((value / grand) * 100),
      };
    })
    .sort((a, b) => b.value - a.value);
}

export interface StudyAnalytics {
  totalMinutes: number;
  sessionCount: number;
  averageSessionMinutes: number;
  averageProductivity: number | null;
  topicsCompleted: number;
  topicsTotal: number;
  averageConfidence: number | null;
  bySubject: {
    subjectId: string;
    name: string;
    color: string;
    minutes: number;
    topicsCompleted: number;
    topicsTotal: number;
    progress: number;
  }[];
  mostStudiedSubjectId: string | null;
}

export function calculateStudyAnalytics(
  sessions: StudySession[],
  subjects: Subject[],
  topics: Topic[],
): StudyAnalytics {
  const totalMinutes = sessions.reduce((a, s) => a + s.durationMinutes, 0);
  const rated = sessions.filter((s) => typeof s.productivityRating === 'number');
  const confident = topics.filter((t) => typeof t.confidence === 'number');

  const bySubject = subjects
    .map((subject) => {
      const subjTopics = topics.filter((t) => t.subjectId === subject.id);
      const completed = subjTopics.filter((t) => t.status === 'completed').length;
      const minutes = sessions
        .filter((s) => s.subjectId === subject.id)
        .reduce((a, s) => a + s.durationMinutes, 0);
      const progress =
        subjTopics.length > 0
          ? Math.round(
              subjTopics.reduce((a, t) => a + progressForTopic(t), 0) / subjTopics.length,
            )
          : 0;
      return {
        subjectId: subject.id,
        name: subject.name,
        color: subject.color,
        minutes,
        topicsCompleted: completed,
        topicsTotal: subjTopics.length,
        progress,
      };
    })
    .sort((a, b) => b.minutes - a.minutes);

  return {
    totalMinutes,
    sessionCount: sessions.length,
    averageSessionMinutes:
      sessions.length > 0 ? Math.round(totalMinutes / sessions.length) : 0,
    averageProductivity:
      rated.length > 0
        ? Math.round(
            (rated.reduce((a, s) => a + (s.productivityRating ?? 0), 0) / rated.length) * 10,
          ) / 10
        : null,
    topicsCompleted: topics.filter((t) => t.status === 'completed').length,
    topicsTotal: topics.length,
    averageConfidence:
      confident.length > 0
        ? Math.round(
            (confident.reduce((a, t) => a + (t.confidence ?? 0), 0) / confident.length) * 10,
          ) / 10
        : null,
    bySubject,
    mostStudiedSubjectId: bySubject[0]?.minutes ? bySubject[0].subjectId : null,
  };
}

/** Topic status maps to a coarse progress value unless explicitly overridden. */
export function progressForTopic(topic: Topic): number {
  if (typeof topic.progress === 'number' && topic.progress > 0) return topic.progress;
  switch (topic.status) {
    case 'completed':
      return 100;
    case 'revision':
      return 80;
    case 'practice':
      return 60;
    case 'learning':
      return 30;
    default:
      return 0;
  }
}

export interface TimeVariance {
  plannedMinutes: number;
  actualMinutes: number;
  variance: number;
  /** Null when there is not enough recorded data to be meaningful. */
  variancePercent: number | null;
  tasksWithBoth: number;
}

export function calculateTimeVariance(tasks: Task[]): TimeVariance {
  const relevant = tasks.filter(
    (t) => (t.estimatedMinutes ?? 0) > 0 && (t.actualMinutes ?? 0) > 0,
  );
  const plannedMinutes = relevant.reduce((a, t) => a + (t.estimatedMinutes ?? 0), 0);
  const actualMinutes = relevant.reduce((a, t) => a + (t.actualMinutes ?? 0), 0);
  return {
    plannedMinutes,
    actualMinutes,
    variance: actualMinutes - plannedMinutes,
    variancePercent:
      plannedMinutes > 0
        ? Math.round(((actualMinutes - plannedMinutes) / plannedMinutes) * 100)
        : null,
    tasksWithBoth: relevant.length,
  };
}

export interface HabitAnalyticsRow {
  habit: Habit;
  consistency: number;
  completed: number;
  scheduled: number;
  currentStreak: number;
}

export function calculateHabitAnalytics(
  habits: Habit[],
  logs: HabitLog[],
  range: DateKey[],
  weekStart: 0 | 1,
  today: DateKey,
): { rows: HabitAnalyticsRow[]; overall: number; best: string | null; weakest: string | null } {
  const grouped = groupLogsByHabit(logs);
  const rows: HabitAnalyticsRow[] = habits.map((habit) => {
    const habitLogs = grouped.get(habit.id) ?? [];
    const c = calculateHabitConsistency(habit, range, habitLogs, weekStart, today);
    return {
      habit,
      consistency: c.rate,
      completed: c.completed,
      scheduled: c.scheduled,
      currentStreak: 0,
    };
  });

  const measured = rows.filter((r) => r.scheduled > 0);
  const overall =
    measured.length > 0
      ? Math.round(
          (measured.reduce((a, r) => a + r.completed, 0) /
            Math.max(1, measured.reduce((a, r) => a + r.scheduled, 0))) *
            100,
        )
      : 0;

  const sorted = [...measured].sort((a, b) => b.consistency - a.consistency);
  return {
    rows,
    overall,
    best: sorted[0]?.habit.name ?? null,
    weakest: sorted.length > 1 ? sorted[sorted.length - 1].habit.name : null,
  };
}

export interface ActivitySummary {
  sessions: number;
  totalMinutes: number;
  byType: { type: string; count: number; minutes: number }[];
}

export function calculateActivitySummary(logs: ActivityLog[]): ActivitySummary {
  const byType = new Map<string, { count: number; minutes: number }>();
  let totalMinutes = 0;
  for (const log of logs) {
    if (!log.completed) continue;
    totalMinutes += log.durationMinutes;
    const entry = byType.get(log.type) ?? { count: 0, minutes: 0 };
    entry.count += 1;
    entry.minutes += log.durationMinutes;
    byType.set(log.type, entry);
  }
  return {
    sessions: logs.filter((l) => l.completed).length,
    totalMinutes,
    byType: [...byType.entries()]
      .map(([type, v]) => ({ type, ...v }))
      .sort((a, b) => b.count - a.count),
  };
}

/** Goal progress, derived from whichever source the goal is configured for. */
export function calculateGoalProgress(
  goal: Goal,
  ctx: {
    linkedTasks?: Task[];
    habitLogs?: HabitLog[];
    habits?: Habit[];
    topics?: Topic[];
    weekStart?: 0 | 1;
    today?: DateKey;
  } = {},
): number {
  switch (goal.progressType) {
    case 'manual':
      return clamp(goal.progress);
    case 'numeric': {
      const target = goal.targetValue ?? 0;
      if (target <= 0) return clamp(goal.progress);
      return clamp((goal.currentValue / target) * 100);
    }
    case 'tasks': {
      const tasks = ctx.linkedTasks ?? [];
      const relevant = tasks.filter((t) => !t.isRecurringTemplate && t.status !== 'skipped');
      if (relevant.length === 0) return 0;
      const done = relevant.filter((t) => t.status === 'completed').length;
      return clamp((done / relevant.length) * 100);
    }
    case 'topics': {
      const topics = ctx.topics ?? [];
      if (topics.length === 0) return 0;
      return clamp(topics.reduce((a, t) => a + progressForTopic(t), 0) / topics.length);
    }
    case 'habits': {
      const habits = (ctx.habits ?? []).filter((h) => goal.linkedHabitIds.includes(h.id));
      if (habits.length === 0) return 0;
      const today = ctx.today ?? goal.startDate;
      const span = Math.max(1, Math.min(120, diffDays(goal.startDate, today) + 1));
      const range = lastNDays(span, today);
      const grouped = groupLogsByHabit(ctx.habitLogs ?? []);
      const rates = habits.map(
        (h) =>
          calculateHabitConsistency(
            h,
            range,
            grouped.get(h.id) ?? [],
            ctx.weekStart ?? 1,
            today,
          ).rate,
      );
      return clamp(rates.reduce((a, b) => a + b, 0) / rates.length);
    }
    default:
      return clamp(goal.progress);
  }
}

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Counts habit logs completed inside a range (used for weekly rollups). */
export function countHabitCompletions(
  habits: Habit[],
  logs: HabitLog[],
  range: DateKey[],
): number {
  const byId = new Map(habits.map((h) => [h.id, h]));
  const set = new Set(range);
  let count = 0;
  for (const log of logs) {
    if (!set.has(log.date)) continue;
    const habit = byId.get(log.habitId);
    if (!habit) continue;
    if (isLogComplete(log, habit)) count += 1;
  }
  return count;
}
