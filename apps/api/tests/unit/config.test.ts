import { describe, expect, test } from 'vitest';
import { loadConfig } from '../../src/config.ts';

describe('loadConfig', () => {
  test('applies defaults in fixtures mode, with a fresh in-memory database', () => {
    expect(loadConfig({ SOURCES_MODE: 'fixtures' })).toEqual({
      port: 3000,
      host: 'localhost',
      dbPath: ':memory:',
      sourcesMode: 'fixtures',
      fixtureNow: null,
      fixtureFail: [],
      fixtureLastSuccessHours: {},
      contact: null,
      disabledSources: [],
      serveWebApp: false,
    });
  });

  test('stores live data in apps/api/data by default and serves the web app in production', () => {
    const config = loadConfig({ SEANSAI_CONTACT: 'hello@seansai.lt', NODE_ENV: 'production' });
    expect(config.dbPath).toMatch(/apps\/api\/data\/seansai\.sqlite$/);
    expect(config.serveWebApp).toBe(true);
    expect(loadConfig({ SOURCES_MODE: 'fixtures', DB_PATH: '/data/x.sqlite' }).dbPath).toBe(
      '/data/x.sqlite',
    );
  });

  test('requires SEANSAI_CONTACT in live mode', () => {
    expect(() => loadConfig({})).toThrow(/SEANSAI_CONTACT/);
    expect(loadConfig({ SEANSAI_CONTACT: 'hello@seansai.lt' }).contact).toBe('hello@seansai.lt');
  });

  test('accepts a project URL as the contact', () => {
    expect(loadConfig({ SEANSAI_CONTACT: 'https://github.com/zygispr/Seansai' }).contact).toBe(
      'https://github.com/zygispr/Seansai',
    );
  });

  test('rejects an invalid contact address', () => {
    expect(() => loadConfig({ SEANSAI_CONTACT: 'not-an-email' })).toThrow(/SEANSAI_CONTACT/);
    expect(() => loadConfig({ SEANSAI_CONTACT: 'ftp://example.com' })).toThrow(/SEANSAI_CONTACT/);
  });

  test('parses source id lists and fixture overrides', () => {
    const config = loadConfig({
      SOURCES_MODE: 'fixtures',
      FIXTURE_NOW: '2026-10-30T10:00:00Z',
      FIXTURE_FAIL: 'forum, vue',
      FIXTURE_FORUM_LAST_SUCCESS_HOURS: '4',
      DISABLED_SOURCES: 'vue,cinamon,',
      PORT: '4000',
    });
    expect(config.fixtureNow?.toISOString()).toBe('2026-10-30T10:00:00.000Z');
    expect(config.fixtureFail).toEqual(['forum', 'vue']);
    expect(config.fixtureLastSuccessHours).toEqual({ forum: 4 });
    expect(config.disabledSources).toEqual(['vue', 'cinamon']);
    expect(config.port).toBe(4000);
  });

  test('rejects an unknown sources mode', () => {
    expect(() => loadConfig({ SOURCES_MODE: 'mock' })).toThrow(/SOURCES_MODE/);
  });
});
