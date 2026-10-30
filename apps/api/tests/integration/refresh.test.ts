import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Db } from '../../src/db/index.ts';
import { Repository } from '../../src/db/repository.ts';
import { cinemaRegistry } from '../../src/registry/cinemas.ts';
import { refreshSource, type RefreshContext } from '../../src/refresh/refresh-source.ts';
import { FixtureHttpClient } from '../../src/sources/fixture-http.ts';
import type { AdapterResult, SourceAdapter, SourceScreening } from '../../src/sources/types.ts';
import { createTempDb } from '../helpers/temp-db.ts';
import { createTestLogger } from '../helpers/test-logger.ts';

const NOW = new Date('2026-10-30T10:00:00Z');
const LATER = new Date('2026-10-30T11:00:00Z');

function screening(overrides: Partial<SourceScreening> = {}): SourceScreening {
  return {
    sourceScreeningId: '1',
    cinemaId: 'apollo-akropolis',
    startsAt: new Date('2026-10-30T17:00:00Z'),
    title: 'Kasėjas',
    originalTitle: 'Digger',
    year: 2026,
    durationMinutes: 101,
    ageRating: 'N13',
    genres: ['drama'],
    posterUrl: 'https://www.apollokinas.lt/posters/digger.jpg',
    hall: '6 salė',
    format: '2D',
    spokenLanguage: 'en',
    subtitleLanguage: 'lt',
    isDubbed: false,
    ticketUrl: 'https://www.apollokinas.lt/websales/show/1',
    ...overrides,
  };
}

function stubAdapter(result: AdapterResult | (() => Promise<AdapterResult>)) {
  const fetchScreenings = vi.fn(
    typeof result === 'function' ? result : () => Promise.resolve(result),
  );
  const adapter: SourceAdapter = { id: 'apollo', fetchScreenings };
  return Object.assign(adapter, { fetchScreeningsMock: fetchScreenings });
}

let db: Db;
let repo: Repository;
let cleanup: () => void;
let log: ReturnType<typeof createTestLogger>;

function context(overrides: Partial<RefreshContext> = {}): RefreshContext {
  return {
    repo,
    registry: cinemaRegistry,
    http: new FixtureHttpClient({ sourceId: 'apollo', failingSources: [] }),
    now: NOW,
    aliases: [],
    logger: log.logger,
    disabledSources: [],
    ...overrides,
  };
}

const storedScreenings = () =>
  db.prepare('SELECT id, movie_id, cinema_id, local_date FROM screenings ORDER BY id').all();

beforeEach(() => {
  ({ db, cleanup } = createTempDb());
  repo = new Repository(db);
  log = createTestLogger();
});

afterEach(() => {
  cleanup();
});

