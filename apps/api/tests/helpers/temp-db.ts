import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, type Db } from '../../src/db/index.ts';
import type { MovieRecord, ScreeningRecord } from '../../src/db/repository.ts';

/** A migrated SQLite database in a fresh temporary file; `cleanup` closes and deletes it. */
export function createTempDb(): { db: Db; path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'seansai-test-'));
  const path = join(dir, 'test.sqlite');
  const db = openDb(path);
  return {
    db,
    path,
    cleanup: () => {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export function movieRecord(overrides: Partial<MovieRecord> = {}): MovieRecord {
  return {
    id: 'digger-2026',
    title: 'Kasėjas',
    originalTitle: 'Digger',
    matchKey: 'digger',
    year: 2026,
    durationMinutes: 101,
    ageRating: 'N13',
    genres: ['drama'],
    posterUrl: 'https://cinema.lt/posters/digger.jpg',
    ...overrides,
  };
}

export function screeningRecord(overrides: Partial<ScreeningRecord> = {}): ScreeningRecord {
  return {
    id: 'apollo:1',
    sourceId: 'apollo',
    movieId: 'digger-2026',
    cinemaId: 'apollo-akropolis',
    startsAt: new Date('2026-10-30T17:00:00Z'),
    localDate: '2026-10-30',
    hall: '6 salė',
    format: '2D',
    spokenLanguage: 'en',
    subtitleLanguage: 'lt',
    isDubbed: false,
    ticketUrl: 'https://www.apollokinas.lt/websales/show/1',
    sourceTitle: 'Kasėjas',
    refreshedAt: new Date('2026-10-30T10:00:00Z'),
    ...overrides,
  };
}
