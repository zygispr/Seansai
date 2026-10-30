import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { Db } from '../../src/db/index.ts';
import { Repository } from '../../src/db/repository.ts';
import { createTempDb, movieRecord, screeningRecord } from '../helpers/temp-db.ts';

const NOW = new Date('2026-10-30T10:00:00Z');

let db: Db;
let repo: Repository;
let cleanup: () => void;

beforeEach(() => {
  ({ db, cleanup } = createTempDb());
  repo = new Repository(db);
  repo.upsertMovie(movieRecord());
});

afterEach(() => {
  cleanup();
});

const screeningIds = (): string[] =>
  (db.prepare('SELECT id FROM screenings ORDER BY id').all() as Array<{ id: string }>).map(
    (row) => row.id,
  );

describe('replaceSourceScreenings', () => {
  test("replaces only that source's future screenings, so cancelled screenings disappear", () => {
    repo.replaceSourceScreenings('apollo', NOW, [
      screeningRecord({ id: 'apollo:started', startsAt: new Date('2026-10-30T09:00:00Z') }),
      screeningRecord({ id: 'apollo:cancelled', startsAt: new Date('2026-10-30T15:00:00Z') }),
      screeningRecord({ id: 'apollo:kept', startsAt: new Date('2026-10-30T18:00:00Z') }),
    ]);
    repo.replaceSourceScreenings('forum', NOW, [
      screeningRecord({ id: 'forum:1', sourceId: 'forum', cinemaId: 'forum-vingis' }),
    ]);

    repo.replaceSourceScreenings('apollo', NOW, [
      screeningRecord({ id: 'apollo:kept', startsAt: new Date('2026-10-30T18:00:00Z') }),
      screeningRecord({ id: 'apollo:new', startsAt: new Date('2026-10-31T18:00:00Z') }),
    ]);

    // The screening that already started stays until the daily cleanup removes past dates.
    expect(screeningIds()).toEqual(['apollo:kept', 'apollo:new', 'apollo:started', 'forum:1']);
  });

  test('updates a screening that is published again with new details', () => {
    repo.replaceSourceScreenings('apollo', NOW, [screeningRecord({ hall: '6 salė' })]);
    repo.replaceSourceScreenings('apollo', NOW, [screeningRecord({ hall: '7 salė' })]);

    expect(db.prepare('SELECT hall FROM screenings').all()).toEqual([{ hall: '7 salė' }]);
  });

  test('applies all or nothing: a failing row leaves the previous data in place', () => {
    repo.replaceSourceScreenings('apollo', NOW, [screeningRecord({ id: 'apollo:old' })]);

    expect(() => {
      repo.replaceSourceScreenings('apollo', NOW, [
        screeningRecord({ id: 'apollo:fine' }),
        screeningRecord({ id: 'apollo:orphan', movieId: 'no-such-movie' }),
      ]);
    }).toThrow();

    expect(screeningIds()).toEqual(['apollo:old']);
  });

  test("records each movie's latest screening start", () => {
    repo.replaceSourceScreenings('apollo', NOW, [
      screeningRecord({ id: 'apollo:1', startsAt: new Date('2026-11-02T18:00:00Z') }),
      screeningRecord({ id: 'apollo:2', startsAt: new Date('2026-11-01T18:00:00Z') }),
    ]);

    expect(db.prepare('SELECT last_screening_at AS at FROM movies').get()).toEqual({
      at: '2026-11-02T18:00:00.000Z',
    });
  });
});

describe('deletePastScreenings', () => {
  test('removes screenings whose calendar date is before today', () => {
    repo.replaceSourceScreenings('apollo', new Date('2026-10-28T00:00:00Z'), [
      screeningRecord({ id: 'apollo:yesterday', localDate: '2026-10-29' }),
      screeningRecord({ id: 'apollo:today', localDate: '2026-10-30' }),
      screeningRecord({ id: 'apollo:tomorrow', localDate: '2026-10-31' }),
    ]);

    expect(repo.deletePastScreenings('2026-10-30')).toBe(1);
    expect(screeningIds()).toEqual(['apollo:today', 'apollo:tomorrow']);
  });
});

