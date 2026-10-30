import { HealthResponseSchema } from '@seansai/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { Repository } from '../../src/db/repository.ts';
import { buildServer } from '../../src/server.ts';
import { createTempDb } from '../helpers/temp-db.ts';
import { createTestLogger } from '../helpers/test-logger.ts';

const NOW = new Date('2026-10-30T10:00:00Z');
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 60 * 60 * 1000);

let app: FastifyInstance;
let repo: Repository;
let cleanup: () => void;

beforeEach(() => {
  const temp = createTempDb();
  cleanup = temp.cleanup;
  repo = new Repository(temp.db);
  app = buildServer({
    db: temp.db,
    now: () => NOW,
    logger: createTestLogger().logger,
    sourceIds: ['apollo', 'forum', 'vue'],
  });
});

afterEach(async () => {
  await app.close();
  cleanup();
});

test('reports every configured source as stale before its first refresh', async () => {
  const response = await app.inject('/api/v1/health');

  expect(response.statusCode).toBe(200);
  expect(HealthResponseSchema.parse(response.json())).toEqual({
    status: 'ok',
    sources: [
      { id: 'apollo', status: 'stale', lastSuccessAt: null },
      { id: 'forum', status: 'stale', lastSuccessAt: null },
      { id: 'vue', status: 'stale', lastSuccessAt: null },
    ],
  });
});

test('reports each source status with its last success time in Vilnius time', async () => {
  repo.recordSourceSuccess('apollo', hoursAgo(1));
  repo.recordSourceSuccess('forum', hoursAgo(2));
  repo.recordSourceAttempt('forum', hoursAgo(0), 'HTTP 500');
  repo.recordSourceSuccess('vue', hoursAgo(4));

  const response = await app.inject('/api/v1/health');

  expect(response.json()).toEqual({
    status: 'ok',
    sources: [
      { id: 'apollo', status: 'healthy', lastSuccessAt: '2026-10-30T11:00:00+02:00' },
      { id: 'forum', status: 'degraded', lastSuccessAt: '2026-10-30T10:00:00+02:00' },
      { id: 'vue', status: 'stale', lastSuccessAt: '2026-10-30T08:00:00+02:00' },
    ],
  });
  expect(response.headers['cache-control']).toBe('no-store');
});
