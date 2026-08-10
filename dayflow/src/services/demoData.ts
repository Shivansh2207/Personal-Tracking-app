/**
 * Demo fixture generator.
 *
 * Pure and dependency-free, so the same data drives both the in-app "load
 * sample data" action and the fourteen-day simulation test suite.
 *
 * The fixture deliberately contains the awkward cases: a late wake-up, a rest
 * day, missed routines, partial and over-target counts, a missed study slot, a
 * rescheduled one, manual and spontaneous study, a week where the gym target is
 * met and a week where it is not, periodic practice done twice and half-done
 * once, recurring and overdue tasks, revisions, and chapter progress.
 */

import type {
  Category,
  Chapter,
  DateKey,
  RevisionItem,
  Routine,
  RoutineLog,
  RoutineLogStatus,
  StudySession,
  Subject,
  Task,
  TimetableSlot,
  UserSettings,
} from '@/types/models';
import { addDays, dateRange, dayOfWeek, todayKey } from '@/utils/date';

export interface DemoData {
  categories: Category[];
  routines: Routine[];
  routineLogs: RoutineLog[];
  tasks: Task[];
  subjects: Subject[];
  chapters: Chapter[];
  sessions: StudySession[];
  slots: TimetableSlot[];
  revisions: RevisionItem[];
  dates: DateKey[];
  /** Days deliberately marked as rest days by the fixture. */
  restDays: DateKey[];
}

export const DEMO_SETTINGS: UserSettings = {
  weekStart: 1,
  use24HourTime: false,
  timezone: 'Asia/Kolkata',
  wakeTarget: '07:00',
  wakeToleranceMinutes: 15,
  trackSleep: true,
  sleepTarget: '23:30',
  autoCarryTasks: false,
  defaultStudyMinutes: 60,
  weeklyReviewDay: 0,
  notifications: {
    enabled: false,
    wake: false,
    routines: false,
    timetable: false,
    tasks: false,
    revision: false,
    dailySummary: false,
    weeklyReview: false,
    timetableOffsetMinutes: 5,
    taskOffsetMinutes: 15,
    dailySummaryTime: '21:30',
  },
};

const CATEGORY_SEEDS = [
  { name: 'Study', icon: 'book', color: '#7C5CFF', kind: 'study' as const },
  { name: 'College', icon: 'award', color: '#9BA4FF', kind: 'study' as const },
  { name: 'Gym', icon: 'activity', color: '#FF7A45', kind: 'fitness' as const },
  { name: 'Personal', icon: 'heart', color: '#4ADE9B', kind: 'personal' as const },
];

const SUBJECT_SEEDS = [
  {
    name: 'Engineering Mathematics',
    color: '#7C5CFF',
    chapters: ['Matrices', 'Differential Equations', 'Probability', 'Laplace Transform'],
  },
  { name: 'DBMS', color: '#41CFFF', chapters: ['ER Model', 'SQL', 'Normalization', 'Transactions'] },
  { name: 'Data Structures', color: '#4ADE9B', chapters: ['Arrays', 'Linked Lists', 'Trees'] },
  { name: 'Operating Systems', color: '#FFBF47', chapters: ['Processes', 'Scheduling'] },
];

/** Deterministic pseudo-random so a seeded fixture is reproducible. */
function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

