/**
 * Full-journey check.
 *
 * Generates a realistic week for a brand-new account, scores every day through
 * the same pipeline the app uses, then asserts that the streak, weekly rollup,
 * category split, goal progress and study analytics all agree with the raw
 * records. This is the automated version of "run through one simulated week and
 * look for inconsistent statistics".
 */

import {
  buildScoreTrend,
  calculateActivitySummary,
  calculateCategoryDistribution,
  calculateGoalProgress,
  calculateHabitAnalytics,
  calculateStreak,
  calculateStudyAnalytics,
  calculateTimeVariance,
  calculateWeeklySummary,
  computeDayStats,
  type DayRecords,
} from '@/services/analytics';
import { buildDemoWeek, DEMO_SETTINGS } from '@/services/demoData';
import { pickInsight } from '@/services/analytics/insights';
import type { DailyStats } from '@/types/models';
import { addDays, dateRange, endOfWeek, startOfWeek } from '@/utils/date';

const TODAY = '2026-08-09';
const UID = 'sim-user';

function buildStats() {
  const demo = buildDemoWeek(UID, { endDate: TODAY, days: 7, seed: 42 });

  const stats: DailyStats[] = demo.dates.map((date) => {
    const records: DayRecords = {
      tasks: demo.tasks.filter((t) => t.scheduledDate === date),
      habits: demo.habits,
      habitLogs: demo.habitLogs.filter((l) => l.date === date),
      sessions: demo.sessions.filter((s) => s.date === date),
      activities: demo.activities.filter((a) => a.date === date),
      subjects: demo.subjects,
      isRestDay: false,
    };
    const computed = computeDayStats(date, records, DEMO_SETTINGS, TODAY);
    return {
      id: date,
      userId: UID,
      date,
      productivityScore: computed.productivityScore,
      tasksPlanned: computed.tasksPlanned,
      tasksCompleted: computed.tasksCompleted,
      habitsScheduled: computed.habitsScheduled,
      habitsCompleted: computed.habitsCompleted,
      focusMinutes: computed.focusMinutes,
      studyMinutes: computed.studyMinutes,
      activityMinutes: computed.activityMinutes,
      activityCount: computed.activityCount,
      categoryMinutes: computed.categoryMinutes,
      categoryTasks: computed.categoryTasks,
      dayState: computed.dayState,
      updatedAt: 0,
    };
  });

  return { demo, stats };
}

