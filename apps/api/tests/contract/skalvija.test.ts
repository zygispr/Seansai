import { describe, expect, test } from 'vitest';
import { skalvijaAdapter } from '../../src/sources/skalvija/adapter.ts';
import { findScreening, runOnBodies, runOnFixtures } from '../helpers/adapters.ts';

/** Capture instant of the Skalvija fixture (tests/fixtures/README.md). */
const NOW = new Date('2026-10-30T17:39:47Z');
const URL = 'https://skalvija.lt/wp-json/data/v1/get_shows';

describe('Skalvija (WordPress JSON)', () => {
  test('parses the body although it starts with PHP warning HTML', async () => {
    const { screenings, skipped, requests } = await runOnFixtures(skalvijaAdapter, NOW);

    expect(requests).toEqual([URL]);
    expect(screenings).toHaveLength(123);
    expect(skipped).toEqual([]);
    expect(new Set(screenings.map((screening) => screening.cinemaId))).toEqual(
      new Set(['skalvija']),
    );
  });

  test('converts the Unix start time and takes the film details from its event', async () => {
    const { screenings } = await runOnFixtures(skalvijaAdapter, NOW);

    expect(findScreening(screenings, '394627')).toEqual({
      sourceScreeningId: '394627',
      cinemaId: 'skalvija',
      startsAt: new Date('2026-10-30T16:30:00Z'),
      title: 'Skambutis',
      originalTitle: 'Ringu',
      englishTitle: null,
      year: 1998,
      durationMinutes: 96,
      ageRating: 'N13',
      genres: [],
      posterUrl:
        'https://skalvija.lt/wp-content/uploads/fliko-api/8a650248098591035997e01f2484de95.webp',
      hall: null,
      format: null,
      spokenLanguage: 'ja',
      subtitleLanguage: 'lt',
      isDubbed: false,
      ticketUrl: 'https://bilietai.skalvija.lt/kasa/seansas/a2de5b28-259a-48eb-ab6e-71fbde85171c',
    });
  });

  test('a "Repertuarinis seansas" programme label is not mistaken for the film title', async () => {
    const { screenings } = await runOnFixtures(skalvijaAdapter, NOW);

    expect(findScreening(screenings, '394909')).toMatchObject({
      title: 'Didysis eteris',
      originalTitle: 'Primetime',
      spokenLanguage: 'en',
      subtitleLanguage: null,
    });
  });

  test('a foreign film in Lithuanian is dubbed', async () => {
    const { screenings } = await runOnFixtures(skalvijaAdapter, NOW);

    expect(findScreening(screenings, '394987')).toMatchObject({
      title: 'Katinas su skrybėle',
      spokenLanguage: 'lt',
      isDubbed: true,
    });
  });

  test('without its event, a show keeps its own title, e.g. "Repertuarinis seansas"', async () => {
    const body = JSON.stringify({
      shows: [
        {
          _id: '1',
          start_date: 1793377800,
          eventid: 99,
          title: ['Repertuarinis seansas'],
          url: 'https://bilietai.skalvija.lt/kasa/seansas/x',
        },
      ],
      events: [],
    });
    const { screenings } = await runOnBodies(skalvijaAdapter, { [URL]: body }, NOW);

    expect(screenings[0]).toMatchObject({ title: 'Repertuarinis seansas', originalTitle: null });
  });
});
