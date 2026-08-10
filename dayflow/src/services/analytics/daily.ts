/**
 * Daily summary computation.
 *
 * Pure — no Firebase import — so it can be unit tested and reused by the Today
 * screen to render an optimistic summary before the aggregate write lands.
 *
 * `overallConsistency` is intentionally *not* a mysterious productivity score:
 * it is the plain average of the components that actually had something
 * scheduled, and it is `null` when the day had no obligations at all.
 */

import type {
  DailySummary,
  DateKey,
  RevisionItem,
  Routine,
  RoutineLog,
  StudySession,
  Subject,
  Task,
  TimetableSlot,
  UserSettings,
} from '@/types/models';
import { clockDeviationMinutes, dayOfWeek } from '@/utils/date';
import {
  calculateDayProgress,
  groupLogsByRoutine,
  indexLogsByDate,
  isExcusedStatus,
  isRoutineDueOn,
} from './routines';
import { calculateStudyMinutes, evaluateSlots, slotOccurrences } from './study';

export interface DayRecords {
  routines: Routine[];
  routineLogs: RoutineLog[];
  tasks: Task[];
  sessions: StudySession[];
  slots: TimetableSlot[];
  revisions: RevisionItem[];
  subjects: Subject[];
  wakeActual: string | null;
  sleepActual: string | null;
  isRestDay: boolean;
}

export type ComputedDailySummary = Omit<
  DailySummary,
  'id' | 'userId' | 'createdAt' | 'updatedAt'
>;

export function computeDailySummary(
  dateKey: DateKey,
  records: DayRecords,
  settings: UserSettings,
  today: DateKey,
): ComputedDailySummary {
  // ---- routines ----------------------------------------------------------
  const logsByRoutine = groupLogsByRoutine(records.routineLogs);
  let routinesScheduled = 0;
  let routinesCompleted = 0;
  let routinesPartial = 0;
  let routinesSkipped = 0;
  let routineCredit = 0;

  for (const routine of records.routines) {
    if (!routine.active) continue;
    if (routine.trackingType === 'numeric') continue;

    const ctx = {
      logsByDate: indexLogsByDate(logsByRoutine.get(routine.id) ?? []),
      weekStart: settings.weekStart,
      today,
    };
    const log = ctx.logsByDate.get(dateKey);

    if (isExcusedStatus(log?.status)) {
      routinesSkipped += 1;
      continue;
    }
    if (!isRoutineDueOn(routine, dateKey, ctx)) continue;

    routinesScheduled += 1;
    const progress = calculateDayProgress(routine, log, settings.wakeToleranceMinutes);
    routineCredit += progress;
    if (log?.status === 'completed') routinesCompleted += 1;
    else if (log?.status === 'partial') routinesPartial += 1;
  }

  const routineConsistency =
    routinesScheduled > 0 ? Math.round((routineCredit / routinesScheduled) * 100) : 0;

  // ---- tasks -------------------------------------------------------------
  const realTasks = records.tasks.filter((t) => !t.isRecurringTemplate);
  const tasksPlanned = realTasks.filter((t) => t.status !== 'skipped').length;
  const tasksCompleted = realTasks.filter((t) => t.status === 'completed').length;

  // ---- study -------------------------------------------------------------
  const occurrences = slotOccurrences(records.slots, [dateKey]);
  const slotResults = evaluateSlots(occurrences, records.sessions, today);
  const studyActualMinutes = calculateStudyMinutes(records.sessions);
  const studyPlannedMinutes = occurrences.reduce((a, o) => a + o.slot.durationMinutes, 0);
  const scheduledStudyMinutes = calculateStudyMinutes(
    records.sessions.filter((s) => !!s.timetableSlotId),
  );

  // ---- revision ----------------------------------------------------------
  const revisionDue = records.revisions.filter(
    (r) => r.dueDateKey === dateKey && r.status === 'due',
  ).length;
  const revisionCompleted = records.revisions.filter(
    (r) => r.dueDateKey === dateKey && r.status === 'completed',
  ).length;

  // ---- category minutes --------------------------------------------------
  const subjectCategory = new Map<string, string | null>();
  for (const subject of records.subjects) subjectCategory.set(subject.id, 'study');

  const categoryMinutes: Record<string, number> = {};
  const addMinutes = (key: string, minutes: number) => {
    if (!minutes) return;
    categoryMinutes[key] = (categoryMinutes[key] ?? 0) + minutes;
  };
  for (const session of records.sessions) addMinutes('study', session.actualMinutes);
  for (const routine of records.routines) {
    if (routine.trackingType !== 'duration') continue;
    const log = (logsByRoutine.get(routine.id) ?? []).find((l) => l.dateKey === dateKey);
    if (log?.actualValue) addMinutes(routine.categoryId ?? 'uncategorised', log.actualValue);
  }

  // ---- wake / sleep ------------------------------------------------------
  const wakeTarget = settings.wakeTarget;
  const sleepTarget = settings.trackSleep ? settings.sleepTarget : null;

  // ---- overall -----------------------------------------------------------
  const components: number[] = [];
  if (routinesScheduled > 0) components.push(routineConsistency);
  if (tasksPlanned > 0) components.push(Math.round((tasksCompleted / tasksPlanned) * 100));
  if (studyPlannedMinutes > 0) {
    components.push(Math.min(100, Math.round((scheduledStudyMinutes / studyPlannedMinutes) * 100)));
  }

  return {
    dateKey,
    wakeTarget,
    wakeActual: records.wakeActual,
    wakeDeviationMinutes: clockDeviationMinutes(records.wakeActual, wakeTarget),
    sleepTarget,
    sleepActual: records.sleepActual,
    sleepDeviationMinutes: clockDeviationMinutes(records.sleepActual, sleepTarget),

    routinesScheduled,
    routinesCompleted,
    routinesPartial,
    routinesSkipped,
    routineConsistency,

    tasksPlanned,
    tasksCompleted,

    studyPlannedMinutes,
    studyActualMinutes,
    studyExtraMinutes: Math.max(0, studyActualMinutes - scheduledStudyMinutes),

    timetableSlots: slotResults.length,
    timetableCompleted: slotResults.filter((r) => r.outcome === 'completed').length,
    timetablePartial: slotResults.filter((r) => r.outcome === 'partial').length,

    revisionDue,
    revisionCompleted,

    categoryMinutes,
    overallConsistency:
      components.length > 0
        ? Math.round(components.reduce((a, b) => a + b, 0) / components.length)
        : null,
    isRestDay: records.isRestDay,
  };
}

/** Does this day have anything at all recorded or scheduled? */
export function isEmptyDay(summary: ComputedDailySummary): boolean {
  return (
    summary.routinesScheduled === 0 &&
    summary.tasksPlanned === 0 &&
    summary.timetableSlots === 0 &&
    summary.studyActualMinutes === 0 &&
    summary.wakeActual === null
  );
}

/** Weekday index, useful for weekday-vs-weekend breakdowns. */
export function summaryWeekday(summary: { dateKey: DateKey }): number {
  return dayOfWeek(summary.dateKey);
}