export function buildDemoHistory(
  uid: string,
  options: { endDate?: DateKey; days?: number; seed?: number } = {},
): DemoData {
  const endDate = options.endDate ?? todayKey();
  const days = options.days ?? 14;
  const startDate = addDays(endDate, -(days - 1));
  const dates = dateRange(startDate, endDate);
  const random = rng(options.seed ?? 20260810);
  const now = Date.parse(`${endDate}T12:00:00`);

  // ---- categories --------------------------------------------------------
  const categories: Category[] = CATEGORY_SEEDS.map((seed, index) => ({
    id: `cat_${index}`,
    userId: uid,
    name: seed.name,
    icon: seed.icon,
    color: seed.color,
    kind: seed.kind,
    order: index,
    active: true,
    createdAt: now,
  }));

  // ---- subjects & chapters ----------------------------------------------
  const subjects: Subject[] = SUBJECT_SEEDS.map((seed, index) => ({
    id: `subject_${index}`,
    userId: uid,
    courseId: 'course_0',
    name: seed.name,
    code: null,
    color: seed.color,
    icon: 'book',
    targetDate: addDays(endDate, 40),
    examDate: index === 0 ? addDays(endDate, 39) : null,
    weeklyTargetMinutes: index === 0 ? 300 : null,
    order: index,
    createdAt: now,
    updatedAt: now,
  }));

  const chapters: Chapter[] = [];
  SUBJECT_SEEDS.forEach((seed, subjectIndex) => {
    seed.chapters.forEach((chapterName, chapterIndex) => {
      // The first chapter or two of each subject are finished; the next is in
      // progress. That is what "next incomplete" has to resolve correctly.
      const completed = chapterIndex < (subjectIndex === 0 ? 2 : 1);
      const inProgress = chapterIndex === (subjectIndex === 0 ? 2 : 1);
      chapters.push({
        id: `chapter_${subjectIndex}_${chapterIndex}`,
        userId: uid,
        subjectId: `subject_${subjectIndex}`,
        name: chapterName,
        description: null,
        order: chapterIndex,
        status: completed ? 'completed' : inProgress ? 'learning' : 'not_started',
        progress: completed ? 100 : inProgress ? 45 : 0,
        confidence: completed ? 4 : inProgress ? 3 : null,
        totalStudyMinutes: completed ? 180 : inProgress ? 95 : 0,
        lastStudiedAt: completed || inProgress ? now : null,
        completedAt: completed ? Date.parse(`${addDays(endDate, -6)}T20:00:00`) : null,
        createdAt: now,
        updatedAt: now,
      });
    });
  });

  // ---- timetable ---------------------------------------------------------
  const slots: TimetableSlot[] = [
    {
      id: 'slot_maths',
      userId: uid,
      subjectId: 'subject_0',
      chapterMode: 'next_incomplete',
      fixedChapterId: null,
      daysOfWeek: [1, 3],
      startTime: '19:00',
      durationMinutes: 60,
      reminderOffsetMinutes: 5,
      notificationId: null,
      active: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'slot_dbms',
      userId: uid,
      subjectId: 'subject_1',
      chapterMode: 'fixed',
      fixedChapterId: 'chapter_1_2',
      daysOfWeek: [2, 4],
      startTime: '21:00',
      durationMinutes: 60,
      reminderOffsetMinutes: 5,
      notificationId: null,
      active: true,
      createdAt: now,
      updatedAt: now,
    },
  ];

  // ---- routines ----------------------------------------------------------
  const routines: Routine[] = [
    routine(uid, 'routine_wake', 'Wake Up', 'sunrise', 'time', {
      targetTime: '07:00',
      schedule: { type: 'daily', startDate },
      dayPart: 'morning',
      categoryId: 'cat_3',
      order: 0,
    }),
    routine(uid, 'routine_sleep', 'Sleep', 'moon', 'time', {
      targetTime: '23:30',
      schedule: { type: 'daily', startDate },
      dayPart: 'night',
      categoryId: 'cat_3',
      order: 1,
    }),
    routine(uid, 'routine_face', 'Face Routine', 'droplet', 'check', {
      schedule: { type: 'daily', startDate },
      dayPart: 'morning',
      categoryId: 'cat_3',
      order: 2,
    }),
    routine(uid, 'routine_reading', 'Reading', 'book-open', 'count', {
      targetValue: 20,
      unit: 'pages',
      schedule: { type: 'daily', startDate },
      dayPart: 'evening',
      categoryId: 'cat_3',
      order: 3,
    }),
    routine(uid, 'routine_water', 'Water', 'droplet', 'count', {
      targetValue: 8,
      unit: 'glasses',
      schedule: { type: 'daily', startDate },
      dayPart: 'anytime',
      categoryId: 'cat_3',
      order: 4,
    }),
    routine(uid, 'routine_gym', 'Gym', 'activity', 'session', {
      schedule: { type: 'times_per_week', times: 4, startDate },
      dayPart: 'evening',
      categoryId: 'cat_2',
      order: 5,
    }),
    routine(uid, 'routine_maths_practice', 'Maths Practice', 'target', 'count', {
      targetValue: 20,
      unit: 'questions',
      // Wednesday + Saturday — a fixed periodic schedule, not a flexible target.
      schedule: { type: 'specific_days', daysOfWeek: [3, 6], startDate },
      dayPart: 'evening',
      categoryId: 'cat_0',
      linkedSubjectId: 'subject_0',
      order: 6,
    }),
    routine(uid, 'routine_meditation', 'Meditation', 'moon', 'duration', {
      targetValue: 15,
      unit: 'min',
      schedule: { type: 'daily', startDate },
      dayPart: 'night',
      categoryId: 'cat_3',
      order: 7,
    }),
  ];

  // ---- logs, sessions, tasks --------------------------------------------
  const routineLogs: RoutineLog[] = [];
  const sessions: StudySession[] = [];
  const tasks: Task[] = [];
  const restDays: DateKey[] = [];

  // One deliberate rest day, placed on a day the gym target does not use so the
  // fixture exercises rest days and flexible targets independently.
  const restDay = dates[1];
  restDays.push(restDay);

  dates.forEach((dateKey, dayIndex) => {
    const dow = dayOfWeek(dateKey);
    const isRest = dateKey === restDay;
    const isLastWeek = dayIndex >= days - 7;

    // Wake — mostly on target, deliberately late twice, missing once.
    if (dayIndex !== 3) {
      const lateness = dayIndex === 5 ? 42 : dayIndex === 9 ? 31 : Math.round(random() * 20) - 5;
      const minutes = 7 * 60 + lateness;
      routineLogs.push(
        log(uid, 'routine_wake', dateKey, {
          actualValue: 1,
          actualTime: `${pad(Math.floor(minutes / 60))}:${pad(((minutes % 60) + 60) % 60)}`,
          status: 'completed',
        }),
      );
    }

    // Bedtime — occasionally past midnight, which must not break the average.
    const sleepMinutes = dayIndex % 4 === 0 ? 24 * 60 + 15 : 23 * 60 + Math.round(random() * 40);
    routineLogs.push(
      log(uid, 'routine_sleep', dateKey, {
        actualValue: 1,
        actualTime: `${pad(Math.floor(sleepMinutes / 60) % 24)}:${pad(sleepMinutes % 60)}`,
        status: 'completed',
      }),
    );

    if (isRest) {
      // A rest day: routines are explicitly rested, not silently missed.
      for (const id of ['routine_face', 'routine_reading', 'routine_meditation']) {
        routineLogs.push(log(uid, id, dateKey, { actualValue: 0, status: 'rest' }));
      }
    } else {
      // Face routine — missed twice across the fortnight.
      if (dayIndex !== 4 && dayIndex !== 11) {
        routineLogs.push(log(uid, 'routine_face', dateKey, { actualValue: 1, status: 'completed' }));
      }

      // Reading — a mix of over-target, on-target and partial days.
      const pages =
        dayIndex === 2 ? 26 : dayIndex === 6 ? 15 : dayIndex === 8 ? 8 : 18 + Math.round(random() * 6);
      routineLogs.push(
        log(uid, 'routine_reading', dateKey, {
          actualValue: pages,
          targetValueSnapshot: 20,
          status: pages >= 20 ? 'completed' : 'partial',
        }),
      );

      // Water — usually short of target.
      const glasses = 5 + Math.round(random() * 4);
      routineLogs.push(
        log(uid, 'routine_water', dateKey, {
          actualValue: glasses,
          targetValueSnapshot: 8,
          status: glasses >= 8 ? 'completed' : 'partial',
        }),
      );

      // Meditation — duration, sometimes partial.
      const meditation = dayIndex % 5 === 0 ? 8 : 15;
      routineLogs.push(
        log(uid, 'routine_meditation', dateKey, {
          actualValue: meditation,
          targetValueSnapshot: 15,
          status: meditation >= 15 ? 'completed' : 'partial',
        }),
      );
    }

    // Gym — first week hits 4 of 4, second week only 2 of 4.
    const gymDays = isLastWeek ? [1, 4] : [1, 3, 5, 6];
    if (gymDays.includes(dow) && !isRest) {
      routineLogs.push(log(uid, 'routine_gym', dateKey, { actualValue: 1, status: 'completed' }));
    }

    // Maths practice — Wednesday and Saturday; one Saturday only half done.
    if ((dow === 3 || dow === 6) && !isRest) {
      const questions = dayIndex === 5 ? 10 : 20;
      routineLogs.push(
        log(uid, 'routine_maths_practice', dateKey, {
          actualValue: questions,
          targetValueSnapshot: 20,
          status: questions >= 20 ? 'completed' : 'partial',
        }),
      );
    }

    // ---- study sessions --------------------------------------------------
    const mathsSlotDay = dow === 1 || dow === 3;
    const dbmsSlotDay = dow === 2 || dow === 4;

    // A maths slot that was kept, except one that was missed entirely.
    if (mathsSlotDay && dayIndex !== 7 && !isRest) {
      const minutes = dayIndex === 1 ? 35 : 60; // one partial session
      sessions.push(
        session(uid, `session_maths_${dateKey}`, {
          subjectId: 'subject_0',
          chapterId: 'chapter_0_2',
          dateKey,
          actualMinutes: minutes,
          plannedMinutes: 60,
          source: 'timetable',
          timetableSlotId: 'slot_maths',
          startHour: 19,
        }),
      );
    }

    // The DBMS slot is kept most days; one is logged manually the next morning.
    if (dbmsSlotDay && !isRest) {
      sessions.push(
        session(uid, `session_dbms_${dateKey}`, {
          subjectId: 'subject_1',
          chapterId: 'chapter_1_2',
          dateKey,
          actualMinutes: dayIndex === 10 ? 45 : 60,
          plannedMinutes: 60,
          source: dayIndex === 10 ? 'manual' : 'timetable',
          timetableSlotId: 'slot_dbms',
          startHour: 21,
        }),
      );
    }

    // Spontaneous study that belongs to no slot — counts toward totals only.
    if (dayIndex % 4 === 2) {
      sessions.push(
        session(uid, `session_extra_${dateKey}`, {
          subjectId: 'subject_2',
          chapterId: 'chapter_2_1',
          dateKey,
          actualMinutes: 30 + Math.round(random() * 30),
          plannedMinutes: null,
          source: 'manual',
          timetableSlotId: null,
          startHour: 16,
        }),
      );
    }

    // ---- tasks -----------------------------------------------------------
    // A recurring weekly review task plus everyday one-offs.
    if (dow === 0) {
      tasks.push(
        task(uid, `task_review_${dateKey}`, 'Weekly planning', {
          dateKey,
          status: dayIndex < days - 1 ? 'completed' : 'pending',
          categoryId: 'cat_3',
          parentTaskId: 'task_template_review',
        }),
      );
    }
    const dailyTaskCount = 2 + (dayIndex % 2);
    for (let i = 0; i < dailyTaskCount; i += 1) {
      const completed = !isRest && random() > 0.25;
      tasks.push(
        task(uid, `task_${dateKey}_${i}`, TASK_TITLES[(dayIndex + i) % TASK_TITLES.length], {
          dateKey,
          status: completed ? 'completed' : 'pending',
          categoryId: `cat_${(dayIndex + i) % 4}`,
          startTime: ['09:00', '13:00', '18:00'][i % 3],
        }),
      );
    }
  });

  // A recurring template plus an overdue task that was never finished.
  tasks.push({
    ...task(uid, 'task_template_review', 'Weekly planning', {
      dateKey: null,
      status: 'pending',
      categoryId: 'cat_3',
    }),
    isRecurringTemplate: true,
    recurrence: { type: 'specific_days', daysOfWeek: [0], startDate },
  });
  tasks.push(
    task(uid, 'task_overdue', 'Pay exam fees', {
      dateKey: addDays(endDate, -5),
      status: 'pending',
      categoryId: 'cat_1',
      deadline: addDays(endDate, -3),
      carryCount: 2,
    }),
  );
  tasks.push(
    task(uid, 'task_backlog', 'Research internship companies', {
      dateKey: null,
      status: 'pending',
      categoryId: 'cat_1',
    }),
  );

  // ---- revisions ---------------------------------------------------------
  const revisions: RevisionItem[] = [
    {
      id: 'revision_0',
      userId: uid,
      subjectId: 'subject_0',
      chapterId: 'chapter_0_0',
      topicId: null,
      dueDateKey: addDays(endDate, -4),
      status: 'completed',
      revisionNumber: 1,
      completedAt: Date.parse(`${addDays(endDate, -4)}T20:00:00`),
      nextRevisionDateKey: addDays(endDate, 3),
      createdAt: now,
    },
    {
      id: 'revision_1',
      userId: uid,
      subjectId: 'subject_0',
      chapterId: 'chapter_0_1',
      topicId: null,
      dueDateKey: endDate,
      status: 'due',
      revisionNumber: 1,
      completedAt: null,
      nextRevisionDateKey: null,
      createdAt: now,
    },
    {
      id: 'revision_2',
      userId: uid,
      subjectId: 'subject_1',
      chapterId: 'chapter_1_0',
      topicId: null,
      dueDateKey: addDays(endDate, 5),
      status: 'due',
      revisionNumber: 2,
      completedAt: null,
      nextRevisionDateKey: null,
      createdAt: now,
    },
  ];

  return {
    categories,
    routines,
    routineLogs,
    tasks,
    subjects,
    chapters,
    sessions,
    slots,
    revisions,
    dates,
    restDays,
  };
}

