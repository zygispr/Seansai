import type { InStatement } from '@libsql/client';
import type { ScreeningFormat } from '@seansai/shared';
import type { Db } from './index.ts';

const MOVIE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export type MovieRecord = {
  id: string;
  title: string;
  originalTitle: string | null;
  /** Known only from some sources (Apollo, Cinamon); shown under the Lithuanian title. */
  englishTitle: string | null;
  matchKey: string;
  year: number | null;
  durationMinutes: number | null;
  ageRating: string | null;
  genres: string[];
  posterUrl: string | null;
};

/**
 * What movie matching needs to know about existing movies. `durationMinutes` is the first running
 * time known, not the one shown: that one moves, and a listing could fall out of range of it.
 */
export type MovieIdentity = Pick<MovieRecord, 'id' | 'matchKey' | 'year' | 'durationMinutes'> & {
  /** Every normalised title the movie is known by. */
  keys: string[];
};

export type ScreeningRecord = {
  /** `{sourceId}:{sourceScreeningId}` */
  id: string;
  sourceId: string;
  movieId: string;
  cinemaId: string;
  startsAt: Date;
  /** Calendar date of `startsAt` in Europe/Vilnius. */
  localDate: string;
  /** As this cinema lists it; cinemas disagree, so the movie shows the most common one. */
  durationMinutes: number | null;
  hall: string | null;
  format: ScreeningFormat | null;
  spokenLanguage: string | null;
  subtitleLanguage: string | null;
  isDubbed: boolean | null;
  ticketUrl: string;
  sourceTitle: string;
  refreshedAt: Date;
};

export type SourceRecord = {
  id: string;
  lastAttemptAt: Date | null;
  lastSuccessAt: Date | null;
  lastError: string | null;
};

export type MatchReviewRecord = {
  matchKey: string;
  movieIdA: string;
  movieIdB: string;
  reason: string;
  firstSeenAt: Date;
};

/** Everything one successful refresh of one source writes (data-model.md "Write rules"). */
export type SourceRefresh = {
  sourceId: string;
  now: Date;
  /** In listing order, so the first listing's title wins and later ones fill gaps. */
  movies: Array<{ movie: MovieRecord; keys: readonly string[] }>;
  screenings: ScreeningRecord[];
  reviews: Array<Omit<MatchReviewRecord, 'firstSeenAt'>>;
};

export type MovieRow = {
  id: string;
  title: string;
  original_title: string | null;
  english_title: string | null;
  match_key: string;
  year: number | null;
  duration_minutes: number | null;
  age_rating: string | null;
  genres: string;
  poster_url: string | null;
};

type SourceRow = {
  id: string;
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
};

const toDate = (value: string | null): Date | null => (value === null ? null : new Date(value));

export const toMovieRecord = (row: MovieRow): MovieRecord => ({
  id: row.id,
  title: row.title,
  originalTitle: row.original_title,
  englishTitle: row.english_title,
  matchKey: row.match_key,
  year: row.year,
  durationMinutes: row.duration_minutes,
  ageRating: row.age_rating,
  genres: JSON.parse(row.genres) as string[],
  posterUrl: row.poster_url,
});

const toSourceRecord = (row: SourceRow): SourceRecord => ({
  id: row.id,
  lastAttemptAt: toDate(row.last_attempt_at),
  lastSuccessAt: toDate(row.last_success_at),
  lastError: row.last_error,
});

/** A movie with no screenings left whose last one started before `@cutoff`. */
const STALE_MOVIE = `
  NOT EXISTS (SELECT 1 FROM screenings WHERE screenings.movie_id = movies.id)
  AND (last_screening_at IS NULL OR last_screening_at < @cutoff)`;

/** The running time most of a movie's screenings list; a tie goes to the shorter one. */
const MOST_COMMON_DURATION = `(
  SELECT duration_minutes FROM screenings
  WHERE movie_id = movies.id AND duration_minutes IS NOT NULL
  GROUP BY duration_minutes
  ORDER BY COUNT(*) DESC, duration_minutes
  LIMIT 1)`;

