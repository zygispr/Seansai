import { describe, expect, test } from 'vitest';
import { cinemaRegistry } from '../../src/registry/cinemas.ts';
import { checkSource, formatReport } from '../../src/sources/check.ts';
import { FixtureHttpClient } from '../../src/sources/fixture-http.ts';
import type { SourceAdapter, SourceScreening } from '../../src/sources/types.ts';

/** 12:00 on Friday 30 October 2026 in Vilnius. */
const NOW = new Date('2026-10-30T10:00:00Z');
const WEEK = [
  '2026-10-30',
  '2026-10-31',
  '2026-11-01',
  '2026-11-02',
  '2026-11-03',
  '2026-11-04',
  '2026-11-05',
];

function screening(day: string, overrides: Partial<SourceScreening> = {}): SourceScreening {
  return {
    sourceScreeningId: `${day}-${overrides.cinemaId ?? 'apollo-akropolis'}`,
    cinemaId: 'apollo-akropolis',
    startsAt: new Date(`${day}T17:00:00Z`),
    title: 'Kasėjas',
    originalTitle: null,
    englishTitle: null,
    year: null,
    durationMinutes: null,
    ageRating: null,
    genres: [],
    posterUrl: null,
    hall: null,
    format: null,
    spokenLanguage: null,
    subtitleLanguage: null,
    isDubbed: null,
    ticketUrl: 'https://www.apollokinas.lt/websales/show/1',
    ...overrides,
  };
}

function adapter(
  screenings: unknown[] | Error,
  options: Partial<SourceAdapter> = {},
): SourceAdapter {
  return {
    id: 'apollo',
    fetchScreenings: () =>
      screenings instanceof Error
        ? Promise.reject(screenings)
        : Promise.resolve({ screenings: screenings as SourceScreening[], skipped: [] }),
    ...options,
  };
}

const run = (source: SourceAdapter, robotsOverride = false) =>
  checkSource(source, {
    now: NOW,
    http: new FixtureHttpClient({ sourceId: source.id, failingSources: [] }),
    registry: cinemaRegistry,
    robotsOverride,
  });

describe('checkSource', () => {
  test('counts screenings per cinema for today and the next 6 days', async () => {
    const report = await run(
      adapter([
        ...WEEK.map((day) => screening(day)),
        screening('2026-10-30', { sourceScreeningId: 'x', cinemaId: 'apollo-outlet' }),
        screening('2026-11-20'), // beyond the week: not counted
      ]),
    );

    expect(report.days).toEqual(WEEK);
    expect(report.countsByCinema).toEqual({
      'apollo-akropolis': [1, 1, 1, 1, 1, 1, 1],
      'apollo-outlet': [1, 0, 0, 0, 0, 0, 0],
    });
    expect(report.problems).toEqual([]);
  });

  test('a day without any screenings at the source is a problem', async () => {
    const report = await run(
      adapter(WEEK.filter((day) => day !== '2026-11-02').map((day) => screening(day))),
    );

    expect(report.problems).toEqual(['no screenings on 2026-11-02']);
  });

  test('a declared today-only limitation needs only today, and is reported', async () => {
    const report = await run(adapter([screening('2026-10-30')], { limitations: ['today-only'] }));

    expect(report.problems).toEqual([]);
    expect(report.limitations).toEqual(['today-only']);
  });

  test('items that break the SourceScreening contract are counted as problems', async () => {
    const report = await run(
      adapter([
        ...WEEK.map((day) => screening(day)),
        { ...screening('2026-10-30'), ticketUrl: 'nope' },
      ]),
    );

    expect(report.invalid).toBe(1);
    expect(report.problems).toEqual(['1 screening(s) fail validation']);
  });

  test('a failing fetch is reported, not thrown', async () => {
    const report = await run(adapter(new Error('HTTP 403 from www.apollokinas.lt')));

    expect(report.error).toBe('HTTP 403 from www.apollokinas.lt');
    expect(report.problems).toEqual(['fetch failed: HTTP 403 from www.apollokinas.lt']);
  });
});

test('formatReport prints counts, overrides, limitations and problems', async () => {
  const ok = await run(adapter(WEEK.map((day) => screening(day))), true);
  const limited = await run(
    adapter([screening('2026-10-30')], { id: 'cinamon', limitations: ['today-only'] }),
  );
  const broken = await run(adapter(new Error('timeout'), { id: 'romuva' }));

  const text = formatReport([ok, limited, broken]);

  expect(text).toContain('apollo-akropolis');
  expect(text).toContain('robots.txt override');
  expect(text).toContain('limitation: today-only');
  expect(text).toContain('FAIL romuva: fetch failed: timeout');
  expect(text).toMatch(/2 of 3 sources OK|1 of 3 sources failed/);
});
