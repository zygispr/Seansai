import { describe, expect, test } from 'vitest';
import { matchKeyOf, normalizeTitle, titleKeysOf } from '../../src/matching/normalize.ts';

describe('normalizeTitle', () => {
  test('lower-cases and strips diacritics', () => {
    expect(normalizeTitle('Kopa. Trečia dalis')).toBe('kopa trecia dalis');
    expect(normalizeTitle('ŠEŠĖLIŲ ŽAIDIMAS')).toBe('seseliu zaidimas');
  });

  test.each([
    ['Kopa 3D', 'kopa'],
    ['Kopa (IMAX)', 'kopa'],
    ['Kopa 4DX', 'kopa'],
    ['Kopa (LT sub.)', 'kopa'],
    ['Kopa LT', 'kopa'],
    ['Kopa ORG', 'kopa'],
    ['Mažasis princas (dubliuotas)', 'mazasis princas'],
    ['Mažoji Amelija (įgarsinta lietuviškai)', 'mazoji amelija'],
  ])('removes the format/language tag in "%s"', (title, expected) => {
    expect(normalizeTitle(title)).toBe(expected);
  });

  test('removes punctuation and collapses spaces', () => {
    expect(normalizeTitle('  Mission: Impossible –  Dead Reckoning! ')).toBe(
      'mission impossible dead reckoning',
    );
  });

  test('keeps numbers that are part of the title', () => {
    expect(normalizeTitle('Kopa: Antra dalis 2')).toBe('kopa antra dalis 2');
  });

  test('drops a production year in brackets, as Pasaka adds to original titles', () => {
    expect(normalizeTitle('Monster Mia (2026)')).toBe('monster mia');
    expect(normalizeTitle('Hocus Pocus (1993)')).toBe('hocus pocus');
    expect(normalizeTitle('Blade Runner 2049')).toBe('blade runner 2049');
  });

  test('falls back to the plain title when it consists only of tags', () => {
    expect(normalizeTitle('3D')).toBe('3d');
  });
});

const noEnglish = { englishTitle: null };

describe('matchKeyOf', () => {
  test('prefers the English title', () => {
    expect(
      matchKeyOf({
        title: 'Instruktorius',
        originalTitle: 'Instruktorius',
        englishTitle: 'Instructor',
      }),
    ).toBe('instructor');
  });

  test('uses the original title when there is no English one', () => {
    expect(
      matchKeyOf({ title: 'Kopa. Antra dalis', originalTitle: 'Dune: Part Two', ...noEnglish }),
    ).toBe('dune part two');
  });

  test('ignores a leading English article', () => {
    expect(matchKeyOf({ title: 'Sukilimas', originalTitle: 'The Uprising', ...noEnglish })).toBe(
      'uprising',
    );
    expect(matchKeyOf({ title: 'A', originalTitle: null, ...noEnglish })).toBe('a');
  });

  test('uses the local title when there is no original title', () => {
    expect(matchKeyOf({ title: 'Repertuarinis seansas', originalTitle: null, ...noEnglish })).toBe(
      'repertuarinis seansas',
    );
  });

  test('reads the original title from a Vue-style "LOCAL (Original)" title', () => {
    expect(
      matchKeyOf({ title: 'ABSOLIUTUS BLOGIS (Resident Evil)', originalTitle: null, ...noEnglish }),
    ).toBe('resident evil');
  });

  test('does not treat a tag or a year in brackets as an original title', () => {
    expect(matchKeyOf({ title: 'Kopa (LT sub.)', originalTitle: null, ...noEnglish })).toBe('kopa');
    expect(matchKeyOf({ title: 'Titanikas (1997)', originalTitle: null, ...noEnglish })).toBe(
      'titanikas',
    );
  });
});

describe('titleKeysOf', () => {
  test('lists the English, original and Lithuanian titles, once each', () => {
    expect(
      titleKeysOf({
        title: 'Mergaitė ir stebuklinga plunksna',
        originalTitle: 'La fille dans les nuages',
        englishTitle: 'Girl in the Clouds',
      }),
    ).toEqual([
      'girl in the clouds',
      'la fille dans les nuages',
      'mergaite ir stebuklinga plunksna',
    ]);
    expect(
      titleKeysOf({ title: 'Instruktorius', originalTitle: 'Instruktorius', englishTitle: null }),
    ).toEqual(['instruktorius']);
  });

  test('ignores the Scanorama festival label, however a cinema spells it', () => {
    for (const title of [
      'SCA26: Aukso amžius',
      'SCA: Aukso amžius',
      "SCA'26: Aukso amžius",
      'SCANORAMA ’26: „Aukso amžius“',
    ]) {
      expect(titleKeysOf({ title, originalTitle: null, englishTitle: null })).toEqual([
        'aukso amzius',
      ]);
    }
    // A film whose title merely starts with the letters stays as it is.
    expect(titleKeysOf({ title: 'Scarface', originalTitle: null, englishTitle: null })).toEqual([
      'scarface',
    ]);
  });

  test('ignores the programme Fliko cinemas add after a bar', () => {
    expect(
      titleKeysOf({ title: 'Aukso amžius | Scanorama', originalTitle: null, englishTitle: null }),
    ).toEqual(['aukso amzius']);
    expect(
      titleKeysOf({
        title: 'Septintasis antspaudas | Klasikos popietė',
        originalTitle: null,
        englishTitle: null,
      }),
    ).toEqual(['septintasis antspaudas']);
  });
});
