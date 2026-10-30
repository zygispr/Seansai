import { Writable } from 'node:stream';
import { createLogger } from '../../src/lib/logger.ts';

export type LogLine = { level: number; msg: string } & Record<string, unknown>;

/** A JSON logger whose output is captured in memory, for asserting on log lines. */
export function createTestLogger() {
  const chunks: string[] = [];
  const destination = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  const logger = createLogger({ pretty: false, level: 'debug', destination });

  const lines = (): LogLine[] =>
    chunks
      .join('')
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as LogLine);
  const raw = (): string => chunks.join('');

  return { logger, lines, raw };
}
