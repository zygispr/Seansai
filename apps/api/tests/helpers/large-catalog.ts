import type { FastifyInstance } from 'fastify';
import { Repository, type ScreeningRecord } from '../../src/db/repository.ts';
import { createLogger } from '../../src/lib/logger.ts';
import { localDateOf } from '../../src/lib/time.ts';
import { cinemaRegistry } from '../../src/registry/cinemas.ts';
import { buildServer } from '../../src/server.ts';
import { NOW } from './catalog.ts';
import { createTempDb, movieRecord, screeningRecord } from './temp-db.ts';

/** About two weeks of schedules for every supported cinema: the size plan.md budgets for. */
export const SCREENING_COUNT = 7000;
const MOVIE_COUNT = 100;
const DAYS = 14;
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
/** 10:00 in Vilnius on the first day; screenings start between 10:00 and midnight. */
const FIRST_DAY_10AM = Date.UTC(2026, 9, 30, 8, 0);

export const largeMovieIds = Array.from(
  { length: MOVIE_COUNT },
  (_, index) => `movie-${String(index)}-2026`,
);

/** Fills the database with SCREENING_COUNT screenings of MOVIE_COUNT movies, deterministically. */
export async function seedLargeCatalog(repo: Repository): Promise<void> {
  for (const [index, id] of largeMovieIds.entries()) {
    await repo.upsertMovie(
      movieRecord({ id, title: `Filmas ${String(index)}`, matchKey: `filmas ${String(index)}` }),
    );
  }
  const cinemas = cinemaRegistry.all();
  const bySource = new Map<string, ScreeningRecord[]>();
  for (let n = 0; n < SCREENING_COUNT; n++) {
    const cinema = cinemas[(n * 7) % cinemas.length];
    const movieId = largeMovieIds[n % MOVIE_COUNT];
    if (!cinema || !movieId) throw new Error('unreachable');
    const day = Math.floor((n * DAYS) / SCREENING_COUNT);
    const startsAt = new Date(FIRST_DAY_10AM + day * DAY_MS + ((n * 37) % (14 * 60)) * MINUTE_MS);
    const screening = screeningRecord({
      id: `${cinema.sourceId}:${String(n)}`,
      sourceId: cinema.sourceId,
      movieId,
      cinemaId: cinema.id,
      startsAt,
      localDate: localDateOf(startsAt),
    });
    bySource.set(cinema.sourceId, [...(bySource.get(cinema.sourceId) ?? []), screening]);
  }
  for (const [sourceId, screenings] of bySource) {
    await repo.replaceSourceScreenings(sourceId, new Date(0), screenings);
    await repo.recordSourceSuccess(sourceId, NOW);
  }
}

/** A server over the large catalog; logs only warnings, so long runs do not fill memory. */
export async function startLargeCatalogServer(): Promise<{
  app: FastifyInstance;
  close: () => Promise<void>;
}> {
  const temp = await createTempDb();
  await seedLargeCatalog(new Repository(temp.db));
  const app = buildServer({
    db: temp.db,
    now: () => NOW,
    logger: createLogger({ pretty: false, level: 'warn' }),
  });
  return {
    app,
    close: async () => {
      await app.close();
      temp.cleanup();
    },
  };
}
