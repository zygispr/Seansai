import autocannon from 'autocannon';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { TODAY } from '../helpers/catalog.ts';
import { largeMovieIds, startLargeCatalogServer } from '../helpers/large-catalog.ts';

/**
 * SC-007: peaks of 100 people at once. 100 connections for 20 s against the real server, mixing
 * the movie list with screening timelines of 10 movies.
 */
let server: Awaited<ReturnType<typeof startLargeCatalogServer>>;
let baseUrl: string;

beforeAll(async () => {
  server = await startLargeCatalogServer();
  baseUrl = await server.app.listen({ port: 0, host: '127.0.0.1' });
});

afterAll(async () => {
  await server.close();
});

/** Runs the load and keeps every response's time: autocannon's result has p90 and p97.5, not p95. */
function run(options: autocannon.Options) {
  return new Promise<{ result: autocannon.Result; latencies: number[] }>((resolve, reject) => {
    const latencies: number[] = [];
    const instance = autocannon(options, (error: Error | null, result) => {
      if (error) reject(error);
      else resolve({ result, latencies });
    });
    instance.on('response', (_client, _status, _bytes, responseTime: number) => {
      latencies.push(responseTime);
    });
  });
}

function percentile(values: number[], fraction: number): number {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * fraction) - 1] ?? Number.NaN;
}

test('100 concurrent users: p95 latency < 300 ms and no failed responses', async () => {
  const requests = largeMovieIds.slice(0, 10).flatMap((movieId) => [
    { method: 'GET' as const, path: '/api/v1/movies?city=vilnius' },
    {
      method: 'GET' as const,
      path: `/api/v1/movies/${movieId}/screenings?city=vilnius&date=${TODAY}`,
    },
  ]);

  const { result, latencies } = await run({
    url: baseUrl,
    connections: 100,
    duration: 20,
    requests,
  });
  const p95 = percentile(latencies, 0.95);
  // Not console.log: the test runner hides that for a passing test, and CI should show the numbers.
  process.stdout.write(
    `Load: p50 ${String(result.latency.p50)} ms, p95 ${String(p95)} ms, p97.5 ${String(result.latency.p97_5)} ms, ${String(result.requests.average)} requests/s\n`,
  );

  expect(result.errors).toBe(0);
  expect(result.timeouts).toBe(0);
  expect(result.non2xx).toBe(0);
  expect(result['2xx']).toBeGreaterThan(0);
  expect(p95).toBeLessThan(300);
}, 60_000);
