import { CitiesResponseSchema } from '@seansai/shared';
import { afterEach, expect, test } from 'vitest';
import { startCatalogServer } from '../helpers/catalog.ts';

let close: () => Promise<void>;

afterEach(async () => {
  await close();
});

test('lists every city with a supported cinema, with Lithuanian names by default', async () => {
  const server = await startCatalogServer([
    'apollo',
    'forum',
    'pasaka',
    'skalvija',
    'atlantis',
    'garsas',
    'spindulys',
    'minija',
    'romuva',
    'vue',
    'cinamon',
  ]);
  close = server.close;

  const response = await server.app.inject('/api/v1/cities');

  expect(response.statusCode).toBe(200);
  expect(CitiesResponseSchema.parse(response.json()).cities).toEqual([
    { id: 'vilnius', name: 'Vilnius', cinemaCount: 8 },
    { id: 'kaunas', name: 'Kaunas', cinemaCount: 3 },
    { id: 'klaipeda', name: 'Klaipėda', cinemaCount: 1 },
    { id: 'siauliai', name: 'Šiauliai', cinemaCount: 2 },
    { id: 'panevezys', name: 'Panevėžys', cinemaCount: 2 },
    { id: 'marijampole', name: 'Marijampolė', cinemaCount: 1 },
    { id: 'gargzdai', name: 'Gargždai', cinemaCount: 1 },
  ]);
  expect(response.headers['cache-control']).toBe('public, max-age=300, s-maxage=300');
});

test('names cities in English with lang=en', async () => {
  const server = await startCatalogServer();
  close = server.close;

  const response = await server.app.inject('/api/v1/cities?lang=en');

  expect(response.json()).toMatchObject({
    cities: expect.arrayContaining([
      { id: 'klaipeda', name: 'Klaipeda', cinemaCount: 1 },
    ]) as unknown,
  });
});

test('leaves out cities whose cinemas all come from inactive sources', async () => {
  const server = await startCatalogServer(['apollo']);
  close = server.close;

  const response = await server.app.inject('/api/v1/cities');

  expect(response.json()).toEqual({
    cities: [
      { id: 'vilnius', name: 'Vilnius', cinemaCount: 2 },
      { id: 'panevezys', name: 'Panevėžys', cinemaCount: 1 },
    ],
  });
});
