import {
  BASE_WEIGHTS,
  calculateDailyScore,
  calculateLongestStreak,
  calculateStreak,
  resolveDayState,
} from '@/services/analytics/score';
import type { DateKey, DayState } from '@/types/models';

const base = {
  tasksPlanned: 0,
  tasksCompleted: 0,
  habitsScheduled: 0,
  habitsCompleted: 0,
  focusMinutes: 0,
  focusGoalMinutes: 120,
  focusApplicable: false,
};

describe('daily productivity score', () => {
  it('uses the 50/30/20 split when every component applies', () => {
    const result = calculateDailyScore({
      ...base,
      tasksPlanned: 10,
      tasksCompleted: 8,
      habitsScheduled: 5,
      habitsCompleted: 4,
      focusMinutes: 90,
      focusApplicable: true,
    });
    // 0.8*50 + 0.8*30 + 0.75*20 = 40 + 24 + 15 = 79
    expect(result.score).toBe(79);
    expect(result.components.map((c) => c.weight)).toEqual([
      BASE_WEIGHTS.tasks,
      BASE_WEIGHTS.habits,
      BASE_WEIGHTS.focus,
    ]);
  });

  it('redistributes weight when no habits are scheduled', () => {
    const result = calculateDailyScore({
      ...base,
      tasksPlanned: 4,
      tasksCompleted: 4,
      focusMinutes: 120,
      focusApplicable: true,
    });
    expect(result.score).toBe(100);
    const habits = result.components.find((c) => c.key === 'habits');
    expect(habits?.applicable).toBe(false);
    expect(habits?.weight).toBe(0);
  });

  it('does not punish a day with no duration-based work', () => {
    const result = calculateDailyScore({
      ...base,
      tasksPlanned: 4,
      tasksCompleted: 4,
      habitsScheduled: 2,
      habitsCompleted: 2,
      focusApplicable: false,
    });
    expect(result.score).toBe(100);
  });

  it('reports no data when nothing was scheduled or recorded', () => {
    const result = calculateDailyScore(base);
    expect(result.hasData).toBe(false);
    expect(result.score).toBe(0);
    expect(result.totalWeight).toBe(0);
  });

  it('caps a component at 100% when the target is exceeded', () => {
    const result = calculateDailyScore({
      ...base,
      tasksPlanned: 2,
      tasksCompleted: 2,
      focusMinutes: 400,
      focusApplicable: true,
    });
    expect(result.score).toBe(100);
  });

  it('produces a breakdown whose points sum to the score', () => {
    const result = calculateDailyScore({
      ...base,
      tasksPlanned: 7,
      tasksCompleted: 3,
      habitsScheduled: 4,
      habitsCompleted: 1,
      focusMinutes: 30,
      focusApplicable: true,
    });
    const sum = result.components.reduce((a, c) => a + c.points, 0);
    expect(Math.round(sum)).toBe(result.score);
  });
});

describe('day state', () => {
  it('classifies against the threshold', () => {
    expect(
      resolveDayState({ score: 72, hasData: true, threshold: 60, isRestDay: false }),
    ).toBe('successful');
    expect(
      resolveDayState({ score: 42, hasData: true, threshold: 60, isRestDay: false }),
    ).toBe('incomplete');
  });

  it('treats an explicit rest day as its own state', () => {
    expect(
      resolveDayState({ score: 10, hasData: true, threshold: 60, isRestDay: true }),
    ).toBe('rest');
  });

  it('never marks an empty day as a failure', () => {
    expect(
      resolveDayState({ score: 0, hasData: false, threshold: 60, isRestDay: false }),
    ).toBe('no_data');
  });
});

function statsMap(entries: [DateKey, DayState][]) {
  return new Map(entries.map(([date, dayState]) => [date, { dayState }]));
}

describe('productivity streak', () => {
  const today = '2026-08-09';

  it('counts consecutive successful days', () => {
    const map = statsMap([
      ['2026-08-09', 'successful'],
      ['2026-08-08', 'successful'],
      ['2026-08-07', 'successful'],
      ['2026-08-06', 'incomplete'],
    ]);
    expect(calculateStreak(map, today)).toBe(3);
  });

  it('does not break on today when the day is still in progress', () => {
    const map = statsMap([
      ['2026-08-09', 'incomplete'],
      ['2026-08-08', 'successful'],
      ['2026-08-07', 'successful'],
    ]);
    expect(calculateStreak(map, today)).toBe(2);
  });

  it('treats rest days as transparent', () => {
    const map = statsMap([
      ['2026-08-09', 'successful'],
      ['2026-08-08', 'rest'],
      ['2026-08-07', 'successful'],
    ]);
    expect(calculateStreak(map, today)).toBe(2);
  });

  it('breaks after a run of empty days so an abandoned month cannot inflate it', () => {
    const map = statsMap([
      ['2026-08-09', 'successful'],
      // 08-08 .. 08-06 have no entries at all -> no_data
      ['2026-08-05', 'successful'],
    ]);
    expect(calculateStreak(map, today, { maxNeutralRun: 3 })).toBe(1);
  });

  it('bridges a single empty day', () => {
    const map = statsMap([
      ['2026-08-09', 'successful'],
      ['2026-08-07', 'successful'],
      ['2026-08-06', 'successful'],
    ]);
    expect(calculateStreak(map, today, { maxNeutralRun: 3 })).toBe(3);
  });

  it('is zero when the most recent completed day failed', () => {
    const map = statsMap([
      ['2026-08-09', 'incomplete'],
      ['2026-08-08', 'incomplete'],
    ]);
    expect(calculateStreak(map, today)).toBe(0);
  });

  it('finds the longest historical streak', () => {
    const dates: DateKey[] = [
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
    ];
    const map = statsMap([
      ['2026-08-01', 'successful'],
      ['2026-08-02', 'successful'],
      ['2026-08-03', 'incomplete'],
      ['2026-08-04', 'successful'],
      ['2026-08-05', 'successful'],
    ]);
    expect(calculateLongestStreak(map, dates)).toBe(2);
  });
});
