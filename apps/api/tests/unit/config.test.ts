import { describe, expect, test } from 'vitest';
import { loadConfig } from '../../src/config.ts';

describe('loadConfig', () => {
  test('applies defaults in fixtures mode, with a fresh in-memory database', () => {
    expect(loadConfig({ SOURCES_MODE: 'fixtures' })).toEqual({
      port: 3000,
      host: 'localhost',
      db: { url: ':memory:', authToken: null },
      sourcesMode: 'fixtures',
      refreshMode: 'scheduler',
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
    expect(config.db.url).toMatch(/^file:.*apps\/api\/data\/seansai\.sqlite$/);
    expect(config.db.authToken).toBeNull();
    expect(config.refreshMode).toBe('scheduler');
    expect(config.serveWebApp).toBe(true);
    expect(loadConfig({ SOURCES_MODE: 'fixtures', DB_PATH: '/data/x.sqlite' }).db.url).toBe(
      'file:/data/x.sqlite',
    );
  });

  test('on Vercel uses Turso, refreshes by cron and leaves the web app to its own service', () => {
    const config = loadConfig({
      SEANSAI_CONTACT: 'hello@seansai.lt',
      VERCEL: '1',
      NODE_ENV: 'production',
      TURSO_DATABASE_URL: 'libsql://seansai-x.turso.io',
      TURSO_AUTH_TOKEN: 't',
    });
    expect(config.db).toEqual({ url: 'libsql://seansai-x.turso.io', authToken: 't' });
    expect(config.refreshMode).toBe('cron');
    expect(config.serveWebApp).toBe(false);
  });

  test('requires TURSO_DATABASE_URL on Vercel in live mode', () => {
    expect(() => loadConfig({ SEANSAI_CONTACT: 'hello@seansai.lt', VERCEL: '1' })).toThrow(
      /TURSO_DATABASE_URL is required on Vercel/,
    );
  });

  test('in fixture mode on Vercel, uses an in-memory database and the startup refresh', () => {
    const config = loadConfig({ SOURCES_MODE: 'fixtures', VERCEL: '1' });
    expect(config.refreshMode).toBe('scheduler');
    expect(config.db.url).toBe(':memory:');
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
