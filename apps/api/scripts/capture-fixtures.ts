/**
 * Captures fixtures for one source: `npm run fixtures:capture -- <sourceId>`.
 *
 * Reads the hand-written URL list `tests/fixtures/<sourceId>/urls.json`, fetches each URL once
 * through the polite HTTP client (robots.txt, User-Agent, delays), saves every response as a
 * numbered file plus `manifest.json`, and records the capture instant in the fixtures README.
 * List pages are not followed: every page an adapter needs is listed explicitly.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { loadConfig } from '../src/config.ts';
import { createLogger } from '../src/lib/logger.ts';
import { PoliteHttpClient } from '../src/lib/polite-http.ts';
import {
  DEFAULT_FIXTURES_DIR,
  recordCapture,
  resolveFixtureUrl,
} from '../src/sources/fixture-http.ts';
import { sourceConfigs } from '../src/sources/index.ts';

const UrlListSchema = z.array(z.string().min(1)).min(1);
const ManifestSchema = z.record(z.string(), z.string());

function extensionOf(body: string): string {
  const start = body.trimStart();
  if (start.startsWith('{') || start.startsWith('[')) return 'json';
  if (start.startsWith('<?xml')) return 'xml';
  if (start.startsWith('<')) return 'html';
  return 'txt';
}

async function main(): Promise<void> {
  const sourceId = process.argv[2];
  const source = sourceConfigs.find((config) => config.id === sourceId);
  if (!sourceId || !source) {
    const known = sourceConfigs.map((config) => config.id).join(', ');
    throw new Error(`Usage: npm run fixtures:capture -- <sourceId>  (one of: ${known})`);
  }

  const config = loadConfig({ ...process.env, SOURCES_MODE: 'live' });
  if (config.contact === null) throw new Error('SEANSAI_CONTACT is required to capture fixtures');
  const logger = createLogger();
  const http = new PoliteHttpClient({
    sourceId,
    contact: config.contact,
    robotsOverride: source.robotsOverride,
    logger,
  });
  http.beginCycle();

  const sourceDir = join(DEFAULT_FIXTURES_DIR, sourceId);
  const urlListPath = join(sourceDir, 'urls.json');
  if (!existsSync(urlListPath)) throw new Error(`Missing URL list: ${urlListPath}`);
  const templates = UrlListSchema.parse(JSON.parse(readFileSync(urlListPath, 'utf8')));

  const capturedAt = new Date();
  const manifest: Record<string, string> = {};
  const files: Array<{ file: string; body: string }> = [];
  for (const [index, template] of templates.entries()) {
    const url = resolveFixtureUrl(template, capturedAt);
    const body = await http.getText(url);
    const file = `${String(index + 1).padStart(3, '0')}.${extensionOf(body)}`;
    manifest[url] = file;
    files.push({ file, body });
    logger.info({ source: sourceId, url, file }, 'Captured');
  }

  // Only replace the previous capture once every URL was fetched successfully.
  const manifestPath = join(sourceDir, 'manifest.json');
  if (existsSync(manifestPath)) {
    const previous = ManifestSchema.parse(JSON.parse(readFileSync(manifestPath, 'utf8')));
    for (const file of Object.values(previous)) rmSync(join(sourceDir, file), { force: true });
  }
  for (const { file, body } of files) writeFileSync(join(sourceDir, file), body);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const readmePath = join(DEFAULT_FIXTURES_DIR, 'README.md');
  const readme = existsSync(readmePath) ? readFileSync(readmePath, 'utf8') : '# Fixtures\n';
  writeFileSync(readmePath, recordCapture(readme, sourceId, capturedAt));
  logger.info({ source: sourceId, files: files.length, capturedAt }, 'Fixtures saved');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
