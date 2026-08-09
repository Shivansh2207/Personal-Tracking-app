/**
 * Firestore document shapes.
 *
 * Every document lives under `users/{uid}/...` so ownership is structural.
 * `userId` is still stored on top-level records so exports and future
 * collection-group queries stay unambiguous.
 */

/** `YYYY-MM-DD` in the user's local timezone. */
export type DateKey = string;
/** `HH:mm` 24h local time. */
export type TimeString = string;
/** ISO week id, `YYYY-Www` (week start honours the user's weekStart setting). */
export type WeekKey = string;

export type TaskStatus = 'not_started' | 'in_progress' | 'completed' | 'skipped';
export type Priority = 'low' | 'medium' | 'high' | 'critical';

export const PRIORITY_ORDER: Record<Priority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export type RecurrenceType =
  | 'none'
  | 'daily'
  | 'weekdays'
  | 'weekends'
  | 'weekly'
  | 'specific_days'
  | 'monthly'
  | 'interval';

export interface RecurrenceRule {
  type: RecurrenceType;
  /** 0 = Sunday … 6 = Saturday. Used by `specific_days` / `weekly`. */
  daysOfWeek?: number[];
  /** 1–31. Used by `monthly`. */
  dayOfMonth?: number;
  /** Every N days. Used by `interval`. */
  interval?: number;
  /** Inclusive anchor date the rule is measured from. */
  startDate: DateKey;
  /** Inclusive last date, if the series ends. */
  endDate?: DateKey | null;
}

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export interface UserSettings {
  weekStart: 0 | 1;
  use24HourTime: boolean;
  productivityThreshold: number;
  autoCarryTasks: boolean;
  dailyFocusGoalMinutes: number;
  weeklyReviewDay: number;
  notifications: {
    enabled: boolean;
    taskReminders: boolean;
    habitReminders: boolean;
    studyReminders: boolean;
    goalDeadlines: boolean;
    dailyPlanning: boolean;
    dailyReview: boolean;
    weeklyReview: boolean;
    /** `HH:mm` */
    planningTime: TimeString;
    reviewTime: TimeString;
    /** Minutes before a scheduled task to fire its reminder. */
    taskLeadMinutes: number;
  };
}

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  /** Two-letter monogram fallback avatar; no Storage bucket required. */
  avatarEmoji?: string | null;
  timezone: string;
  mainGoal?: string | null;
  wakeTime?: TimeString | null;
  sleepTime?: TimeString | null;
  onboardingComplete: boolean;
  settings: UserSettings;
  createdAt: number;
  updatedAt: number;
}

export interface Category {
  id: string;
  userId: string;
  name: string;
  icon: string;
  color: string;
  order: number;
  active: boolean;
  /** Marks a category as the destination for gym/activity logging. */
  kind?: 'general' | 'study' | 'activity';
  createdAt: number;
}

export interface Task {
  id: string;
  userId: string;
  title: string;
  description?: string | null;
  categoryId?: string | null;
  goalId?: string | null;
  /** `null` means the task lives in the backlog. */
  scheduledDate: DateKey | null;
  startTime?: TimeString | null;
  endTime?: TimeString | null;
  estimatedMinutes?: number | null;
  actualMinutes?: number | null;
  priority: Priority;
  status: TaskStatus;
  isTopPriority: boolean;
  topPriorityOrder?: number | null;
  recurrenceRule?: RecurrenceRule | null;
  /** Set on generated occurrences pointing back at the series template. */
  parentRecurringTaskId?: string | null;
  /** `true` on the stored template that generates occurrences. */
  isRecurringTemplate?: boolean;
  subtasks: Subtask[];
  notes?: string | null;
  reminderMinutesBefore?: number | null;
  /** Local notification id so reminders can be cancelled on edit/delete. */
  notificationId?: string | null;
  /** Number of times the task has been rolled forward. */
  carryCount?: number;
  createdAt: number;
  updatedAt: number;
  completedAt?: number | null;
}

export type HabitMeasurement = 'binary' | 'count' | 'duration';

export type HabitFrequencyType =
  | 'daily'
  | 'specific_days'
  | 'times_per_week'
  | 'times_per_month';

export interface HabitFrequency {
  type: HabitFrequencyType;
  /** 0 = Sunday … 6 = Saturday. */
  daysOfWeek?: number[];
  /** Used by `times_per_week` / `times_per_month`. */
  times?: number;
}

export interface Habit {
  id: string;
  userId: string;
  name: string;
  categoryId?: string | null;
  icon: string;
  color?: string | null;
  measurementType: HabitMeasurement;
  /** Count or minutes required to call a day complete. Binary habits use 1. */
  target: number;
  unit?: string | null;
  frequency: HabitFrequency;
  startDate: DateKey;
  reminderTime?: TimeString | null;
  notificationId?: string | null;
  active: boolean;
  order: number;
  createdAt: number;
  archivedAt?: number | null;
}

