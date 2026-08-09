/**
 * The live application state.
 *
 * Realtime listeners are limited to the small, high-value collections (today's
 * tasks and habit logs, the user's categories/habits/goals/subjects and a
 * 90-day stats window). Historical analytics use one-shot queries instead, so
 * opening the app never streams the whole database.
 *
 * Every mutation is applied optimistically and then reconciled by the listener.
 * Any action that can move a number schedules a debounced recompute of the
 * affected day, which is what keeps the score, streak, calendar and weekly
 * rollups in sync from a single tap.
 */

import { create } from 'zustand';

import {
  expandTasksForDate,
  groupLogsByHabit,
  isLogComplete,
  snapshotHabitDay,
  indexLogsByDate,
} from '@/services/analytics';
import type { HabitDaySnapshot } from '@/services/analytics/habits';
import {
  fetchActivitiesForDate,
  logActivity as logActivityDoc,
  subscribeActivitiesForDate,
} from '@/services/activityService';
import {
  loadCachedCategories,
  subscribeCategories,
} from '@/services/categoryService';
import { toFriendlyError } from '@/services/firebase/errors';
import {
  clearHabitLog,
  loadCachedHabits,
  loadCachedTodayLogs,
  logHabit,
  subscribeHabitLogsForDate,
  subscribeHabits,
} from '@/services/habitService';
import { loadCachedGoals, recalculateAllGoals, subscribeGoals } from '@/services/goalService';
import {
  loadCachedRecentStats,
  recomputeDailyStats,
  subscribeRecentStats,
} from '@/services/statsService';
import { loadCachedSubjects, subscribeSessionsForDate, subscribeSubjects } from '@/services/studyService';
import {
  ensureRealTask,
  loadCachedTodayTasks,
  setTaskStatus,
  sortTasks,
  subscribeBacklog,
  subscribeRecurringTemplates,
  subscribeTasksForDate,
} from '@/services/taskService';
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
  UserSettings,
} from '@/types/models';
import { todayKey } from '@/utils/date';

type Unsub = () => void;

interface DataState {
  uid: string | null;
  settings: UserSettings | null;
  /** The day the Home/Plan surfaces are showing. */
  activeDate: DateKey;

  categories: Category[];
  habits: Habit[];
  goals: Goal[];
  subjects: Subject[];

  dayTasks: Task[];
  recurringTemplates: Task[];
  backlog: Task[];
  dayHabitLogs: HabitLog[];
  daySessions: StudySession[];
  dayActivities: ActivityLog[];
  recentStats: DailyStats[];

  loading: boolean;
  hydrated: boolean;
  error: string | null;
  offline: boolean;

  init: (uid: string, settings: UserSettings) => void;
  setSettings: (settings: UserSettings) => void;
  setActiveDate: (date: DateKey) => void;
  teardown: () => void;
  scheduleRecompute: (date: DateKey) => void;
  recomputeNow: (date: DateKey) => Promise<void>;

  toggleTaskComplete: (task: Task) => Promise<void>;
  toggleHabit: (habit: Habit) => Promise<void>;
  setHabitValue: (habit: Habit, value: number) => Promise<void>;
  skipHabit: (habit: Habit) => Promise<void>;
  quickLogActivity: (params: {
    type?: ActivityLog['type'];
    label?: string | null;
    durationMinutes?: number;
    notes?: string | null;
  }) => Promise<void>;

  visibleTasks: () => Task[];
  habitSnapshots: () => (HabitDaySnapshot & { habit: Habit })[];
  statsFor: (date: DateKey) => DailyStats | null;
}

let listeners: Unsub[] = [];
let dayListeners: Unsub[] = [];
const recomputeTimers = new Map<DateKey, ReturnType<typeof setTimeout>>();

function clearListeners(list: Unsub[]) {
  list.forEach((fn) => {
    try {
      fn();
    } catch {
      // A listener may already be detached.
    }
  });
}

