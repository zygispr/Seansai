import { describe, expect, test } from 'vitest';
import { romuvaAdapter } from '../../src/sources/romuva/adapter.ts';
import { findScreening, runOnBodies, runOnFixtures } from '../helpers/adapters.ts';

/** Capture instant of the Romuva fixture (tests/fixtures/README.md). */
const NOW = new Date('2026-10-30T17:39:49Z');
const URL = 'https://bilietai.kcromuva.lt/';

describe('Romuva (calendar embedded in the ticket page)', () => {
  test('extracts the events array from fullCalendar({ events: [...] })', async () => {
    const { screenings, skipped, requests } = await runOnFixtures(romuvaAdapter, NOW);

    expect(requests).toEqual([URL]);
    expect(screenings).toHaveLength(97);
    expect(skipped).toEqual([]);
  });

  test('reads "YYYY-MM-DD HH:MM" as Vilnius time and links to the event page', async () => {
    const { screenings } = await runOnFixtures(romuvaAdapter, NOW);

    expect(findScreening(screenings, '6090915110')).toEqual({
      sourceScreeningId: '6090915110',
      cinemaId: 'romuva',
      // 18:00 in Vilnius in winter (UTC+2).
      startsAt: new Date('2026-12-15T16:00:00Z'),
      title: 'Kopa: Trečia dalis',
      originalTitle: null,
      englishTitle: null,
      year: null,
      durationMinutes: null,
      ageRating: null,
      genres: [],
      posterUrl: null,
      hall: null,
      format: null,
      spokenLanguage: null,
      subtitleLanguage: null,
      isDubbed: null,
      ticketUrl: 'https://bilietai.kcromuva.lt/lt/e/6090915110/kopa-trecia-dalis',
    });
  });

  test('fails the refresh when the calendar is missing from the page', async () => {
    await expect(
      runOnBodies(romuvaAdapter, { [URL]: '<html><body>Prisijunkite</body></html>' }, NOW),
    ).rejects.toThrow(/calendar/);
  });

  test('skips an event with an unreadable start', async () => {
    const page = `<script>$('#c').fullCalendar({ locale: 'lt', events: [
      {"title":"Seansas","start":"netrukus","url":"https://bilietai.kcromuva.lt/lt/e/1/a"},
      {"title":"Kitas","start":"2026-11-01 12:00","url":"https://bilietai.kcromuva.lt/lt/e/2/b"}
    ] });</script>`;
    const { screenings, skipped } = await runOnBodies(romuvaAdapter, { [URL]: page }, NOW);

    expect(screenings.map((screening) => screening.sourceScreeningId)).toEqual(['2']);
    expect(skipped).toHaveLength(1);
  });
});