const SQL = {
  upsertMovie: `
    INSERT INTO movies (id, title, original_title, english_title, match_key, year,
                        duration_minutes, match_duration_minutes, age_rating, genres, poster_url)
    VALUES (@id, @title, @originalTitle, @englishTitle, @matchKey, @year,
            @durationMinutes, @durationMinutes, @ageRating, @genres, @posterUrl)
    ON CONFLICT (id) DO UPDATE SET
      -- The title stays as the first source published it; gaps are filled from later ones.
      original_title   = COALESCE(original_title, excluded.original_title),
      english_title    = COALESCE(english_title, excluded.english_title),
      duration_minutes = COALESCE(duration_minutes, excluded.duration_minutes),
      match_duration_minutes = COALESCE(match_duration_minutes, excluded.match_duration_minutes),
      age_rating       = COALESCE(age_rating, excluded.age_rating),
      genres           = CASE WHEN genres = '[]' THEN excluded.genres ELSE genres END,
      poster_url       = COALESCE(poster_url, excluded.poster_url)`,
  movieIdentities: `
    SELECT movies.id, match_key, year, match_duration_minutes AS duration_minutes,
           (SELECT json_group_array(key) FROM movie_keys WHERE movie_id = movies.id) AS keys
    FROM movies ORDER BY movies.id`,
  addMovieKey: 'INSERT INTO movie_keys (movie_id, key) VALUES (?, ?) ON CONFLICT DO NOTHING',
  deleteFutureScreenings: 'DELETE FROM screenings WHERE source_id = ? AND starts_at >= ?',
  upsertScreening: `
    INSERT INTO screenings (id, source_id, movie_id, cinema_id, starts_at, local_date,
                            duration_minutes, hall, format, spoken_language, subtitle_language,
                            is_dubbed, ticket_url, source_title, refreshed_at)
    VALUES (@id, @sourceId, @movieId, @cinemaId, @startsAt, @localDate, @durationMinutes, @hall,
            @format, @spokenLanguage, @subtitleLanguage, @isDubbed, @ticketUrl, @sourceTitle,
            @refreshedAt)
    ON CONFLICT (id) DO UPDATE SET
      movie_id = excluded.movie_id, cinema_id = excluded.cinema_id,
      starts_at = excluded.starts_at, local_date = excluded.local_date,
      duration_minutes = excluded.duration_minutes, hall = excluded.hall, format = excluded.format,
      spoken_language = excluded.spoken_language,
      subtitle_language = excluded.subtitle_language, is_dubbed = excluded.is_dubbed,
      ticket_url = excluded.ticket_url, source_title = excluded.source_title,
      refreshed_at = excluded.refreshed_at`,
  raiseLastScreening: `
    UPDATE movies SET last_screening_at = @startsAt
    WHERE id = @movieId AND (last_screening_at IS NULL OR last_screening_at < @startsAt)`,
  settleDurations: `
    UPDATE movies SET duration_minutes = ${MOST_COMMON_DURATION}
    WHERE ${MOST_COMMON_DURATION} IS NOT NULL
      AND duration_minutes IS NOT ${MOST_COMMON_DURATION}`,
  recordAttempt: `
    INSERT INTO sources (id, last_attempt_at, last_error) VALUES (@id, @at, @error)
    ON CONFLICT (id) DO UPDATE SET last_attempt_at = @at, last_error = @error`,
  recordSuccess: `
    INSERT INTO sources (id, last_attempt_at, last_success_at, last_error)
    VALUES (@id, @at, @at, NULL)
    ON CONFLICT (id) DO UPDATE SET last_attempt_at = @at, last_success_at = @at,
                                   last_error = NULL`,
  listSources: 'SELECT * FROM sources ORDER BY id',
  deletePastScreenings: 'DELETE FROM screenings WHERE local_date < ?',
  deleteStaleMovieKeys: `
    DELETE FROM movie_keys WHERE movie_id IN (SELECT id FROM movies WHERE ${STALE_MOVIE})`,
  deleteStaleMovieReviews: `
    DELETE FROM match_reviews
    WHERE movie_id_a IN (SELECT id FROM movies WHERE ${STALE_MOVIE})
       OR movie_id_b IN (SELECT id FROM movies WHERE ${STALE_MOVIE})`,
  deleteStaleMovies: `DELETE FROM movies WHERE ${STALE_MOVIE}`,
  insertMatchReview: `
    INSERT INTO match_reviews (match_key, movie_id_a, movie_id_b, reason, first_seen_at)
    VALUES (@matchKey, @movieIdA, @movieIdB, @reason, @firstSeenAt)
    ON CONFLICT (movie_id_a, movie_id_b) DO NOTHING`,
} as const;

