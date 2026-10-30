import {
  ErrorResponseSchema,
  MovieDetailResponseSchema,
  ScreeningsResponseSchema,
} from '@seansai/shared';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { startCatalogServer, TODAY } from '../helpers/catalog.ts';

let server: ReturnType<typeof startCatalogServer>;

beforeEach(() => {
  server = startCatalogServer();
});

afterEach(async () => {
  await server.close();
});

describe('GET /movies/{id}/screenings', () => {
  test('returns one timeline sorted by start, ties by cinema name, without started screenings', async () => {
    const response = await server.app.inject(
      `/api/v1/movies/digger-2026/screenings?city=vilnius&date=${TODAY}`,
    );

    expect(response.statusCode).toBe(200);
    const body = ScreeningsResponseSchema.parse(response.json());
    expect(body.date).toBe(TODAY);
    expect(body.nextDateWithScreenings).toBeNull();
    expect(body.screenings.map((screening) => [screening.startsAt, screening.cinema.name])).toEqual(
      [
        ['2026-10-30T15:00:00+02:00', 'Apollo Akropolis'],
        ['2026-10-30T15:00:00+02:00', 'Skalvija'],
        ['2026-10-30T17:00:00+02:00', 'Forum Cinemas Vingis'],
      ],
    );
  });

  test('each screening carries its cinema, city and details', async () => {
    const response = await server.app.inject(
      `/api/v1/movies/digger-2026/screenings?city=vilnius&date=${TODAY}&lang=en`,
    );

    expect(ScreeningsResponseSchema.parse(response.json()).screenings[0]).toEqual({
      id: expect.stringMatching(/^apollo:/) as string,
      startsAt: '2026-10-30T15:00:00+02:00',
      cinema: {
        id: 'apollo-akropolis',
        name: 'Apollo Akropolis',
        cityId: 'vilnius',
        cityName: 'Vilnius',
      },
      hall: '6 salė',
      format: '2D',
      spokenLanguage: 'en',
      subtitleLanguage: 'lt',
      isDubbed: false,
      ticketUrl: expect.stringMatching(/^https:\/\/www\.apollokinas\.lt\//) as string,
    });
  });

  test('an empty day points to the next date with screenings', async () => {
    const response = await server.app.inject(
      `/api/v1/movies/later-2026/screenings?city=vilnius&date=${TODAY}`,
    );

    expect(ScreeningsResponseSchema.parse(response.json())).toMatchObject({
      screenings: [],
      nextDateWithScreenings: '2026-11-06',
    });
  });

  test('includes freshness for the city’s cinemas', async () => {
    const response = await server.app.inject(
      `/api/v1/movies/digger-2026/screenings?city=vilnius&date=${TODAY}`,
    );

    expect(ScreeningsResponseSchema.parse(response.json()).freshness.staleCinemas).toEqual([
      {
        id: 'forum-vingis',
        name: 'Forum Cinemas Vingis',
        lastSuccessAt: '2026-10-30T08:00:00+02:00',
      },
    ]);
  });

  test('a future date returns that day’s full list', async () => {
    const response = await server.app.inject(
      '/api/v1/movies/digger-2026/screenings?city=vilnius&date=2026-10-31',
    );

    expect(response.statusCode).toBe(200);
    const body = ScreeningsResponseSchema.parse(response.json());
    expect(body.date).toBe('2026-10-31');
    expect(body.screenings.map((screening) => screening.startsAt)).toEqual([
      '2026-10-31T20:00:00+02:00',
    ]);
  });

  test('a screening starting after midnight belongs to the date it starts on', async () => {
    const day = async (date: string) =>
      ScreeningsResponseSchema.parse(
        (
          await server.app.inject(`/api/v1/movies/sooner-2026/screenings?city=vilnius&date=${date}`)
        ).json(),
      ).screenings.map((screening) => screening.startsAt);

    expect(await day('2026-10-31')).toEqual([]);
    expect(await day('2026-11-01')).toEqual([
      '2026-11-01T00:30:00+02:00',
      '2026-11-01T19:00:00+02:00',
    ]);
  });

  test.each([
    ['before today', '2026-10-29'],
    ['after the last published date', '2026-11-07'],
    ['not a date', 'tomorrow'],
    ['not a calendar date', '2026-02-30'],
  ])('rejects a date %s with 400 invalid_date', async (_, date) => {
    const response = await server.app.inject(
      `/api/v1/movies/digger-2026/screenings?city=vilnius&date=${date}`,
    );

    expect(response.statusCode).toBe(400);
    expect(ErrorResponseSchema.parse(response.json()).error.code).toBe('invalid_date');
  });

  test('answers an unknown movie with 404 movie_not_found', async () => {
    const response = await server.app.inject(
      `/api/v1/movies/no-such-movie/screenings?city=vilnius&date=${TODAY}`,
    );

    expect(response.statusCode).toBe(404);
    expect(ErrorResponseSchema.parse(response.json()).error.code).toBe('movie_not_found');
  });

  test('rejects an unknown city with 400 invalid_city', async () => {
    const response = await server.app.inject(
      `/api/v1/movies/digger-2026/screenings?city=riga&date=${TODAY}`,
    );

    expect(response.statusCode).toBe(400);
    expect(ErrorResponseSchema.parse(response.json()).error.code).toBe('invalid_city');
  });
});

describe('GET /movies/{id}', () => {
  test('returns the movie with its screening dates in the city and the selectable dates', async () => {
    const response = await server.app.inject('/api/v1/movies/digger-2026?city=vilnius');

    expect(response.statusCode).toBe(200);
    expect(MovieDetailResponseSchema.parse(response.json())).toEqual({
      movie: {
        id: 'digger-2026',
        title: 'Kasėjas',
        originalTitle: 'Digger',
        englishTitle: null,
        posterUrl: 'https://cinema.lt/posters/digger.jpg',
        ageRating: 'N13',
        durationMinutes: 101,
        genres: ['drama'],
        year: 2026,
      },
      screeningDates: ['2026-10-30', '2026-10-31'],
      // Today up to the furthest date any cinema has published (6 November).
      availableDates: [
        '2026-10-30',
        '2026-10-31',
        '2026-11-01',
        '2026-11-02',
        '2026-11-03',
        '2026-11-04',
        '2026-11-05',
        '2026-11-06',
      ],
    });
  });

  test('a movie whose only screening today already started has no screening dates', async () => {
    const response = await server.app.inject('/api/v1/movies/started-2026?city=vilnius');

    expect(MovieDetailResponseSchema.parse(response.json()).screeningDates).toEqual([]);
  });

  test('answers an unknown movie with 404 movie_not_found', async () => {
    const response = await server.app.inject('/api/v1/movies/no-such-movie?city=vilnius');

    expect(response.statusCode).toBe(404);
    expect(ErrorResponseSchema.parse(response.json()).error.code).toBe('movie_not_found');
  });
});
