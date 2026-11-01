import { describe, expect, test, vi } from 'vitest';
import { runDailyRefresh } from '../../src/refresh/daily.ts';
import type { RefreshOutcome } from '../../src/refresh/refresh-source.ts';
import type { SourceAdapter } from '../../src/sources/types.ts';
import { createTestLogger } from '../helpers/test-logger.ts';

const NOW = new Date('2026-10-30T22:15:00Z');
const adapter = (id: SourceAdapter['id']): SourceAdapter => ({
  id,
  fetchScreenings: () => Promise.resolve({ screenings: [], skipped: [] }),
});

describe('runDailyRefresh', () => {
  test('refreshes every source, isolates failures, then cleans up once', async () => {
    const log = createTestLogger();
    const order: string[] = [];
    const outcomes: Record<string, RefreshOutcome> = {
      apollo: { status: 'success', stored: 3, skipped: 0, newReviews: 0 },
      forum: { status: 'failed', error: 'x' },
    };
    const refresh = vi.fn((source: SourceAdapter): Promise<RefreshOutcome> => {
      order.push(source.id);
      const outcome = outcomes[source.id];
      // Vue throws synchronously, as a refresh with a missing HTTP client would.
      if (!outcome) throw new Error('adapter crashed');
      return Promise.resolve(outcome);
    });
    const cleanup = vi.fn(() => {
      order.push('cleanup');
      return Promise.resolve({ screenings: 4, movies: 1 });
    });

    const result = await runDailyRefresh({
      adapters: [adapter('apollo'), adapter('forum'), adapter('vue')],
      refresh,
      cleanup,
      clock: () => NOW,
      logger: log.logger,
    });

    expect(result).toEqual({
      sources: { apollo: 'success', forum: 'failed', vue: 'failed' },
      cleanup: { screenings: 4, movies: 1 },
    });
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledWith(NOW);
    expect(order.at(-1)).toBe('cleanup');
    expect(log.lines()).toContainEqual(expect.objectContaining({ level: 50, source: 'vue' }));
  });
});