const TASK_TITLES = [
  'Submit DBMS assignment',
  'Finish portfolio hero section',
  'Email the project supervisor',
  'Review pull requests',
  'Print lab record',
  'Buy notebook',
];

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

function routine(
  uid: string,
  id: string,
  name: string,
  icon: string,
  trackingType: Routine['trackingType'],
  overrides: Partial<Routine> & { schedule: Routine['schedule'] },
): Routine {
  return {
    id,
    userId: uid,
    name,
    icon,
    categoryId: null,
    trackingType,
    targetValue: null,
    unit: null,
    targetTime: null,
    preferredTime: null,
    dayPart: 'anytime',
    reminderEnabled: false,
    reminderTime: null,
    notificationId: null,
    linkedSubjectId: null,
    active: true,
    order: 0,
    createdAt: 0,
    updatedAt: 0,
    archivedAt: null,
    ...overrides,
  };
}

function log(
  uid: string,
  routineId: string,
  dateKey: DateKey,
  overrides: Partial<RoutineLog> & { status: RoutineLogStatus },
): RoutineLog {
  return {
    id: `${routineId}_${dateKey}`,
    userId: uid,
    routineId,
    dateKey,
    actualValue: 0,
    targetValueSnapshot: null,
    actualTime: null,
    startedAt: null,
    completedAt: Date.parse(`${dateKey}T20:00:00`),
    notes: null,
    createdAt: Date.parse(`${dateKey}T20:00:00`),
    ...overrides,
  };
}

