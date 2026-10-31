import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { SourceBlockedError, SourceRequestError } from '../lib/errors.ts';
import { parseJsonBody, type HttpClient } from '../lib/polite-http.ts';
import { addDays, localDateOf } from '../lib/time.ts';

/**
 * Saved real responses, one folder per source: numbered response files plus `manifest.json`
 * (`{ "<url>": "<file>" }`). Used by contract tests and by `SOURCES_MODE=fixtures`; never
 * refreshed in CI (`npm run fixtures:capture -- <sourceId>` refreshes them deliberately).
 */
export const DEFAULT_FIXTURES_DIR = fileURLToPath(new URL('../../tests/fixtures', import.meta.url));

const ManifestSchema = z.record(z.string(), z.string());

type FixtureHttpOptions = {
  sourceId: string;
  fixturesDir?: string;
  /** FIXTURE_FAIL: sources whose every request fails as if the cinema blocked us. */
  failingSources: readonly string[];
};

/** Stands in for `PoliteHttpClient`, answering from saved fixtures instead of the network. */
export class FixtureHttpClient implements HttpClient {
  readonly #sourceId: string;
  readonly #sourceDir: string;
  readonly #fails: boolean;
  #manifest: Record<string, string> | null = null;

  constructor(options: FixtureHttpOptions) {
    this.#sourceId = options.sourceId;
    this.#sourceDir = join(options.fixturesDir ?? DEFAULT_FIXTURES_DIR, options.sourceId);
    this.#fails = options.failingSources.includes(options.sourceId);
  }

  beginCycle(): void {
    // Fixtures have no per-cycle state.
  }

  async getText(url: string): Promise<string> {
    if (this.#fails) throw new SourceBlockedError(url, 'simulated failure (FIXTURE_FAIL)');
    const file = this.#readManifest()[url];
    if (file === undefined) {
      // Fixtures may hold only a sample of a site's pages; the rest answer like removed pages.
      throw new SourceRequestError(url, `no fixture recorded for ${this.#sourceId}`, {
        status: 404,
      });
    }
    return readFile(join(this.#sourceDir, file), 'utf8');
  }

  async getJson<T>(url: string, schema: z.ZodType<T>): Promise<T> {
    return parseJsonBody(url, await this.getText(url), schema);
  }

  #readManifest(): Record<string, string> {
    if (this.#manifest) return this.#manifest;
    const manifestPath = join(this.#sourceDir, 'manifest.json');
    if (!existsSync(manifestPath)) {
      throw new SourceRequestError(
        manifestPath,
        `no fixtures captured for ${this.#sourceId} (run npm run fixtures:capture -- ${this.#sourceId})`,
      );
    }
    this.#manifest = ManifestSchema.parse(JSON.parse(readFileSync(manifestPath, 'utf8')));
    return this.#manifest;
  }
}

/**
 * Empties inline `<style>` elements. Some cinema pages inline megabytes of CSS that no adapter
 * reads, so fixtures are saved without it. Scripts are kept: some adapters read data from them.
 */
export function stripInlineStyles(html: string): string {
  return html.replace(/(<style\b[^>]*>)[\s\S]*?(<\/style>)/gi, '$1$2');
}

const PLACEHOLDER = /\{today(?:\+(\d+))?:(dd\.MM\.yyyy|yyyy-MM-dd)\}/g;

/**
 * Fills the date placeholders used in `urls.json`: `{today:dd.MM.yyyy}`, `{today:yyyy-MM-dd}`
 * and `{today+N:yyyy-MM-dd}`, with today's date in Vilnius.
 */
export function resolveFixtureUrl(template: string, now: Date): string {
  const today = localDateOf(now);
  const resolved = template.replace(
    PLACEHOLDER,
    (_match, plusDays: string | undefined, format: string) => {
      const date = addDays(today, Number(plusDays ?? 0));
      if (format === 'yyyy-MM-dd') return date;
      const [year, month, day] = date.split('-');
      return `${day ?? ''}.${month ?? ''}.${year ?? ''}`;
    },
  );
  if (/\{today/.test(resolved)) {
    throw new Error(`Unknown date placeholder in fixture URL: ${template}`);
  }
  return resolved;
}

const LOG_START = '<!-- capture-log:start -->';
const LOG_END = '<!-- capture-log:end -->';
const LOG_ROW = /^\| ([a-z]+) \| (\S+) \|$/gm;

/** Returns the README text with the capture instant of `sourceId` recorded in its capture log. */
export function recordCapture(readme: string, sourceId: string, capturedAt: Date): string {
  const captures = parseCaptureLog(readme);
  captures.set(sourceId, capturedAt);
  const rows = [...captures.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, at]) => `| ${id} | ${at.toISOString()} |`);
  const log = [LOG_START, '| Source | Captured at (UTC) |', '| --- | --- |', ...rows, LOG_END].join(
    '\n',
  );

  const start = readme.indexOf(LOG_START);
  const end = readme.indexOf(LOG_END);
  if (start === -1 || end === -1) return `${readme.trimEnd()}\n\n${log}\n`;
  return readme.slice(0, start) + log + readme.slice(end + LOG_END.length);
}

function parseCaptureLog(readme: string): Map<string, Date> {
  const start = readme.indexOf(LOG_START);
  const end = readme.indexOf(LOG_END);
  const captures = new Map<string, Date>();
  if (start === -1 || end === -1) return captures;
  for (const [, sourceId, instant] of readme.slice(start, end).matchAll(LOG_ROW)) {
    if (sourceId && instant) captures.set(sourceId, new Date(instant));
  }
  return captures;
}

function readCaptureLog(fixturesDir: string): Map<string, Date> {
  const readmePath = join(fixturesDir, 'README.md');
  if (!existsSync(readmePath)) return new Map();
  return parseCaptureLog(readFileSync(readmePath, 'utf8'));
}

/**
 * The fixture clock: the earliest capture instant in the fixtures README, so "today" and
 * "already started" match the saved data and no source's screenings are already in the past
 * (sources captured on a later day simply start on a later date). Null when nothing was captured.
 */
export function readFixtureNow(fixturesDir = DEFAULT_FIXTURES_DIR): Date | null {
  const instants = [...readCaptureLog(fixturesDir).values()];
  if (instants.length === 0) return null;
  return new Date(Math.min(...instants.map((instant) => instant.getTime())));
}

/**
 * When one source was captured. In fixture mode its adapter runs at this instant, so the dated
 * URLs it builds are the ones that were saved.
 */
export function readCaptureInstant(
  sourceId: string,
  fixturesDir = DEFAULT_FIXTURES_DIR,
): Date | null {
  return readCaptureLog(fixturesDir).get(sourceId) ?? null;
}
