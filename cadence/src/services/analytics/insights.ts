/**
 * Data-derived dashboard insight.
 *
 * Every candidate declares the evidence it needs. Candidates whose evidence is
 * missing are simply not generated — the dashboard shows nothing rather than an
 * invented observation.
 */

import type { ActivityLog, Category, DailyStats, DateKey, Habit, HabitLog } from '@/types/models';
import { formatDuration, lastNDays } from '@/utils/date';
import { calculateHabitAnalytics, calculateWeekdayAverages } from './aggregate';

export interface Insight {
  id: string;
  text: string;
  /** Higher wins when several insights qualify. */
  weight: number;
}

export interface InsightContext {
  today: DateKey;
  weekStart: 0 | 1;
  weekDates: DateKey[];
  lastWeekDates: DateKey[];
  stats: DailyStats[];
  habits: Habit[];
  habitLogs: HabitLog[];
  activities: ActivityLog[];
  categories: Category[];
  weeklyActivityTarget?: number | null;
}

export function buildInsights(ctx: InsightContext): Insight[] {
  const out: Insight[] = [];
  const byDate = new Map(ctx.stats.map((s) => [s.date, s]));

  const thisWeek = ctx.weekDates.map((d) => byDate.get(d)).filter(Boolean) as DailyStats[];
  const lastWeek = ctx.lastWeekDates.map((d) => byDate.get(d)).filter(Boolean) as DailyStats[];

  // 1. Weekly task execution.
  const planned = thisWeek.reduce((a, s) => a + s.tasksPlanned, 0);
  const completed = thisWeek.reduce((a, s) => a + s.tasksCompleted, 0);
  if (planned >= 5) {
    out.push({
      id: 'weekly-execution',
      text: `You've completed ${Math.round((completed / planned) * 100)}% of your planned work this week.`,
      weight: 60,
    });
  }

  // 2. Most productive weekday — needs a month of evidence.
  const monthStats = ctx.stats.filter(
    (s) => s.dayState !== 'no_data' && s.date >= lastNDays(30, ctx.today)[0],
  );
  if (monthStats.length >= 10) {
    const averages = calculateWeekdayAverages(monthStats).filter((a) => a.samples >= 2);
    if (averages.length >= 3) {
      const best = [...averages].sort((a, b) => b.average - a.average)[0];
      if (best && best.average > 0) {
        out.push({
          id: 'best-weekday',
          text: `${dayFull(best.dow)} is currently your most productive day.`,
          weight: 45,
        });
      }
    }
  }

  // 3. Week-over-week score movement.
  const scoredThis = thisWeek.filter((s) => s.dayState === 'successful' || s.dayState === 'incomplete');
  const scoredLast = lastWeek.filter((s) => s.dayState === 'successful' || s.dayState === 'incomplete');
  if (scoredThis.length >= 3 && scoredLast.length >= 3) {
    const avgThis = avg(scoredThis.map((s) => s.productivityScore));
    const avgLast = avg(scoredLast.map((s) => s.productivityScore));
    const delta = Math.round(avgThis - avgLast);
    if (Math.abs(delta) >= 5) {
      out.push({
        id: 'week-delta',
        text:
          delta > 0
            ? `Your average score is up ${delta} points compared with last week.`
            : `Your average score is down ${Math.abs(delta)} points compared with last week.`,
        weight: 70,
      });
    }
  }

  // 4. Weakest habit — neutral phrasing, never shaming.
  if (ctx.habits.length >= 2) {
    const range = lastNDays(30, ctx.today);
    const analytics = calculateHabitAnalytics(
      ctx.habits.filter((h) => h.active),
      ctx.habitLogs,
      range,
      ctx.weekStart,
      ctx.today,
    );
    const measured = analytics.rows.filter((r) => r.scheduled >= 4);
    if (measured.length >= 2) {
      const weakest = [...measured].sort((a, b) => a.consistency - b.consistency)[0];
      if (weakest && weakest.consistency < 60) {
        out.push({
          id: 'weak-habit',
          text: `${weakest.habit.name} has been your least consistent habit this month.`,
          weight: 50,
        });
      }
      const strongest = [...measured].sort((a, b) => b.consistency - a.consistency)[0];
      if (strongest && strongest.consistency >= 85) {
        out.push({
          id: 'strong-habit',
          text: `${strongest.habit.name} is holding at ${strongest.consistency}% consistency.`,
          weight: 35,
        });
      }
    }
  }

  // 5. Weekly activity target.
  if (ctx.weeklyActivityTarget && ctx.weeklyActivityTarget > 0) {
    const done = ctx.activities.filter(
      (a) => a.completed && ctx.weekDates.includes(a.date),
    ).length;
    const remaining = ctx.weeklyActivityTarget - done;
    if (remaining > 0) {
      out.push({
        id: 'activity-target',
        text: `You still need ${remaining} ${remaining === 1 ? 'session' : 'sessions'} to hit this week's activity target.`,
        weight: 55,
      });
    } else if (done >= ctx.weeklyActivityTarget) {
      out.push({
        id: 'activity-hit',
        text: `Activity target reached — ${done} sessions logged this week.`,
        weight: 40,
      });
    }
  }

  // 6. Focus time accumulated this week.
  const focus = thisWeek.reduce((a, s) => a + s.focusMinutes, 0);
  if (focus >= 60) {
    out.push({
      id: 'focus-week',
      text: `${formatDuration(focus)} of focused work recorded this week.`,
      weight: 30,
    });
  }

  return out.sort((a, b) => b.weight - a.weight);
}

export function pickInsight(ctx: InsightContext): Insight | null {
  const all = buildInsights(ctx);
  if (all.length === 0) return null;
  // Rotate through the top candidates by day so the card does not feel static.
  const top = all.slice(0, 3);
  const seed = Number(ctx.today.replace(/-/g, '')) % top.length;
  return top[seed] ?? top[0];
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function dayFull(dow: number): string {
  return (
    ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dow] ?? ''
  );
}
