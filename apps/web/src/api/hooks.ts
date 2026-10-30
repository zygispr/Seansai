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

export function useMovie(movieId: string, city: string) {
  return useQuery({
    queryKey: queryKeys.movie(movieId, city),
    queryFn: ({ signal }) => getMovie(movieId, city, signal),
    staleTime: STALE_TIME_MS,
  });
}

export function useScreenings(movieId: string, city: string, date: string) {
  return useQuery({
    queryKey: queryKeys.screenings(movieId, city, date),
    queryFn: ({ signal }) => getScreenings(movieId, city, date, signal),
    staleTime: STALE_TIME_MS,
  });
}
