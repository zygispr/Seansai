import type { Logger } from '../lib/logger.ts';
import { addDays, instantFromLocal, todayIn } from '../lib/time.ts';
import type { SourceAdapter } from '../sources/types.ts';

const REFRESH_INTERVAL_MS = 60 * 60 * 1000;
const JITTER_MS = 5 * 60 * 1000;
const CLEANUP_LOCAL_TIME = '04:00';

export type SchedulerOptions = {
  mode: 'live' | 'fixtures';
  clock: () => Date;
  logger: Logger;
  /** Refreshes one source; expected to record its own failures. */
  refresh: (adapter: SourceAdapter, now: Date) => Promise<unknown>;
  /** Removes past screenings and stale movies. */
  cleanup: (now: Date) => Promise<void>;
  random?: () => number;
};

export type Scheduler = {
  /** Settles when every source has finished its startup refresh. */
  startupRun: Promise<void>;
  stop(): void;
};

/**
 * Refreshes every source at startup, then each one every 60 minutes ± 5 minutes, independently,
 * so one slow or failing source never delays another (research.md §4). Cleans up daily at 04:00
 * Vilnius time. In fixture mode only the startup refresh runs.
 */
export function startScheduler(
  adapters: readonly SourceAdapter[],
  options: SchedulerOptions,
): Scheduler {
  const { mode, clock, logger, refresh, cleanup } = options;
  const random = options.random ?? Math.random;
  const timers = new Set<NodeJS.Timeout>();
  let stopped = false;

  const schedule = (delayMs: number, task: () => void): void => {
    if (stopped) return;
    const timer = setTimeout(() => {
      timers.delete(timer);
      task();
    }, delayMs);
    timers.add(timer);
  };

  const runRefresh = async (adapter: SourceAdapter): Promise<void> => {
    try {
      await refresh(adapter, clock());
    } catch (error) {
      logger.error({ source: adapter.id, err: error }, 'Unexpected error while refreshing source');
    }
    if (mode === 'live') {
      const jitter = (random() * 2 - 1) * JITTER_MS;
      schedule(REFRESH_INTERVAL_MS + jitter, () => void runRefresh(adapter));
    }
  };

  const msUntilNextCleanup = (): number => {
    const now = clock();
    const today = todayIn(now);
    let next = instantFromLocal(today, CLEANUP_LOCAL_TIME);
    if (next.getTime() <= now.getTime()) {
      next = instantFromLocal(addDays(today, 1), CLEANUP_LOCAL_TIME);
    }
    return next.getTime() - now.getTime();
  };

  const runCleanup = async (): Promise<void> => {
    try {
      await cleanup(clock());
    } catch (error) {
      logger.error({ err: error }, 'Daily cleanup failed');
    }
    schedule(msUntilNextCleanup(), () => void runCleanup());
  };

  const startupRun = Promise.all(adapters.map(runRefresh)).then(() => undefined);
  if (mode === 'live') schedule(msUntilNextCleanup(), () => void runCleanup());

  return {
    startupRun,
    stop() {
      stopped = true;
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
    },
  };
}
