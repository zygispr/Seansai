import type { Freshness, Lang, ScreeningFormat } from '@seansai/shared';
import type { Statement } from 'better-sqlite3';
import { addDays, formatInstant } from '../lib/time.ts';
import { deriveSourceStatus } from '../refresh/status.ts';
import type { Cinema, CinemaRegistry } from '../registry/cinemas.ts';
import { cities, type City } from '../registry/cities.ts';
import type { Db } from './index.ts';
import { Repository, toMovieRecord, type MovieRecord, type MovieRow } from './repository.ts';

/**
 * Read queries behind the public API. Every query is bounded by a set of cinemas (one city, or
 * all of them) and filters out screenings that already started (FR-007). Cinema ids are passed
 * as a JSON array so each statement is prepared once.
 */

export type MovieListing = { movie: MovieRecord; screeningsToday: number; firstDate: string };

export type ScreeningListing = {
  id: string;
  startsAt: Date;
  cinema: Cinema;
  hall: string | null;
  format: ScreeningFormat | null;
  spokenLanguage: string | null;
  subtitleLanguage: string | null;
  isDubbed: boolean | null;
  ticketUrl: string;
};

type ScreeningRow = {
  id: string;
  cinema_id: string;
  starts_at: string;
  hall: string | null;
  format: ScreeningFormat | null;
  spoken_language: string | null;
  subtitle_language: string | null;
  is_dubbed: number | null;
  ticket_url: string;
};

type QueriesOptions = {
  db: Db;
  registry: CinemaRegistry;
  /** Sources whose cinemas are shown; a disabled source's cinemas disappear entirely. */
  sourceIds: readonly string[];
};

const collator = new Intl.Collator('lt');
const IN_CINEMAS = 'cinema_id IN (SELECT value FROM json_each(@cinemaIds))';

export class Queries {
  readonly #repo: Repository;
  readonly #cinemas: readonly Cinema[];
  readonly #statements: Record<
    'movies' | 'movie' | 'screeningDates' | 'lastDate' | 'screenings' | 'nextDate',
    Statement
  >;

