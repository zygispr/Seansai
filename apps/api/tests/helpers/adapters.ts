import { expect } from 'vitest';
import type { z } from 'zod';
import { SourceRequestError } from '../../src/lib/errors.ts';
import { parseJsonBody, type HttpClient } from '../../src/lib/polite-http.ts';
import { cinemaRegistry } from '../../src/registry/cinemas.ts';
import { FixtureHttpClient } from '../../src/sources/fixture-http.ts';
import {
  SourceScreeningSchema,
  type AdapterResult,
  type SourceAdapter,
  type SourceScreening,
} from '../../src/sources/types.ts';

/** Wraps an HTTP client and records every URL requested through it. */
class RecordingHttpClient implements HttpClient {
  readonly requests: string[] = [];
  readonly #inner: HttpClient;

  constructor(inner: HttpClient) {
    this.#inner = inner;
  }

  beginCycle(): void {
    this.#inner.beginCycle();
  }

  getText(url: string): Promise<string> {
    this.requests.push(url);
    return this.#inner.getText(url);
  }

  getJson<T>(url: string, schema: z.ZodType<T>): Promise<T> {
    this.requests.push(url);
    return this.#inner.getJson(url, schema);
  }
}

/** Answers from inline bodies, for edge cases the saved fixtures do not contain. */
class StubHttpClient implements HttpClient {
  readonly #bodies: Record<string, string>;

  constructor(bodies: Record<string, string>) {
    this.#bodies = bodies;
  }

  beginCycle(): void {
    // No per-cycle state.
  }

  getText(url: string): Promise<string> {
    const body = this.#bodies[url];
    if (body === undefined) {
      return Promise.reject(new SourceRequestError(url, 'not stubbed', { status: 404 }));
    }
    return Promise.resolve(body);
  }

  async getJson<T>(url: string, schema: z.ZodType<T>): Promise<T> {
    return parseJsonBody(url, await this.getText(url), schema);
  }
}

export type AdapterRun = AdapterResult & { requests: string[] };

async function run(adapter: SourceAdapter, http: HttpClient, now: Date): Promise<AdapterRun> {
  const recording = new RecordingHttpClient(http);
  const result = await adapter.fetchScreenings({ now, http: recording, registry: cinemaRegistry });
  // Every item must satisfy the contract the refresh job enforces.
  for (const screening of result.screenings) {
    expect(SourceScreeningSchema.safeParse(screening).success).toBe(true);
  }
  return { ...result, requests: recording.requests };
}

/** Runs the adapter against its saved fixtures in `tests/fixtures/<adapter.id>/`. */
export function runOnFixtures(adapter: SourceAdapter, now: Date): Promise<AdapterRun> {
  return run(adapter, new FixtureHttpClient({ sourceId: adapter.id, failingSources: [] }), now);
}

/** Runs the adapter against inline response bodies keyed by URL. */
export function runOnBodies(
  adapter: SourceAdapter,
  bodies: Record<string, string>,
  now: Date,
): Promise<AdapterRun> {
  return run(adapter, new StubHttpClient(bodies), now);
}

export function findScreening(
  screenings: readonly SourceScreening[],
  sourceScreeningId: string,
): SourceScreening {
  const screening = screenings.find((item) => item.sourceScreeningId === sourceScreeningId);
  if (!screening) throw new Error(`No screening ${sourceScreeningId} in the adapter output`);
  return screening;
}
