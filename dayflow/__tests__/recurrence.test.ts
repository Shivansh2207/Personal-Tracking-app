import {
  countScheduledDays,
  describeSchedule,
  isAvailableOn,
  isScheduledOn,
  isVirtualOccurrence,
  nextOccurrence,
  occurrencesInRange,
  parseVirtualOccurrence,
  virtualOccurrenceId,
} from '@/services/recurrence';
import { buildVirtualOccurrence, expandTasksForDate } from '@/services/recurrence/tasks';
import type { ScheduleRule, Task } from '@/types/models';
import { dateRange } from '@/utils/date';

function rule(overrides: Partial<ScheduleRule>): ScheduleRule {
  return { type: 'daily', startDate: '2026-08-10', ...overrides };
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    userId: 'u1',
    title: 'Weekly planning',
    description: null,
    categoryId: null,
    dateKey: null,
    startTime: null,
    estimatedMinutes: null,
    deadline: null,
    status: 'pending',
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
    completedAt: null,
    ...overrides,
  };
}

describe('fixed schedules', () => {
  it('respects the start and end of the window', () => {
    const r = rule({ endDate: '2026-08-12' });
    expect(isScheduledOn(r, '2026-08-09')).toBe(false);
    expect(isScheduledOn(r, '2026-08-10')).toBe(true);
    expect(isScheduledOn(r, '2026-08-13')).toBe(false);
  });

  it('handles weekdays and weekends', () => {
    // 2026-08-15 Sat, 2026-08-16 Sun, 2026-08-17 Mon
    expect(isScheduledOn(rule({ type: 'weekdays' }), '2026-08-17')).toBe(true);
    expect(isScheduledOn(rule({ type: 'weekdays' }), '2026-08-15')).toBe(false);
    expect(isScheduledOn(rule({ type: 'weekends' }), '2026-08-16')).toBe(true);
  });

  it('handles specific weekdays', () => {
    const r = rule({ type: 'specific_days', daysOfWeek: [3, 6] });
    expect(isScheduledOn(r, '2026-08-12')).toBe(true); // Wed
    expect(isScheduledOn(r, '2026-08-15')).toBe(true); // Sat
    expect(isScheduledOn(r, '2026-08-13')).toBe(false);
  });

  it('handles every N days', () => {
    const r = rule({ type: 'every_n_days', interval: 3 });
    expect(isScheduledOn(r, '2026-08-10')).toBe(true);
    expect(isScheduledOn(r, '2026-08-11')).toBe(false);
    expect(isScheduledOn(r, '2026-08-13')).toBe(true);
  });

  it('handles every N weeks on chosen days', () => {
    const r = rule({ type: 'every_n_weeks', interval: 2, daysOfWeek: [1] });
    expect(isScheduledOn(r, '2026-08-10')).toBe(true); // week 0, Monday
    expect(isScheduledOn(r, '2026-08-17')).toBe(false); // week 1
    expect(isScheduledOn(r, '2026-08-24')).toBe(true); // week 2
  });

  it('clamps a monthly rule to short months', () => {
    const r = rule({ type: 'monthly_day', dayOfMonth: 31, startDate: '2026-01-31' });
    expect(isScheduledOn(r, '2026-01-31')).toBe(true);
    expect(isScheduledOn(r, '2026-02-28')).toBe(true); // clamped
    expect(isScheduledOn(r, '2026-02-27')).toBe(false);
    expect(isScheduledOn(r, '2026-03-31')).toBe(true);
  });

  it('handles the nth weekday of a month', () => {
    // First Sunday of August 2026 is the 2nd; the last is the 30th.
    const first = rule({ type: 'monthly_nth_weekday', nth: 1, weekday: 0, startDate: '2026-08-01' });
    expect(isScheduledOn(first, '2026-08-02')).toBe(true);
    expect(isScheduledOn(first, '2026-08-09')).toBe(false);

    const last = rule({ type: 'monthly_nth_weekday', nth: 5, weekday: 0, startDate: '2026-08-01' });
    expect(isScheduledOn(last, '2026-08-30')).toBe(true);
    expect(isScheduledOn(last, '2026-08-23')).toBe(false);
  });

  it('lists occurrences and finds the next one', () => {
    const r = rule({ type: 'weekdays' });
    expect(occurrencesInRange(r, '2026-08-10', '2026-08-16')).toEqual([
      '2026-08-10',
      '2026-08-11',
      '2026-08-12',
      '2026-08-13',
      '2026-08-14',
    ]);
    expect(nextOccurrence(rule({ type: 'weekends' }), '2026-08-12')).toBe('2026-08-15');
    expect(countScheduledDays(r, dateRange('2026-08-10', '2026-08-16'))).toBe(5);
  });
});

