import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import {
  RobotsDisallowedError,
  SourceBlockedError,
  SourceRequestError,
  SourceResponseError,
} from '../../src/lib/errors.ts';
import { PoliteHttpClient } from '../../src/lib/polite-http.ts';
import { createTestLogger } from '../helpers/test-logger.ts';

/** `status: 'hang'` simulates a server that never answers. */
type Route = { status?: number | 'hang'; body?: string; contentType?: string };
type Call = { url: string; at: number; headers: Headers };

const ALLOW_ALL: Route = { body: 'User-agent: *\nAllow: /\n' };

function createClient(routes: Record<string, Route>, options: { robotsOverride?: boolean } = {}) {
  const calls: Call[] = [];
  const fetch = vi.fn((input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input.toString();
    calls.push({ url, at: Date.now(), headers: new Headers(init?.headers) });
    const route = routes[url] ?? { status: 404 };
    if (route.status === 'hang') {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    }
    return Promise.resolve(
      new Response(route.body ?? '', {
        status: route.status ?? 200,
        headers: { 'content-type': route.contentType ?? 'text/plain' },
      }),
    );
  });
  const { logger, lines } = createTestLogger();
  const client = new PoliteHttpClient({
    sourceId: 'test',
    contact: 'hello@seansai.lt',
    robotsOverride: options.robotsOverride ?? false,
    logger,
    fetch,
  });
  const urls = () => calls.map((call) => call.url);
  return { client, calls, urls, lines };
}