export const useDataStore = create<DataState>((set, get) => ({
  uid: null,
  settings: null,
  activeDate: todayKey(),

  categories: [],
  habits: [],
  goals: [],
  subjects: [],

  dayTasks: [],
  recurringTemplates: [],
  backlog: [],
  dayHabitLogs: [],
  daySessions: [],
  dayActivities: [],
  recentStats: [],

  loading: true,
  hydrated: false,
  error: null,
  offline: false,

  init: (uid, settings) => {
    if (get().uid === uid && listeners.length > 0) {
      set({ settings });
      return;
    }
    get().teardown();
    set({ uid, settings, loading: true, error: null, hydrated: false });

    // Paint from the last known good data first.
    (async () => {
      const [categories, habits, goals, subjects, tasks, logs, stats] = await Promise.all([
        loadCachedCategories(uid),
        loadCachedHabits(uid),
        loadCachedGoals(uid),
        loadCachedSubjects(uid),
        loadCachedTodayTasks(uid),
        loadCachedTodayLogs(uid),
        loadCachedRecentStats(uid),
      ]);
      if (get().uid !== uid) return;
      const hasCache =
        categories.length > 0 || habits.length > 0 || tasks.length > 0 || stats.length > 0;
      set((state) => ({
        categories: state.categories.length ? state.categories : categories,
        habits: state.habits.length ? state.habits : habits,
        goals: state.goals.length ? state.goals : goals,
        subjects: state.subjects.length ? state.subjects : subjects,
        dayTasks: state.dayTasks.length ? state.dayTasks : tasks,
        dayHabitLogs: state.dayHabitLogs.length ? state.dayHabitLogs : logs,
        recentStats: state.recentStats.length ? state.recentStats : stats,
        hydrated: hasCache || state.hydrated,
      }));
    })();

    const onError = (e: unknown) => {
      const friendly = toFriendlyError(e, 'Sync problem');
      set({ error: friendly.message, offline: friendly.retryable, loading: false });
    };
    const clearError = () => {
      if (get().error) set({ error: null, offline: false });
    };

    listeners = [
      subscribeCategories(
        uid,
        (categories) => {
          clearError();
          set({ categories });
        },
        onError,
      ),
      subscribeHabits(
        uid,
        (habits) => {
          clearError();
          set({ habits });
        },
        onError,
      ),
      subscribeGoals(uid, (goals) => set({ goals }), onError),
      subscribeSubjects(uid, (subjects) => set({ subjects }), onError),
      subscribeRecurringTemplates(
        uid,
        (recurringTemplates) => set({ recurringTemplates }),
        onError,
      ),
      subscribeBacklog(uid, (backlog) => set({ backlog }), onError),
      subscribeRecentStats(uid, 90, (recentStats) => set({ recentStats }), onError),
    ];

    get().setActiveDate(get().activeDate);
  },

  setSettings: (settings) => set({ settings }),

  setActiveDate: (date) => {
    const uid = get().uid;
    set({ activeDate: date });
    if (!uid) return;

    clearListeners(dayListeners);
    const onError = (e: unknown) => {
      const friendly = toFriendlyError(e, 'Sync problem');
      set({ error: friendly.message, offline: friendly.retryable });
    };

    dayListeners = [
      subscribeTasksForDate(
        uid,
        date,
        (dayTasks) => set({ dayTasks, loading: false, hydrated: true }),
        onError,
      ),
      subscribeHabitLogsForDate(uid, date, (dayHabitLogs) => set({ dayHabitLogs }), onError),
      subscribeSessionsForDate(uid, date, (daySessions) => set({ daySessions }), onError),
      subscribeActivitiesForDate(uid, date, (dayActivities) => set({ dayActivities }), onError),
    ];
  },

  teardown: () => {
    clearListeners(listeners);
    clearListeners(dayListeners);
    listeners = [];
    dayListeners = [];
    recomputeTimers.forEach((t) => clearTimeout(t));
    recomputeTimers.clear();
    set({
      uid: null,
      categories: [],
      habits: [],
      goals: [],
      subjects: [],
      dayTasks: [],
      recurringTemplates: [],
      backlog: [],
      dayHabitLogs: [],
      daySessions: [],
      dayActivities: [],
      recentStats: [],
      loading: true,
      hydrated: false,
      error: null,
    });
  },

  /**
   * Debounced so a burst of taps (ticking four habits in a row) produces one
   * aggregate write instead of four.
   */
  scheduleRecompute: (date) => {
    const existing = recomputeTimers.get(date);
    if (existing) clearTimeout(existing);
    recomputeTimers.set(
      date,
      setTimeout(() => {
        recomputeTimers.delete(date);
        get().recomputeNow(date);
      }, 700),
    );
  },

  recomputeNow: async (date) => {
    const { uid, settings } = get();
    if (!uid || !settings) return;
    try {
      await recomputeDailyStats(uid, date, settings);
      await recalculateAllGoals(uid, {
        habits: get().habits,
        habitLogs: get().dayHabitLogs,
        weekStart: settings.weekStart,
      }).catch(() => {});
    } catch (e) {
      const friendly = toFriendlyError(e, 'Could not update your stats');
      if (!friendly.retryable) set({ error: friendly.message });
    }
  },

  toggleTaskComplete: async (task) => {
    const { uid, activeDate } = get();
    if (!uid) return;
    const nextStatus = task.status === 'completed' ? 'not_started' : 'completed';

    // Optimistic: flip immediately, including virtual recurring occurrences.
    set((state) => ({
      dayTasks: state.dayTasks.map((t) =>
        t.id === task.id
          ? { ...t, status: nextStatus, completedAt: nextStatus === 'completed' ? Date.now() : null }
          : t,
      ),
    }));

    try {
      await setTaskStatus(uid, task.id, nextStatus);
      get().scheduleRecompute(task.scheduledDate ?? activeDate);
    } catch (e) {
      set((state) => ({
        dayTasks: state.dayTasks.map((t) => (t.id === task.id ? task : t)),
        error: toFriendlyError(e, 'Could not update that task').message,
      }));
    }
  },

  toggleHabit: async (habit) => {
    const { uid, activeDate, dayHabitLogs } = get();
    if (!uid) return;
    const existing = dayHabitLogs.find((l) => l.habitId === habit.id && l.date === activeDate);
    const complete = isLogComplete(existing, habit);

    const optimistic: HabitLog = {
      id: `${habit.id}_${activeDate}`,
      userId: uid,
      habitId: habit.id,
      date: activeDate,
      value: habit.target,
      status: 'completed',
      notes: null,
      completedAt: Date.now(),
    };

    set((state) => ({
      dayHabitLogs: complete
        ? state.dayHabitLogs.filter((l) => l.id !== optimistic.id)
        : [...state.dayHabitLogs.filter((l) => l.id !== optimistic.id), optimistic],
    }));

    try {
      if (complete) await clearHabitLog(uid, habit.id, activeDate);
      else await logHabit(uid, habit, activeDate, { status: 'completed', value: habit.target });
      get().scheduleRecompute(activeDate);
    } catch (e) {
      set((state) => ({
        dayHabitLogs: complete
          ? [...state.dayHabitLogs, existing!].filter(Boolean)
          : state.dayHabitLogs.filter((l) => l.id !== optimistic.id),
        error: toFriendlyError(e, 'Could not update that habit').message,
      }));
    }
  },

  setHabitValue: async (habit, value) => {
    const { uid, activeDate } = get();
    if (!uid) return;
    const id = `${habit.id}_${activeDate}`;
    const previous = get().dayHabitLogs;

    if (value <= 0) {
      set((state) => ({ dayHabitLogs: state.dayHabitLogs.filter((l) => l.id !== id) }));
      try {
        await clearHabitLog(uid, habit.id, activeDate);
        get().scheduleRecompute(activeDate);
      } catch (e) {
        set({ dayHabitLogs: previous, error: toFriendlyError(e).message });
      }
      return;
    }

    const status = value >= habit.target ? 'completed' : 'partial';
    set((state) => ({
      dayHabitLogs: [
        ...state.dayHabitLogs.filter((l) => l.id !== id),
        {
          id,
          userId: uid,
          habitId: habit.id,
          date: activeDate,
          value,
          status,
          notes: null,
          completedAt: Date.now(),
        },
      ],
    }));

    try {
      await logHabit(uid, habit, activeDate, { value, status });
      get().scheduleRecompute(activeDate);
    } catch (e) {
      set({ dayHabitLogs: previous, error: toFriendlyError(e).message });
    }
  },

  skipHabit: async (habit) => {
    const { uid, activeDate } = get();
    if (!uid) return;
    const id = `${habit.id}_${activeDate}`;
    const previous = get().dayHabitLogs;
    set((state) => ({
      dayHabitLogs: [
        ...state.dayHabitLogs.filter((l) => l.id !== id),
        {
          id,
          userId: uid,
          habitId: habit.id,
          date: activeDate,
          value: 0,
          status: 'skipped',
          notes: null,
          completedAt: Date.now(),
        },
      ],
    }));
    try {
      await logHabit(uid, habit, activeDate, { status: 'skipped', value: 0 });
      get().scheduleRecompute(activeDate);
    } catch (e) {
      set({ dayHabitLogs: previous, error: toFriendlyError(e).message });
    }
  },

  quickLogActivity: async (params) => {
    const { uid, activeDate } = get();
    if (!uid) return;
    try {
      await logActivityDoc(uid, {
        date: activeDate,
        type: params.type ?? 'gym',
        label: params.label ?? null,
        durationMinutes: params.durationMinutes ?? 0,
        notes: params.notes ?? null,
        completed: true,
      });
      const activities = await fetchActivitiesForDate(uid, activeDate);
      set({ dayActivities: activities });
      get().scheduleRecompute(activeDate);
    } catch (e) {
      set({ error: toFriendlyError(e, 'Could not save that activity').message });
    }
  },

  /** Stored tasks merged with the recurring occurrences due on the active day. */
  visibleTasks: () => {
    const { dayTasks, recurringTemplates, activeDate } = get();
    return sortTasks(expandTasksForDate(dayTasks, recurringTemplates, activeDate));
  },

  habitSnapshots: () => {
    const { habits, dayHabitLogs, activeDate, settings } = get();
    const weekStart = settings?.weekStart ?? 1;
    const grouped = groupLogsByHabit(dayHabitLogs);
    return habits
      .filter((h) => h.active)
      .map((habit) => ({
        habit,
        ...snapshotHabitDay(habit, activeDate, {
          logsByDate: indexLogsByDate(grouped.get(habit.id) ?? []),
          weekStart,
          today: todayKey(),
        }),
      }))
      .filter((s) => s.available);
  },

  statsFor: (date) => get().recentStats.find((s) => s.date === date) ?? null,
}));

/** Used by screens that need to resolve a possibly-virtual task id. */
export async function resolveTaskId(uid: string, taskId: string): Promise<string> {
  return ensureRealTask(uid, taskId);
}
