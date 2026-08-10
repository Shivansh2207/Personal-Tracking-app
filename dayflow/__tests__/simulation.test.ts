/**
 * Fourteen-day simulation.
 *
 * Runs a realistic fortnight — containing late wake-ups, a rest day, missed
 * routines, partial and over-target counts, a missed study slot, manual and
 * spontaneous study, a good gym week and a bad one, periodic practice, overdue
 * and recurring tasks and revisions — through the same pipeline the app uses,
 * then asserts that every derived number agrees with the raw records.
 *
 * This is the automated version of "simulate two weeks and check the analytics
 * stay correct".
 */

import {
  calculateRevisionCompletion,
  calculateRoutineConsistency,
  calculateSubjectProgress,
  calculateTaskCompletion,
  calculateTimetableAdherence,
  calculateWakeAnalytics,
  calculateWeeklySummary,
  compare,
  computeDailySummary,
  evaluateSlots,
  slotOccurrences,
  splitPlannedAndExtra,
  type ComputedDailySummary,
  type DayRecords,
} from '@/services/analytics';
import { DEMO_SETTINGS, buildDemoHistory } from '@/services/demoData';
import type { DailySummary } from '@/types/models';
import { dateRange, endOfWeek, startOfWeek } from '@/utils/date';

const END = '2026-08-16'; // a Sunday
const UID = 'sim-user';

function buildSummaries() {
  const demo = buildDemoHistory(UID, { endDate: END, days: 14, seed: 7 });

  const computed: ComputedDailySummary[] = demo.dates.map((dateKey) => {
    const dayLogs = demo.routineLogs.filter((l) => l.dateKey === dateKey);
    const wakeLog = dayLogs.find((l) => l.routineId === 'routine_wake');
    const sleepLog = dayLogs.find((l) => l.routineId === 'routine_sleep');

    const records: DayRecords = {
      routines: demo.routines,
      // The whole fortnight of logs is supplied so flexible weekly targets can
      // be scored against the real period, exactly as the app does.
      routineLogs: demo.routineLogs,
      tasks: demo.tasks.filter((t) => t.dateKey === dateKey),
      sessions: demo.sessions.filter((s) => s.dateKey === dateKey),
      slots: demo.slots,
      revisions: demo.revisions.filter((r) => r.dueDateKey === dateKey),
      subjects: demo.subjects,
      wakeActual: wakeLog?.actualTime ?? null,
      sleepActual: sleepLog?.actualTime ?? null,
      isRestDay: demo.restDays.includes(dateKey),
    };

    return computeDailySummary(dateKey, records, DEMO_SETTINGS, END);
  });

  const summaries: DailySummary[] = computed.map((c) => ({
    ...c,
    id: c.dateKey,
    userId: UID,
    createdAt: 0,
    updatedAt: 0,
  }));

  return { demo, summaries };
}

