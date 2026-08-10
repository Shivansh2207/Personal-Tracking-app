import {
  addDays,
  averageClockMinutes,
  clockDeviationMinutes,
  dateRange,
  dayPartForTime,
  diffDays,
  endOfWeek,
  formatClock,
  formatDeviation,
  formatDuration,
  formatTime,
  fromDateKey,
  isValidDateKey,
  minutesToTime,
  startOfWeek,
  timeToMinutes,
  toDateKey,
  weekKey,
} from '@/utils/date';

describe('local-day keys', () => {
  it('builds a key from local calendar fields, not UTC', () => {
    // 23:55 local on 10 August must belong to 10 August whatever the offset.
    expect(toDateKey(new Date(2026, 7, 10, 23, 55, 0))).toBe('2026-08-10');
  });

  it('keeps an after-midnight moment on the new day', () => {
    expect(toDateKey(new Date(2026, 7, 11, 0, 5, 0))).toBe('2026-08-11');
  });

  it('round-trips through a Date', () => {
    expect(toDateKey(fromDateKey('2026-02-28'))).toBe('2026-02-28');
  });

  it('validates keys', () => {
    expect(isValidDateKey('2026-08-10')).toBe(true);
    expect(isValidDateKey('2026-02-30')).toBe(false);
    expect(isValidDateKey('2026-8-9')).toBe(false);
    expect(isValidDateKey(null)).toBe(false);
  });

  it('crosses month and year boundaries', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(diffDays('2026-08-01', '2026-08-10')).toBe(9);
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

describe('weeks', () => {
  it('honours a Monday week start', () => {
    // 2026-08-10 is a Monday.
    expect(startOfWeek('2026-08-10', 1)).toBe('2026-08-10');
    expect(endOfWeek('2026-08-10', 1)).toBe('2026-08-16');
  });

  it('honours a Sunday week start', () => {
    expect(startOfWeek('2026-08-10', 0)).toBe('2026-08-09');
    expect(endOfWeek('2026-08-10', 0)).toBe('2026-08-15');
  });

  it('derives a stable week id from the week start', () => {
    expect(weekKey('2026-08-10', 1)).toBe(weekKey('2026-08-14', 1));
    expect(weekKey('2026-08-10', 1)).not.toBe(weekKey('2026-08-17', 1));
  });
});

describe('clock arithmetic', () => {
  it('parses and formats HH:mm', () => {
    expect(timeToMinutes('19:00')).toBe(1140);
    expect(timeToMinutes('7:05')).toBe(425);
    expect(timeToMinutes('99:99')).toBeNull();
    expect(minutesToTime(1140)).toBe('19:00');
  });

  it('measures deviation from a target', () => {
    expect(clockDeviationMinutes('07:14', '07:00')).toBe(14);
    expect(clockDeviationMinutes('06:52', '07:00')).toBe(-8);
    expect(clockDeviationMinutes(null, '07:00')).toBeNull();
  });

  it('resolves a deviation that wraps past midnight', () => {
    // A 00:20 bedtime against a 23:30 target is 50 minutes late, not 23 hours early.
    expect(clockDeviationMinutes('00:20', '23:30')).toBe(50);
    expect(clockDeviationMinutes('23:10', '00:05')).toBe(-55);
  });

  it('averages clock times across midnight', () => {
    // 23:50 and 00:10 average to midnight, not midday.
    expect(averageClockMinutes(['23:50', '00:10'])).toBe(0);
    expect(averageClockMinutes(['07:00', '07:30'])).toBe(7 * 60 + 15);
  });

  it('ignores missing values rather than treating them as midnight', () => {
    expect(averageClockMinutes(['07:00', null, undefined, '07:20'])).toBe(7 * 60 + 10);
    expect(averageClockMinutes([null, undefined])).toBeNull();
  });

  it('formats deviations with a tolerance', () => {
    expect(formatDeviation(10, 15)).toBe('On target');
    expect(formatDeviation(42, 15)).toBe('+42m');
    expect(formatDeviation(-20, 15)).toBe('−20m');
    expect(formatDeviation(null)).toBe('—');
  });

  it('formats durations and clocks', () => {
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(165)).toBe('2h 45m');
    expect(formatDuration(null)).toBe('—');
    expect(formatClock(65)).toBe('01:05');
    expect(formatClock(3725)).toBe('1:02:05');
    expect(formatTime('19:00', false)).toBe('7:00 PM');
    expect(formatTime('19:00', true)).toBe('19:00');
  });

  it('buckets times into day parts', () => {
    expect(dayPartForTime('08:00')).toBe('morning');
    expect(dayPartForTime('13:00')).toBe('afternoon');
    expect(dayPartForTime('19:00')).toBe('evening');
    expect(dayPartForTime('22:00')).toBe('night');
    expect(dayPartForTime(null)).toBe('anytime');
  });
});
