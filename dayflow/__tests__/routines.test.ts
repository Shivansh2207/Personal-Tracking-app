import {
  calculateCountProgress,
  calculateDayProgress,
  calculateRoutineConsistency,
  calculateSessionProgress,
  calculateStreak,
  calculateTimeAdherence,
  deriveStatus,
  indexLogsByDate,
  isRoutineAvailableOn,
  isRoutineDueOn,
} from '@/services/analytics/routines';
import type { Routine, RoutineLog, RoutineLogStatus, ScheduleRule, TrackingType } from '@/types/models';
import { dateRange } from '@/utils/date';

// 2026-08-10 is a Monday; 2026-08-16 is the Sunday that ends that week.
const WEEK = dateRange('2026-08-10', '2026-08-16');
const TODAY = '2026-08-16';

function makeRoutine(
  trackingType: TrackingType,
  schedule: Partial<ScheduleRule> = {},
  overrides: Partial<Routine> = {},
): Routine {
  return {
    id: 'r1',
    userId: 'u1',
    name: 'Routine',
    icon: 'circle',
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
    schedule: { type: 'daily', startDate: '2026-08-10', ...schedule } as ScheduleRule,
    ...overrides,
  };
}

function log(
  dateKey: string,
  status: RoutineLogStatus,
  actualValue = 1,
  extra: Partial<RoutineLog> = {},
): RoutineLog {
  return {
    id: `r1_${dateKey}`,
    userId: 'u1',
    routineId: 'r1',
    dateKey,
    actualValue,
    targetValueSnapshot: null,
    actualTime: null,
    status,
    startedAt: null,
    completedAt: 0,
    notes: null,
    createdAt: 0,
    ...extra,
  };
}

describe('per-type progress', () => {
  it('treats a partial count as partial, not zero', () => {
    expect(calculateCountProgress(15, 20)).toBe(0.75);
    expect(calculateCountProgress(0, 20)).toBe(0);
    // Overachievement is capped for scoring but never negative.
    expect(calculateCountProgress(26, 20)).toBe(1);
  });

  it('scores duration the same way as count', () => {
    const routine = makeRoutine('duration', {}, { targetValue: 60 });
    expect(calculateDayProgress(routine, log('2026-08-10', 'partial', 45))).toBe(0.75);
  });

  it('scores a check as all or nothing', () => {
    const routine = makeRoutine('check');
    expect(calculateDayProgress(routine, log('2026-08-10', 'completed'))).toBe(1);
    expect(calculateDayProgress(routine, log('2026-08-10', 'missed', 0))).toBe(0);
    expect(calculateDayProgress(routine, undefined)).toBe(0);
  });

  it('scores a time routine from its deviation, honouring tolerance', () => {
    expect(calculateTimeAdherence(10, 15)).toBe(1);
    expect(calculateTimeAdherence(-10, 15)).toBe(1);
    expect(calculateTimeAdherence(75, 15)).toBe(0);
    expect(calculateTimeAdherence(45, 15)).toBeCloseTo(0.5, 5);
    expect(calculateTimeAdherence(null, 15)).toBe(0);
  });

  it('excludes rest and skipped days from earning credit', () => {
    const routine = makeRoutine('check');
    expect(calculateDayProgress(routine, log('2026-08-10', 'rest', 0))).toBe(0);
    expect(calculateDayProgress(routine, log('2026-08-10', 'skipped', 0))).toBe(0);
  });

  it('derives the right status from what was recorded', () => {
    const count = makeRoutine('count', {}, { targetValue: 20 });
    expect(deriveStatus(count, 20)).toBe('completed');
    expect(deriveStatus(count, 15)).toBe('partial');
    expect(deriveStatus(count, 0)).toBe('missed');
    expect(deriveStatus(count, 15, 'rest')).toBe('rest');
  });
});

describe('fixed schedules', () => {
  it('is owed only on its scheduled weekdays', () => {
    const routine = makeRoutine('count', { type: 'specific_days', daysOfWeek: [3, 6] });
    const ctx = { logsByDate: indexLogsByDate([]), weekStart: 1 as const, today: TODAY };
    expect(isRoutineDueOn(routine, '2026-08-12', ctx)).toBe(true); // Wednesday
    expect(isRoutineDueOn(routine, '2026-08-15', ctx)).toBe(true); // Saturday
    expect(isRoutineDueOn(routine, '2026-08-11', ctx)).toBe(false); // Tuesday
    expect(isRoutineAvailableOn(routine, '2026-08-11')).toBe(false);
  });

  it('never counts an unscheduled day as a miss', () => {
    const routine = makeRoutine('count', { type: 'specific_days', daysOfWeek: [3, 6] }, { targetValue: 20 });
    const logs = [log('2026-08-12', 'completed', 20), log('2026-08-15', 'completed', 20)];
    const result = calculateRoutineConsistency(routine, WEEK, logs, 1, TODAY);
    expect(result.scheduled).toBe(2);
    expect(result.rate).toBe(100);
  });

  it('gives partial credit rather than zero', () => {
    const routine = makeRoutine('count', { type: 'specific_days', daysOfWeek: [3, 6] }, { targetValue: 20 });
    const logs = [log('2026-08-12', 'completed', 20), log('2026-08-15', 'partial', 10)];
    const result = calculateRoutineConsistency(routine, WEEK, logs, 1, TODAY);
    expect(result.rate).toBe(75); // (1 + 0.5) / 2
    expect(result.actualTotal).toBe(30);
    expect(result.targetTotal).toBe(40);
  });

  it('removes rest days from the denominator', () => {
    const routine = makeRoutine('check');
    const logs = [
      log('2026-08-10', 'completed'),
      log('2026-08-11', 'rest', 0),
      log('2026-08-12', 'completed'),
      log('2026-08-13', 'completed'),
      log('2026-08-14', 'completed'),
      log('2026-08-15', 'completed'),
      log('2026-08-16', 'completed'),
    ];
    const result = calculateRoutineConsistency(routine, WEEK, logs, 1, TODAY);
    expect(result.scheduled).toBe(6);
    expect(result.skipped).toBe(1);
    expect(result.rate).toBe(100);
  });

  it('does not score days before the routine existed or after today', () => {
    const routine = makeRoutine('check', { startDate: '2026-08-14' });
    const logs = [log('2026-08-14', 'completed'), log('2026-08-15', 'completed')];
    const result = calculateRoutineConsistency(routine, WEEK, logs, 1, '2026-08-15');
    expect(result.scheduled).toBe(2);
    expect(result.rate).toBe(100);
  });
});

