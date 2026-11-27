import { describe, expect, it } from 'vitest';
import { foldedName, placesOf, searchPlaces, type Place } from './place-search';

const city = (name: string, country = 'FRA'): Place => ({
  kind: 'city',
  name,
  country,
  lonLat: [0, 0],
});
const region = (name: string, country = 'FRA', id = name): Place => ({
  kind: 'region',
  name,
  country,
  lonLat: [1, 1],
  id,
});

describe('foldedName', () => {
  it('drops accents, case, ligatures and punctuation', () => {
    expect(foldedName('Île-de-France')).toBe('ile de france');
    expect(foldedName("Côte d'Ivoire")).toBe('cote d ivoire');
    expect(foldedName('Œuvres')).toBe('oeuvres');
    expect(foldedName('  ZÜRICH ')).toBe('zurich');
  });
});

describe('searchPlaces', () => {
  const places = [
    city('Paris'),
    city('Parme', 'ITA'),
    region('Île-de-France'),
    city('Bruxelles', 'BEL'),
    region('Pas-de-Calais'),
    city('Le Caire', 'EGY'),
    region('Paris', 'FRA', 'FRA-paris'),
  ];

  it('ignores accents and case, both ways', () => {
    expect(searchPlaces(places, 'ILE de fr').map((p) => p.name)).toEqual(['Île-de-France']);
    expect(searchPlaces(places, 'île').map((p) => p.name)).toEqual(['Île-de-France']);
  });

  it('puts a name that starts with the query before one that only holds it, then a word start', () => {
    expect(searchPlaces(places, 'cai').map((p) => p.name)).toEqual(['Le Caire']);
    expect(searchPlaces(places, 'ca').map((p) => p.name)).toEqual(['Le Caire', 'Pas-de-Calais']);
    expect(searchPlaces(places, 'ar').map((p) => p.name)).toEqual(['Paris', 'Parme', 'Paris']);
  });

  it('keeps a city before a region of the same name, and the list order otherwise', () => {
    const found = searchPlaces(places, 'par');
    expect(found.map((p) => `${p.kind}:${p.name}`)).toEqual([
      'city:Paris',
      'city:Parme',
      'region:Paris',
    ]);
  });

  it('puts a city that only holds the query before a region that starts with it', () => {
    const drowned = [region('Munxar', 'MLT'), city('Dortmund', 'DEU'), city('Munich', 'DEU')];
    expect(searchPlaces(drowned, 'mun').map((p) => p.name)).toEqual([
      'Munich',
      'Dortmund',
      'Munxar',
    ]);
  });

  it('stops at the limit', () => {
    expect(searchPlaces(places, 'a', 3)).toHaveLength(3);
  });

  it('answers nothing to an empty or blank query', () => {
    expect(searchPlaces(places, '')).toEqual([]);
    expect(searchPlaces(places, '   ')).toEqual([]);
  });

  it('answers nothing when no name holds the query', () => {
    expect(searchPlaces(places, 'xyz')).toEqual([]);
  });
});

describe('placesOf', () => {
  const atlas = {
    cities: () => [{ name: 'Paris', lonLat: [2.35, 48.85] as const, capital: true, population: 1 }],
    regions: [
      { id: 'FRA-1', country: 'FRA', name: 'Bretagne' },
      { id: 'FRA-2', country: 'FRA', name: 'Sans point' },
    ],
  };

  it('lists the cities first, then the regions that have a point, and no piece', () => {
    const found = placesOf(atlas, new Map([['FRA-1', [-3, 48] as const]]));
    expect(found.map(({ kind, name }) => `${kind}:${name}`)).toEqual([
      'city:Paris',
      'region:Bretagne',
    ]);
    expect(found[1]).toMatchObject({ id: 'FRA-1', country: 'FRA', lonLat: [-3, 48] });
  });
});
