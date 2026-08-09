import {
  calculateHabitConsistency,
  calculateHabitStreaks,
  indexLogsByDate,
  isHabitAvailableOn,
  isHabitRequiredOn,
  summariseHabitsForDay,
  groupLogsByHabit,
} from '@/services/analytics/habits';
import type { Habit, HabitFrequency, HabitLog } from '@/types/models';
import { dateRange } from '@/utils/date';

function makeHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 'h1',
    userId: 'u1',
    name: 'Gym',
    categoryId: null,
    icon: 'activity',
    color: null,
    measurementType: 'binary',
    target: 1,
    unit: null,
    frequency: { type: 'daily' } as HabitFrequency,
    startDate: '2026-08-03',
    reminderTime: null,
    notificationId: null,
    active: true,
    order: 0,
    createdAt: 0,
    archivedAt: null,
    ...overrides,
  };
}

function log(date: string, overrides: Partial<HabitLog> = {}): HabitLog {
  return {
    id: `h1_${date}`,
    userId: 'u1',
    habitId: 'h1',
    date,
    value: 1,
    status: 'completed',
    notes: null,
    completedAt: 0,
    ...overrides,
  };
}

// 2026-08-03 is a Monday; 2026-08-09 is the Sunday that ends that week.
const WEEK = dateRange('2026-08-03', '2026-08-09');

describe('habit availability', () => {
  it('is unavailable before the start date', () => {
    const habit = makeHabit({ startDate: '2026-08-05' });
    expect(isHabitAvailableOn(habit, '2026-08-04')).toBe(false);
    expect(isHabitAvailableOn(habit, '2026-08-05')).toBe(true);
  });

  it('respects specific weekdays', () => {
    const habit = makeHabit({
      frequency: { type: 'specific_days', daysOfWeek: [1, 3, 5] },
    });
    expect(isHabitAvailableOn(habit, '2026-08-03')).toBe(true); // Mon
    expect(isHabitAvailableOn(habit, '2026-08-04')).toBe(false); // Tue
    expect(isHabitAvailableOn(habit, '2026-08-05')).toBe(true); // Wed
  });
});

describe('flexible frequency', () => {
  const habit = makeHabit({ frequency: { type: 'times_per_week', times: 3 } });

  it('is not required early in the week when the target is still reachable', () => {
    const ctx = { logsByDate: indexLogsByDate([]), weekStart: 1 as const, today: '2026-08-09' };
    expect(isHabitRequiredOn(habit, '2026-08-03', ctx)).toBe(false);
  });

  it('becomes required once the remaining days exactly cover the target', () => {
    const ctx = { logsByDate: indexLogsByDate([]), weekStart: 1 as const, today: '2026-08-09' };
    // From Friday there are exactly three days left (Fri, Sat, Sun) for three sessions.
    expect(isHabitRequiredOn(habit, '2026-08-07', ctx)).toBe(true);
  });

  it('stops being required once the weekly target has been met', () => {
    const ctx = {
      logsByDate: indexLogsByDate([log('2026-08-03'), log('2026-08-04'), log('2026-08-05')]),
      weekStart: 1 as const,
      today: '2026-08-09',
    };
    expect(isHabitRequiredOn(habit, '2026-08-08', ctx)).toBe(false);
  });

  it('scores 100% for a 3x/week habit done on any three days', () => {
    const logs = [log('2026-08-03'), log('2026-08-06'), log('2026-08-09')];
    const result = calculateHabitConsistency(habit, WEEK, logs, 1, '2026-08-09');
    expect(result.rate).toBe(100);
  });

  it('scores partially when the target is missed', () => {
    const logs = [log('2026-08-03')];
    const result = calculateHabitConsistency(habit, WEEK, logs, 1, '2026-08-09');
    expect(result.rate).toBe(33);
  });
});

