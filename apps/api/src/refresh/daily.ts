import type { Logger } from '../lib/logger.ts';
import type { SourceAdapter } from '../sources/types.ts';
import type { RefreshOutcome } from './refresh-source.ts';

/** The daily run's summary, returned by the cron route and logged; never stored. */
export type DailyRefreshResult = {
  sources: Record<string, RefreshOutcome['status']>;
  cleanup: { screenings: number; movies: number };
};

type DailyRefreshDeps = {
  adapters: readonly SourceAdapter[];
  /** Refreshes one source; records its own failures on the source. */
  refresh: (adapter: SourceAdapter, now: Date) => Promise<RefreshOutcome>;
  /** Removes past screenings and stale movies; returns how many of each. */
  cleanup: (now: Date) => Promise<{ screenings: number; movies: number }>;
  clock: () => Date;
  logger: Logger;
};

/**
 * Refreshes every source in parallel, so the run fits the platform's 300 s limit, then cleans up
 * once all have settled. One source failing or throwing never stops the others or the cleanup
 * (FR-009).
 */
export async function runDailyRefresh(deps: DailyRefreshDeps): Promise<DailyRefreshResult> {
  const { adapters, refresh, cleanup, clock, logger } = deps;
  // `async` turns a refresh that throws synchronously into a rejection, isolated like any other.
  const settled = await Promise.allSettled(
    adapters.map(async (adapter) => refresh(adapter, clock())),
  );

  const sources: DailyRefreshResult['sources'] = {};
  settled.forEach((outcome, index) => {
    const source = adapters[index]?.id;
    if (source === undefined) return;
    if (outcome.status === 'fulfilled') {
      sources[source] = outcome.value.status;
    } else {
      logger.error({ source, err: outcome.reason }, 'Unexpected error while refreshing source');
      sources[source] = 'failed';
    }
  });

  const removed = await cleanup(clock());
  logger.info({ sources, cleanup: removed }, 'Daily refresh finished');
  return { sources, cleanup: removed };
}
