import autocannon from 'autocannon';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { TODAY } from '../helpers/catalog.ts';
import { largeMovieIds, startLargeCatalogServer } from '../helpers/large-catalog.ts';

/**
 * SC-007: peaks of 100 people at once. 100 connections for 20 s against the real server, mixing
 * the movie list with screening timelines of 10 movies.
 */
let server: ReturnType<typeof startLargeCatalogServer>;
let baseUrl: string;

beforeAll(async () => {
  server = startLargeCatalogServer();
  baseUrl = await server.app.listen({ port: 0, host: '127.0.0.1' });
});

afterAll(async () => {
  await server.close();
});

test('100 concurrent users: p95 latency < 300 ms and no failed responses', async () => {
  const requests = largeMovieIds.slice(0, 10).flatMap((movieId) => [
    { method: 'GET' as const, path: '/api/v1/movies?city=vilnius' },
    {
      method: 'GET' as const,
      path: `/api/v1/movies/${movieId}/screenings?city=vilnius&date=${TODAY}`,
    },
  ]);

  const result = await autocannon({ url: baseUrl, connections: 100, duration: 20, requests });

  expect(result.errors).toBe(0);
  expect(result.timeouts).toBe(0);
  expect(result.non2xx).toBe(0);
  expect(result['2xx']).toBeGreaterThan(0);
  // autocannon reports p90 and p97.5, not p95; p97.5 under budget means p95 is too.
  expect(result.latency.p97_5).toBeLessThan(300);
}, 60_000);