describe('daily frequency consistency', () => {
  const habit = makeHabit();

  it('is 100% when every day is logged', () => {
    const logs = WEEK.map((d) => log(d));
    expect(calculateHabitConsistency(habit, WEEK, logs, 1, '2026-08-09').rate).toBe(100);
  });

  it('excludes skipped days from the denominator', () => {
    const logs = [
      log('2026-08-03'),
      log('2026-08-04'),
      log('2026-08-05', { status: 'skipped', value: 0 }),
      log('2026-08-06'),
      log('2026-08-07'),
      log('2026-08-08'),
      log('2026-08-09'),
    ];
    const result = calculateHabitConsistency(habit, WEEK, logs, 1, '2026-08-09');
    expect(result.scheduled).toBe(6);
    expect(result.completed).toBe(6);
    expect(result.skipped).toBe(1);
    expect(result.rate).toBe(100);
  });

  it('ignores days before the habit existed', () => {
    const late = makeHabit({ startDate: '2026-08-07' });
    const logs = [log('2026-08-07'), log('2026-08-08'), log('2026-08-09')];
    const result = calculateHabitConsistency(late, WEEK, logs, 1, '2026-08-09');
    expect(result.scheduled).toBe(3);
    expect(result.rate).toBe(100);
  });

  it('does not count future days', () => {
    const logs = [log('2026-08-03'), log('2026-08-04')];
    const result = calculateHabitConsistency(habit, WEEK, logs, 1, '2026-08-04');
    expect(result.scheduled).toBe(2);
    expect(result.rate).toBe(100);
  });
});

describe('habit streaks', () => {
  const habit = makeHabit();

  it('counts consecutive completed days', () => {
    const logs = [log('2026-08-07'), log('2026-08-08'), log('2026-08-09')];
    expect(calculateHabitStreaks(habit, logs, 1, '2026-08-09').current).toBe(3);
  });

  it('does not break on an unfinished today', () => {
    const logs = [log('2026-08-07'), log('2026-08-08')];
    expect(calculateHabitStreaks(habit, logs, 1, '2026-08-09').current).toBe(2);
  });

  it('treats a rest day as transparent', () => {
    const logs = [
      log('2026-08-07'),
      log('2026-08-08', { status: 'skipped', value: 0 }),
      log('2026-08-09'),
    ];
    expect(calculateHabitStreaks(habit, logs, 1, '2026-08-09').current).toBe(2);
  });

  it('breaks on a missed scheduled day', () => {
    const logs = [log('2026-08-06'), log('2026-08-09')];
    expect(calculateHabitStreaks(habit, logs, 1, '2026-08-09').current).toBe(1);
  });

  it('does not break on a day the habit was not scheduled', () => {
    const mwf = makeHabit({ frequency: { type: 'specific_days', daysOfWeek: [1, 3, 5] } });
    const logs = [log('2026-08-03'), log('2026-08-05'), log('2026-08-07')];
    expect(calculateHabitStreaks(mwf, logs, 1, '2026-08-07').current).toBe(3);
  });
});

describe('day summary', () => {
  it('counts only required habits in the denominator', () => {
    const daily = makeHabit({ id: 'daily', name: 'Study' });
    const flexible = makeHabit({
      id: 'flex',
      name: 'Gym',
      frequency: { type: 'times_per_week', times: 2 },
    });
    const logs: HabitLog[] = [{ ...log('2026-08-03'), id: 'daily_2026-08-03', habitId: 'daily' }];

    const summary = summariseHabitsForDay(
      [daily, flexible],
      '2026-08-03',
      groupLogsByHabit(logs),
      1,
      '2026-08-09',
    );

    // Monday: the daily habit counts; the 2x/week habit is still flexible.
    expect(summary.scheduled).toBe(1);
    expect(summary.completed).toBe(1);
    expect(summary.snapshots).toHaveLength(2);
  });

  it('credits a flexible habit that was completed even when not required', () => {
    const flexible = makeHabit({
      id: 'flex',
      frequency: { type: 'times_per_week', times: 2 },
    });
    const logs: HabitLog[] = [{ ...log('2026-08-03'), id: 'flex_2026-08-03', habitId: 'flex' }];
    const summary = summariseHabitsForDay(
      [flexible],
      '2026-08-03',
      groupLogsByHabit(logs),
      1,
      '2026-08-09',
    );
    expect(summary.scheduled).toBe(1);
    expect(summary.completed).toBe(1);
  });
});
