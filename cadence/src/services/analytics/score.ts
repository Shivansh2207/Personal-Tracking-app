/**
 * Daily productivity score.
 *
 * Base weighting is Tasks 50 / Habits 30 / Focus 20, but a component that has
 * nothing scheduled is *removed* and its weight redistributed proportionally
 * across the remaining ones. A user with no habits configured is scored purely
 * on tasks and focus rather than being capped at 70%.
 *
 * The breakdown is returned alongside the number so the dashboard can show
 * exactly how the score was produced.
 */

import type { DailyStats, DateKey, DayState, Task } from '@/types/models';

export const BASE_WEIGHTS = { tasks: 50, habits: 30, focus: 20 } as const;

export type ScoreComponentKey = 'tasks' | 'habits' | 'focus';

export interface ScoreComponent {
  key: ScoreComponentKey;
  label: string;
  /** Applicable components have a non-zero weight. */
  applicable: boolean;
  /** e.g. 8 completed. */
  achieved: number;
  /** e.g. 10 planned. */
  target: number;
  ratio: number;
  weight: number;
  points: number;
  detail: string;
}

export interface DailyScoreInput {
  tasksPlanned: number;
  tasksCompleted: number;
  habitsScheduled: number;
  habitsCompleted: number;
  focusMinutes: number;
  focusGoalMinutes: number;
  /** True when the day had any duration-based intent or record. */
  focusApplicable: boolean;
}

export interface DailyScoreResult {
  score: number;
  components: ScoreComponent[];
  /** Sum of the weights actually used. 0 when the day has no data at all. */
  totalWeight: number;
  hasData: boolean;
}

function ratioOf(achieved: number, target: number): number {
  if (target <= 0) return 0;
  return Math.max(0, Math.min(1, achieved / target));
}

export function calculateDailyScore(input: DailyScoreInput): DailyScoreResult {
  const raw: {
    key: ScoreComponentKey;
    label: string;
    applicable: boolean;
    achieved: number;
    target: number;
    detail: string;
  }[] = [
    {
      key: 'tasks',
      label: 'Tasks',
      applicable: input.tasksPlanned > 0,
      achieved: input.tasksCompleted,
      target: input.tasksPlanned,
      detail: `${input.tasksCompleted} / ${input.tasksPlanned} tasks`,
    },
    {
      key: 'habits',
      label: 'Habits',
      applicable: input.habitsScheduled > 0,
      achieved: input.habitsCompleted,
      target: input.habitsScheduled,
      detail: `${input.habitsCompleted} / ${input.habitsScheduled} habits`,
    },
    {
      key: 'focus',
      label: 'Focus',
      applicable: input.focusApplicable && input.focusGoalMinutes > 0,
      achieved: input.focusMinutes,
      target: input.focusGoalMinutes,
      detail: `${Math.round(input.focusMinutes)} / ${input.focusGoalMinutes} min`,
    },
  ];

  const applicableWeight = raw.reduce(
    (sum, c) => (c.applicable ? sum + BASE_WEIGHTS[c.key] : sum),
    0,
  );

  if (applicableWeight === 0) {
    return {
      score: 0,
      totalWeight: 0,
      hasData: false,
      components: raw.map((c) => ({
        ...c,
        ratio: 0,
        weight: 0,
        points: 0,
      })),
    };
  }

  const components: ScoreComponent[] = raw.map((c) => {
    if (!c.applicable) {
      return { ...c, ratio: 0, weight: 0, points: 0 };
    }
    // Redistribute the missing components' weight proportionally.
    const weight = (BASE_WEIGHTS[c.key] / applicableWeight) * 100;
    const ratio = ratioOf(c.achieved, c.target);
    return {
      ...c,
      ratio,
      weight: Math.round(weight * 10) / 10,
      points: Math.round(ratio * weight * 10) / 10,
    };
  });

  const score = Math.round(components.reduce((sum, c) => sum + c.points, 0));
  return {
    score: Math.max(0, Math.min(100, score)),
    components,
    totalWeight: 100,
    hasData: true,
  };
}

/**
 * Focus is only scored when the day actually involved duration-based work —
 * either something was recorded, or something with an estimate was planned.
 */
export function isFocusApplicable(params: {
  focusMinutes: number;
  plannedTasks: Task[];
  hasDurationHabit: boolean;
}): boolean {
  if (params.focusMinutes > 0) return true;
  if (params.hasDurationHabit) return true;
  return params.plannedTasks.some((t) => (t.estimatedMinutes ?? 0) > 0);
}

export interface DayStateInput {
  score: number;
  hasData: boolean;
  threshold: number;
  isRestDay: boolean;
}

export function resolveDayState(input: DayStateInput): DayState {
  if (input.isRestDay) return 'rest';
  if (!input.hasData) return 'no_data';
  return input.score >= input.threshold ? 'successful' : 'incomplete';
}

/**
 * Productivity streak.
 *
 * - `successful` days extend the streak.
 * - `rest` days are transparent: they neither extend nor break it.
 * - `no_data` days are transparent too, but only up to `maxNeutralRun`
 *   consecutive days, so an abandoned month cannot silently preserve a streak.
 * - `incomplete` breaks it.
 * - Today is never counted as a failure because the day is not over.
 */
export function calculateStreak(
  statsByDate: Map<DateKey, Pick<DailyStats, 'dayState'>>,
  today: DateKey,
  options: { maxNeutralRun?: number; earliest?: DateKey } = {},
): number {
  const maxNeutralRun = options.maxNeutralRun ?? 3;
  let streak = 0;
  let neutralRun = 0;
  let cursor = today;

  for (let i = 0; i < 800; i += 1) {
    if (options.earliest && cursor < options.earliest) break;
    const state = statsByDate.get(cursor)?.dayState ?? 'no_data';

    if (state === 'successful') {
      streak += 1;
      neutralRun = 0;
    } else if (cursor === today) {
      // Day in progress: not a miss.
    } else if (state === 'rest') {
      neutralRun = 0;
    } else if (state === 'no_data') {
      neutralRun += 1;
      if (neutralRun >= maxNeutralRun) break;
    } else {
      break;
    }

    cursor = shiftBack(cursor);
  }

  return streak;
}

export function calculateLongestStreak(
  statsByDate: Map<DateKey, Pick<DailyStats, 'dayState'>>,
  orderedDates: DateKey[],
): number {
  let longest = 0;
  let run = 0;
  for (const date of orderedDates) {
    const state = statsByDate.get(date)?.dayState ?? 'no_data';
    if (state === 'successful') {
      run += 1;
      longest = Math.max(longest, run);
    } else if (state === 'rest') {
      // transparent
    } else {
      run = 0;
    }
  }
  return longest;
}

function shiftBack(key: DateKey): DateKey {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - 1);
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
