import type { ScreeningFormat } from '@seansai/shared';
import type { Statement } from 'better-sqlite3';
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

/** What movie matching needs to know about existing movies. */
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

/** Writes and the few reads the refresh pipeline needs. Read queries for the API live apart. */
export class Repository {
  readonly #db: Db;
  readonly #statements: Record<string, Statement>;

  constructor(db: Db) {
    this.#db = db;
    this.#statements = {
      upsertMovie: db.prepare(`
        INSERT INTO movies (id, title, original_title, english_title, match_key, year,
                            duration_minutes, age_rating, genres, poster_url)
        VALUES (@id, @title, @originalTitle, @englishTitle, @matchKey, @year,
                @durationMinutes, @ageRating, @genres, @posterUrl)
        ON CONFLICT (id) DO UPDATE SET
          -- The title stays as the first source published it; gaps are filled from later ones.
          original_title   = COALESCE(original_title, excluded.original_title),
          english_title    = COALESCE(english_title, excluded.english_title),
          duration_minutes = COALESCE(duration_minutes, excluded.duration_minutes),
          age_rating       = COALESCE(age_rating, excluded.age_rating),
          genres           = CASE WHEN genres = '[]' THEN excluded.genres ELSE genres END,
          poster_url       = COALESCE(poster_url, excluded.poster_url)`),
      getMovie: db.prepare('SELECT * FROM movies WHERE id = ?'),
      movieIdentities: db.prepare(`
        SELECT movies.id, match_key, year, duration_minutes,
               (SELECT json_group_array(key) FROM movie_keys WHERE movie_id = movies.id) AS keys
        FROM movies ORDER BY movies.id`),
      addMovieKey: db.prepare(
        'INSERT INTO movie_keys (movie_id, key) VALUES (?, ?) ON CONFLICT DO NOTHING',
      ),
      deleteFutureScreenings: db.prepare(
        'DELETE FROM screenings WHERE source_id = ? AND starts_at >= ?',
      ),
      upsertScreening: db.prepare(`
        INSERT INTO screenings (id, source_id, movie_id, cinema_id, starts_at, local_date, hall,
                                format, spoken_language, subtitle_language, is_dubbed, ticket_url,
                                source_title, refreshed_at)
        VALUES (@id, @sourceId, @movieId, @cinemaId, @startsAt, @localDate, @hall, @format,
                @spokenLanguage, @subtitleLanguage, @isDubbed, @ticketUrl, @sourceTitle,
                @refreshedAt)
        ON CONFLICT (id) DO UPDATE SET
          movie_id = excluded.movie_id, cinema_id = excluded.cinema_id,
          starts_at = excluded.starts_at, local_date = excluded.local_date,
          hall = excluded.hall, format = excluded.format,
          spoken_language = excluded.spoken_language,
          subtitle_language = excluded.subtitle_language, is_dubbed = excluded.is_dubbed,
          ticket_url = excluded.ticket_url, source_title = excluded.source_title,
          refreshed_at = excluded.refreshed_at`),
      raiseLastScreening: db.prepare(`
        UPDATE movies SET last_screening_at = @startsAt
        WHERE id = @movieId AND (last_screening_at IS NULL OR last_screening_at < @startsAt)`),
      recordAttempt: db.prepare(`
        INSERT INTO sources (id, last_attempt_at, last_error) VALUES (@id, @at, @error)
        ON CONFLICT (id) DO UPDATE SET last_attempt_at = @at, last_error = @error`),
      recordSuccess: db.prepare(`
        INSERT INTO sources (id, last_attempt_at, last_success_at, last_error)
        VALUES (@id, @at, @at, NULL)
        ON CONFLICT (id) DO UPDATE SET last_attempt_at = @at, last_success_at = @at,
                                       last_error = NULL`),
      getSource: db.prepare('SELECT * FROM sources WHERE id = ?'),
      listSources: db.prepare('SELECT * FROM sources ORDER BY id'),
      deletePastScreenings: db.prepare('DELETE FROM screenings WHERE local_date < ?'),
      deleteStaleMovies: db.prepare(`
        DELETE FROM movies
        WHERE NOT EXISTS (SELECT 1 FROM screenings WHERE screenings.movie_id = movies.id)
          AND (last_screening_at IS NULL OR last_screening_at < ?)`),
      insertMatchReview: db.prepare(`
        INSERT INTO match_reviews (match_key, movie_id_a, movie_id_b, reason, first_seen_at)
        VALUES (@matchKey, @movieIdA, @movieIdB, @reason, @firstSeenAt)
        ON CONFLICT (movie_id_a, movie_id_b) DO NOTHING`),
    };
  }

  #statement(name: string): Statement {
    const statement = this.#statements[name];
    if (!statement) throw new Error(`Unknown statement: ${name}`);
    return statement;
  }

  /** Runs `work` in one transaction (nested calls become savepoints). */
  transaction<T>(work: () => T): T {
    return this.#db.transaction(work)();
  }

  /** Creates or fills in the movie, and records the titles it is known by (its own match key included). */
  upsertMovie(movie: MovieRecord, keys: readonly string[] = []): void {
    this.#statement('upsertMovie').run({ ...movie, genres: JSON.stringify(movie.genres) });
    for (const key of new Set([movie.matchKey, ...keys])) {
      this.#statement('addMovieKey').run(movie.id, key);
    }
  }

  getMovie(id: string): MovieRecord | undefined {
    const row = this.#statement('getMovie').get(id) as MovieRow | undefined;
    return row ? toMovieRecord(row) : undefined;
  }

  listMovieIdentities(): MovieIdentity[] {
    const rows = this.#statement('movieIdentities').all() as Array<
      Pick<MovieRow, 'id' | 'match_key' | 'year' | 'duration_minutes'> & { keys: string }
    >;
    return rows.map((row) => ({
      id: row.id,
      matchKey: row.match_key,
      year: row.year,
      durationMinutes: row.duration_minutes,
      keys: JSON.parse(row.keys) as string[],
    }));
  }

  /**
   * Replaces the source's screenings that start at or after `from` with `screenings`, in one
   * transaction, so screenings the cinema cancelled disappear. Screenings that already started
   * are kept until the daily cleanup.
   */
  replaceSourceScreenings(sourceId: string, from: Date, screenings: ScreeningRecord[]): void {
    this.transaction(() => {
      this.#statement('deleteFutureScreenings').run(sourceId, from.toISOString());
      const latestStartByMovie = new Map<string, string>();
      for (const screening of screenings) {
        const startsAt = screening.startsAt.toISOString();
        this.#statement('upsertScreening').run({
          ...screening,
          startsAt,
          isDubbed: screening.isDubbed === null ? null : Number(screening.isDubbed),
          refreshedAt: screening.refreshedAt.toISOString(),
        });
        const latest = latestStartByMovie.get(screening.movieId);
        if (latest === undefined || latest < startsAt) {
          latestStartByMovie.set(screening.movieId, startsAt);
        }
      }
      for (const [movieId, startsAt] of latestStartByMovie) {
        this.#statement('raiseLastScreening').run({ startsAt, movieId });
      }
    });
  }

  /** Records a refresh attempt that failed with `error`. */
  recordSourceAttempt(sourceId: string, at: Date, error: string): void {
    this.#statement('recordAttempt').run({ id: sourceId, at: at.toISOString(), error });
  }

  recordSourceSuccess(sourceId: string, at: Date): void {
    this.#statement('recordSuccess').run({ id: sourceId, at: at.toISOString() });
  }

  getSource(id: string): SourceRecord | undefined {
    const row = this.#statement('getSource').get(id) as SourceRow | undefined;
    return row ? toSourceRecord(row) : undefined;
  }

  listSources(): SourceRecord[] {
    return (this.#statement('listSources').all() as SourceRow[]).map(toSourceRecord);
  }

  /** Deletes screenings dated before `today` (Vilnius calendar date); returns how many. */
  deletePastScreenings(today: string): number {
    return this.#statement('deletePastScreenings').run(today).changes;
  }

  /** Deletes movies that have had no screenings for 30 days; returns how many. */
  deleteStaleMovies(now: Date): number {
    const cutoff = new Date(now.getTime() - MOVIE_RETENTION_MS).toISOString();
    return this.#statement('deleteStaleMovies').run(cutoff).changes;
  }

  /** Logs an uncertain match for the maintainer; returns false if the pair was already logged. */
  insertMatchReview(review: MatchReviewRecord): boolean {
    const result = this.#statement('insertMatchReview').run({
      ...review,
      firstSeenAt: review.firstSeenAt.toISOString(),
    });
    return result.changes > 0;
  }
}
