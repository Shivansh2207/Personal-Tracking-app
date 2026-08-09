import {
  buildVirtualOccurrence,
  describeRecurrence,
  expandTasksForDate,
  isVirtualOccurrence,
  nextOccurrence,
  occurrencesInRange,
  occursOn,
  parseVirtualOccurrence,
  virtualOccurrenceId,
} from '@/services/analytics/recurrence';
import type { RecurrenceRule, Task } from '@/types/models';

function rule(overrides: Partial<RecurrenceRule>): RecurrenceRule {
  return { type: 'daily', startDate: '2026-08-03', ...overrides };
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    userId: 'u1',
    title: 'Probability Practice',
    description: null,
    categoryId: 'cat1',
    goalId: null,
    scheduledDate: null,
    startTime: '19:00',
    endTime: null,
    estimatedMinutes: 60,
    actualMinutes: null,
    priority: 'medium',
    status: 'not_started',
    isTopPriority: false,
    topPriorityOrder: null,
    recurrenceRule: null,
    parentRecurringTaskId: null,
    isRecurringTemplate: false,
    subtasks: [],
    notes: null,
    reminderMinutesBefore: null,
    notificationId: null,
    carryCount: 0,
    createdAt: 0,
    updatedAt: 0,
    completedAt: null,
    ...overrides,
  };
}

describe('occursOn', () => {
  it('never fires before the start date or after the end date', () => {
    const r = rule({ endDate: '2026-08-05' });
    expect(occursOn(r, '2026-08-02')).toBe(false);
    expect(occursOn(r, '2026-08-03')).toBe(true);
    expect(occursOn(r, '2026-08-06')).toBe(false);
  });

  it('handles weekdays and weekends', () => {
    // 2026-08-08 Sat, 2026-08-09 Sun, 2026-08-10 Mon
    expect(occursOn(rule({ type: 'weekdays' }), '2026-08-10')).toBe(true);
    expect(occursOn(rule({ type: 'weekdays' }), '2026-08-08')).toBe(false);
    expect(occursOn(rule({ type: 'weekends' }), '2026-08-09')).toBe(true);
    expect(occursOn(rule({ type: 'weekends' }), '2026-08-10')).toBe(false);
  });

  it('handles specific weekdays', () => {
    const r = rule({ type: 'specific_days', daysOfWeek: [1, 4] });
    expect(occursOn(r, '2026-08-03')).toBe(true); // Mon
    expect(occursOn(r, '2026-08-06')).toBe(true); // Thu
    expect(occursOn(r, '2026-08-05')).toBe(false); // Wed
  });

  it('repeats weekly on the start weekday by default', () => {
    const r = rule({ type: 'weekly' }); // 2026-08-03 is a Monday
    expect(occursOn(r, '2026-08-10')).toBe(true);
    expect(occursOn(r, '2026-08-11')).toBe(false);
  });

  it('clamps a monthly rule to short months', () => {
    const r = rule({ type: 'monthly', dayOfMonth: 31, startDate: '2026-01-31' });
    expect(occursOn(r, '2026-01-31')).toBe(true);
    expect(occursOn(r, '2026-02-28')).toBe(true); // clamped
    expect(occursOn(r, '2026-02-27')).toBe(false);
    expect(occursOn(r, '2026-03-31')).toBe(true);
  });

  it('handles custom intervals', () => {
    const r = rule({ type: 'interval', interval: 3 });
    expect(occursOn(r, '2026-08-03')).toBe(true);
    expect(occursOn(r, '2026-08-04')).toBe(false);
    expect(occursOn(r, '2026-08-06')).toBe(true);
    expect(occursOn(r, '2026-08-09')).toBe(true);
  });
});

