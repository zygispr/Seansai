import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { Db } from '../../src/db/index.ts';
import { Repository } from '../../src/db/repository.ts';
import { loadAliases } from '../../src/matching/match.ts';
import { titleKeysOf } from '../../src/matching/normalize.ts';
import { refreshSource } from '../../src/refresh/refresh-source.ts';
import { cinemaRegistry } from '../../src/registry/cinemas.ts';
import {
  FixtureHttpClient,
  readCaptureInstant,
  readFixtureNow,
} from '../../src/sources/fixture-http.ts';
import { adapters } from '../../src/sources/index.ts';
import { createTempDb } from '../helpers/temp-db.ts';
import { createTestLogger } from '../helpers/test-logger.ts';

/**
 * The same movie must not appear twice (FR-005, SC-004): every source's saved data is refreshed
 * into one database, in both orders, and films that several cinemas show become one movie each.
 */
async function refreshAll(order: 'forward' | 'reverse'): Promise<{ db: Db; cleanup: () => void }> {
  const temp = createTempDb();
  const repo = new Repository(temp.db);
  const now = readFixtureNow() ?? new Date();
  for (const adapter of order === 'forward' ? adapters : [...adapters].reverse()) {
    await refreshSource(adapter, {
      repo,
      registry: cinemaRegistry,
      http: new FixtureHttpClient({ sourceId: adapter.id, failingSources: [] }),
      now,
      sourceNow: readCaptureInstant(adapter.id) ?? now,
      // The maintainer's merge decisions apply, as in production.
      aliases: loadAliases(),
      logger: createTestLogger().logger,
      disabledSources: [],
    });
  }
  return temp;
}

const SHOWN = 'EXISTS (SELECT 1 FROM screenings WHERE screenings.movie_id = movie_keys.movie_id)';

/** Shown movies known by this title (in any language), with their English titles. */
function moviesKnownAs(db: Db, title: string) {
  const [key] = titleKeysOf({ title, originalTitle: null, englishTitle: null });
  return db
    .prepare(
      `SELECT movies.id, movies.english_title AS englishTitle FROM movie_keys
       JOIN movies ON movies.id = movie_keys.movie_id
       WHERE key = ? AND ${SHOWN}`,
    )
    .all(key) as Array<{ id: string; englishTitle: string | null }>;
}

describe.each(['forward', 'reverse'] as const)('all fixtures, refreshed %s', (order) => {
  let db: Db;
  let cleanup: () => void;

  beforeAll(async () => {
    ({ db, cleanup } = await refreshAll(order));
  });

  afterAll(() => {
    cleanup();
  });

  test('no two shown movies share a title', () => {
    const shared = db
      .prepare(
        `SELECT key, group_concat(movie_id, ', ') AS movies FROM movie_keys
         WHERE ${SHOWN} GROUP BY key HAVING count(*) > 1`,
      )
      .all();

    expect(shared).toEqual([]);
    expect(db.prepare('SELECT count(DISTINCT movie_id) AS movies FROM screenings').get()).toEqual({
      movies: 230,
    });
  });

  test.each([
    // Apollo's English title vs the Lithuanian original at Vue, Cinamon and the Fliko sites.
    ['Instruktorius', /^Instructor$/],
    // "Uprising" (Apollo), "The Uprising" (Cinamon, Pasaka, Vue) and "Sukilimas" (Romuva).
    ['Sukilimas', /Uprising$/],
    // Pasaka's original title is French; Apollo's is English.
    ['Mergaitė ir stebuklinga plunksna', /^Girl In The Clouds$/],
    // Vue spells the English title differently; the Lithuanian title is the same.
    ['Aviukas Šonas ir baimės pilnos kelnės', /^Shaun the Sheep: The Beast of Mossy Bottom$/],
    // Vue lists running times without ads, 11–13 minutes shorter than Apollo's.
    ['Forgotten Island', /^Forgotten Island$/],
    // Romuva publishes only the Lithuanian title.
    ['Kita mamytė', /^Other Mommy$/],
    // Forum's "Odisėja" and the same film at other cinemas.
    ['Odisėja', /^The Odyssey$/],
  ])('"%s" is one movie, under its English title', (title, englishTitle) => {
    const movies = moviesKnownAs(db, title);

    expect(movies).toHaveLength(1);
    expect(movies[0]?.englishTitle).toMatch(englishTitle);
  });

  test.each(['Aukso amžius', 'Rozė', 'Paukščių šneka', 'Zeitūno melodija'])(
    'Scanorama film "%s" is one movie at every cinema that shows it',
    (title) => {
      expect(moviesKnownAs(db, title)).toHaveLength(1);
    },
  );
});
