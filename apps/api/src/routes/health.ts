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
    const sources = new Map(
      (await options.repo.listSources()).map((source) => [source.id, source] as const),
    );
    return {
      status: 'ok',
      sources: options.sourceIds.map((id) => {
        const source = sources.get(id);
        return {
          id,
          status: deriveSourceStatus(source, now),
          lastSuccessAt: source?.lastSuccessAt ? formatInstant(source.lastSuccessAt) : null,
        };
      }),
    };
  });
  return Promise.resolve();
};
