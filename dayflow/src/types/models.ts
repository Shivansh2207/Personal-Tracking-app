/**
 * DayFlow domain model.
 *
 * Everything lives under `users/{uid}/...`, so ownership is structural.
 *
 * The central design decision is that **not every activity is a task**. A
 * routine declares *how it is measured* (`trackingType`) and *when it is owed*
 * (`schedule`), and the analytics layer scores each type on its own terms.
 */

/** `YYYY-MM-DD` in the user's configured timezone. */
export type DateKey = string;
/** `HH:mm`, 24-hour, local. */
export type TimeString = string;
/** `YYYY-Www`, derived from the week's start date. */
export type WeekKey = string;

// ---------------------------------------------------------------------------
// Tracking types
// ---------------------------------------------------------------------------

export type TrackingType =
  /** Binary: done or not done. Face routine, vitamins, make bed. */
  | 'check'
  /** A quantity against a target. 20 pages, 8 glasses, 25 questions. */
  | 'count'
  /** Minutes against a target. 30 min reading, 15 min meditation. */
  | 'duration'
  /** An actual clock time against a target time. Wake up, bedtime. */
  | 'time'
  /** N sessions within a period, with no fixed day. Gym 4×/week. */
  | 'session'
  /** A free measurement with no completion semantics. Weight, mood. */
  | 'numeric';

export const TRACKING_TYPE_LABELS: Record<TrackingType, string> = {
  check: 'Done / Not done',
  count: 'Count',
  duration: 'Time spent',
  time: 'Actual time',
  session: 'Sessions per period',
  numeric: 'Measurement',
};

/** Types whose progress is a ratio of actual to target. */
export const RATIO_TRACKING_TYPES: TrackingType[] = ['count', 'duration', 'session'];

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

export type ScheduleType =
  | 'daily'
  | 'weekdays'
  | 'weekends'
  | 'specific_days'
  | 'times_per_week'
  | 'times_per_month'
  | 'every_n_days'
  | 'every_n_weeks'
  | 'monthly_day'
  | 'monthly_nth_weekday';

export interface ScheduleRule {
  type: ScheduleType;
  /** 0 = Sunday … 6 = Saturday. Used by `specific_days` / `every_n_weeks`. */
  daysOfWeek?: number[];
  /** Target count for `times_per_week` / `times_per_month`. */
  times?: number;
  /** Interval for `every_n_days` / `every_n_weeks`. */
  interval?: number;
  /** 1–31 for `monthly_day` (clamped to short months). */
  dayOfMonth?: number;
  /** 1–5 (5 = last) for `monthly_nth_weekday`. */
  nth?: number;
  /** 0–6 for `monthly_nth_weekday`. */
  weekday?: number;
  /** Anchor the rule is measured from. */
  startDate: DateKey;
  endDate?: DateKey | null;
}

/**
 * A fixed schedule names the days an activity is owed on; a flexible target
 * only names how many times per period. This distinction is what stops a
 * "4× per week" gym routine being reported as three missed days.
 */
export function isFlexibleSchedule(rule: ScheduleRule): boolean {
  return rule.type === 'times_per_week' || rule.type === 'times_per_month';
}

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

export type UserType = 'student' | 'student_work' | 'work' | 'personal' | 'other';

export interface NotificationSettings {
  enabled: boolean;
  wake: boolean;
  routines: boolean;
  timetable: boolean;
  tasks: boolean;
  revision: boolean;
  dailySummary: boolean;
  weeklyReview: boolean;
  /** Minutes before a timetable slot to fire its reminder. */
  timetableOffsetMinutes: number;
  /** Minutes before a task's start time. */
  taskOffsetMinutes: number;
  dailySummaryTime: TimeString;
}

export interface UserSettings {
  weekStart: 0 | 1;
  use24HourTime: boolean;
  timezone: string;

  wakeTarget: TimeString | null;
  /** Minutes either side of the wake target still counted as "on target". */
  wakeToleranceMinutes: number;
  trackSleep: boolean;
  sleepTarget: TimeString | null;

  autoCarryTasks: boolean;
  defaultStudyMinutes: number;
  weeklyReviewDay: number;

  notifications: NotificationSettings;
}

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  userType: UserType | null;
  timezone: string;
  onboardingCompleted: boolean;
  settings: UserSettings;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export type CategoryKind = 'general' | 'study' | 'fitness' | 'work' | 'personal';