export type HabitLogStatus = 'completed' | 'partial' | 'skipped' | 'missed';

export interface HabitLog {
  /** Deterministic id `${habitId}_${date}` — prevents duplicate day records. */
  id: string;
  userId: string;
  habitId: string;
  date: DateKey;
  value: number;
  status: HabitLogStatus;
  notes?: string | null;
  completedAt: number;
}

export type TopicStatus = 'not_started' | 'learning' | 'practice' | 'revision' | 'completed';

export interface Subject {
  id: string;
  userId: string;
  name: string;
  categoryId?: string | null;
  description?: string | null;
  color: string;
  icon: string;
  targetDate?: DateKey | null;
  examDate?: DateKey | null;
  order: number;
  createdAt: number;
}

export interface Topic {
  id: string;
  userId: string;
  subjectId: string;
  name: string;
  description?: string | null;
  status: TopicStatus;
  /** 0–100. Derived from status unless manually overridden. */
  progress: number;
  estimatedMinutes?: number | null;
  actualMinutes: number;
  /** 1–5 self-rated. `null` until first rated. */
  confidence?: number | null;
  lastStudiedAt?: number | null;
  nextRevisionDate?: DateKey | null;
  order: number;
  createdAt: number;
  updatedAt: number;
}

export interface StudySession {
  id: string;
  userId: string;
  subjectId?: string | null;
  topicId?: string | null;
  categoryId?: string | null;
  taskId?: string | null;
  /** Free-text label used when no subject/topic was selected. */
  label?: string | null;
  date: DateKey;
  startedAt: number;
  endedAt: number;
  durationMinutes: number;
  productivityRating?: number | null;
  notes?: string | null;
  createdAt: number;
}

export type ActivityType = 'gym' | 'running' | 'walking' | 'cycling' | 'sports' | 'other';

export interface ActivityLog {
  id: string;
  userId: string;
  date: DateKey;
  type: ActivityType;
  /** e.g. "Push", "Legs", "5k". */
  label?: string | null;
  durationMinutes: number;
  completed: boolean;
  notes?: string | null;
  createdAt: number;
}

export type GoalStatus = 'active' | 'completed' | 'paused' | 'archived';
export type GoalProgressType = 'manual' | 'tasks' | 'habits' | 'numeric' | 'topics';

export interface GoalMilestone {
  id: string;
  title: string;
  done: boolean;
  targetDate?: DateKey | null;
}

export interface Goal {
  id: string;
  userId: string;
  title: string;
  description?: string | null;
  categoryId?: string | null;
  startDate: DateKey;
  targetDate?: DateKey | null;
  status: GoalStatus;
  progressType: GoalProgressType;
  targetValue?: number | null;
  currentValue: number;
  /** 0–100 cached value; recomputed by goalService whenever inputs change. */
  progress: number;
  linkedHabitIds: string[];
  linkedSubjectIds: string[];
  milestones: GoalMilestone[];
  createdAt: number;
  updatedAt: number;
  completedAt?: number | null;
}

/** Aggregate written once per local day; raw records remain the source of truth. */
export interface DailyStats {
  id: DateKey;
  userId: string;
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
  /** categoryId -> minutes recorded. */
  categoryMinutes: Record<string, number>;
  /** categoryId -> completed task count. */
  categoryTasks: Record<string, number>;
  dayState: DayState;
  updatedAt: number;
}

export type DayState = 'successful' | 'incomplete' | 'rest' | 'no_data';

export interface DailyReview {
  id: DateKey;
  userId: string;
  date: DateKey;
  productivityScore: number;
  tasksPlanned: number;
  tasksCompleted: number;
  habitsScheduled: number;
  habitsCompleted: number;
  focusMinutes: number;
  activityMinutes: number;
  biggestWin?: string | null;
  improvement?: string | null;
  tomorrowFocus?: string | null;
  energyScore?: number | null;
  moodScore?: number | null;
  isRestDay: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface WeeklyReview {
  id: WeekKey;
  userId: string;
  weekStart: DateKey;
  weekEnd: DateKey;
  productivityScore: number;
  taskCompletionRate: number;
  tasksPlanned: number;
  tasksCompleted: number;
  habitConsistency: number;
  focusMinutes: number;
  studyMinutes: number;
  activityCount: number;
  goalProgress: number;
  bestDay?: DateKey | null;
  weakestCategory?: string | null;
  biggestWin?: string | null;
  biggestMistake?: string | null;
  slowdown?: string | null;
  improvement?: string | null;
  nextWeekFocus?: string | null;
  realityScore?: number | null;
  notes?: string | null;
  createdAt: number;
  updatedAt: number;
}

/** A note / reflection captured from Quick Add, outside the review flow. */
export interface Reflection {
  id: string;
  userId: string;
  date: DateKey;
  text: string;
  categoryId?: string | null;
  createdAt: number;
}
