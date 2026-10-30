import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type { MatchReviewRecord, MovieIdentity, MovieRecord } from '../db/repository.ts';
import { matchKeyOf } from './normalize.ts';

/** The movie details one source listing carries. */
export type Listing = {
  title: string;
  originalTitle: string | null;
  year: number | null;
  durationMinutes: number | null;
  ageRating: string | null;
  genres: string[];
  posterUrl: string | null;
};

const AliasSchema = z.object({
  matchKey: z.string().min(1),
  movieIdA: z.string().min(1),
  movieIdB: z.string().min(1),
  resolution: z.enum(['merge', 'keep-separate']),
});
export type Alias = z.infer<typeof AliasSchema>;

/** The maintainer's decisions on pairs from the match-review log (versioned in the repo). */
export function loadAliases(path = new URL('./aliases.json', import.meta.url)): Alias[] {
  return z.array(AliasSchema).parse(JSON.parse(readFileSync(path, 'utf8')));
}

export type MatchReview = Omit<MatchReviewRecord, 'firstSeenAt'>;

export type Resolution = {
  /** The movie this listing belongs to: an existing one, or a new one to create. */
  movie: MovieRecord;
  /** Uncertain pairs to log for the maintainer (FR-005). */
  reviews: MatchReview[];
};

const DURATION_TOLERANCE_MINUTES = 10;

/** Stable, URL-friendly id from match key and year, e.g. `digger-2026`. */
function movieIdOf(matchKey: string, year: number | null): string {
  const slug = matchKey.replaceAll(' ', '-');
  return year === null ? slug : `${slug}-${String(year)}`;
}

/**
 * The rule from research.md §5: equal match keys plus equal production years, or one year missing
 * and durations within 10 minutes. Two missing years count as equal: such listings share the same
 * (match key, year) identity.
 */
function isConfidentMatch(listing: Listing, candidate: MovieIdentity): boolean {
  if (listing.year !== null && candidate.year !== null) return listing.year === candidate.year;
  if (listing.year === null && candidate.year === null) return true;
  if (listing.durationMinutes === null || candidate.durationMinutes === null) return false;
  return (
    Math.abs(listing.durationMinutes - candidate.durationMinutes) <= DURATION_TOLERANCE_MINUTES
  );
}

function conflictReason(listing: Listing, candidate: MovieIdentity): string {
  if (listing.year !== null && candidate.year !== null) {
    return `year ${String(candidate.year)} vs ${String(listing.year)}`;
  }
  const duration = (minutes: number | null) =>
    minutes === null ? 'unknown' : `${String(minutes)} min`;
  return `year ${String(candidate.year ?? 'missing')} vs ${String(listing.year ?? 'missing')}, duration ${duration(candidate.durationMinutes)} vs ${duration(listing.durationMinutes)}`;
}

function findAlias(aliases: readonly Alias[], idA: string, idB: string): Alias | undefined {
  return aliases.find(
    (alias) =>
      (alias.movieIdA === idA && alias.movieIdB === idB) ||
      (alias.movieIdA === idB && alias.movieIdB === idA),
  );
}

/**
 * Decides which movie a listing belongs to. Merges only confident matches; anything uncertain
 * becomes a separate movie and is logged for review, because a wrong merge is worse than a
 * duplicate (FR-005).
 */
export function resolveMovie(
  listing: Listing,
  existingMovies: readonly MovieIdentity[],
  aliases: readonly Alias[],
): Resolution {
  const matchKey = matchKeyOf(listing);
  const ownId = movieIdOf(matchKey, listing.year);
  const fromListing: MovieRecord = {
    id: ownId,
    title: listing.title,
    originalTitle: listing.originalTitle,
    matchKey,
    year: listing.year,
    durationMinutes: listing.durationMinutes,
    ageRating: listing.ageRating,
    genres: listing.genres,
    posterUrl: listing.posterUrl,
  };
  const joinExisting = (target: MovieIdentity): Resolution => ({
    movie: { ...fromListing, id: target.id, matchKey: target.matchKey, year: target.year },
    reviews: [],
  });

  const candidates = existingMovies.filter((movie) => movie.matchKey === matchKey);
  const sameIdentity = candidates.find((movie) => movie.id === ownId);
  if (sameIdentity) return joinExisting(sameIdentity);

  const confident: MovieIdentity[] = [];
  const conflicting: MovieIdentity[] = [];
  for (const candidate of candidates) {
    const alias = findAlias(aliases, ownId, candidate.id);
    if (alias?.resolution === 'merge') return joinExisting(candidate);
    if (alias?.resolution === 'keep-separate') continue;
    (isConfidentMatch(listing, candidate) ? confident : conflicting).push(candidate);
  }

  const [onlyConfident, ...otherConfident] = confident;
  if (onlyConfident && otherConfident.length === 0) return joinExisting(onlyConfident);

  const reviews: MatchReview[] = [
    ...conflicting.map((candidate) => ({
      matchKey,
      movieIdA: candidate.id,
      movieIdB: ownId,
      reason: conflictReason(listing, candidate),
    })),
    ...confident.map((candidate) => ({
      matchKey,
      movieIdA: candidate.id,
      movieIdB: ownId,
      reason: 'matches more than one movie',
    })),
  ];
  return { movie: fromListing, reviews };
}