describe('a brand-new account after one simulated week', () => {
  const { demo, stats } = buildStats();

  it('produces one aggregate per day with no gaps', () => {
    expect(stats).toHaveLength(7);
    expect(stats.map((s) => s.date)).toEqual(demo.dates);
    expect(new Set(stats.map((s) => s.date)).size).toBe(7);
  });

  it('scores every day between 0 and 100 and never invents data', () => {
    for (const stat of stats) {
      expect(stat.productivityScore).toBeGreaterThanOrEqual(0);
      expect(stat.productivityScore).toBeLessThanOrEqual(100);
      expect(stat.dayState).not.toBe('no_data');
      expect(stat.tasksCompleted).toBeLessThanOrEqual(stat.tasksPlanned);
      expect(stat.habitsCompleted).toBeLessThanOrEqual(stat.habitsScheduled);
    }
  });

  it('matches the raw task records exactly', () => {
    for (const stat of stats) {
      const dayTasks = demo.tasks.filter((t) => t.scheduledDate === stat.date);
      expect(stat.tasksPlanned).toBe(dayTasks.filter((t) => t.status !== 'skipped').length);
      expect(stat.tasksCompleted).toBe(dayTasks.filter((t) => t.status === 'completed').length);
    }
  });

  it('matches the raw focus and activity records exactly', () => {
    for (const stat of stats) {
      const minutes = demo.sessions
        .filter((s) => s.date === stat.date)
        .reduce((a, s) => a + s.durationMinutes, 0);
      expect(stat.focusMinutes).toBe(minutes);

      const activities = demo.activities.filter((a) => a.date === stat.date && a.completed);
      expect(stat.activityCount).toBe(activities.length);
      expect(stat.activityMinutes).toBe(
        activities.reduce((a, x) => a + x.durationMinutes, 0),
      );
    }
  });

  it('attributes recorded time to categories without double counting', () => {
    for (const stat of stats) {
      const bucketTotal = Object.values(stat.categoryMinutes).reduce((a, b) => a + b, 0);
      const taskMinutes = demo.tasks
        .filter((t) => t.scheduledDate === stat.date && t.status === 'completed')
        .reduce((a, t) => a + (t.actualMinutes ?? 0), 0);
      expect(bucketTotal).toBe(stat.focusMinutes + stat.activityMinutes + taskMinutes);
    }
  });

  it('rolls the days up into a consistent weekly summary', () => {
    const weekStart = startOfWeek(TODAY, DEMO_SETTINGS.weekStart);
    const weekEnd = endOfWeek(TODAY, DEMO_SETTINGS.weekStart);
    const summary = calculateWeeklySummary(weekStart, weekEnd, stats);

    const inWeek = stats.filter((s) => s.date >= weekStart && s.date <= weekEnd);
    expect(summary.tasksCompleted).toBe(inWeek.reduce((a, s) => a + s.tasksCompleted, 0));
    expect(summary.tasksPlanned).toBe(inWeek.reduce((a, s) => a + s.tasksPlanned, 0));
    expect(summary.focusMinutes).toBe(inWeek.reduce((a, s) => a + s.focusMinutes, 0));
    expect(summary.taskCompletionRate).toBe(
      Math.round((summary.tasksCompleted / summary.tasksPlanned) * 100),
    );
    expect(summary.productivityScore).toBeGreaterThan(0);
    expect(summary.bestDay).not.toBeNull();
  });

  it('computes a streak that agrees with the day states', () => {
    const map = new Map(stats.map((s) => [s.date, { dayState: s.dayState }]));
    const streak = calculateStreak(map, TODAY);

    // Walk the same days by hand and compare.
    let expected = 0;
    for (let i = stats.length - 1; i >= 0; i -= 1) {
      const stat = stats[i];
      if (stat.dayState === 'successful') expected += 1;
      else if (stat.date === TODAY) continue;
      else break;
    }
    expect(streak).toBe(expected);
  });

  it('splits categories into percentages that total 100', () => {
    const categories = demo.categories;
    const byTime = calculateCategoryDistribution(stats, categories, 'time');
    expect(byTime.length).toBeGreaterThan(0);
    const total = byTime.reduce((a, s) => a + s.percent, 0);
    expect(Math.abs(total - 100)).toBeLessThanOrEqual(2); // rounding slack

    const byActivity = calculateCategoryDistribution(stats, categories, 'activities');
    expect(byActivity.length).toBeGreaterThan(0);
  });

  it('never reports habit consistency above 100%', () => {
    const analytics = calculateHabitAnalytics(
      demo.habits,
      demo.habitLogs,
      demo.dates,
      DEMO_SETTINGS.weekStart,
      TODAY,
    );
    expect(analytics.overall).toBeGreaterThanOrEqual(0);
    expect(analytics.overall).toBeLessThanOrEqual(100);
    for (const row of analytics.rows) {
      expect(row.consistency).toBeLessThanOrEqual(100);
      expect(row.completed).toBeLessThanOrEqual(row.scheduled + 1);
    }
  });

  it('derives study analytics from the real sessions', () => {
    const study = calculateStudyAnalytics(demo.sessions, demo.subjects, demo.topics);
    expect(study.totalMinutes).toBe(
      demo.sessions.reduce((a, s) => a + s.durationMinutes, 0),
    );
    expect(study.sessionCount).toBe(demo.sessions.length);
    expect(study.topicsTotal).toBe(demo.topics.length);
    expect(study.bySubject.reduce((a, s) => a + s.minutes, 0)).toBe(study.totalMinutes);
  });

  it('computes goal progress from linked records rather than a stored guess', () => {
    const syllabusGoal = demo.goals[0];
    const linkedTopics = demo.topics.filter((t) =>
      syllabusGoal.linkedSubjectIds.includes(t.subjectId),
    );
    const progress = calculateGoalProgress(syllabusGoal, { topics: linkedTopics });
    expect(progress).toBeGreaterThan(0);
    expect(progress).toBeLessThanOrEqual(100);
    // The stored value starts at 0; the derived value is what the UI shows.
    expect(syllabusGoal.progress).toBe(0);
  });

  it('reports planned vs actual only for tasks that have both numbers', () => {
    const variance = calculateTimeVariance(demo.tasks);
    const eligible = demo.tasks.filter(
      (t) => (t.estimatedMinutes ?? 0) > 0 && (t.actualMinutes ?? 0) > 0,
    );
    expect(variance.tasksWithBoth).toBe(eligible.length);
    expect(variance.plannedMinutes).toBe(
      eligible.reduce((a, t) => a + (t.estimatedMinutes ?? 0), 0),
    );
  });

  it('summarises activity from completed logs only', () => {
    const summary = calculateActivitySummary(demo.activities);
    expect(summary.sessions).toBe(demo.activities.filter((a) => a.completed).length);
    expect(summary.byType.reduce((a, t) => a + t.count, 0)).toBe(summary.sessions);
  });

  it('builds a trend point for every requested day, flagging empty ones', () => {
    const requested = dateRange(addDays(TODAY, -13), TODAY);
    const trend = buildScoreTrend(stats, requested);
    expect(trend).toHaveLength(14);
    expect(trend.filter((p) => p.hasData)).toHaveLength(7);
    expect(trend.filter((p) => !p.hasData).every((p) => p.value === 0)).toBe(true);
  });

  it('only generates an insight it can back with data', () => {
    const weekDates = dateRange(
      startOfWeek(TODAY, DEMO_SETTINGS.weekStart),
      endOfWeek(TODAY, DEMO_SETTINGS.weekStart),
    );
    const insight = pickInsight({
      today: TODAY,
      weekStart: DEMO_SETTINGS.weekStart,
      weekDates,
      lastWeekDates: weekDates.map((d) => addDays(d, -7)),
      stats,
      habits: demo.habits,
      habitLogs: demo.habitLogs,
      activities: demo.activities,
      categories: demo.categories,
      weeklyActivityTarget: 4,
    });
    expect(insight).not.toBeNull();
    expect(insight!.text.length).toBeGreaterThan(0);
  });

  it('reports no insight for an account with no history at all', () => {
    const insight = pickInsight({
      today: TODAY,
      weekStart: 1,
      weekDates: [],
      lastWeekDates: [],
      stats: [],
      habits: [],
      habitLogs: [],
      activities: [],
      categories: [],
      weeklyActivityTarget: null,
    });
    expect(insight).toBeNull();
  });
});

describe('a fresh account with nothing recorded', () => {
  it('scores zero without classifying the user as failing', () => {
    const records: DayRecords = {
      tasks: [],
      habits: [],
      habitLogs: [],
      sessions: [],
      activities: [],
      subjects: [],
      isRestDay: false,
    };
    const computed = computeDayStats(TODAY, records, DEMO_SETTINGS, TODAY);
    expect(computed.productivityScore).toBe(0);
    expect(computed.dayState).toBe('no_data');
    expect(computed.breakdown.hasData).toBe(false);
  });

  it('shows an empty weekly summary rather than a fabricated one', () => {
    const summary = calculateWeeklySummary('2026-08-03', '2026-08-09', []);
    expect(summary.daysWithData).toBe(0);
    expect(summary.productivityScore).toBe(0);
    expect(summary.taskCompletionRate).toBe(0);
    expect(summary.bestDay).toBeNull();
  });
});
