import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { DailyRefreshResult } from '../../src/refresh/daily.ts';
import { buildServer, type ServerOptions } from '../../src/server.ts';
import { createTempDb } from '../helpers/temp-db.ts';
import { createTestLogger } from '../helpers/test-logger.ts';

const SECRET = 's3cret';
const NOT_FOUND = { error: { code: 'not_found', message: 'There is no such API route.' } };
const result: DailyRefreshResult = {
  sources: { apollo: 'success', forum: 'failed', vue: 'disabled' },
  cleanup: { screenings: 4, movies: 1 },
};

let app: FastifyInstance;
let cleanup: () => void;

async function startServer(
  cron: NonNullable<ServerOptions['cron']> | null,
): Promise<FastifyInstance> {
  const temp = await createTempDb();
  cleanup = temp.cleanup;
  app = buildServer({
    db: temp.db,
    now: () => new Date(),
    logger: createTestLogger().logger,
    cron,
  });
  return app;
}

afterEach(async () => {
  await app.close();
  cleanup();
});

describe('GET /api/v1/cron/daily', () => {
  test('without the secret answers 404 like an unknown route and runs nothing', async () => {
    const run = vi.fn().mockResolvedValue(result);
    await startServer({ secret: SECRET, run });

    for (const headers of [{}, { authorization: 'Bearer wrong' }, { authorization: SECRET }]) {
      const response = await app.inject({ url: '/api/v1/cron/daily', headers });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual(NOT_FOUND);
    }
    expect(run).not.toHaveBeenCalled();
  });

  test('with the secret runs the daily refresh and returns its summary, uncached', async () => {
    const run = vi.fn().mockResolvedValue(result);
    await startServer({ secret: SECRET, run });

    const response = await app.inject({
      url: '/api/v1/cron/daily',
      headers: { authorization: `Bearer ${SECRET}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(result);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(run).toHaveBeenCalledTimes(1);
  });

  test('does not exist when no secret is configured', async () => {
    await startServer(null);

    const response = await app.inject({
      url: '/api/v1/cron/daily',
      headers: { authorization: `Bearer ${SECRET}` },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual(NOT_FOUND);
  });
});