describe('deleteStaleMovies', () => {
  const movieIds = () =>
    (db.prepare('SELECT id FROM movies ORDER BY id').all() as Array<{ id: string }>).map(
      (row) => row.id,
    );
  const setLastScreening = (id: string, at: string) =>
    db.prepare('UPDATE movies SET last_screening_at = ? WHERE id = ?').run(at, id);

  test('deletes movies after 30 days without screenings', () => {
    repo.upsertMovie(movieRecord({ id: 'old-2025', matchKey: 'old', year: 2025 }));
    repo.upsertMovie(movieRecord({ id: 'recent-2026', matchKey: 'recent' }));
    setLastScreening('old-2025', '2026-09-29T18:00:00.000Z');
    setLastScreening('recent-2026', '2026-10-01T18:00:00.000Z');
    // digger-2026 still has a screening, however old its last_screening_at says it is.
    repo.replaceSourceScreenings('apollo', new Date('2026-09-01T00:00:00Z'), [screeningRecord()]);
    setLastScreening('digger-2026', '2026-09-01T18:00:00.000Z');

    expect(repo.deleteStaleMovies(NOW)).toBe(1);
    expect(movieIds()).toEqual(['digger-2026', 'recent-2026']);
  });

  test('also removes the match reviews of a deleted movie', () => {
    repo.upsertMovie(movieRecord({ id: 'dune-1984', matchKey: 'dune', year: 1984 }));
    repo.upsertMovie(movieRecord({ id: 'dune-2021', matchKey: 'dune', year: 2021 }));
    repo.insertMatchReview({
      matchKey: 'dune',
      movieIdA: 'dune-1984',
      movieIdB: 'dune-2021',
      reason: 'year 1984 vs 2021',
      firstSeenAt: NOW,
    });

    repo.deleteStaleMovies(NOW);

    expect(db.prepare('SELECT COUNT(*) AS count FROM match_reviews').get()).toEqual({ count: 0 });
  });
});

describe('upsertMovie', () => {
  test('keeps the first title and fills in details that were missing', () => {
    repo.upsertMovie(
      movieRecord({ id: 'kopa', matchKey: 'kopa', year: null, posterUrl: null, genres: [] }),
    );
    repo.upsertMovie(
      movieRecord({
        id: 'kopa',
        matchKey: 'kopa',
        year: null,
        title: 'KOPA (LT sub.)',
        posterUrl: 'https://cinema.lt/kopa.jpg',
        genres: ['sci-fi'],
      }),
    );

    expect(repo.getMovie('kopa')).toMatchObject({
      title: 'Kasėjas',
      posterUrl: 'https://cinema.lt/kopa.jpg',
      genres: ['sci-fi'],
    });
  });
});

describe('sources', () => {
  test('records attempts and successes', () => {
    repo.recordSourceAttempt('forum', NOW, 'Request to https://forum failed: HTTP 500');
    expect(repo.getSource('forum')).toEqual({
      id: 'forum',
      lastAttemptAt: NOW,
      lastSuccessAt: null,
      lastError: 'Request to https://forum failed: HTTP 500',
    });

    const later = new Date('2026-10-30T11:00:00Z');
    repo.recordSourceSuccess('forum', later);
    expect(repo.getSource('forum')).toEqual({
      id: 'forum',
      lastAttemptAt: later,
      lastSuccessAt: later,
      lastError: null,
    });

    const failedAgain = new Date('2026-10-30T12:00:00Z');
    repo.recordSourceAttempt('forum', failedAgain, 'timeout');
    expect(repo.getSource('forum')).toMatchObject({ lastSuccessAt: later, lastError: 'timeout' });
    expect(repo.listSources().map((source) => source.id)).toEqual(['forum']);
  });
});

describe('insertMatchReview', () => {
  test('logs each pair once', () => {
    repo.upsertMovie(movieRecord({ id: 'dune-1984', matchKey: 'dune', year: 1984 }));
    repo.upsertMovie(movieRecord({ id: 'dune-2021', matchKey: 'dune', year: 2021 }));
    const review = {
      matchKey: 'dune',
      movieIdA: 'dune-1984',
      movieIdB: 'dune-2021',
      reason: 'year 1984 vs 2021',
      firstSeenAt: NOW,
    };

    expect(repo.insertMatchReview(review)).toBe(true);
    expect(repo.insertMatchReview({ ...review, firstSeenAt: new Date() })).toBe(false);
  });
});
