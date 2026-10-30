import { describe, expect, test } from 'vitest';
import {
  addDays,
  formatInstant,
  instantFromLocal,
  localDateOf,
  todayIn,
} from '../../src/lib/time.ts';

describe('localDateOf', () => {
  test('23:30 local time stays on the same calendar date', () => {
    // 21:30 UTC = 23:30 in Vilnius (EET, UTC+2)
    expect(localDateOf(new Date('2026-10-30T21:30:00Z'))).toBe('2026-10-30');
  });

  test('a screening starting after midnight belongs to the calendar date it starts on', () => {
    // 22:30 UTC = 00:30 on the next day in Vilnius
    expect(localDateOf(new Date('2026-10-30T22:30:00Z'))).toBe('2026-10-31');
  });

  test('uses summer time (UTC+3) before the DST change', () => {
    // 21:30 UTC = 00:30 on 2026-07-02 in Vilnius (EEST, UTC+3)
    expect(localDateOf(new Date('2026-07-01T21:30:00Z'))).toBe('2026-07-02');
  });
});

describe('instantFromLocal', () => {
  test('after the DST change on 2026-10-25, Vilnius is UTC+2', () => {
    expect(instantFromLocal('2026-10-30', '13:30').toISOString()).toBe('2026-10-30T11:30:00.000Z');
  });

  test('before the DST change, Vilnius is UTC+3', () => {
    expect(instantFromLocal('2026-10-24', '13:30').toISOString()).toBe('2026-10-24T10:30:00.000Z');
  });

  test('on the day of the change, a time after 04:00 uses the winter offset', () => {
    expect(instantFromLocal('2026-10-25', '12:00').toISOString()).toBe('2026-10-25T10:00:00.000Z');
  });

  test('accepts seconds', () => {
    expect(instantFromLocal('2026-10-30', '13:30:15').toISOString()).toBe(
      '2026-10-30T11:30:15.000Z',
    );
  });

  test('round-trips with localDateOf just after midnight', () => {
    const instant = instantFromLocal('2026-10-31', '00:30');
    expect(instant.toISOString()).toBe('2026-10-30T22:30:00.000Z');
    expect(localDateOf(instant)).toBe('2026-10-31');
  });

  test('rejects malformed input', () => {
    expect(() => instantFromLocal('30.10.2026', '13:30')).toThrow(RangeError);
    expect(() => instantFromLocal('2026-10-30', '25:00')).toThrow(RangeError);
  });
});

describe('todayIn', () => {
  test('returns the Vilnius calendar date of the given instant', () => {
    expect(todayIn(new Date('2026-10-30T10:00:00Z'))).toBe('2026-10-30');
    expect(todayIn(new Date('2026-10-30T22:15:00Z'))).toBe('2026-10-31');
  });
});

describe('addDays', () => {
  test('adds calendar days across month ends', () => {
    expect(addDays('2026-10-30', 14)).toBe('2026-11-13');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31');
  });
});

describe('formatInstant', () => {
  test('formats with the Vilnius offset', () => {
    expect(formatInstant(new Date('2026-10-30T19:35:00Z'))).toBe('2026-10-30T21:35:00+02:00');
    expect(formatInstant(new Date('2026-07-01T10:00:00Z'))).toBe('2026-07-01T13:00:00+03:00');
  });
});