/** The movie's upsert, then one insert per title it is known by (its own match key included). */
function movieStatements(movie: MovieRecord, keys: readonly string[]): InStatement[] {
  return [
    {
      sql: SQL.upsertMovie,
      args: {
        id: movie.id,
        title: movie.title,
        originalTitle: movie.originalTitle,
        englishTitle: movie.englishTitle,
        matchKey: movie.matchKey,
        year: movie.year,
        durationMinutes: movie.durationMinutes,
        ageRating: movie.ageRating,
        genres: JSON.stringify(movie.genres),
        posterUrl: movie.posterUrl,
      },
    },
    ...[...new Set([movie.matchKey, ...keys])].map((key) => ({
      sql: SQL.addMovieKey,
      args: [movie.id, key],
    })),
  ];
}

/**
 * Deletes the source's screenings that start at or after `from`, upserts `screenings`, raises each
 * movie's latest screening start, and sets every movie's running time to the most common one: also
 * the movies this source stopped listing. The source refreshed last in a run recounts with every
 * cinema's new data, so the result does not depend on which cinema came first.
 */
function screeningStatements(
  sourceId: string,
  from: Date,
  screenings: readonly ScreeningRecord[],
): InStatement[] {
  const latestStartByMovie = new Map<string, string>();
  const upserts = screenings.map((screening): InStatement => {
    const startsAt = screening.startsAt.toISOString();
    const latest = latestStartByMovie.get(screening.movieId);
    if (latest === undefined || latest < startsAt) {
      latestStartByMovie.set(screening.movieId, startsAt);
    }
    return {
      sql: SQL.upsertScreening,
      args: {
        id: screening.id,
        sourceId: screening.sourceId,
        movieId: screening.movieId,
        cinemaId: screening.cinemaId,
        startsAt,
        localDate: screening.localDate,
        durationMinutes: screening.durationMinutes,
        hall: screening.hall,
        format: screening.format,
        spokenLanguage: screening.spokenLanguage,
        subtitleLanguage: screening.subtitleLanguage,
        isDubbed: screening.isDubbed === null ? null : Number(screening.isDubbed),
        ticketUrl: screening.ticketUrl,
        sourceTitle: screening.sourceTitle,
        refreshedAt: screening.refreshedAt.toISOString(),
      },
    };
  });
  return [
    { sql: SQL.deleteFutureScreenings, args: [sourceId, from.toISOString()] },
    ...upserts,
    ...[...latestStartByMovie].map(([movieId, startsAt]) => ({
      sql: SQL.raiseLastScreening,
      args: { startsAt, movieId },
    })),
    SQL.settleDurations,
  ];
}

function matchReviewStatement(review: MatchReviewRecord): InStatement {
  return {
    sql: SQL.insertMatchReview,
    args: {
      matchKey: review.matchKey,
      movieIdA: review.movieIdA,
      movieIdB: review.movieIdB,
      reason: review.reason,
      firstSeenAt: review.firstSeenAt.toISOString(),
    },
  };
}

function successStatement(sourceId: string, at: Date): InStatement {
  return { sql: SQL.recordSuccess, args: { id: sourceId, at: at.toISOString() } };
}

