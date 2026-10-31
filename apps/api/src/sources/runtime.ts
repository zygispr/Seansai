import type { Config } from '../config.ts';
import type { Logger } from '../lib/logger.ts';
import { PoliteHttpClient, type HttpClient } from '../lib/polite-http.ts';
import { FixtureHttpClient, readCaptureInstant, readFixtureNow } from './fixture-http.ts';
import { findSourceConfig } from './index.ts';
import type { SourceAdapter, SourceId } from './types.ts';

/** Fixture mode runs on a fixed clock so "today" matches the saved data. */
export function createClock(config: Config): () => Date {
  if (config.sourcesMode === 'live') return () => new Date();
  const fixed = config.fixtureNow ?? readFixtureNow();
  return fixed ? () => fixed : () => new Date();
}

/**
 * The clock an adapter runs on. In fixture mode it replays its source as captured, so the dated
 * URLs it builds match the saved ones even when sources were captured on different days.
 */
export function adapterNow(sourceId: SourceId, config: Config, now: Date): Date {
  if (config.sourcesMode === 'live') return now;
  return readCaptureInstant(sourceId) ?? now;
}

/** The polite live client, or the fixture client in fixture mode. */
export function createHttpClient(
  adapter: SourceAdapter,
  config: Config,
  logger: Logger,
): HttpClient {
  if (config.sourcesMode === 'fixtures') {
    return new FixtureHttpClient({ sourceId: adapter.id, failingSources: config.fixtureFail });
  }
  if (config.contact === null) throw new Error('SEANSAI_CONTACT is required in live mode');
  return new PoliteHttpClient({
    sourceId: adapter.id,
    contact: config.contact,
    robotsOverride: findSourceConfig(adapter.id)?.robotsOverride ?? false,
    logger,
  });
}
