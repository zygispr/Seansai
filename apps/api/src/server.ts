import { constants as zlib } from 'node:zlib';
import fastifyCompress from '@fastify/compress';
import fastifyEtag from '@fastify/etag';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import type { Db } from './db/index.ts';
import { Queries } from './db/queries.ts';
import { Repository } from './db/repository.ts';
import { createLogger, type Logger } from './lib/logger.ts';
import { cinemaRegistry } from './registry/cinemas.ts';
import { citiesRoutes } from './routes/cities.ts';
import { healthRoutes } from './routes/health.ts';
import { ApiError, errorBody } from './routes/http.ts';
import { moviesRoutes } from './routes/movies.ts';
import { screeningsRoutes } from './routes/screenings.ts';
import { sourceConfigs } from './sources/index.ts';

export type ServerOptions = {
  db: Db;
  now: () => Date;
  logger?: Logger;
  /** Sources whose cinemas are shown and reported by `/health`; defaults to every enabled one. */
  sourceIds?: readonly string[];
  /** Built web app to serve (production); null when Vite serves it (development). */
  webDistDir?: string | null;
};

const API_PREFIX = '/api/v1';

/**
 * Sent with every response. The web app loads only its own scripts and styles (no inline code);
 * posters come from the cinemas' websites over HTTPS. On Vercel the web service sends a copy
 * from vercel.json; tests/unit/vercel-config.test.ts keeps the two equal.
 */
export const SECURITY_HEADERS = {
  'content-security-policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' https: data:",
    "connect-src 'self'",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
} as const;

export function buildServer(options: ServerOptions): FastifyInstance {
  const repo = new Repository(options.db);
  const sourceIds =
    options.sourceIds ??
    sourceConfigs.filter((source) => source.enabled).map((source) => source.id);
  const queries = new Queries({ db: options.db, registry: cinemaRegistry, sourceIds });

  // The logger's own serializers keep request logs free of personal data (lib/logger.ts).
  const loggerInstance: FastifyBaseLogger = options.logger ?? createLogger();
  const app = Fastify({ loggerInstance });

  void app.register(fastifyEtag);
  // JSON answers are compressed per request with a fast Brotli level; the web app's files are
  // compressed once at build time and served as they are (preCompressed below).
  void app.register(fastifyCompress, {
    encodings: ['br', 'gzip'],
    threshold: 1024,
    brotliOptions: { params: { [zlib.BROTLI_PARAM_QUALITY]: 4 } },
  });

  app.addHook('onRequest', (_request, reply, done) => {
    reply.headers(SECURITY_HEADERS);
    done();
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      return reply.status(error.statusCode).send(errorBody(error.code, error.message));
    }
    request.log.error({ err: error }, 'Unhandled error');
    // Never leak internals (constitution, Principle V: no raw technical errors).
    return reply
      .status(500)
      .send(
        errorBody('internal_error', 'Something went wrong on our side. Please try again later.'),
      );
  });

  const webDistDir = options.webDistDir ?? null;
  app.setNotFoundHandler((request, reply) => {
    if (webDistDir === null || request.url.startsWith('/api/')) {
      return reply.status(404).send(errorBody('not_found', 'There is no such API route.'));
    }
    // Single-page app: every other path is a client-side route.
    return reply.sendFile('index.html');
  });

  if (webDistDir !== null) {
    void app.register(fastifyStatic, {
      root: webDistDir,
      // Serves the .br or .gz copy written by the web build when the browser accepts it.
      preCompressed: true,
      cacheControl: false,
      setHeaders: (reply, path) => {
        // Vite fingerprints everything under assets/, so it can be cached forever.
        const cacheControl = path.includes('/assets/')
          ? 'public, max-age=31536000, immutable'
          : 'no-cache';
        reply.header('cache-control', cacheControl);
      },
    });
  }

  void app.register(
    async (api) => {
      await api.register(healthRoutes, { repo, now: options.now, sourceIds });
      await api.register(citiesRoutes, { queries });
      await api.register(moviesRoutes, { queries, now: options.now });
      await api.register(screeningsRoutes, { queries, now: options.now });
    },
    { prefix: API_PREFIX },
  );

  return app;
}
