/**
 * Live application state.
 *
 * Realtime listeners are limited to the small, high-value collections: the
 * user's routines/categories/subjects/timetable, the active day's logs, tasks
 * and sessions, the current period's routine logs (needed to score flexible
 * weekly targets) and a bounded 90-day window of daily summaries. History is
 * fetched on demand instead of streamed.
 *
 * Every mutation is applied optimistically and reconciled by the listener, then
 * schedules a debounced recompute of the affected day. That single funnel is
 * what keeps the Today screen, the calendar, the insights and the weekly review
 * agreeing with one another.
 */

import { create } from 'zustand';

import {
  groupLogsByRoutine,
  indexLogsByDate,
  snapshotRoutineDay,
  type RoutineDaySnapshot,
} from '@/services/analytics/routines';
import { loadCachedCategories, subscribeCategories } from '@/services/categoryService';
import { toFriendlyError } from '@/services/firebase/errors';
import {
  clearRoutineLog,
  loadCachedRoutines,
  loadCachedTodayLogs,
  logRoutine,
  subscribeRoutineLogsInRange,
  subscribeRoutines,
} from '@/services/routineService';
import { subscribeDueRevisions } from '@/services/revisionService';
import {
  fetchAllChapters,
  loadCachedSubjects,
  subscribeSessionsForDate,
  subscribeSubjects,
} from '@/services/studyService';
import {
  loadCachedSummaries,
  recomputeDailySummary,
  subscribeRecentSummaries,
} from '@/services/summaryService';
import {
  expandTasksForDate,
  loadCachedTodayTasks,
  setTaskStatus,
  subscribeBacklog,
  subscribeRecurringTemplates,
  subscribeTasksForDate,
} from '@/services/taskService';
import { loadCachedTimetable, subscribeTimetable } from '@/services/timetableService';
import type {
  Category,
  Chapter,
  DailySummary,
  DateKey,
  RevisionItem,
  Routine,
  RoutineLog,
  StudySession,
  Subject,
  Task,
  TimeString,
  TimetableSlot,
  UserSettings,
} from '@/types/models';
import { addDays, endOfMonth, startOfMonth, todayKey } from '@/utils/date';

type Unsub = () => void;

interface DataState {
  uid: string | null;
  settings: UserSettings | null;
  /** The day the Today / Plan surfaces are showing. */
  activeDate: DateKey;

  categories: Category[];
  routines: Routine[];
  subjects: Subject[];
  chapters: Chapter[];
  slots: TimetableSlot[];
  dueRevisions: RevisionItem[];

  dayTasks: Task[];
  recurringTemplates: Task[];
  backlog: Task[];
  /** Logs across the current month, so weekly/monthly targets can be scored. */
  periodLogs: RoutineLog[];
  daySessions: StudySession[];
  recentSummaries: DailySummary[];

  loading: boolean;
  hydrated: boolean;
  error: string | null;
  offline: boolean;

  init: (uid: string, settings: UserSettings) => void;
  setSettings: (settings: UserSettings) => void;
  setActiveDate: (date: DateKey) => void;
  teardown: () => void;
  refreshChapters: () => Promise<void>;
  scheduleRecompute: (date: DateKey) => void;
  recomputeNow: (date: DateKey) => Promise<void>;

  toggleRoutine: (routine: Routine) => Promise<void>;
  adjustRoutine: (routine: Routine, delta: number) => Promise<void>;
  setRoutineValue: (routine: Routine, value: number) => Promise<void>;
  logRoutineTime: (routine: Routine, time: TimeString) => Promise<void>;
  skipRoutine: (routine: Routine, rest?: boolean) => Promise<void>;
  toggleTask: (task: Task) => Promise<void>;

  visibleTasks: () => Task[];
  routineSnapshots: (date?: DateKey) => RoutineDaySnapshot[];
  logsFor: (date: DateKey) => RoutineLog[];
  summaryFor: (date: DateKey) => DailySummary | null;
}