/**
 * Writes and the few reads the refresh pipeline needs. Read queries for the API live apart.
 *
 * Multi-statement writes go in one `batch`, not an interactive transaction: Turso's interactive
 * transactions time out after 5 s and cost a network round trip per statement, while a batch is
 * one request that commits or rolls back as a whole.
 */
export class Repository {
  readonly #db: Db;
  /** Settles when the latest `exclusive` work has; never rejects. */
  #exclusiveTail: Promise<unknown> = Promise.resolve();

  constructor(db: Db) {
    this.#db = db;
  }

  /**
   * Runs `work` after all earlier `exclusive` work on this repository has settled. Only this
   * process is covered: another server instance can still interleave with it.
   */
  exclusive<T>(work: () => Promise<T>): Promise<T> {
    const result = this.#exclusiveTail.then(work);
    // The caller gets `result` and its error; the queue only needs to move on.
    this.#exclusiveTail = result.catch(() => undefined);
    return result;
  }

  async listMovieIdentities(): Promise<MovieIdentity[]> {
    const { rows } = await this.#db.execute(SQL.movieIdentities);
    return (
      rows as unknown as Array<
        Pick<MovieRow, 'id' | 'match_key' | 'year' | 'duration_minutes'> & { keys: string }
      >
    ).map((row) => ({
      id: row.id,
      matchKey: row.match_key,
      year: row.year,
      durationMinutes: row.duration_minutes,
      keys: JSON.parse(row.keys) as string[],
    }));
  }

  /**
   * Writes one successful source refresh as one batch (FR-010): movies and their keys, the
   * source's future screenings, new match reviews and the success record. Returns how many of the
   * reviews were not logged before.
   */
  async storeRefresh(refresh: SourceRefresh): Promise<{ newReviews: number }> {
    const { sourceId, now } = refresh;
    const before = [
      ...refresh.movies.flatMap(({ movie, keys }) => movieStatements(movie, keys)),
      ...screeningStatements(sourceId, now, refresh.screenings),
    ];
    const results = await this.#db.batch(
      [
        ...before,
        ...refresh.reviews.map((review) => matchReviewStatement({ ...review, firstSeenAt: now })),
        successStatement(sourceId, now),
      ],
      'write',
    );
    const reviewResults = results.slice(before.length, before.length + refresh.reviews.length);
    return { newReviews: reviewResults.filter((result) => result.rowsAffected > 0).length };
  }

  /** Records a refresh attempt that failed with `error`. */
  async recordSourceAttempt(sourceId: string, at: Date, error: string): Promise<void> {
    await this.#db.execute({
      sql: SQL.recordAttempt,
      args: { id: sourceId, at: at.toISOString(), error },
    });
  }

  async recordSourceSuccess(sourceId: string, at: Date): Promise<void> {
    await this.#db.execute(successStatement(sourceId, at));
  }

  async listSources(): Promise<SourceRecord[]> {
    const { rows } = await this.#db.execute(SQL.listSources);
    return (rows as unknown as SourceRow[]).map(toSourceRecord);
  }

  /** Deletes screenings dated before `today` (Vilnius calendar date); returns how many. */
  async deletePastScreenings(today: string): Promise<number> {
    const result = await this.#db.execute({ sql: SQL.deletePastScreenings, args: [today] });
    return result.rowsAffected;
  }

  /**
   * Deletes movies that have had no screenings for 30 days; returns how many. Their keys and
   * match reviews are deleted first, in the same batch, because foreign-key cascades are not
   * enforced on Turso.
   */
  async deleteStaleMovies(now: Date): Promise<number> {
    const args = { cutoff: new Date(now.getTime() - MOVIE_RETENTION_MS).toISOString() };
    const results = await this.#db.batch(
      [
        { sql: SQL.deleteStaleMovieKeys, args },
        { sql: SQL.deleteStaleMovieReviews, args },
        { sql: SQL.deleteStaleMovies, args },
      ],
      'write',
    );
    return results[2]?.rowsAffected ?? 0;
  }
}
