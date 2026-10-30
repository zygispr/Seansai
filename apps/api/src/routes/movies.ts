import type { MovieDetailResponse, MovieSummary, MoviesResponse } from '@seansai/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Queries } from '../db/queries.ts';
import type { MovieRecord } from '../db/repository.ts';
import { todayIn } from '../lib/time.ts';
import { ApiError, citySchema, parseQuery, setListCaching } from './http.ts';

type MoviesRouteOptions = { queries: Queries; now: () => Date };

export function movieSummary(movie: MovieRecord): MovieSummary {
  return {
    id: movie.id,
    title: movie.title,
    originalTitle: movie.originalTitle,
    englishTitle: movie.englishTitle,
    posterUrl: movie.posterUrl,
    ageRating: movie.ageRating,
    durationMinutes: movie.durationMinutes,
  };
}

/** The movie, or a 404 `movie_not_found`. */
export function findMovie(queries: Queries, movieId: string): MovieRecord {
  const movie = queries.getMovie(movieId);
  if (!movie) throw new ApiError(404, 'movie_not_found', 'There is no movie with this id.');
  return movie;
}

export const moviesRoutes: FastifyPluginAsync<MoviesRouteOptions> = (app, { queries, now }) => {
  const QuerySchema = z.object({ city: citySchema((city) => queries.isCity(city)) });
  const codes = { city: 'invalid_city' } as const;

  /** The "currently showing" list for a city, ordered as FR-003 requires. */
  app.get('/movies', (request, reply): MoviesResponse => {
    const { city } = parseQuery(QuerySchema, request.query, codes);
    const at = now();
    const cinemas = queries.cinemasIn(city);
    setListCaching(reply);
    return {
      movies: queries.listMovies(cinemas, todayIn(at), at).map((listing) => ({
        movie: movieSummary(listing.movie),
        screeningsToday: listing.screeningsToday,
        firstDate: listing.firstDate,
      })),
      freshness: queries.freshness(cinemas, at),
    };
  });

  /** Movie details plus the dates on which it has screenings in the city (US2). */
  app.get<{ Params: { movieId: string } }>(
    '/movies/:movieId',
    (request, reply): MovieDetailResponse => {
      const { city } = parseQuery(QuerySchema, request.query, codes);
      const movie = findMovie(queries, request.params.movieId);
      const at = now();
      setListCaching(reply);
      return {
        movie: { ...movieSummary(movie), genres: movie.genres, year: movie.year },
        screeningDates: queries.screeningDates(movie.id, queries.cinemasIn(city), at),
        availableDates: queries.availableDates(todayIn(at)),
      };
    },
  );
  return Promise.resolve();
};
