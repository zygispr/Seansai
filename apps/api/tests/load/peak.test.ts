import { Agent, get } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { TODAY } from '../helpers/catalog.ts';
import { largeMovieIds, startLargeCatalogServer } from '../helpers/large-catalog.ts';

/**
 * SC-007: peaks of 100 people at once. A steady 200 requests/s for 20 s against the real server, far
 * more than people browsing send, mixing the movie list with screening timelines of 10 movies.
 *
 * Steady, because sending as fast as answered measures the machine: on identical code, GitHub's
 * machines ranged from 310 to 650 requests/s, and p95 from 169 to 371 ms.
 */
const REQUESTS_PER_SECOND = 200;
const SECONDS = 20;
const MAX_CONNECTIONS = 100;

let server: Awaited<ReturnType<typeof startLargeCatalogServer>>;
let baseUrl: string;

beforeAll(async () => {
  server = await startLargeCatalogServer();
  baseUrl = await server.app.listen({ port: 0, host: '127.0.0.1' });
});

afterAll(async () => {
  await server.close();
});

function statusOf(url: string, agent: Agent): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    get(url, { agent }, (response) => {
      response.resume();
      response.on('end', () => {
        resolve(response.statusCode);
      });
    }).on('error', reject);
  });
}

/**
 * Sends the requests evenly spaced and times each from when it was due, not when it left: a server
 * that falls behind then shows up as latency. Returns the times and how many requests failed.
 */
async function sendSteadily(paths: readonly string[]) {
  const agent = new Agent({ keepAlive: true, maxSockets: MAX_CONNECTIONS });
  const latencies: number[] = [];
  let failures = 0;
  const started = performance.now();
  const requests: Array<Promise<void>> = [];
  for (let n = 0; n < REQUESTS_PER_SECOND * SECONDS; n++) {
    const dueAt = started + (n * 1000) / REQUESTS_PER_SECOND;
    await sleep(Math.max(0, dueAt - performance.now()));
    requests.push(
      statusOf(`${baseUrl}${paths[n % paths.length] ?? ''}`, agent).then(
        (status) => {
          latencies.push(performance.now() - dueAt);
          if (status !== 200) failures++;
        },
        () => {
          failures++;
        },
      ),
    );
  }
  await Promise.all(requests);
  agent.destroy();
  return { latencies, failures };
}

function percentile(values: number[], fraction: number): number {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * fraction) - 1] ?? Number.NaN;
}

test('a steady 200 requests/s: p95 latency < 300 ms and no failed responses', async () => {
  const paths = largeMovieIds
    .slice(0, 10)
    .flatMap((movieId) => [
      '/api/v1/movies?city=vilnius',
      `/api/v1/movies/${movieId}/screenings?city=vilnius&date=${TODAY}`,
    ]);

  const { latencies, failures } = await sendSteadily(paths);

  const p95 = percentile(latencies, 0.95);
  // Not console.log: the test runner hides that for a passing test, and CI should show the numbers.
  process.stdout.write(
    `Load: p50 ${percentile(latencies, 0.5).toFixed(1)} ms, p95 ${p95.toFixed(1)} ms, max ${percentile(latencies, 1).toFixed(1)} ms\n`,
  );
  expect(failures).toBe(0);
  expect(latencies).toHaveLength(REQUESTS_PER_SECOND * SECONDS);
  expect(p95).toBeLessThan(300);
}, 60_000);