let globalListeners: Unsub[] = [];
let dayListeners: Unsub[] = [];
const recomputeTimers = new Map<DateKey, ReturnType<typeof setTimeout>>();

function clearListeners(list: Unsub[]) {
  list.forEach((fn) => {
    try {
      fn();
    } catch {
      // Already detached.
    }
  });
}

export const useDataStore = create<DataState>((set, get) => ({
  uid: null,
  settings: null,
  activeDate: todayKey(),

  categories: [],
  routines: [],
  subjects: [],
  chapters: [],
  slots: [],
  dueRevisions: [],

  dayTasks: [],
  recurringTemplates: [],
  backlog: [],
  periodLogs: [],
  daySessions: [],
  recentSummaries: [],

  loading: true,
  hydrated: false,
  error: null,
  offline: false,

  init: (uid, settings) => {
    if (get().uid === uid && globalListeners.length > 0) {
      set({ settings });
      return;
    }
    get().teardown();
    set({ uid, settings, loading: true, error: null, hydrated: false });

    // Paint from the last known good data first.
    (async () => {
      const [categories, routines, subjects, slots, tasks, logs, summaries] = await Promise.all([
        loadCachedCategories(uid),
        loadCachedRoutines(uid),
        loadCachedSubjects(uid),
        loadCachedTimetable(uid),
        loadCachedTodayTasks(uid),
        loadCachedTodayLogs(uid),
        loadCachedSummaries(uid),
      ]);
      if (get().uid !== uid) return;
      const hasCache = routines.length > 0 || tasks.length > 0 || summaries.length > 0;
      set((state) => ({
        categories: state.categories.length ? state.categories : categories,
        routines: state.routines.length ? state.routines : routines,
        subjects: state.subjects.length ? state.subjects : subjects,
        slots: state.slots.length ? state.slots : slots,
        dayTasks: state.dayTasks.length ? state.dayTasks : tasks,
        periodLogs: state.periodLogs.length ? state.periodLogs : logs,
        recentSummaries: state.recentSummaries.length ? state.recentSummaries : summaries,
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

    globalListeners = [
      subscribeCategories(
        uid,
        (categories) => {
          clearError();
          set({ categories });
        },
        onError,
      ),
      subscribeRoutines(
        uid,
        (routines) => {
          clearError();
          set({ routines });
        },
        onError,
      ),
      subscribeSubjects(
        uid,
        (subjects) => {
          set({ subjects });
          get().refreshChapters();
        },
        onError,
      ),
      subscribeTimetable(uid, (slots) => set({ slots }), onError),
      subscribeDueRevisions(uid, (dueRevisions) => set({ dueRevisions }), onError),
      subscribeRecurringTemplates(uid, (recurringTemplates) => set({ recurringTemplates }), onError),
      subscribeBacklog(uid, (backlog) => set({ backlog }), onError),
      subscribeRecentSummaries(uid, 90, (recentSummaries) => set({ recentSummaries }), onError),
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

    // The period window covers the whole month containing the active day, which
    // is what flexible weekly and monthly targets need to be scored correctly.
    const periodFrom = startOfMonth(date);
    const periodTo = endOfMonth(date);

    dayListeners = [
      subscribeTasksForDate(
        uid,
        date,
        (dayTasks) => set({ dayTasks, loading: false, hydrated: true }),
        onError,
      ),
      subscribeRoutineLogsInRange(uid, periodFrom, periodTo, (periodLogs) => set({ periodLogs }), onError),
      subscribeSessionsForDate(uid, date, (daySessions) => set({ daySessions }), onError),
    ];
  },

  teardown: () => {
    clearListeners(globalListeners);
    clearListeners(dayListeners);
    globalListeners = [];
    dayListeners = [];
    recomputeTimers.forEach((t) => clearTimeout(t));
    recomputeTimers.clear();
    set({
      uid: null,
      categories: [],
      routines: [],
      subjects: [],
      chapters: [],
      slots: [],
      dueRevisions: [],
      dayTasks: [],
      recurringTemplates: [],
      backlog: [],
      periodLogs: [],
      daySessions: [],
      recentSummaries: [],
      loading: true,
      hydrated: false,
      error: null,
    });
  },

  refreshChapters: async () => {
    const { uid, subjects } = get();
    if (!uid || subjects.length === 0) {
      set({ chapters: [] });
      return;
    }
    const chapters = await fetchAllChapters(uid, subjects).catch(() => [] as Chapter[]);
    if (get().uid === uid) set({ chapters });
  },

  /** Debounced so a burst of taps produces one aggregate write, not five. */
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
      await recomputeDailySummary(uid, date, settings);
    } catch (e) {
      const friendly = toFriendlyError(e, 'Could not update your summary');
      if (!friendly.retryable) set({ error: friendly.message });
    }
  },

  // -------------------------------------------------------------------------
  // Optimistic mutations
  // -------------------------------------------------------------------------

  toggleRoutine: async (routine) => {
    const { uid, activeDate, periodLogs } = get();
    if (!uid) return;
    const existing = periodLogs.find(
      (l) => l.routineId === routine.id && l.dateKey === activeDate,
    );
    const complete = existing?.status === 'completed';
    const id = `${routine.id}_${activeDate}`;
    const previous = periodLogs;

    set({
      periodLogs: complete
        ? periodLogs.filter((l) => l.id !== id)
        : [
            ...periodLogs.filter((l) => l.id !== id),
            {
              id,
              userId: uid,
              routineId: routine.id,
              dateKey: activeDate,
              actualValue: 1,
              targetValueSnapshot: routine.targetValue,
              actualTime: null,
              status: 'completed',
              startedAt: null,
              completedAt: Date.now(),
              notes: null,
              createdAt: Date.now(),
            },
          ],
    });

    try {
      if (complete) await clearRoutineLog(uid, routine.id, activeDate);
      else await logRoutine(uid, routine, activeDate, { actualValue: 1, status: 'completed' });
      get().scheduleRecompute(activeDate);
    } catch (e) {
      set({ periodLogs: previous, error: toFriendlyError(e).message });
    }
  },

  adjustRoutine: async (routine, delta) => {
    const { activeDate, periodLogs } = get();
    const existing = periodLogs.find(
      (l) => l.routineId === routine.id && l.dateKey === activeDate,
    );
    await get().setRoutineValue(routine, Math.max(0, (existing?.actualValue ?? 0) + delta));
  },

  setRoutineValue: async (routine, value) => {
    const { uid, activeDate, periodLogs } = get();
    if (!uid) return;
    const id = `${routine.id}_${activeDate}`;
    const previous = periodLogs;
    const target = routine.targetValue;
    const status =
      value <= 0 ? 'missed' : !target || value >= target ? 'completed' : 'partial';

    if (value <= 0) {
      set({ periodLogs: periodLogs.filter((l) => l.id !== id) });
      try {
        await clearRoutineLog(uid, routine.id, activeDate);
        get().scheduleRecompute(activeDate);
      } catch (e) {
        set({ periodLogs: previous, error: toFriendlyError(e).message });
      }
      return;
    }

    set({
      periodLogs: [
        ...periodLogs.filter((l) => l.id !== id),
        {
          id,
          userId: uid,
          routineId: routine.id,
          dateKey: activeDate,
          actualValue: value,
          targetValueSnapshot: target,
          actualTime: null,
          status,
          startedAt: null,
          completedAt: Date.now(),
          notes: null,
          createdAt: Date.now(),
        },
      ],
    });

    try {
      await logRoutine(uid, routine, activeDate, { actualValue: value });
      get().scheduleRecompute(activeDate);
    } catch (e) {
      set({ periodLogs: previous, error: toFriendlyError(e).message });
    }
  },

  logRoutineTime: async (routine, time) => {
    const { uid, activeDate, periodLogs } = get();
    if (!uid) return;
    const id = `${routine.id}_${activeDate}`;
    const previous = periodLogs;

    set({
      periodLogs: [
        ...periodLogs.filter((l) => l.id !== id),
        {
          id,
          userId: uid,
          routineId: routine.id,
          dateKey: activeDate,
          actualValue: 1,
          targetValueSnapshot: routine.targetValue,
          actualTime: time,
          status: 'completed',
          startedAt: null,
          completedAt: Date.now(),
          notes: null,
          createdAt: Date.now(),
        },
      ],
    });

    try {
      await logRoutine(uid, routine, activeDate, {
        actualValue: 1,
        actualTime: time,
        status: 'completed',
      });
      get().scheduleRecompute(activeDate);
    } catch (e) {
      set({ periodLogs: previous, error: toFriendlyError(e).message });
    }
  },

  skipRoutine: async (routine, rest = false) => {
    const { uid, activeDate, periodLogs } = get();
    if (!uid) return;
    const id = `${routine.id}_${activeDate}`;
    const previous = periodLogs;

    set({
      periodLogs: [
        ...periodLogs.filter((l) => l.id !== id),
        {
          id,
          userId: uid,
          routineId: routine.id,
          dateKey: activeDate,
          actualValue: 0,
          targetValueSnapshot: routine.targetValue,
          actualTime: null,
          status: rest ? 'rest' : 'skipped',
          startedAt: null,
          completedAt: Date.now(),
          notes: null,
          createdAt: Date.now(),
        },
      ],
    });

    try {
      await logRoutine(uid, routine, activeDate, {
        actualValue: 0,
        status: rest ? 'rest' : 'skipped',
      });
      get().scheduleRecompute(activeDate);
    } catch (e) {
      set({ periodLogs: previous, error: toFriendlyError(e).message });
    }
  },

  toggleTask: async (task) => {
    const { uid, activeDate, dayTasks } = get();
    if (!uid) return;
    const next = task.status === 'completed' ? 'pending' : 'completed';

    set({
      dayTasks: dayTasks.map((t) =>
        t.id === task.id
          ? { ...t, status: next, completedAt: next === 'completed' ? Date.now() : null }
          : t,
      ),
    });

    try {
      await setTaskStatus(uid, task.id, next);
      get().scheduleRecompute(task.dateKey ?? activeDate);
    } catch (e) {
      set({
        dayTasks: dayTasks.map((t) => (t.id === task.id ? task : t)),
        error: toFriendlyError(e, 'Could not update that task').message,
      });
    }
  },

  // -------------------------------------------------------------------------
  // Derived
  // -------------------------------------------------------------------------

  visibleTasks: () => {
    const { dayTasks, recurringTemplates, activeDate } = get();
    return expandTasksForDate(dayTasks, recurringTemplates, activeDate);
  },

  logsFor: (date) => get().periodLogs.filter((l) => l.dateKey === date),

  routineSnapshots: (date) => {
    const { routines, periodLogs, activeDate, settings } = get();
    const target = date ?? activeDate;
    const weekStart = settings?.weekStart ?? 1;
    const tolerance = settings?.wakeToleranceMinutes ?? 0;
    const grouped = groupLogsByRoutine(periodLogs);
    const today = todayKey();

    return routines
      .filter((r) => r.active)
      .map((routine) =>
        snapshotRoutineDay(
          routine,
          target,
          {
            logsByDate: indexLogsByDate(grouped.get(routine.id) ?? []),
            weekStart,
            today,
          },
          tolerance,
        ),
      )
      .filter((s) => s.available)
      .sort((a, b) => a.routine.order - b.routine.order);
  },

  summaryFor: (date) => get().recentSummaries.find((s) => s.dateKey === date) ?? null,
}));

/** Yesterday, relative to the active date — used by the missed-work prompt. */
export function previousDay(date: DateKey): DateKey {
  return addDays(date, -1);
}
