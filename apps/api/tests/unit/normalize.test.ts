import { describe, expect, test } from 'vitest';
import { matchKeyOf, normalizeTitle } from '../../src/matching/normalize.ts';

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

  test('falls back to the plain title when it consists only of tags', () => {
    expect(normalizeTitle('3D')).toBe('3d');
  });
});

describe('matchKeyOf', () => {
  test('uses the original title when available', () => {
    expect(matchKeyOf({ title: 'Kopa. Antra dalis', originalTitle: 'Dune: Part Two' })).toBe(
      'dune part two',
    );
  });

  test('uses the local title when there is no original title', () => {
    expect(matchKeyOf({ title: 'Repertuarinis seansas', originalTitle: null })).toBe(
      'repertuarinis seansas',
    );
  });

  test('reads the original title from a Vue-style "LOCAL (Original)" title', () => {
    expect(matchKeyOf({ title: 'ABSOLIUTUS BLOGIS (Resident Evil)', originalTitle: null })).toBe(
      'resident evil',
    );
  });

  test('does not treat a tag or a year in brackets as an original title', () => {
    expect(matchKeyOf({ title: 'Kopa (LT sub.)', originalTitle: null })).toBe('kopa');
    expect(matchKeyOf({ title: 'Titanikas (1997)', originalTitle: null })).toBe('titanikas 1997');
  });
});
