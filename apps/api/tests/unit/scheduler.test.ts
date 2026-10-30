import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { startScheduler, type SchedulerOptions } from '../../src/refresh/scheduler.ts';
import type { SourceAdapter } from '../../src/sources/types.ts';
import { createTestLogger } from '../helpers/test-logger.ts';

const MINUTE = 60 * 1000;
const adapter = (id: SourceAdapter['id']): SourceAdapter => ({
  id,
  fetchScreenings: () => Promise.resolve({ screenings: [], skipped: [] }),
});
const apollo = adapter('apollo');
const forum = adapter('forum');

function options(overrides: Partial<SchedulerOptions> = {}): SchedulerOptions {
  return {
    mode: 'live',
    clock: () => new Date(),
    logger: createTestLogger().logger,
    refresh: vi.fn(() => Promise.resolve()),
    cleanup: vi.fn(),
    random: () => 0.5,
    ...overrides,
  };
}

const refreshedIds = (refresh: SchedulerOptions['refresh']) =>
  vi.mocked(refresh).mock.calls.map(([source]) => source.id);

beforeEach(() => {
  // 12:00 in Vilnius
  vi.useFakeTimers({ now: new Date('2026-10-30T10:00:00Z') });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('startScheduler', () => {
  test('refreshes every source once at startup', async () => {
    const opts = options();
    const scheduler = startScheduler([apollo, forum], opts);
    await scheduler.startupRun;

    expect(refreshedIds(opts.refresh)).toEqual(['apollo', 'forum']);
    scheduler.stop();
  });

  test('one failing source never blocks the others', async () => {
    const refresh = vi.fn((source: SourceAdapter) =>
      source.id === 'apollo' ? Promise.reject(new Error('boom')) : Promise.resolve(),
    );
    const opts = options({ refresh });
    const scheduler = startScheduler([apollo, forum], opts);
    await scheduler.startupRun;
    expect(refreshedIds(refresh)).toEqual(['apollo', 'forum']);

    await vi.advanceTimersByTimeAsync(60 * MINUTE);
    expect(refreshedIds(refresh)).toEqual(['apollo', 'forum', 'apollo', 'forum']);
    scheduler.stop();
  });

  test('refreshes each source again every 60 minutes ± 5 minutes of jitter', async () => {
    let jitter = 0; // random() = 0 → -5 min, 1 → +5 min
    const opts = options({ random: () => jitter });
    const scheduler = startScheduler([apollo], opts);
    await scheduler.startupRun;

    await vi.advanceTimersByTimeAsync(55 * MINUTE - 1);
    expect(opts.refresh).toHaveBeenCalledTimes(1);
    jitter = 1;
    await vi.advanceTimersByTimeAsync(1);
    expect(opts.refresh).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(65 * MINUTE - 1);
    expect(opts.refresh).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(opts.refresh).toHaveBeenCalledTimes(3);
    scheduler.stop();
  });

  test('passes the current time to each refresh', async () => {
    const opts = options();
    const scheduler = startScheduler([apollo], opts);
    await scheduler.startupRun;
    await vi.advanceTimersByTimeAsync(60 * MINUTE);

    expect(vi.mocked(opts.refresh).mock.calls.map(([, now]) => now.toISOString())).toEqual([
      '2026-10-30T10:00:00.000Z',
      '2026-10-30T11:00:00.000Z',
    ]);
    scheduler.stop();
  });

  test('runs the cleanup daily at 04:00 Vilnius time', async () => {
    const opts = options();
    const scheduler = startScheduler([], opts);

    // From 12:00 on 30 October to 04:00 on 31 October (UTC+2) is 16 hours.
    await vi.advanceTimersByTimeAsync(16 * 60 * MINUTE - 1);
    expect(opts.cleanup).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(opts.cleanup).toHaveBeenCalledWith(new Date('2026-10-31T02:00:00Z'));

    await vi.advanceTimersByTimeAsync(24 * 60 * MINUTE);
    expect(opts.cleanup).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });

  test('in fixture mode, refreshes only once at startup', async () => {
    const opts = options({ mode: 'fixtures' });
    const scheduler = startScheduler([apollo, forum], opts);
    await scheduler.startupRun;

    await vi.advanceTimersByTimeAsync(48 * 60 * MINUTE);
    expect(opts.refresh).toHaveBeenCalledTimes(2);
    expect(opts.cleanup).not.toHaveBeenCalled();
    scheduler.stop();
  });

  test('stop() prevents further runs', async () => {
    const opts = options();
    const scheduler = startScheduler([apollo], opts);
    await scheduler.startupRun;
    scheduler.stop();

    await vi.advanceTimersByTimeAsync(48 * 60 * MINUTE);
    expect(opts.refresh).toHaveBeenCalledTimes(1);
    expect(opts.cleanup).not.toHaveBeenCalled();
  });
});