describe('refreshSource', () => {
  test('stores a valid result, merging listings of the same movie, and marks success', async () => {
    const adapter = stubAdapter({
      screenings: [
        screening({ sourceScreeningId: '1' }),
        screening({
          sourceScreeningId: '2',
          cinemaId: 'apollo-outlet',
          title: 'KASĖJAS (LT sub.)',
          // 00:30 local time on 31 October: belongs to the date it starts on.
          startsAt: new Date('2026-10-30T22:30:00Z'),
        }),
      ],
      skipped: [{ reason: 'no start time', raw: '{"id":3}' }],
    });

    const outcome = await refreshSource(adapter, context());

    expect(outcome).toEqual({ status: 'success', stored: 2, skipped: 1, newReviews: 0 });
    expect(storedScreenings()).toEqual([
      {
        id: 'apollo:1',
        movie_id: 'digger-2026',
        cinema_id: 'apollo-akropolis',
        local_date: '2026-10-30',
      },
      {
        id: 'apollo:2',
        movie_id: 'digger-2026',
        cinema_id: 'apollo-outlet',
        local_date: '2026-10-31',
      },
    ]);
    expect(repo.getSource('apollo')).toMatchObject({ lastSuccessAt: NOW, lastError: null });
    expect(log.lines()).toContainEqual(
      expect.objectContaining({ source: 'apollo', stored: 2, skipped: 1, newReviews: 0 }),
    );
  });

  test('passes the clock, HTTP client and registry to the adapter', async () => {
    const adapter = stubAdapter({ screenings: [], skipped: [] });
    const ctx = context();

    await refreshSource(adapter, ctx);

    expect(adapter.fetchScreeningsMock).toHaveBeenCalledWith({
      now: NOW,
      http: ctx.http,
      registry: ctx.registry,
    });
  });

  test('a result failing SourceScreeningSchema keeps the previous data and records the error', async () => {
    await refreshSource(stubAdapter({ screenings: [screening()], skipped: [] }), context());

    const outcome = await refreshSource(
      stubAdapter({
        screenings: [screening({ sourceScreeningId: '2', ticketUrl: 'javascript:alert(1)' })],
        skipped: [],
      }),
      context({ now: LATER }),
    );

    expect(outcome).toMatchObject({ status: 'failed' });
    expect(storedScreenings()).toEqual([expect.objectContaining({ id: 'apollo:1' })]);
    expect(repo.getSource('apollo')).toMatchObject({
      lastAttemptAt: LATER,
      lastSuccessAt: NOW,
      lastError: expect.stringContaining('ticketUrl') as unknown,
    });
  });

  test('a thrown error keeps the previous data and records the error', async () => {
    await refreshSource(stubAdapter({ screenings: [screening()], skipped: [] }), context());

    const outcome = await refreshSource(
      stubAdapter(() => Promise.reject(new Error('Blocked by www.apollokinas.lt: HTTP 403'))),
      context({ now: LATER }),
    );

    expect(outcome).toEqual({ status: 'failed', error: 'Blocked by www.apollokinas.lt: HTTP 403' });
    expect(storedScreenings()).toHaveLength(1);
    expect(repo.getSource('apollo')).toMatchObject({
      lastSuccessAt: NOW,
      lastError: 'Blocked by www.apollokinas.lt: HTTP 403',
    });
    expect(log.lines()).toContainEqual(expect.objectContaining({ source: 'apollo', level: 50 }));
  });

  test('drops and logs screenings whose cinema is not in the registry', async () => {
    const outcome = await refreshSource(
      stubAdapter({
        screenings: [
          screening(),
          screening({ sourceScreeningId: '2', cinemaId: 'apollo-new-mall' }),
        ],
        skipped: [],
      }),
      context(),
    );

    expect(outcome).toMatchObject({ status: 'success', stored: 1, skipped: 1 });
    expect(storedScreenings()).toEqual([expect.objectContaining({ id: 'apollo:1' })]);
    expect(log.lines()).toContainEqual(
      expect.objectContaining({ source: 'apollo', cinemaId: 'apollo-new-mall', level: 40 }),
    );
  });

  test('logs uncertain matches for review and counts the new ones', async () => {
    const dune = (id: string, year: number) =>
      screening({ sourceScreeningId: id, title: 'Kopa', originalTitle: 'Dune', year });
    const adapter = stubAdapter({ screenings: [dune('1', 1984), dune('2', 2021)], skipped: [] });

    expect(await refreshSource(adapter, context())).toMatchObject({ newReviews: 1 });
    expect(await refreshSource(adapter, context({ now: LATER }))).toMatchObject({ newReviews: 0 });

    expect(db.prepare('SELECT movie_id_a, movie_id_b, reason FROM match_reviews').all()).toEqual([
      { movie_id_a: 'dune-1984', movie_id_b: 'dune-2021', reason: 'year 1984 vs 2021' },
    ]);
  });

  test('skips a source listed in DISABLED_SOURCES', async () => {
    const adapter = stubAdapter({ screenings: [screening()], skipped: [] });

    const outcome = await refreshSource(adapter, context({ disabledSources: ['vue', 'apollo'] }));

    expect(outcome).toEqual({ status: 'disabled' });
    expect(adapter.fetchScreeningsMock).not.toHaveBeenCalled();
    expect(repo.getSource('apollo')).toBeUndefined();
  });
});