  constructor({ db, registry, sourceIds }: QueriesOptions) {
    this.#repo = new Repository(db);
    this.#cinemas = registry.all().filter((cinema) => sourceIds.includes(cinema.sourceId));
    this.#statements = {
      movies: db.prepare(`
        SELECT movies.*,
               SUM(screenings.local_date = @today) AS screenings_today,
               MIN(screenings.local_date) AS first_date
        FROM screenings JOIN movies ON movies.id = screenings.movie_id
        WHERE screenings.${IN_CINEMAS} AND screenings.starts_at > @now
        GROUP BY movies.id`),
      movie: db.prepare('SELECT * FROM movies WHERE id = ?'),
      screeningDates: db.prepare(`
        SELECT DISTINCT local_date FROM screenings
        WHERE movie_id = @movieId AND ${IN_CINEMAS} AND starts_at > @now
        ORDER BY local_date`),
      lastDate: db.prepare('SELECT MAX(local_date) AS last_date FROM screenings'),
      screenings: db.prepare(`
        SELECT id, cinema_id, starts_at, hall, format, spoken_language, subtitle_language,
               is_dubbed, ticket_url
        FROM screenings
        WHERE movie_id = @movieId AND local_date = @date AND ${IN_CINEMAS} AND starts_at > @now
        ORDER BY starts_at`),
      nextDate: db.prepare(`
        SELECT MIN(local_date) AS next_date FROM screenings
        WHERE movie_id = @movieId AND local_date > @date AND ${IN_CINEMAS} AND starts_at > @now`),
    };
  }

  /** Cinemas in a city, or in every city for `all`. */
  cinemasIn(city: string): Cinema[] {
    return this.#cinemas.filter((cinema) => city === 'all' || cinema.cityId === city);
  }

  /** Cities with at least one shown cinema (the city prompt, FR-013). */
  listCities(): Array<{ city: City; cinemaCount: number }> {
    return cities
      .map((city) => ({ city, cinemaCount: this.cinemasIn(city.id).length }))
      .filter((entry) => entry.cinemaCount > 0);
  }

  isCity(city: string): boolean {
    return city === 'all' || this.cinemasIn(city).length > 0;
  }

  /**
   * The "currently showing" list (FR-003): movies with screenings left today first, most
   * screenings first and ties by title; then movies starting later, by first date and title.
   */
  listMovies(cinemas: readonly Cinema[], today: string, now: Date): MovieListing[] {
    const rows = this.#statements.movies.all({
      ...this.#bounds(cinemas, now),
      today,
    }) as Array<MovieRow & { screenings_today: number; first_date: string }>;
    return rows
      .map((row) => ({
        movie: toMovieRecord(row),
        screeningsToday: row.screenings_today,
        firstDate: row.first_date,
      }))
      .sort((a, b) => {
        const todayFirst = Number(b.screeningsToday > 0) - Number(a.screeningsToday > 0);
        if (todayFirst !== 0) return todayFirst;
        if (a.screeningsToday > 0) {
          if (a.screeningsToday !== b.screeningsToday) return b.screeningsToday - a.screeningsToday;
        } else if (a.firstDate !== b.firstDate) {
          return a.firstDate < b.firstDate ? -1 : 1;
        }
        return collator.compare(a.movie.title, b.movie.title);
      });
  }

  getMovie(id: string): MovieRecord | undefined {
    const row = this.#statements.movie.get(id) as MovieRow | undefined;
    return row ? toMovieRecord(row) : undefined;
  }

  /** Dates on which the movie still has screenings in these cinemas. */
  screeningDates(movieId: string, cinemas: readonly Cinema[], now: Date): string[] {
    const rows = this.#statements.screeningDates.all({
      ...this.#bounds(cinemas, now),
      movieId,
    }) as Array<{ local_date: string }>;
    return rows.map((row) => row.local_date);
  }

  /** Today up to the furthest date any cinema has published (FR-010). */
  availableDates(today: string): string[] {
    const { last_date: lastDate } = this.#statements.lastDate.get() as { last_date: string | null };
    const dates = [today];
    while (lastDate !== null && (dates.at(-1) ?? today) < lastDate) {
      dates.push(addDays(dates.at(-1) ?? today, 1));
    }
    return dates;
  }

  /** The movie's screenings on `date` as one timeline: by start time, ties by cinema name. */
  listScreenings(
    movieId: string,
    cinemas: readonly Cinema[],
    date: string,
    now: Date,
  ): ScreeningListing[] {
    const byId = new Map(cinemas.map((cinema) => [cinema.id, cinema]));
    const rows = this.#statements.screenings.all({
      ...this.#bounds(cinemas, now),
      movieId,
      date,
    }) as ScreeningRow[];
    return rows
      .flatMap((row) => {
        const cinema = byId.get(row.cinema_id);
        if (!cinema) return [];
        return [
          {
            id: row.id,
            startsAt: new Date(row.starts_at),
            cinema,
            hall: row.hall,
            format: row.format,
            spokenLanguage: row.spoken_language,
            subtitleLanguage: row.subtitle_language,
            isDubbed: row.is_dubbed === null ? null : row.is_dubbed === 1,
            ticketUrl: row.ticket_url,
          },
        ];
      })
      .sort(
        (a, b) =>
          a.startsAt.getTime() - b.startsAt.getTime() ||
          collator.compare(a.cinema.name, b.cinema.name),
      );
  }

  /** The first date after `date` with screenings of the movie (US1 scenario 6). */
  nextDateWithScreenings(
    movieId: string,
    cinemas: readonly Cinema[],
    date: string,
    now: Date,
  ): string | null {
    const row = this.#statements.nextDate.get({ ...this.#bounds(cinemas, now), movieId, date }) as {
      next_date: string | null;
    };
    return row.next_date;
  }

  /**
   * How current the data for these cinemas is: the oldest successful refresh among their
   * sources, and the cinemas without one for 3 hours or more (FR-014, FR-015).
   */
  freshness(cinemas: readonly Cinema[], now: Date): Freshness {
    const sources = new Map(
      [...new Set(cinemas.map((cinema) => cinema.sourceId))].map((id) => [
        id,
        this.#repo.getSource(id),
      ]),
    );
    const successes = [...sources.values()]
      .map((source) => source?.lastSuccessAt?.getTime())
      .filter((time) => time !== undefined);
    const oldest = successes.length > 0 ? new Date(Math.min(...successes)) : now;
    return {
      updatedAt: formatInstant(oldest),
      staleCinemas: cinemas
        .filter((cinema) => deriveSourceStatus(sources.get(cinema.sourceId), now) === 'stale')
        .map((cinema) => {
          const lastSuccessAt = sources.get(cinema.sourceId)?.lastSuccessAt;
          return {
            id: cinema.id,
            name: cinema.name,
            lastSuccessAt: lastSuccessAt ? formatInstant(lastSuccessAt) : null,
          };
        }),
    };
  }

  #bounds(cinemas: readonly Cinema[], now: Date) {
    return {
      cinemaIds: JSON.stringify(cinemas.map((cinema) => cinema.id)),
      now: now.toISOString(),
    };
  }
}

export function cityName(city: City, lang: Lang): string {
  return lang === 'en' ? city.nameEn : city.nameLt;
}
