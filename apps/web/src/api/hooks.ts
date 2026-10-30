import type { Lang } from '@seansai/shared';
import { skipToken, useQuery } from '@tanstack/react-query';
import { getCities, getMovie, getMovies, getScreenings } from './client.ts';

/** The API caches responses for 5 minutes too, so refetching sooner gains nothing. */
const STALE_TIME_MS = 5 * 60 * 1000;

export const queryKeys = {
  cities: (lang: Lang) => ['cities', lang] as const,
  movies: (city: string) => ['movies', city] as const,
  movie: (movieId: string, city: string) => ['movie', movieId, city] as const,
  screenings: (movieId: string, city: string, date: string) =>
    ['screenings', movieId, city, date] as const,
};

export function useCities(lang: Lang) {
  return useQuery({
    queryKey: queryKeys.cities(lang),
    queryFn: ({ signal }) => getCities(lang, signal),
    staleTime: STALE_TIME_MS,
  });
}

/** Waits (does not fetch) while no city has been chosen yet. */
export function useMovies(city: string | null) {
  return useQuery({
    queryKey: queryKeys.movies(city ?? ''),
    queryFn: city === null ? skipToken : ({ signal }) => getMovies(city, signal),
    staleTime: STALE_TIME_MS,
  });
}

/** Waits while no city has been chosen yet. */
export function useMovie(movieId: string, city: string | null) {
  return useQuery({
    queryKey: queryKeys.movie(movieId, city ?? ''),
    queryFn: city === null ? skipToken : ({ signal }) => getMovie(movieId, city, signal),
    staleTime: STALE_TIME_MS,
  });
}

/**
 * Waits until both the city and the date are known. While another date of the same movie and city
 * loads, the previous date's list stays as placeholder data (`isPlaceholderData`).
 */
export function useScreenings(movieId: string, city: string | null, date: string | null) {
  return useQuery({
    queryKey: queryKeys.screenings(movieId, city ?? '', date ?? ''),
    queryFn:
      city === null || date === null
        ? skipToken
        : ({ signal }) => getScreenings(movieId, city, date, signal),
    staleTime: STALE_TIME_MS,
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === movieId && previousQuery.queryKey[2] === (city ?? '')
        ? previous
        : undefined,
  });
}
