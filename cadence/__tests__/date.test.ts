import {
  addDays,
  addMonths,
  dateRange,
  dayPartForTime,
  diffDays,
  endOfWeek,
  formatClock,
  formatDuration,
  formatRelativeDate,
  formatTime,
  fromDateKey,
  isValidDateKey,
  minutesToTime,
  monthGrid,
  nextWeekendKey,
  startOfWeek,
  timeToMinutes,
  toDateKey,
  weekKey,
} from '@/utils/date';

describe('local-day date keys', () => {
  it('builds a key from local calendar fields, not UTC', () => {
    // 23:55 local on 9 August must belong to 9 August, whatever the offset is.
    const lateNight = new Date(2026, 7, 9, 23, 55, 0);
    expect(toDateKey(lateNight)).toBe('2026-08-09');
  });

  it('round-trips a key through a Date', () => {
    const key = '2026-02-28';
    expect(toDateKey(fromDateKey(key))).toBe(key);
  });

  it('handles a day boundary at 00:05 local', () => {
    const justAfterMidnight = new Date(2026, 7, 10, 0, 5, 0);
    expect(toDateKey(justAfterMidnight)).toBe('2026-08-10');
  });

  it('validates keys', () => {
    expect(isValidDateKey('2026-08-09')).toBe(true);
    expect(isValidDateKey('2026-02-30')).toBe(false);
    expect(isValidDateKey('2026-8-9')).toBe(false);
    expect(isValidDateKey(null)).toBe(false);
  });

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
  });

  it('clamps month arithmetic to short months', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
  });

  it('measures whole-day differences', () => {
    expect(diffDays('2026-08-01', '2026-08-09')).toBe(8);
    expect(diffDays('2026-08-09', '2026-08-01')).toBe(-8);
  });

  it('builds inclusive ranges', () => {
    expect(dateRange('2026-08-01', '2026-08-03')).toEqual([
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
    ]);
    expect(dateRange('2026-08-03', '2026-08-01')).toEqual([]);
  });
});

describe('week boundaries', () => {
  it('honours a Monday week start', () => {
    // 2026-08-09 is a Sunday.
    expect(startOfWeek('2026-08-09', 1)).toBe('2026-08-03');
    expect(endOfWeek('2026-08-09', 1)).toBe('2026-08-09');
  });

  it('honours a Sunday week start', () => {
    expect(startOfWeek('2026-08-09', 0)).toBe('2026-08-09');
    expect(endOfWeek('2026-08-09', 0)).toBe('2026-08-15');
  });

  it('derives a stable week id from the week start', () => {
    expect(weekKey('2026-08-09', 1)).toBe(weekKey('2026-08-05', 1));
    expect(weekKey('2026-08-09', 1)).not.toBe(weekKey('2026-08-10', 1));
  });

  it('finds the coming weekend', () => {
    expect(nextWeekendKey('2026-08-05')).toBe('2026-08-08'); // Wed -> Sat
    expect(nextWeekendKey('2026-08-08')).toBe('2026-08-08'); // already Sat
  });

  it('produces a six-row calendar grid', () => {
    const grid = monthGrid('2026-08-09', 1);
    expect(grid).toHaveLength(42);
    expect(grid[0]).toBe(startOfWeek('2026-08-01', 1));
  });
});

describe('time formatting', () => {
  it('parses and formats HH:mm', () => {
    expect(timeToMinutes('19:00')).toBe(1140);
    expect(timeToMinutes('7:05')).toBe(425);
    expect(timeToMinutes('99:99')).toBeNull();
    expect(timeToMinutes(null)).toBeNull();
    expect(minutesToTime(1140)).toBe('19:00');
  });

  it('formats 12 and 24 hour clocks', () => {
    expect(formatTime('19:00', false)).toBe('7:00 PM');
    expect(formatTime('19:00', true)).toBe('19:00');
    expect(formatTime('00:30', false)).toBe('12:30 AM');
  });

  it('formats durations', () => {
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(45)).toBe('45m');
    expect(formatDuration(60)).toBe('1h');
    expect(formatDuration(165)).toBe('2h 45m');
    expect(formatDuration(null)).toBe('—');
  });

  it('formats a running clock', () => {
    expect(formatClock(65)).toBe('01:05');
    expect(formatClock(3725)).toBe('1:02:05');
  });

  it('buckets times into day parts', () => {
    expect(dayPartForTime('08:00')).toBe('morning');
    expect(dayPartForTime('13:00')).toBe('afternoon');
    expect(dayPartForTime('19:00')).toBe('evening');
    expect(dayPartForTime(null)).toBe('anytime');
  });

  it('describes dates relative to today', () => {
    expect(formatRelativeDate('2026-08-09', '2026-08-09')).toBe('Today');
    expect(formatRelativeDate('2026-08-10', '2026-08-09')).toBe('Tomorrow');
    expect(formatRelativeDate('2026-08-08', '2026-08-09')).toBe('Yesterday');
  });
});