describe('a fortnight of real use', () => {
  const { demo, summaries } = buildSummaries();

  it('produces exactly one summary per day, with no gaps or duplicates', () => {
    expect(summaries).toHaveLength(14);
    expect(summaries.map((s) => s.dateKey)).toEqual(demo.dates);
    expect(new Set(summaries.map((s) => s.dateKey)).size).toBe(14);
  });

  it('keeps every derived percentage inside its bounds', () => {
    for (const summary of summaries) {
      expect(summary.routineConsistency).toBeGreaterThanOrEqual(0);
      expect(summary.routineConsistency).toBeLessThanOrEqual(100);
      if (summary.overallConsistency !== null) {
        expect(summary.overallConsistency).toBeGreaterThanOrEqual(0);
        expect(summary.overallConsistency).toBeLessThanOrEqual(100);
      }
      expect(summary.routinesCompleted).toBeLessThanOrEqual(summary.routinesScheduled);
      expect(summary.tasksCompleted).toBeLessThanOrEqual(summary.tasksPlanned);
      expect(summary.timetableCompleted).toBeLessThanOrEqual(summary.timetableSlots);
    }
  });

  it('matches the raw task records exactly', () => {
    for (const summary of summaries) {
      const dayTasks = demo.tasks.filter(
        (t) => t.dateKey === summary.dateKey && !t.isRecurringTemplate,
      );
      expect(summary.tasksPlanned).toBe(dayTasks.filter((t) => t.status !== 'skipped').length);
      expect(summary.tasksCompleted).toBe(
        dayTasks.filter((t) => t.status === 'completed').length,
      );
    }
  });

  it('matches the raw study records exactly, and separates planned from extra', () => {
    for (const summary of summaries) {
      const daySessions = demo.sessions.filter((s) => s.dateKey === summary.dateKey);
      const total = daySessions.reduce((a, s) => a + s.actualMinutes, 0);
      const scheduled = daySessions
        .filter((s) => s.timetableSlotId)
        .reduce((a, s) => a + s.actualMinutes, 0);

      expect(summary.studyActualMinutes).toBe(total);
      expect(summary.studyExtraMinutes).toBe(total - scheduled);
    }
  });

  it('records the rest day as a rest day rather than a run of failures', () => {
    const restSummary = summaries.find((s) => s.dateKey === demo.restDays[0]);
    expect(restSummary).toBeDefined();
    expect(restSummary!.isRestDay).toBe(true);
    // The rested routines left the denominator instead of scoring zero.
    expect(restSummary!.routinesSkipped).toBeGreaterThan(0);
  });

  it('never reports a day with nothing scheduled as 0% by mistake', () => {
    for (const summary of summaries) {
      if (summary.routinesScheduled === 0 && summary.tasksPlanned === 0 && summary.timetableSlots === 0) {
        expect(summary.overallConsistency).toBeNull();
      }
    }
  });

  it('scores the flexible gym target per week, not per day', () => {
    const gym = demo.routines.find((r) => r.id === 'routine_gym')!;
    const gymLogs = demo.routineLogs.filter((l) => l.routineId === 'routine_gym');

    const week2 = dateRange(startOfWeek(END, 1), endOfWeek(END, 1));
    const result = calculateRoutineConsistency(gym, week2, gymLogs, 1, END);

    // Two of four sessions in the final week — one number, not five misses.
    expect(result.completed).toBe(2);
    expect(result.scheduled).toBe(4);
    expect(result.rate).toBe(50);
    expect(result.missed).toBe(2);
  });

  it('gives the periodic practice routine partial credit, never zero', () => {
    const practice = demo.routines.find((r) => r.id === 'routine_maths_practice')!;
    const logs = demo.routineLogs.filter((l) => l.routineId === 'routine_maths_practice');
    const result = calculateRoutineConsistency(practice, demo.dates, logs, 1, END);

    // Every scheduled day was attempted; one was half-done.
    expect(result.scheduled).toBeGreaterThan(0);
    expect(result.rate).toBeGreaterThan(0);
    expect(result.rate).toBeLessThan(100);
    expect(result.actualTotal).toBeGreaterThan(0);
  });

  it('gives a partial reading day partial credit and caps an over-target day', () => {
    const reading = demo.routines.find((r) => r.id === 'routine_reading')!;
    const logs = demo.routineLogs.filter((l) => l.routineId === 'routine_reading');
    const result = calculateRoutineConsistency(reading, demo.dates, logs, 1, END);

    expect(result.rate).toBeGreaterThan(0);
    expect(result.rate).toBeLessThanOrEqual(100);
    // Reading 26 pages against a 20-page target does not push the rate past 100.
    expect(logs.some((l) => l.actualValue > 20)).toBe(true);
  });

  it('measures wake time honestly, ignoring the day it was not logged', () => {
    const wake = calculateWakeAnalytics(summaries, DEMO_SETTINGS.wakeTarget, DEMO_SETTINGS.wakeToleranceMinutes);
    const loggedDays = summaries.filter((s) => s.wakeActual !== null).length;

    expect(wake.logged).toBe(loggedDays);
    expect(wake.logged).toBeLessThan(14); // one day deliberately missing
    expect(wake.totalDays).toBe(14);
    expect(wake.average).not.toBeNull();
    // A missing day must not drag the average toward midnight.
    expect(wake.averageMinutes!).toBeGreaterThan(6 * 60);
    expect(wake.averageMinutes!).toBeLessThan(9 * 60);
    expect(wake.adherence).not.toBeNull();
    expect(wake.weekdayAverage).not.toBeNull();
    expect(wake.weekendAverage).not.toBeNull();
  });

  it('counts a missed study slot as missed and spontaneous study as extra', () => {
    const occurrences = slotOccurrences(demo.slots, demo.dates);
    const results = evaluateSlots(occurrences, demo.sessions, END);
    const adherence = calculateTimetableAdherence(results);

    expect(adherence.scheduled).toBe(occurrences.filter((o) => o.dateKey <= END).length);
    expect(adherence.missed).toBeGreaterThan(0);
    expect(adherence.rate).toBeGreaterThan(0);
    expect(adherence.rate).toBeLessThan(100);

    const split = splitPlannedAndExtra(demo.sessions);
    expect(split.extraMinutes).toBeGreaterThan(0);
    expect(split.plannedMinutes + split.extraMinutes).toBe(split.totalMinutes);
  });

  it('credits a manually logged session to its slot rather than calling it extra', () => {
    const manualBySlot = demo.sessions.filter(
      (s) => s.source === 'manual' && s.timetableSlotId !== null,
    );
    expect(manualBySlot.length).toBeGreaterThan(0);

    const results = evaluateSlots(slotOccurrences(demo.slots, demo.dates), demo.sessions, END);
    const matched = results.find((r) => r.dateKey === manualBySlot[0].dateKey);
    expect(matched?.actualMinutes).toBeGreaterThan(0);
  });

  it('rolls the days into weekly summaries that agree with them', () => {
    const start = startOfWeek(END, 1);
    const end = endOfWeek(END, 1);
    const week = calculateWeeklySummary(start, end, summaries);
    const inWeek = summaries.filter((s) => s.dateKey >= start && s.dateKey <= end);

    expect(week.tasksCompleted).toBe(inWeek.reduce((a, s) => a + s.tasksCompleted, 0));
    expect(week.tasksPlanned).toBe(inWeek.reduce((a, s) => a + s.tasksPlanned, 0));
    expect(week.studyMinutes).toBe(inWeek.reduce((a, s) => a + s.studyActualMinutes, 0));
    expect(week.daysWithData).toBeGreaterThan(0);
    expect(week.routineConsistency).toBeGreaterThan(0);
    expect(week.wakeAverageMinutes).not.toBeNull();
  });

  it('only compares weeks once there is a previous week with data', () => {
    const thisWeek = calculateWeeklySummary(startOfWeek(END, 1), endOfWeek(END, 1), summaries);
    const lastStart = dateRange(demo.dates[0], demo.dates[6])[0];
    const lastWeek = calculateWeeklySummary(lastStart, demo.dates[6], summaries);

    expect(
      compare(thisWeek.studyMinutes, lastWeek.studyMinutes, { hasPreviousData: true }),
    ).not.toBeNull();
    expect(
      compare(thisWeek.studyMinutes, 0, { hasPreviousData: false }),
    ).toBeNull();
  });

  it('reports task analytics separately from routine consistency', () => {
    const stats = calculateTaskCompletion(demo.tasks, demo.categories, END);
    const real = demo.tasks.filter((t) => !t.isRecurringTemplate && t.status !== 'skipped');
    expect(stats.planned).toBe(real.length);
    expect(stats.completed).toBe(real.filter((t) => t.status === 'completed').length);
    expect(stats.overdue).toBeGreaterThan(0); // the deliberately overdue task
    expect(stats.carriedForward).toBeGreaterThan(0);
  });

  it('does not let the recurring template inflate the task count', () => {
    const templates = demo.tasks.filter((t) => t.isRecurringTemplate);
    expect(templates.length).toBeGreaterThan(0);
    const stats = calculateTaskCompletion(demo.tasks, demo.categories, END);
    expect(stats.planned).toBe(
      demo.tasks.filter((t) => !t.isRecurringTemplate && t.status !== 'skipped').length,
    );
  });

  it('keeps syllabus progress out of the hands of the clock', () => {
    const maths = demo.subjects[0];
    const stats = calculateSubjectProgress(maths, demo.chapters, demo.sessions, demo.revisions, END);
    expect(stats.minutes).toBeGreaterThan(0);
    expect(stats.chaptersCompleted).toBe(
      demo.chapters.filter((ch) => ch.subjectId === maths.id && ch.status === 'completed').length,
    );
    expect(stats.syllabusProgress).toBeLessThan(100);
  });

  it('tracks revisions without double counting', () => {
    const stats = calculateRevisionCompletion(demo.revisions, END);
    expect(stats.completed).toBe(demo.revisions.filter((r) => r.status === 'completed').length);
    expect(stats.dueToday + stats.overdue + stats.upcoming).toBe(
      demo.revisions.filter((r) => r.status === 'due').length,
    );
  });

  it('attributes recorded minutes to categories without double counting', () => {
    for (const summary of summaries) {
      const studyMinutes = summary.categoryMinutes.study ?? 0;
      expect(studyMinutes).toBe(summary.studyActualMinutes);
    }
  });
});

describe('a brand-new account', () => {
  it('scores an empty day as "nothing to measure", not as a failure', () => {
    const records: DayRecords = {
      routines: [],
      routineLogs: [],
      tasks: [],
      sessions: [],
      slots: [],
      revisions: [],
      subjects: [],
      wakeActual: null,
      sleepActual: null,
      isRestDay: false,
    };
    const summary = computeDailySummary(END, records, DEMO_SETTINGS, END);
    expect(summary.overallConsistency).toBeNull();
    expect(summary.routineConsistency).toBe(0);
    expect(summary.routinesScheduled).toBe(0);
  });

  it('produces an empty weekly summary rather than a fabricated one', () => {
    const week = calculateWeeklySummary('2026-08-10', '2026-08-16', []);
    expect(week.daysWithData).toBe(0);
    expect(week.studyMinutes).toBe(0);
    expect(week.routineConsistency).toBe(0);
    expect(week.wakeAverageMinutes).toBeNull();
  });

  it('has no wake analytics to show', () => {
    const wake = calculateWakeAnalytics([], '07:00', 15);
    expect(wake.logged).toBe(0);
    expect(wake.average).toBeNull();
    expect(wake.adherence).toBeNull();
  });
});