describe('flexible schedules', () => {
  it('is never scheduled on a specific day, but is always available', () => {
    const r = rule({ type: 'times_per_week', times: 4 });
    expect(isScheduledOn(r, '2026-08-10')).toBe(false);
    expect(isScheduledOn(r, '2026-08-13')).toBe(false);
    expect(isAvailableOn(r, '2026-08-10')).toBe(true);
  });

  it('is unavailable outside its window', () => {
    const r = rule({ type: 'times_per_week', times: 4, startDate: '2026-08-12' });
    expect(isAvailableOn(r, '2026-08-11')).toBe(false);
    expect(isAvailableOn(r, '2026-08-12')).toBe(true);
  });
});

describe('virtual task occurrences', () => {
  it('round-trips ids', () => {
    const id = virtualOccurrenceId('tmpl', '2026-08-16');
    expect(isVirtualOccurrence(id)).toBe(true);
    expect(parseVirtualOccurrence(id)).toEqual({ templateId: 'tmpl', dateKey: '2026-08-16' });
    expect(isVirtualOccurrence('abc')).toBe(false);
  });

  it('resets completion state when materialising', () => {
    const template = task({
      isRecurringTemplate: true,
      recurrence: rule({ type: 'daily' }),
      status: 'completed',
      completedAt: 123,
    });
    const occurrence = buildVirtualOccurrence(template, '2026-08-16');
    expect(occurrence.status).toBe('pending');
    expect(occurrence.completedAt).toBeNull();
    expect(occurrence.parentTaskId).toBe(template.id);
    expect(occurrence.isRecurringTemplate).toBe(false);
  });

  it('merges stored tasks with generated occurrences', () => {
    const template = task({ id: 'tmpl', isRecurringTemplate: true, recurrence: rule({ type: 'daily' }) });
    const stored = task({ id: 'stored', dateKey: '2026-08-16' });
    const merged = expandTasksForDate([stored], [template], '2026-08-16');
    expect(merged).toHaveLength(2);
    expect(merged.some((t) => isVirtualOccurrence(t.id))).toBe(true);
  });

  it('never duplicates a day that already has a real document', () => {
    const template = task({ id: 'tmpl', isRecurringTemplate: true, recurrence: rule({ type: 'daily' }) });
    const materialised = task({
      id: 'real',
      dateKey: '2026-08-16',
      parentTaskId: 'tmpl',
      status: 'completed',
    });
    const merged = expandTasksForDate([materialised], [template], '2026-08-16');
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('real');
    expect(merged[0].status).toBe('completed');
  });

  it('leaves future occurrences open after one day is completed', () => {
    const template = task({ id: 'tmpl', isRecurringTemplate: true, recurrence: rule({ type: 'daily' }) });
    const tomorrow = expandTasksForDate([], [template], '2026-08-17');
    expect(tomorrow).toHaveLength(1);
    expect(tomorrow[0].status).toBe('pending');
  });

  it('never shows the template document itself, only its occurrence', () => {
    const template = task({ id: 'tmpl', isRecurringTemplate: true, recurrence: rule({ type: 'daily' }) });
    const rows = expandTasksForDate([template], [template], '2026-08-16');
    expect(rows).toHaveLength(1);
    expect(rows[0].id).not.toBe('tmpl');
    expect(rows[0].isRecurringTemplate).toBe(false);
    expect(rows[0].parentTaskId).toBe('tmpl');
  });

  it('produces no rows on a day the rule does not fire', () => {
    const template = task({
      id: 'tmpl',
      isRecurringTemplate: true,
      recurrence: rule({ type: 'specific_days', daysOfWeek: [0] }),
    });
    // 2026-08-12 is a Wednesday; the rule only fires on Sundays.
    expect(expandTasksForDate([], [template], '2026-08-12')).toHaveLength(0);
  });
});

describe('descriptions', () => {
  it('describes each rule in plain language', () => {
    expect(describeSchedule(rule({ type: 'daily' }))).toBe('Every day');
    expect(describeSchedule(rule({ type: 'times_per_week', times: 4 }))).toBe('4× per week');
    expect(describeSchedule(rule({ type: 'specific_days', daysOfWeek: [3, 6] }))).toBe('Wed · Sat');
    expect(describeSchedule(rule({ type: 'every_n_days', interval: 3 }))).toBe('Every 3 days');
    expect(
      describeSchedule(rule({ type: 'monthly_nth_weekday', nth: 1, weekday: 0 })),
    ).toBe('The first Sun each month');
    expect(describeSchedule(null)).toBe('No schedule');
  });
});
