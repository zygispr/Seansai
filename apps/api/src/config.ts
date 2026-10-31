import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const DEFAULT_DB_PATH = fileURLToPath(new URL('../data/seansai.sqlite', import.meta.url));
/** Vercel functions can write only under /tmp, and it lasts only as long as the instance. */
const VERCEL_DB_PATH = '/tmp/seansai.sqlite';
const LAST_SUCCESS_HOURS_PATTERN = /^FIXTURE_([A-Z0-9]+)_LAST_SUCCESS_HOURS$/;

const sourceIdList = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((id) => id.trim().toLowerCase())
      .filter((id) => id.length > 0),
  );

const EnvSchema = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    HOST: z.string().min(1).default('localhost'),
    DB_PATH: z.string().min(1).optional(),
    SOURCES_MODE: z.enum(['live', 'fixtures']).default('live'),
    FIXTURE_NOW: z.iso.datetime({ offset: true }).optional(),
    FIXTURE_FAIL: sourceIdList,
    /** An email address or the project's https URL, sent in the User-Agent. */
    SEANSAI_CONTACT: z.union([z.email(), z.url({ protocol: /^https$/ })]).optional(),
    DISABLED_SOURCES: sourceIdList,
    NODE_ENV: z.string().optional(),
    /** Set by Vercel, where the web app is its own service (vercel.json). */
    VERCEL: z.string().optional(),
  })
  .refine((env) => env.SOURCES_MODE === 'fixtures' || env.SEANSAI_CONTACT !== undefined, {
    path: ['SEANSAI_CONTACT'],
    message: 'is required in live mode (it is sent in the User-Agent so cinemas can reach us)',
  });

export type Config = {
  port: number;
  host: string;
  /** Fixture mode defaults to a fresh in-memory database, so runs are repeatable. */
  dbPath: string;
  sourcesMode: 'live' | 'fixtures';
  /** Fixed clock for fixture mode; null means the capture instant or the real clock. */
  fixtureNow: Date | null;
  /** Sources whose fixture client fails every request (resilience testing). */
  fixtureFail: string[];
  /** Per source id: pretend the last successful refresh was this many hours ago. */
  fixtureLastSuccessHours: Record<string, number>;
  contact: string | null;
  /** Kill switch (research.md §1b): these sources are never refreshed. */
  disabledSources: string[];
  /** Production serves the built web app; in development Vite serves it, on Vercel its service. */
  serveWebApp: boolean;
};

function parseLastSuccessHours(env: NodeJS.ProcessEnv): Record<string, number> {
  const hoursBySource: Record<string, number> = {};
  for (const [name, value] of Object.entries(env)) {
    const match = LAST_SUCCESS_HOURS_PATTERN.exec(name);
    if (!match?.[1]) continue;
    const hours = Number(value);
    if (!Number.isFinite(hours) || hours < 0) {
      throw new Error(`Invalid configuration: ${name} must be a non-negative number`);
    }
    hoursBySource[match[1].toLowerCase()] = hours;
  }
  return hoursBySource;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `${issue.path.join('.')} ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid configuration: ${problems}`);
  }
  const values = parsed.data;
  const onVercel = values.VERCEL !== undefined;
  const liveDbPath = onVercel ? VERCEL_DB_PATH : DEFAULT_DB_PATH;
  return {
    port: values.PORT,
    host: values.HOST,
    dbPath: values.DB_PATH ?? (values.SOURCES_MODE === 'fixtures' ? ':memory:' : liveDbPath),
    sourcesMode: values.SOURCES_MODE,
    fixtureNow: values.FIXTURE_NOW ? new Date(values.FIXTURE_NOW) : null,
    fixtureFail: values.FIXTURE_FAIL,
    fixtureLastSuccessHours: parseLastSuccessHours(env),
    contact: values.SEANSAI_CONTACT ?? null,
    disabledSources: values.DISABLED_SOURCES,
    serveWebApp: values.NODE_ENV === 'production' && !onVercel,
  };
}