export interface Category {
  id: string;
  userId: string;
  name: string;
  icon: string;
  color: string;
  kind: CategoryKind;
  order: number;
  active: boolean;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Routines
// ---------------------------------------------------------------------------

export type DayPart = 'morning' | 'afternoon' | 'evening' | 'night' | 'anytime';

export interface Routine {
  id: string;
  userId: string;
  name: string;
  icon: string;
  categoryId: string | null;

  trackingType: TrackingType;
  /** Target quantity/minutes/sessions. `null` for check and numeric routines. */
  targetValue: number | null;
  /** "pages", "glasses", "questions", "min", "kg". */
  unit: string | null;
  /** Target clock time for `time` routines. */
  targetTime: TimeString | null;

  schedule: ScheduleRule;
  preferredTime: TimeString | null;
  dayPart: DayPart;

  reminderEnabled: boolean;
  reminderTime: TimeString | null;
  notificationId: string | null;

  /** Links a practice routine to a subject so study analytics can see it. */
  linkedSubjectId: string | null;

  active: boolean;
  order: number;
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
}

export type RoutineLogStatus = 'completed' | 'partial' | 'missed' | 'skipped' | 'rest';

export interface RoutineLog {
  /** Deterministic `${routineId}_${dateKey}` — one record per routine per day. */
  id: string;
  userId: string;
  routineId: string;
  dateKey: DateKey;
  /** Count, minutes, sessions logged that day, or 1 for a completed check. */
  actualValue: number;
  /** The target at the time of logging, so history survives target changes. */
  targetValueSnapshot: number | null;
  /** For `time` routines: the clock time actually logged. */
  actualTime: TimeString | null;
  status: RoutineLogStatus;
  startedAt: number | null;
  completedAt: number;
  notes: string | null;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export type TaskStatus = 'pending' | 'completed' | 'skipped';
export type Priority = 'low' | 'normal' | 'high' | 'urgent';

export const PRIORITY_ORDER: Record<Priority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export interface Task {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  categoryId: string | null;
  /** `null` puts the task in the backlog. */
  dateKey: DateKey | null;
  startTime: TimeString | null;
  estimatedMinutes: number | null;
  /** Hard deadline, independent of the day it is scheduled on. */
  deadline: DateKey | null;
  status: TaskStatus;
  priority: Priority;

  recurrence: ScheduleRule | null;
  /** True on the stored series definition; occurrences are generated from it. */
  isRecurringTemplate: boolean;
  parentTaskId: string | null;

  reminderMinutesBefore: number | null;
  notificationId: string | null;
  notes: string | null;
  /** How many times the task has been rolled forward. */
  carryCount: number;

  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
}

// ---------------------------------------------------------------------------
// Study
// ---------------------------------------------------------------------------

export interface Course {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  active: boolean;
  createdAt: number;
}

export interface Subject {
  id: string;
  userId: string;
  courseId: string | null;
  name: string;
  code: string | null;
  color: string;
  icon: string;
  targetDate: DateKey | null;
  examDate: DateKey | null;
  /** Optional weekly study target, in minutes. */
  weeklyTargetMinutes: number | null;
  order: number;
  createdAt: number;
  updatedAt: number;
}

export type ChapterStatus = 'not_started' | 'learning' | 'practice' | 'revision' | 'completed';

export const CHAPTER_STATUS_LABELS: Record<ChapterStatus, string> = {
  not_started: 'Not started',
  learning: 'Learning',
  practice: 'Practice',
  revision: 'Revision',
  completed: 'Completed',
};

export const CHAPTER_STATUS_ORDER: ChapterStatus[] = [
  'not_started',
  'learning',
  'practice',
  'revision',
  'completed',
];

export interface Chapter {
  id: string;
  userId: string;
  subjectId: string;
  name: string;
  description: string | null;
  order: number;
  status: ChapterStatus;
  /** 0–100, set by the user. Never inferred from time spent. */
  progress: number;
  /** 1–5, optional. */
  confidence: number | null;
  totalStudyMinutes: number;
  lastStudiedAt: number | null;
  completedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface Topic {
  id: string;
  userId: string;
  subjectId: string;
  chapterId: string;
  name: string;
  status: ChapterStatus;
  progress: number;
  confidence: number | null;
  notes: string | null;
  order: number;
  createdAt: number;
  updatedAt: number;
}

export type SessionSource = 'timer' | 'manual' | 'timetable' | 'revision';

export interface StudySession {
  id: string;
  userId: string;
  subjectId: string | null;
  chapterId: string | null;
  topicIds: string[];
  /** Local day the session is attributed to — its *start* date. */
  dateKey: DateKey;
  plannedMinutes: number | null;
  actualMinutes: number;
  source: SessionSource;
  /** Set when the session fulfils a timetable slot. */
  timetableSlotId: string | null;
  startedAt: number;
  endedAt: number;
  confidence: number | null;
  progressBefore: number | null;
  progressAfter: number | null;
  notes: string | null;
  createdAt: number;
}

export type ChapterMode = 'fixed' | 'next_incomplete';

export interface TimetableSlot {
  id: string;
  userId: string;
  subjectId: string;
  chapterMode: ChapterMode;
  fixedChapterId: string | null;
  /** 0 = Sunday … 6 = Saturday. */
  daysOfWeek: number[];
  startTime: TimeString;
  durationMinutes: number;
  reminderOffsetMinutes: number | null;
  notificationId: string | null;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export type RevisionStatus = 'due' | 'completed' | 'skipped';

export interface RevisionItem {
  id: string;
  userId: string;
  subjectId: string;
  chapterId: string;
  topicId: string | null;
  dueDateKey: DateKey;
  status: RevisionStatus;
  /** 1 for the first revision, 2 for the next, and so on. */
  revisionNumber: number;
  completedAt: number | null;
  nextRevisionDateKey: DateKey | null;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Free-form activity log (things that fit neither routine, task nor study)
// ---------------------------------------------------------------------------

export interface ActivityLog {
  id: string;
  userId: string;
  type: string;
  categoryId: string | null;
  dateKey: DateKey;
  value: number | null;
  unit: string | null;
  startedAt: number | null;
  endedAt: number | null;
  notes: string | null;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Aggregates
// ---------------------------------------------------------------------------

export interface DailySummary {
  id: DateKey;
  userId: string;
  dateKey: DateKey;

