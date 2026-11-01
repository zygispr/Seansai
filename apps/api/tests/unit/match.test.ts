import { describe, expect, test } from 'vitest';
import type { MovieIdentity } from '../../src/db/repository.ts';
import { loadAliases, resolveMovie, type Alias, type Listing } from '../../src/matching/match.ts';

function listing(overrides: Partial<Listing> = {}): Listing {
  return {
    title: 'Kasėjas',
    originalTitle: 'Digger',
    englishTitle: null,
    year: 2026,
    durationMinutes: 101,
    ageRating: 'N13',
    genres: ['drama'],
    posterUrl: null,
    ...overrides,
  };
}

/** Existing movies list every title they are known by. */
function movie(
  identity: Omit<MovieIdentity, 'keys' | 'listedDurations'> &
    Partial<Pick<MovieIdentity, 'keys' | 'listedDurations'>>,
): MovieIdentity {
  return { keys: [identity.matchKey], listedDurations: [], ...identity };
}

const digger = movie({ id: 'digger-2026', matchKey: 'digger', year: 2026, durationMinutes: 101 });

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

  test('matches confidently when one year is missing and durations differ by at most 15 minutes', () => {
    const result = resolveMovie(listing({ year: null, durationMinutes: 116 }), [digger], []);

    expect(result.movie.id).toBe('digger-2026');
    expect(result.reviews).toEqual([]);
  });

  test('a missing year is judged against every running time listed for the film', () => {
    // The film shows 105, its most common time; this listing is 17 minutes from that, 2 from 120.
    const film = movie({ ...digger, durationMinutes: 105, listedDurations: [105, 120] });

    const close = resolveMovie(listing({ year: null, durationMinutes: 122 }), [film], []);
    expect(close.movie.id).toBe('digger-2026');
    expect(close.reviews).toEqual([]);

    const far = resolveMovie(listing({ year: null, durationMinutes: 136 }), [film], []);
    expect(far.movie.id).toBe('digger');
    expect(far.reviews).toHaveLength(1);
  });

  test('keeps listings separate when one year is missing and durations differ by more than 15 minutes', () => {
    const result = resolveMovie(listing({ year: null, durationMinutes: 117 }), [digger], []);

    expect(result.movie.id).toBe('digger');
    expect(result.reviews).toEqual([
      expect.objectContaining({ matchKey: 'digger', movieIdA: 'digger-2026', movieIdB: 'digger' }),
    ]);
  });

  test('matches when one year is missing and a duration is unknown, as nothing contradicts it', () => {
    const result = resolveMovie(listing({ year: null, durationMinutes: null }), [digger], []);

    expect(result.movie.id).toBe('digger-2026');
    expect(result.reviews).toEqual([]);
  });

  test('names a new movie after its English title and keeps every title as a key', () => {
    const result = resolveMovie(
      listing({ title: 'Instruktorius', originalTitle: 'Instructor', englishTitle: 'Instructor' }),
      [],
      [],
    );

    expect(result.movie).toMatchObject({ id: 'instructor-2026', englishTitle: 'Instructor' });
    expect(result.keys).toEqual(['instructor', 'instruktorius']);
  });

  test('matches through any shared title: the same Lithuanian title, different originals', () => {
    // Apollo knows the English title; Vue only the Lithuanian original.
    const apollo = movie({
      id: 'instructor-2026',
      matchKey: 'instructor',
      keys: ['instructor', 'instruktorius'],
      year: 2026,
      durationMinutes: 90,
    });

    const result = resolveMovie(
      listing({
        title: 'Instruktorius',
        originalTitle: 'Instruktorius',
        year: null,
        durationMinutes: 90,
      }),
      [apollo],
      [],
    );

    expect(result.movie.id).toBe('instructor-2026');
    expect(result.keys).toEqual(['instruktorius']);
  });

  test('a Lithuanian title alone (Romuva) joins the movie with that title', () => {
    const odyssey = movie({
      id: 'odyssey-2026',
      matchKey: 'odyssey',
      keys: ['odyssey', 'odiseja'],
      year: 2026,
      durationMinutes: 172,
    });

    const result = resolveMovie(
      listing({ title: 'Odisėja', originalTitle: null, year: null, durationMinutes: null }),
      [odyssey],
      [],
    );

    expect(result.movie.id).toBe('odyssey-2026');
  });

  test('"The Uprising" and "Uprising" are the same title', () => {
    const uprising = movie({
      id: 'uprising-2026',
      matchKey: 'uprising',
      year: 2026,
      durationMinutes: 127,
    });

    const result = resolveMovie(
      listing({ title: 'Sukilimas', originalTitle: 'The Uprising', durationMinutes: 127 }),
      [uprising],
      [],
    );

    expect(result.movie.id).toBe('uprising-2026');
  });

  test('a shared title does not override a year conflict', () => {
    const result = resolveMovie(
      listing({ title: 'Kasėjas', originalTitle: 'Kasėjas', year: 1990 }),
      [
        movie({
          id: 'digger-2026',
          matchKey: 'digger',
          keys: ['digger', 'kasejas'],
          year: 2026,
          durationMinutes: 101,
        }),
      ],
      [],
    );

    expect(result.movie.id).toBe('kasejas-1990');
    expect(result.reviews).toHaveLength(1);
  });

  test('keeps a remake with a different year separate and logs it for review', () => {
    const dune1984 = movie({
      id: 'dune-1984',
      matchKey: 'dune',
      year: 1984,
      durationMinutes: 137,
    });

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
    const kopa = movie({ id: 'kopa', matchKey: 'kopa', year: null, durationMinutes: null });

    const result = resolveMovie(
      listing({ title: 'Kopa. Antra dalis', originalTitle: null, year: null }),
      [kopa],
      [],
    );

    expect(result.movie.id).toBe('kopa-antra-dalis');
    expect(result.reviews).toEqual([]);
  });

  test('treats two listings without a year as the same movie', () => {
    const skalvijaKopa = movie({
      id: 'kopa',
      matchKey: 'kopa',
      year: null,
      durationMinutes: null,
    });

    const result = resolveMovie(
      listing({ title: 'Kopa', originalTitle: null, year: null, durationMinutes: null }),
      [skalvijaKopa],
      [],
    );

    expect(result.movie.id).toBe('kopa');
  });

  test('does not guess when more than one existing movie would match', () => {
    const candidates = [
      movie({ id: 'pinocchio-2022', matchKey: 'pinocchio', year: 2022, durationMinutes: 115 }),
      movie({ id: 'pinocchio-2019', matchKey: 'pinocchio', year: 2019, durationMinutes: 120 }),
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
    test("the real file merges Garsas's Sunday showing of The Cat in the Hat into the film", () => {
      const film = {
        id: 'cat-in-the-hat-2026',
        matchKey: 'cat in the hat',
        year: 2026,
        durationMinutes: 91,
        keys: ['cat in the hat', 'katinas su skrybele'],
        listedDurations: [91],
      };
      const sundayShowing = listing({
        title: 'Katinas su skrybėle | Sekmadienis su vaikais',
        originalTitle: 'The Cat in the Hat',
        englishTitle: null,
        year: null,
        durationMinutes: 108,
      });

      const result = resolveMovie(sundayShowing, [film], loadAliases());

      expect(result.movie.id).toBe('cat-in-the-hat-2026');
      expect(result.reviews).toEqual([]);
    });

    const dune1984 = movie({
      id: 'dune-1984',
      matchKey: 'dune',
      year: 1984,
      durationMinutes: 137,
    });
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
