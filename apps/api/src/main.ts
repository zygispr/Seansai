import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.ts';
import { openDb } from './db/index.ts';
import { Repository } from './db/repository.ts';
import { createLogger } from './lib/logger.ts';
import { todayIn } from './lib/time.ts';
import { loadAliases } from './matching/match.ts';
import { refreshSource } from './refresh/refresh-source.ts';
import { startScheduler } from './refresh/scheduler.ts';
import { cinemaRegistry } from './registry/cinemas.ts';
import { buildServer } from './server.ts';
import { adapters, findSourceConfig, logRobotsOverrides, sourceConfigs } from './sources/index.ts';
import { adapterNow, createClock, createHttpClient } from './sources/runtime.ts';

const WEB_DIST_DIR = fileURLToPath(new URL('../../web/dist', import.meta.url));
const HOUR_MS = 60 * 60 * 1000;

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger();
  const clock = createClock(config);
  const db = openDb(config.dbPath);
  const repo = new Repository(db);

  if (config.sourcesMode === 'fixtures') {
    // Simulates sources whose last success was N hours ago (resilience scenario, FR-015).
    for (const [sourceId, hours] of Object.entries(config.fixtureLastSuccessHours)) {
      repo.recordSourceSuccess(sourceId, new Date(clock().getTime() - hours * HOUR_MS));
    }
  }
  logRobotsOverrides(logger);

  const enabledAdapters = adapters.filter((adapter) => findSourceConfig(adapter.id)?.enabled);
  const httpClients = new Map(
    enabledAdapters.map((adapter) => [adapter.id, createHttpClient(adapter, config, logger)]),
  );
  const aliases = loadAliases();

  const server = buildServer({
    db,
    now: clock,
    logger,
    sourceIds: sourceConfigs
      .filter((source) => source.enabled && !config.disabledSources.includes(source.id))
      .map((source) => source.id),
    webDistDir: config.serveWebApp ? WEB_DIST_DIR : null,
  });
  await server.listen({ port: config.port, host: config.host });

  const scheduler = startScheduler(enabledAdapters, {
    mode: config.sourcesMode,
    clock,
    logger,
    refresh: (adapter, now) => {
      const http = httpClients.get(adapter.id);
      if (!http) throw new Error(`No HTTP client for source ${adapter.id}`);
      return refreshSource(adapter, {
        repo,
        registry: cinemaRegistry,
        http,
        now,
        sourceNow: adapterNow(adapter.id, config, now),
        aliases,
        logger,
        disabledSources: config.disabledSources,
      });
    },
    cleanup: (now) => {
      const screenings = repo.deletePastScreenings(todayIn(now));
      const movies = repo.deleteStaleMovies(now);
      logger.info({ screenings, movies }, 'Daily cleanup removed past screenings and old movies');
    },
  });
  logger.info(
    {
      mode: config.sourcesMode,
      sources: enabledAdapters.map((adapter) => adapter.id),
      now: clock(),
    },
    'Seansai API started',
  );

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down');
    scheduler.stop();
    await server.close();
    db.close();
  };
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      shutdown(signal).catch((error: unknown) => {
        logger.error({ err: error }, 'Error during shutdown');
        process.exitCode = 1;
      });
    });
  }
}

main().catch((error: unknown) => {
  // The logger may not exist yet (e.g. invalid configuration), so report on stderr.
  console.error('Seansai API failed to start:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