  wakeTarget: TimeString | null;
  wakeActual: TimeString | null;
  /** Signed minutes: positive = later than target. */
  wakeDeviationMinutes: number | null;
  sleepTarget: TimeString | null;
  sleepActual: TimeString | null;
  sleepDeviationMinutes: number | null;

  routinesScheduled: number;
  routinesCompleted: number;
  routinesPartial: number;
  routinesSkipped: number;
  /** 0–100 across scheduled routines, honouring partial credit. */
  routineConsistency: number;

  tasksPlanned: number;
  tasksCompleted: number;

  studyPlannedMinutes: number;
  studyActualMinutes: number;
  /** Study time that did not correspond to a timetable slot. */
  studyExtraMinutes: number;

  timetableSlots: number;
  timetableCompleted: number;
  timetablePartial: number;

  revisionDue: number;
  revisionCompleted: number;

  /** Category id -> minutes recorded that day. */
  categoryMinutes: Record<string, number>;
  /** 0–100 blended day completion, or null when there was nothing to do. */
  overallConsistency: number | null;
  isRestDay: boolean;

  createdAt: number;
  updatedAt: number;
}

export interface WeeklySummary {
  id: WeekKey;
  userId: string;
  weekStart: DateKey;
  weekEnd: DateKey;

  studyMinutes: number;
  studyPlannedMinutes: number;
  routineConsistency: number;
  tasksPlanned: number;
  tasksCompleted: number;
  timetableAdherence: number;
  /** Minutes since midnight, averaged over days with a wake log. */
  wakeAverageMinutes: number | null;
  revisionCompleted: number;
  daysWithData: number;
  /** subjectId -> minutes. */
  subjectBreakdown: Record<string, number>;

  // Optional weekly reflection.
  biggestWin: string | null;
  biggestProblem: string | null;
  nextWeekFocus: string | null;
  realityScore: number | null;

  createdAt: number;
  updatedAt: number;
}

export interface DailyReflection {
  id: DateKey;
  userId: string;
  dateKey: DateKey;
  dayRating: number | null;
  energy: number | null;
  mood: number | null;
  biggestWin: string | null;
  tomorrowFocus: string | null;
  isRestDay: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Note {
  id: string;
  userId: string;
  dateKey: DateKey;
  text: string;
  createdAt: number;
}
