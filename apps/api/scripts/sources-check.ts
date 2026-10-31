/**
 * `npm run sources:check` (quickstart "Live sources", manual, not in CI): fetches every enabled
 * source once, politely, and prints screenings per cinema for today and the next 6 days, which
 * sources run with a robots.txt override, and each source's declared limitations. Exits non-zero
 * if a source fails: a fetch error, invalid items, or a day without screenings it should have.
 *
 * Needs SEANSAI_CONTACT (sent in the User-Agent). `--fixtures` checks the saved fixtures instead.
 */
import { loadConfig } from '../src/config.ts';
import { createLogger } from '../src/lib/logger.ts';
import { cinemaRegistry } from '../src/registry/cinemas.ts';
import { checkSource, formatReport, type SourceCheck } from '../src/sources/check.ts';
import { adapters, findSourceConfig, sourceConfigs } from '../src/sources/index.ts';
import { adapterNow, createClock, createHttpClient } from '../src/sources/runtime.ts';

const fixtures = process.argv.includes('--fixtures');
let config: ReturnType<typeof loadConfig>;
try {
  config = loadConfig({ ...process.env, ...(fixtures ? { SOURCES_MODE: 'fixtures' } : {}) });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  console.error('Set SEANSAI_CONTACT (an email or the project URL), or pass --fixtures.');
  process.exit(1);
}
const logger = createLogger({ level: 'warn' });
const now = createClock(config)();
const active = sourceConfigs.filter(
  (source) => source.enabled && !config.disabledSources.includes(source.id),
);

console.log(
  `Checking ${String(active.length)} sources (${config.sourcesMode}), today is ${now.toISOString()}\n`,
);

// Sources are on different hosts, so they are checked at the same time; each client still waits
// between requests to its own host.
const reports: SourceCheck[] = await Promise.all(
  active.map(async (source) => {
    const adapter = adapters.find((candidate) => candidate.id === source.id);
    if (!adapter) {
      return {
        source: source.id,
        robotsOverride: source.robotsOverride,
        limitations: [],
        error: 'no adapter',
        invalid: 0,
        skipped: 0,
        days: [],
        countsByCinema: {},
        problems: ['no adapter yet, so its cinemas are always shown as out of date'],
      };
    }
    return checkSource(adapter, {
      now: adapterNow(adapter.id, config, now),
      http: createHttpClient(adapter, config, logger),
      registry: cinemaRegistry,
      robotsOverride: findSourceConfig(adapter.id)?.robotsOverride ?? false,
    });
  }),
);

console.log(formatReport(reports));
if (reports.some((report) => report.problems.length > 0)) process.exitCode = 1;
