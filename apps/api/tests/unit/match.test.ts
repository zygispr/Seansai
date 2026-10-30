import { describe, expect, test } from 'vitest';
import type { MovieIdentity } from '../../src/db/repository.ts';
import { resolveMovie, type Alias, type Listing } from '../../src/matching/match.ts';

function listing(overrides: Partial<Listing> = {}): Listing {
  return {
    title: 'Kasėjas',
    originalTitle: 'Digger',
    year: 2026,
    durationMinutes: 101,
    ageRating: 'N13',
    genres: ['drama'],
    posterUrl: null,
    ...overrides,
  };
}

const digger: MovieIdentity = {
  id: 'digger-2026',
  matchKey: 'digger',
  year: 2026,
  durationMinutes: 101,
};

describe('resolveMovie', () => {
  test('creates a new movie with a stable id from match key and year', () => {
    const result = resolveMovie(listing(), [], []);

    expect(result.movie).toMatchObject({
      id: 'digger-2026',
      title: 'Kasėjas',
      originalTitle: 'Digger',
      matchKey: 'digger',
      year: 2026,
    });
    expect(result.reviews).toEqual([]);
  });

  test('omits the year from the id when it is unknown', () => {
    const result = resolveMovie(
      listing({ originalTitle: null, title: 'Kopa. Antra dalis', year: null }),
      [],
      [],
    );

    expect(result.movie.id).toBe('kopa-antra-dalis');
  });

  test('matches confidently when match keys and production years are equal', () => {
    const result = resolveMovie(
      listing({ title: 'KASĖJAS (LT sub.)', durationMinutes: 140 }),
      [digger],
      [],
    );

    expect(result.movie.id).toBe('digger-2026');
    expect(result.reviews).toEqual([]);
  });

  test('matches confidently when one year is missing and durations differ by at most 10 minutes', () => {
    const result = resolveMovie(listing({ year: null, durationMinutes: 110 }), [digger], []);

    expect(result.movie.id).toBe('digger-2026');
    expect(result.reviews).toEqual([]);
  });

  test('keeps listings separate when one year is missing and durations differ by more than 10 minutes', () => {
    const result = resolveMovie(listing({ year: null, durationMinutes: 115 }), [digger], []);

    expect(result.movie.id).toBe('digger');
    expect(result.reviews).toEqual([
      expect.objectContaining({ matchKey: 'digger', movieIdA: 'digger-2026', movieIdB: 'digger' }),
    ]);
  });

  test('keeps listings separate when one year is missing and a duration is unknown', () => {
    const result = resolveMovie(listing({ year: null, durationMinutes: null }), [digger], []);

    expect(result.movie.id).toBe('digger');
    expect(result.reviews).toHaveLength(1);
  });

  test('keeps a remake with a different year separate and logs it for review', () => {
    const dune1984: MovieIdentity = {
      id: 'dune-1984',
      matchKey: 'dune',
      year: 1984,
      durationMinutes: 137,
    };

    const result = resolveMovie(
      listing({ title: 'Kopa', originalTitle: 'Dune', year: 2021, durationMinutes: 155 }),
      [dune1984],
      [],
    );

    expect(result.movie.id).toBe('dune-2021');
    expect(result.reviews).toEqual([
      {
        matchKey: 'dune',
        movieIdA: 'dune-1984',
        movieIdB: 'dune-2021',
        reason: 'year 1984 vs 2021',
      },
    ]);
  });

  test('never merges a film with its sequel', () => {
    const kopa: MovieIdentity = { id: 'kopa', matchKey: 'kopa', year: null, durationMinutes: null };

    const result = resolveMovie(
      listing({ title: 'Kopa. Antra dalis', originalTitle: null, year: null }),
      [kopa],
      [],
    );

    expect(result.movie.id).toBe('kopa-antra-dalis');
    expect(result.reviews).toEqual([]);
  });

  test('treats two listings without a year as the same movie', () => {
    const skalvijaKopa: MovieIdentity = {
      id: 'kopa',
      matchKey: 'kopa',
      year: null,
      durationMinutes: null,
    };

    const result = resolveMovie(
      listing({ title: 'Kopa', originalTitle: null, year: null, durationMinutes: null }),
      [skalvijaKopa],
      [],
    );

    expect(result.movie.id).toBe('kopa');
  });

  test('does not guess when more than one existing movie would match', () => {
    const candidates: MovieIdentity[] = [
      { id: 'pinocchio-2022', matchKey: 'pinocchio', year: 2022, durationMinutes: 115 },
      { id: 'pinocchio-2019', matchKey: 'pinocchio', year: 2019, durationMinutes: 120 },
    ];

    const result = resolveMovie(
      listing({ title: 'Pinokis', originalTitle: 'Pinocchio', year: null, durationMinutes: 117 }),
      candidates,
      [],
    );

    expect(result.movie.id).toBe('pinocchio');
    expect(result.reviews.map((review) => review.movieIdA).sort()).toEqual([
      'pinocchio-2019',
      'pinocchio-2022',
    ]);
  });

  describe('alias file', () => {
    const dune1984: MovieIdentity = {
      id: 'dune-1984',
      matchKey: 'dune',
      year: 1984,
      durationMinutes: 137,
    };
    const remake = listing({
      title: 'Kopa',
      originalTitle: 'Dune',
      year: 2021,
      durationMinutes: 155,
    });

    test('"merge" forces a merge the rules would not make', () => {
      const aliases: Alias[] = [
        { matchKey: 'dune', movieIdA: 'dune-1984', movieIdB: 'dune-2021', resolution: 'merge' },
      ];

      const result = resolveMovie(remake, [dune1984], aliases);

      expect(result.movie.id).toBe('dune-1984');
      expect(result.reviews).toEqual([]);
    });

    test('"keep-separate" keeps them apart without logging a review', () => {
      const aliases: Alias[] = [
        {
          matchKey: 'dune',
          movieIdA: 'dune-2021',
          movieIdB: 'dune-1984',
          resolution: 'keep-separate',
        },
      ];

      const result = resolveMovie(remake, [dune1984], aliases);

      expect(result.movie.id).toBe('dune-2021');
      expect(result.reviews).toEqual([]);
    });

    test('"keep-separate" also overrides a match the rules would make', () => {
      const aliases: Alias[] = [
        {
          matchKey: 'digger',
          movieIdA: 'digger-2026',
          movieIdB: 'digger',
          resolution: 'keep-separate',
        },
      ];

      const result = resolveMovie(listing({ year: null }), [digger], aliases);

      expect(result.movie.id).toBe('digger');
      expect(result.reviews).toEqual([]);
    });
  });
});