function session(
  uid: string,
  id: string,
  params: {
    subjectId: string;
    chapterId: string;
    dateKey: DateKey;
    actualMinutes: number;
    plannedMinutes: number | null;
    source: StudySession['source'];
    timetableSlotId: string | null;
    startHour: number;
  },
): StudySession {
  const startedAt = Date.parse(`${params.dateKey}T${pad(params.startHour)}:00:00`);
  return {
    id,
    userId: uid,
    subjectId: params.subjectId,
    chapterId: params.chapterId,
    topicIds: [],
    dateKey: params.dateKey,
    plannedMinutes: params.plannedMinutes,
    actualMinutes: params.actualMinutes,
    source: params.source,
    timetableSlotId: params.timetableSlotId,
    startedAt,
    endedAt: startedAt + params.actualMinutes * 60_000,
    confidence: 3,
    progressBefore: null,
    progressAfter: null,
    notes: null,
    createdAt: startedAt,
  };
}

function task(
  uid: string,
  id: string,
  title: string,
  overrides: Partial<Task> & { dateKey: DateKey | null; status: Task['status'] },
): Task {
  return {
    id,
    userId: uid,
    title,
    description: null,
    categoryId: null,
    startTime: null,
    estimatedMinutes: null,
    deadline: null,
    priority: 'normal',
    recurrence: null,
    isRecurringTemplate: false,
    parentTaskId: null,
    reminderMinutesBefore: null,
    notificationId: null,
    notes: null,
    carryCount: 0,
    createdAt: 0,
    updatedAt: 0,
    completedAt: overrides.status === 'completed' ? 1 : null,
    ...overrides,
  };
}
