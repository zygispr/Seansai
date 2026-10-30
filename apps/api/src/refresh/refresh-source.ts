import { z } from 'zod';
import type { MovieIdentity, Repository, ScreeningRecord } from '../db/repository.ts';
import type { Logger } from '../lib/logger.ts';
import type { HttpClient } from '../lib/polite-http.ts';
import { localDateOf } from '../lib/time.ts';
import { resolveMovie, type Alias, type MatchReview } from '../matching/match.ts';
import type { CinemaRegistry } from '../registry/cinemas.ts';
import {
  SourceScreeningSchema,
  type SourceAdapter,
  type SourceScreening,
} from '../sources/types.ts';

export type RefreshContext = {
  repo: Repository;
  registry: CinemaRegistry;
  http: HttpClient;
  now: Date;
  aliases: readonly Alias[];
  logger: Logger;
  /** Kill switch (DISABLED_SOURCES): these sources are not refreshed at all. */
  disabledSources: readonly string[];
};

export type RefreshOutcome =
  | { status: 'success'; stored: number; skipped: number; newReviews: number }
  | { status: 'failed'; error: string }
  | { status: 'disabled' };

const ResultSchema = z.array(SourceScreeningSchema);

/** Thrown when an adapter's output does not match the SourceScreening contract. */
class InvalidAdapterOutputError extends Error {
  override readonly name = 'InvalidAdapterOutputError';
}

function validateScreenings(screenings: unknown): SourceScreening[] {
  const result = ResultSchema.safeParse(screenings);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const [index, ...field] = issue?.path ?? [];
  throw new InvalidAdapterOutputError(
    `Invalid adapter output at screenings[${String(index)}].${field.join('.')}: ${issue?.message ?? 'invalid'}`,
  );
}

/**
 * One refresh of one source: run the adapter, validate its output, match each listing to a movie
 * and replace the source's future screenings. Any failure keeps the source's previous data and is
 * recorded, so the UI can flag the cinema once its data gets old (FR-015).
 */
export async function refreshSource(
  adapter: SourceAdapter,
  ctx: RefreshContext,
): Promise<RefreshOutcome> {
  const { repo, registry, now, logger } = ctx;
  const source = adapter.id;
  if (ctx.disabledSources.includes(source)) {
    logger.info({ source }, 'Source disabled by DISABLED_SOURCES; not refreshed');
    return { status: 'disabled' };
  }

  try {
    ctx.http.beginCycle();
    const result = await adapter.fetchScreenings({ now, http: ctx.http, registry });
    const screenings = validateScreenings(result.screenings);

    const known = screenings.filter((screening) => registry.get(screening.cinemaId) !== undefined);
    for (const screening of screenings) {
      if (registry.get(screening.cinemaId) === undefined) {
        logger.warn(
          { source, cinemaId: screening.cinemaId, title: screening.title },
          'Dropped a screening at a cinema missing from the registry',
        );
      }
    }
    for (const item of result.skipped) {
      logger.debug({ source, reason: item.reason, raw: item.raw }, 'Adapter skipped an item');
    }

    const newReviews = repo.transaction(() => {
      const reviews = storeScreenings(source, known, ctx);
      const inserted = reviews.filter((review) =>
        repo.insertMatchReview({ ...review, firstSeenAt: now }),
      );
      repo.recordSourceSuccess(source, now);
      return inserted.length;
    });

    const outcome = {
      status: 'success' as const,
      stored: known.length,
      skipped: result.skipped.length + (screenings.length - known.length),
      newReviews,
    };
    logger.info({ source, ...outcome }, 'Source refreshed');
    return outcome;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    repo.recordSourceAttempt(source, now, message);
    logger.error({ source, err: error }, 'Source refresh failed; previous data kept');
    return { status: 'failed', error: message };
  }
}

/** Matches each screening to a movie and writes them; returns the uncertain matches found. */
function storeScreenings(
  source: string,
  screenings: readonly SourceScreening[],
  ctx: RefreshContext,
): MatchReview[] {
  const { repo, now, aliases } = ctx;
  const movies: MovieIdentity[] = repo.listMovieIdentities();
  const reviews: MatchReview[] = [];
  const records: ScreeningRecord[] = screenings.map((screening) => {
    const resolution = resolveMovie(screening, movies, aliases);
    const { movie } = resolution;
    repo.upsertMovie(movie);
    if (!movies.some((existing) => existing.id === movie.id)) movies.push(movie);
    reviews.push(...resolution.reviews);
    return {
      id: `${source}:${screening.sourceScreeningId}`,
      sourceId: source,
      movieId: movie.id,
      cinemaId: screening.cinemaId,
      startsAt: screening.startsAt,
      localDate: localDateOf(screening.startsAt),
      hall: screening.hall,
      format: screening.format,
      spokenLanguage: screening.spokenLanguage,
      subtitleLanguage: screening.subtitleLanguage,
      isDubbed: screening.isDubbed,
      ticketUrl: screening.ticketUrl,
      sourceTitle: screening.title,
      refreshedAt: now,
    };
  });
  repo.replaceSourceScreenings(source, now, records);
  return reviews;
}
