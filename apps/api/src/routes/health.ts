import type { HealthResponse } from '@seansai/shared';
import type { FastifyPluginAsync } from 'fastify';
import type { Repository } from '../db/repository.ts';
import { formatInstant } from '../lib/time.ts';
import { deriveSourceStatus } from '../refresh/status.ts';

type HealthRouteOptions = {
  repo: Repository;
  now: () => Date;
  sourceIds: readonly string[];
};

/** Liveness plus per-source status, for monitoring (not used by the UI). */
export const healthRoutes: FastifyPluginAsync<HealthRouteOptions> = (app, options) => {
  app.get('/health', async (_request, reply): Promise<HealthResponse> => {
    reply.header('cache-control', 'no-store');
    const now = options.now();
    return {
      status: 'ok',
      sources: await Promise.all(
        options.sourceIds.map(async (id) => {
          const source = await options.repo.getSource(id);
          return {
            id,
            status: deriveSourceStatus(source, now),
            lastSuccessAt: source?.lastSuccessAt ? formatInstant(source.lastSuccessAt) : null,
          };
        }),
      ),
    };
  });
  return Promise.resolve();
};
