import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { z } from 'zod';
import { SourceBlockedError, SourceRequestError } from '../../src/lib/errors.ts';
import {
  FixtureHttpClient,
  readCaptureInstant,
  readFixtureNow,
  recordCapture,
  resolveFixtureUrl,
  stripInlineStyles,
} from '../../src/sources/fixture-http.ts';

let fixturesDir: string;

beforeEach(() => {
  fixturesDir = mkdtempSync(join(tmpdir(), 'seansai-fixtures-'));
  mkdirSync(join(fixturesDir, 'apollo'));
  writeFileSync(
    join(fixturesDir, 'apollo', 'manifest.json'),
    JSON.stringify({
      'https://www.apollokinas.lt/xml/TheatreAreas/': '001.json',
      'https://www.apollokinas.lt/xml/Schedule/?area=1019': '002.json',
    }),
  );
  writeFileSync(join(fixturesDir, 'apollo', '001.json'), '{"areas":[1019]}');
  writeFileSync(join(fixturesDir, 'apollo', '002.json'), '{"shows":[]}');
});

afterEach(() => {
  rmSync(fixturesDir, { recursive: true, force: true });
});

describe('FixtureHttpClient', () => {
  test('serves the saved response for a recorded URL', async () => {
    const client = new FixtureHttpClient({ sourceId: 'apollo', fixturesDir, failingSources: [] });

    await expect(client.getText('https://www.apollokinas.lt/xml/TheatreAreas/')).resolves.toBe(
      '{"areas":[1019]}',
    );
    await expect(
      client.getJson(
        'https://www.apollokinas.lt/xml/Schedule/?area=1019',
        z.object({ shows: z.array(z.unknown()) }),
      ),
    ).resolves.toEqual({ shows: [] });
  });

  test('fails clearly for a URL that was never captured', async () => {
    const client = new FixtureHttpClient({ sourceId: 'apollo', fixturesDir, failingSources: [] });

    await expect(client.getText('https://www.apollokinas.lt/other')).rejects.toThrow(
      SourceRequestError,
    );
  });

  test('answers a URL that was never captured as "not found", like a removed page', async () => {
    const client = new FixtureHttpClient({ sourceId: 'apollo', fixturesDir, failingSources: [] });

    await expect(client.getText('https://www.apollokinas.lt/other')).rejects.toMatchObject({
      status: 404,
    });
  });

  test('fails clearly for a source without fixtures', async () => {
    const client = new FixtureHttpClient({ sourceId: 'forum', fixturesDir, failingSources: [] });

    await expect(client.getText('https://restapi.forumcinemas.lt/api/region')).rejects.toThrow(
      /no fixtures/,
    );
  });

  test('simulates a blocked source listed in FIXTURE_FAIL', async () => {
    const client = new FixtureHttpClient({
      sourceId: 'apollo',
      fixturesDir,
      failingSources: ['forum', 'apollo'],
    });

    await expect(client.getText('https://www.apollokinas.lt/xml/TheatreAreas/')).rejects.toThrow(
      SourceBlockedError,
    );
  });
});

describe('stripInlineStyles', () => {
  test('empties inline <style> elements and keeps everything else, scripts included', () => {
    const html = [
      '<html><head><style data-n-head="ssr">.a{color:red}\n.b{}</style>',
      '<link rel="stylesheet" href="/x.css"></head>',
      '<body><time datetime="2026-10-30">30</time>',
      '<script>fullCalendar({ events: [] })</script><STYLE>p{}</STYLE></body></html>',
    ].join('');

    expect(stripInlineStyles(html)).toBe(
      [
        '<html><head><style data-n-head="ssr"></style>',
        '<link rel="stylesheet" href="/x.css"></head>',
        '<body><time datetime="2026-10-30">30</time>',
        '<script>fullCalendar({ events: [] })</script><STYLE></STYLE></body></html>',
      ].join(''),
    );
  });
});

describe('resolveFixtureUrl', () => {
  const now = new Date('2026-10-30T22:30:00Z'); // 00:30 on 31 October in Vilnius

  test('fills in Vilnius dates', () => {
    expect(
      resolveFixtureUrl(
        'https://x.lt/Schedule/?area=1019&dt={today:dd.MM.yyyy}&from={today:yyyy-MM-dd}&to={today+14:yyyy-MM-dd}',
        now,
      ),
    ).toBe('https://x.lt/Schedule/?area=1019&dt=31.10.2026&from=2026-10-31&to=2026-11-14');
  });

  test('rejects an unknown placeholder', () => {
    expect(() => resolveFixtureUrl('https://x.lt/?d={today:MM/dd}', now)).toThrow(/placeholder/);
  });
});

describe('capture log', () => {
  test('records captures per source and uses the earliest one as the fixture clock', () => {
    // The earliest capture, so no source's saved screenings are already in the past.
    const readme = '# Fixtures\n\nSome notes.\n';
    const first = recordCapture(readme, 'forum', new Date('2026-10-30T09:00:00Z'));
    const second = recordCapture(first, 'apollo', new Date('2026-10-30T09:05:00Z'));
    const recaptured = recordCapture(second, 'forum', new Date('2026-10-31T09:10:00Z'));

    expect(recaptured).toContain('Some notes.');
    expect(recaptured.match(/\| forum \|/g)).toHaveLength(1);

    writeFileSync(join(fixturesDir, 'README.md'), recaptured);
    expect(readFixtureNow(fixturesDir)?.toISOString()).toBe('2026-10-30T09:05:00.000Z');
  });

  test('knows when each source was captured', () => {
    const readme = recordCapture('# Fixtures\n', 'forum', new Date('2026-10-31T09:10:00Z'));
    writeFileSync(join(fixturesDir, 'README.md'), readme);

    expect(readCaptureInstant('forum', fixturesDir)?.toISOString()).toBe(
      '2026-10-31T09:10:00.000Z',
    );
    expect(readCaptureInstant('apollo', fixturesDir)).toBeNull();
  });

  test('has no fixture clock before anything was captured', () => {
    expect(readFixtureNow(fixturesDir)).toBeNull();
    expect(readCaptureInstant('forum', fixturesDir)).toBeNull();
  });
});
