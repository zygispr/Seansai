import { describe, expect, test } from 'vitest';
import { en } from '../../src/i18n/en.ts';
import { createTranslator } from '../../src/i18n/index.tsx';
import { lt } from '../../src/i18n/lt.ts';

describe('message catalogues', () => {
  test('en has every key of lt, and no others', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(lt).sort());
  });

  test('plural messages have the forms each language needs', () => {
    for (const [key, value] of Object.entries(lt)) {
      if (typeof value === 'string') continue;
      expect(Object.keys(value).sort(), key).toEqual(['few', 'many', 'one', 'other']);
    }
    for (const [key, value] of Object.entries(en)) {
      if (typeof value === 'string') continue;
      expect(Object.keys(value).sort(), key).toEqual(['one', 'other']);
    }
  });
});

describe('createTranslator', () => {
  test.each([
    [1, '1 seansas'],
    [2, '2 seansai'],
    [10, '10 seansų'],
    [21, '21 seansas'],
  ])('Lithuanian plural for %i is "%s"', (count, expected) => {
    expect(createTranslator('lt').plural('screenings.count', count)).toBe(expected);
  });

  test('English plurals', () => {
    const { plural } = createTranslator('en');
    expect(plural('screenings.count', 1)).toBe('1 screening');
    expect(plural('screenings.count', 21)).toBe('21 screenings');
  });

  test('translates and fills in parameters', () => {
    expect(createTranslator('lt').t('layout.updatedAt', { time: '14:05' })).toBe(
      'Atnaujinta 14:05',
    );
    expect(createTranslator('en').t('layout.updatedAt', { time: '14:05' })).toBe('Updated 14:05');
  });

  test('formats times in Lithuanian local time, 24-hour', () => {
    expect(createTranslator('en').formatTime('2026-10-30T19:35:00Z')).toBe('21:35');
    expect(createTranslator('lt').formatTime('2026-10-30T23:05:00+02:00')).toBe('23:05');
  });

  test('formats calendar dates without shifting the day', () => {
    expect(createTranslator('en').formatDate('2026-10-31')).toBe('Saturday 31 October');
    expect(createTranslator('lt').formatDate('2026-10-31')).toMatch(/spalio 31/);
  });
});