/** Runs fake timers until the promise settles, then returns its outcome. */
async function settle<T>(promise: Promise<T>): Promise<T> {
  const outcome = promise.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  await vi.runAllTimersAsync();
  const result = await outcome;
  if (result.ok) return result.value;
  throw result.error;
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-10-30T10:00:00Z') });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('PoliteHttpClient', () => {
  test('identifies itself with a User-Agent that includes the contact address', async () => {
    const { client, calls } = createClient({
      'https://cinema.lt/robots.txt': ALLOW_ALL,
      'https://cinema.lt/schedule': { body: 'ok' },
    });

    await expect(settle(client.getText('https://cinema.lt/schedule'))).resolves.toBe('ok');

    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.headers.get('user-agent')).toBe('Seansai/1.0 (+mailto:hello@seansai.lt)');
    }
  });

  test('sends no browser-like headers', async () => {
    const { client, calls } = createClient({
      'https://cinema.lt/robots.txt': ALLOW_ALL,
      'https://cinema.lt/schedule': { body: 'ok' },
    });

    await settle(client.getText('https://cinema.lt/schedule'));

    expect([...(calls.at(-1)?.headers.keys() ?? [])]).toEqual(['user-agent']);
  });

  test('waits at least 500 ms between requests to the same host', async () => {
    const { client, calls, urls } = createClient({
      'https://cinema.lt/robots.txt': ALLOW_ALL,
      'https://cinema.lt/a': { body: 'a' },
      'https://cinema.lt/b': { body: 'b' },
    });

    await settle(
      Promise.all([client.getText('https://cinema.lt/a'), client.getText('https://cinema.lt/b')]),
    );

    expect(urls()).toEqual([
      'https://cinema.lt/robots.txt',
      'https://cinema.lt/a',
      'https://cinema.lt/b',
    ]);
    const gaps = calls.slice(1).map((call, index) => call.at - (calls[index]?.at ?? 0));
    expect(gaps.every((gap) => gap >= 500)).toBe(true);
  });

  test('does not delay the first request to a different host', async () => {
    const { client, calls } = createClient({
      'https://a.lt/robots.txt': ALLOW_ALL,
      'https://a.lt/x': { body: 'x' },
      'https://b.lt/robots.txt': ALLOW_ALL,
      'https://b.lt/y': { body: 'y' },
    });

    await settle(client.getText('https://a.lt/x'));
    const finishedAt = Date.now();
    await settle(client.getText('https://b.lt/y'));

    expect(calls.find((call) => call.url === 'https://b.lt/robots.txt')?.at).toBe(finishedAt);
  });

  test('times out after 15 seconds', async () => {
    const { client } = createClient({
      'https://cinema.lt/robots.txt': ALLOW_ALL,
      'https://cinema.lt/slow': { status: 'hang' },
    });

    const request = settle(client.getText('https://cinema.lt/slow'));

    await expect(request).rejects.toThrow(SourceRequestError);
    await expect(request).rejects.toThrow(/timed out after 15000 ms/);
  });

  test('refuses a URL disallowed by robots.txt', async () => {
    const { client, urls } = createClient({
      'https://cinema.lt/robots.txt': { body: 'User-agent: *\nDisallow: /data/\n' },
    });

    await expect(settle(client.getText('https://cinema.lt/data/films'))).rejects.toThrow(
      RobotsDisallowedError,
    );
    expect(urls()).toEqual(['https://cinema.lt/robots.txt']);
  });

  test('treats a missing robots.txt as allowing everything', async () => {
    const { client } = createClient({
      'https://api.cinema.lt/robots.txt': { status: 404 },
      'https://api.cinema.lt/region': { body: 'ok' },
    });

    await expect(settle(client.getText('https://api.cinema.lt/region'))).resolves.toBe('ok');
  });

  test('fails the request when robots.txt returns a server error', async () => {
    const { client, urls } = createClient({
      'https://cinema.lt/robots.txt': { status: 503 },
    });

    await expect(settle(client.getText('https://cinema.lt/schedule'))).rejects.toThrow(
      SourceRequestError,
    );
    expect(urls()).toEqual(['https://cinema.lt/robots.txt']);
  });

  test('with robotsOverride, fetches a disallowed URL and warns once per cycle', async () => {
    const { client, urls, lines } = createClient(
      {
        'https://vue.lt/robots.txt': { body: 'User-agent: *\nDisallow: /data/\n' },
        'https://vue.lt/data/a': { body: 'a' },
        'https://vue.lt/data/b': { body: 'b' },
      },
      { robotsOverride: true },
    );
    const overrideWarnings = () =>
      lines().filter((line) => line.msg.includes('robots.txt override'));

    client.beginCycle();
    await expect(
      settle(
        Promise.all([
          client.getText('https://vue.lt/data/a'),
          client.getText('https://vue.lt/data/b'),
        ]),
      ),
    ).resolves.toEqual(['a', 'b']);
    expect(overrideWarnings()).toHaveLength(1);

    client.beginCycle();
    await settle(client.getText('https://vue.lt/data/a'));
    expect(overrideWarnings()).toHaveLength(2);
    expect(urls().filter((url) => url.endsWith('/robots.txt'))).toHaveLength(1);
  });

  test.each([401, 403, 429])(
    'throws SourceBlockedError on HTTP %i without retrying',
    async (status) => {
      const { client, urls } = createClient({
        'https://cinema.lt/robots.txt': ALLOW_ALL,
        'https://cinema.lt/schedule': { status },
      });

      await expect(settle(client.getText('https://cinema.lt/schedule'))).rejects.toThrow(
        SourceBlockedError,
      );
      expect(urls().filter((url) => url.endsWith('/schedule'))).toHaveLength(1);
    },
  );

  test('throws SourceBlockedError on a CAPTCHA challenge page, without retrying', async () => {
    const { client, urls } = createClient({
      'https://cinema.lt/robots.txt': ALLOW_ALL,
      'https://cinema.lt/schedule': {
        contentType: 'text/html; charset=utf-8',
        body: '<html><head><title>Just a moment...</title></head><body>Checking</body></html>',
      },
    });

    await expect(settle(client.getText('https://cinema.lt/schedule'))).rejects.toThrow(
      SourceBlockedError,
    );
    expect(urls().filter((url) => url.endsWith('/schedule'))).toHaveLength(1);
  });

  test('does not mistake an ordinary page that loads reCAPTCHA for a block page', async () => {
    const { client } = createClient({
      'https://cinema.lt/robots.txt': ALLOW_ALL,
      'https://cinema.lt/filmai': {
        contentType: 'text/html',
        body: '<html><body><h1>Filmai</h1><script src="https://www.google.com/recaptcha/api.js"></script></body></html>',
      },
    });

    await expect(settle(client.getText('https://cinema.lt/filmai'))).resolves.toContain('Filmai');
  });

  test('throws SourceRequestError on other non-2xx responses', async () => {
    const { client } = createClient({
      'https://cinema.lt/robots.txt': ALLOW_ALL,
      'https://cinema.lt/schedule': { status: 500 },
    });

    await expect(settle(client.getText('https://cinema.lt/schedule'))).rejects.toThrow(
      SourceRequestError,
    );
  });

  test('caches robots.txt for 24 hours', async () => {
    const { client, urls } = createClient({
      'https://cinema.lt/robots.txt': ALLOW_ALL,
      'https://cinema.lt/schedule': { body: 'ok' },
    });
    const robotsRequests = () => urls().filter((url) => url.endsWith('/robots.txt')).length;

    await settle(client.getText('https://cinema.lt/schedule'));
    vi.advanceTimersByTime(23 * 60 * 60 * 1000);
    await settle(client.getText('https://cinema.lt/schedule'));
    expect(robotsRequests()).toBe(1);

    vi.advanceTimersByTime(60 * 60 * 1000);
    await settle(client.getText('https://cinema.lt/schedule'));
    expect(robotsRequests()).toBe(2);
  });

  test('getJson parses and validates the body', async () => {
    const { client } = createClient({
      'https://cinema.lt/robots.txt': ALLOW_ALL,
      'https://cinema.lt/ok.json': { body: '{"count":3}' },
      'https://cinema.lt/wrong-shape.json': { body: '{"count":"3"}' },
      'https://cinema.lt/broken.json': { body: '{"count":' },
    });
    const schema = z.object({ count: z.number() });

    await expect(settle(client.getJson('https://cinema.lt/ok.json', schema))).resolves.toEqual({
      count: 3,
    });
    await expect(
      settle(client.getJson('https://cinema.lt/wrong-shape.json', schema)),
    ).rejects.toThrow(SourceResponseError);
    await expect(settle(client.getJson('https://cinema.lt/broken.json', schema))).rejects.toThrow(
      SourceResponseError,
    );
  });
});
