import { describe, expect, test } from 'vitest';
import { cinemaRegistry, cinemas } from '../../src/registry/cinemas.ts';
import { cities } from '../../src/registry/cities.ts';
import { sourceConfigs } from '../../src/sources/index.ts';

describe('cinema registry', () => {
  test('every cinema belongs to a known city', () => {
    const cityIds = new Set(cities.map((city) => city.id));
    for (const cinema of cinemas) {
      expect(cityIds, cinema.id).toContain(cinema.cityId);
    }
  });

  test('city and cinema ids are unique', () => {
    expect(new Set(cities.map((city) => city.id)).size).toBe(cities.length);
    expect(new Set(cinemas.map((cinema) => cinema.id)).size).toBe(cinemas.length);
  });

  test('every (sourceId, sourceVenueKey) pair is unique', () => {
    const pairs = cinemas.flatMap((cinema) =>
      cinema.sourceVenueKeys.map((key) => `${cinema.sourceId}:${key}`),
    );
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  test('every cinema has at least one source venue key and a configured source', () => {
    const sourceIds = new Set(sourceConfigs.map((source) => source.id));
    for (const cinema of cinemas) {
      expect(cinema.sourceVenueKeys.length, cinema.id).toBeGreaterThan(0);
      expect(sourceIds, cinema.id).toContain(cinema.sourceId);
    }
  });

  test('Forum Vingis is in Vilnius although the Forum feed says Kaunas', () => {
    expect(cinemaRegistry.get('forum-vingis')?.cityId).toBe('vilnius');
  });

  test('findBySourceKey resolves a venue key to its cinema', () => {
    expect(cinemaRegistry.findBySourceKey('apollo', '1018')?.id).toBe('apollo-molas');
    expect(
      cinemaRegistry.findBySourceKey('forum', 'f933f355-2e6b-466f-9b97-e267ecd8e266')?.id,
    ).toBe('forum-vingis');
    expect(cinemaRegistry.findBySourceKey('apollo', 'unknown')).toBeUndefined();
    expect(cinemaRegistry.findBySourceKey('pasaka', '1018')).toBeUndefined();
  });
});