describe('flexible weekly targets', () => {
  const gym = makeRoutine('session', { type: 'times_per_week', times: 4 });

  it('is available every day but owed on none of them early in the week', () => {
    const ctx = { logsByDate: indexLogsByDate([]), weekStart: 1 as const, today: TODAY };
    expect(isRoutineAvailableOn(gym, '2026-08-10')).toBe(true);
    expect(isRoutineDueOn(gym, '2026-08-10', ctx)).toBe(false);
  });

  it('becomes owed only once the remaining days exactly cover the target', () => {
    const ctx = { logsByDate: indexLogsByDate([]), weekStart: 1 as const, today: TODAY };
    // From Thursday there are exactly four days left for four sessions.
    expect(isRoutineDueOn(gym, '2026-08-13', ctx)).toBe(true);
  });

  it('stops being owed once the target is met', () => {
    const logs = [
      log('2026-08-10', 'completed'),
      log('2026-08-11', 'completed'),
      log('2026-08-12', 'completed'),
      log('2026-08-13', 'completed'),
    ];
    const ctx = { logsByDate: indexLogsByDate(logs), weekStart: 1 as const, today: TODAY };
    expect(isRoutineDueOn(gym, '2026-08-15', ctx)).toBe(false);
  });

  it('scores 100% for four sessions on any four days', () => {
    const logs = [
      log('2026-08-10', 'completed'),
      log('2026-08-12', 'completed'),
      log('2026-08-14', 'completed'),
      log('2026-08-16', 'completed'),
    ];
    const result = calculateRoutineConsistency(gym, WEEK, logs, 1, TODAY);
    expect(result.rate).toBe(100);
    // Crucially: three "missed days" were never invented.
    expect(result.scheduled).toBe(4);
  });

  it('scores a short week proportionally, not as a string of failures', () => {
    const logs = [log('2026-08-10', 'completed'), log('2026-08-12', 'completed')];
    const result = calculateRoutineConsistency(gym, WEEK, logs, 1, TODAY);
    expect(result.rate).toBe(50);
  });

  it('reports period progress for the session UI', () => {
    const logs = [log('2026-08-10', 'completed'), log('2026-08-12', 'completed')];
    const progress = calculateSessionProgress(gym, '2026-08-14', logs, 1);
    expect(progress).toEqual({ done: 2, target: 4, rate: 50 });
  });
});

describe('streaks', () => {
  it('counts consecutive completed days', () => {
    const routine = makeRoutine('check');
    const logs = [
      log('2026-08-14', 'completed'),
      log('2026-08-15', 'completed'),
      log('2026-08-16', 'completed'),
    ];
    expect(calculateStreak(routine, logs, 1, TODAY).current).toBe(3);
  });

  it('does not break on an unfinished today', () => {
    const routine = makeRoutine('check');
    const logs = [log('2026-08-14', 'completed'), log('2026-08-15', 'completed')];
    expect(calculateStreak(routine, logs, 1, TODAY).current).toBe(2);
  });

  it('treats a rest day as transparent', () => {
    const routine = makeRoutine('check');
    const logs = [
      log('2026-08-14', 'completed'),
      log('2026-08-15', 'rest', 0),
      log('2026-08-16', 'completed'),
    ];
    expect(calculateStreak(routine, logs, 1, TODAY).current).toBe(2);
  });

  it('does not break on a day the routine was not scheduled', () => {
    const routine = makeRoutine('check', { type: 'specific_days', daysOfWeek: [1, 3, 5] });
    const logs = [
      log('2026-08-10', 'completed'),
      log('2026-08-12', 'completed'),
      log('2026-08-14', 'completed'),
    ];
    expect(calculateStreak(routine, logs, 1, '2026-08-14').current).toBe(3);
  });

  it('breaks on a genuinely missed scheduled day', () => {
    const routine = makeRoutine('check');
    const logs = [log('2026-08-13', 'completed'), log('2026-08-16', 'completed')];
    expect(calculateStreak(routine, logs, 1, TODAY).current).toBe(1);
  });

  it('counts a partial day toward the streak', () => {
    const routine = makeRoutine('count', {}, { targetValue: 20 });
    const logs = [
      log('2026-08-15', 'partial', 12),
      log('2026-08-16', 'completed', 20),
    ];
    expect(calculateStreak(routine, logs, 1, TODAY).current).toBe(2);
  });
});
