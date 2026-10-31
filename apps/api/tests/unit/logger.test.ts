import Fastify from 'fastify';
import { expect, test } from 'vitest';
import { createTestLogger } from '../helpers/test-logger.ts';

test('request log lines contain no IP address, user agent or cookies', async () => {
  const { logger, lines, raw } = createTestLogger();
  const app = Fastify({ loggerInstance: logger });
  app.get('/api/v1/movies', () => ({ movies: [] }));

  await app.inject({
    method: 'GET',
    url: '/api/v1/movies?city=vilnius',
    remoteAddress: '203.0.113.7',
    headers: {
      'x-forwarded-for': '198.51.100.23',
      'user-agent': 'Mozilla/5.0 (Test Browser)',
      cookie: 'session=secret',
      authorization: 'Bearer secret',
    },
  });
  await app.close();

  const output = raw();
  expect(output).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/);
  expect(output).not.toContain('Mozilla');
  expect(output).not.toContain('secret');
  expect(output).not.toMatch(/remoteAddress|remotePort|hostname/);

  const incoming = lines().find((line) => line.msg === 'incoming request');
  expect(incoming?.req).toEqual({ method: 'GET', route: '/api/v1/movies' });
  const completed = lines().find((line) => line.msg === 'request completed');
  expect(completed?.res).toEqual({ statusCode: 200 });
  expect(completed?.responseTime).toEqual(expect.any(Number));
});