describe('occurrence expansion', () => {
  it('lists occurrences in a window', () => {
    const dates = occurrencesInRange(rule({ type: 'weekdays' }), '2026-08-03', '2026-08-09');
    expect(dates).toEqual([
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
      '2026-08-06',
      '2026-08-07',
    ]);
  });

  it('finds the next occurrence after a date', () => {
    expect(nextOccurrence(rule({ type: 'weekends' }), '2026-08-05')).toBe('2026-08-08');
    expect(nextOccurrence(rule({ type: 'daily', endDate: '2026-08-05' }), '2026-08-05')).toBeNull();
  });

  it('round-trips virtual ids', () => {
    const id = virtualOccurrenceId('template1', '2026-08-09');
    expect(isVirtualOccurrence(id)).toBe(true);
    expect(parseVirtualOccurrence(id)).toEqual({
      templateId: 'template1',
      date: '2026-08-09',
    });
    expect(isVirtualOccurrence('abc123')).toBe(false);
  });

  it('resets state when materialising an occurrence', () => {
    const template = task({
      isRecurringTemplate: true,
      recurrenceRule: rule({ type: 'daily' }),
      status: 'completed',
      subtasks: [{ id: 's1', title: 'Warm up', done: true }],
    });
    const occurrence = buildVirtualOccurrence(template, '2026-08-09');
    expect(occurrence.status).toBe('not_started');
    expect(occurrence.completedAt).toBeNull();
    expect(occurrence.subtasks[0].done).toBe(false);
    expect(occurrence.parentRecurringTaskId).toBe(template.id);
    expect(occurrence.isRecurringTemplate).toBe(false);
  });

  it('merges stored tasks with generated occurrences', () => {
    const template = task({
      id: 'tmpl',
      isRecurringTemplate: true,
      recurrenceRule: rule({ type: 'daily' }),
    });
    const stored = task({ id: 'stored', scheduledDate: '2026-08-09' });

    const merged = expandTasksForDate([stored], [template], '2026-08-09');
    expect(merged).toHaveLength(2);
    expect(merged.some((t) => t.id === 'stored')).toBe(true);
    expect(merged.some((t) => isVirtualOccurrence(t.id))).toBe(true);
  });

  it('does not duplicate an occurrence that already has a real document', () => {
    const template = task({
      id: 'tmpl',
      isRecurringTemplate: true,
      recurrenceRule: rule({ type: 'daily' }),
    });
    const materialised = task({
      id: 'real',
      scheduledDate: '2026-08-09',
      parentRecurringTaskId: 'tmpl',
      status: 'completed',
    });

    const merged = expandTasksForDate([materialised], [template], '2026-08-09');
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('real');
    expect(merged[0].status).toBe('completed');
  });

  it('keeps future occurrences open after one day is completed', () => {
    const template = task({
      id: 'tmpl',
      isRecurringTemplate: true,
      recurrenceRule: rule({ type: 'daily' }),
    });
    const completedToday = task({
      id: 'real',
      scheduledDate: '2026-08-09',
      parentRecurringTaskId: 'tmpl',
      status: 'completed',
    });

    const tomorrow = expandTasksForDate([], [template], '2026-08-10');
    expect(tomorrow).toHaveLength(1);
    expect(tomorrow[0].status).toBe('not_started');
    expect(completedToday.status).toBe('completed');
  });

  it('excludes the template itself from a day list', () => {
    const template = task({
      id: 'tmpl',
      isRecurringTemplate: true,
      recurrenceRule: rule({ type: 'weekly' }),
    });
    const merged = expandTasksForDate([template], [template], '2026-08-04');
    expect(merged).toHaveLength(0);
  });
});

describe('describeRecurrence', () => {
  it('describes each rule type in plain language', () => {
    expect(describeRecurrence(null)).toBe('Does not repeat');
    expect(describeRecurrence(rule({ type: 'daily' }))).toBe('Every day');
    expect(describeRecurrence(rule({ type: 'interval', interval: 3 }))).toBe('Every 3 days');
    expect(
      describeRecurrence(rule({ type: 'specific_days', daysOfWeek: [1, 3] })),
    ).toBe('Mon · Wed');
  });
});
