import { describe, expect, it } from 'vitest';
import { distanceKm, type LonLat } from './geo';
import { planBlitzMap, type BlitzCandidate, type BlitzMapRules } from './blitz-placement';

/**
 * **La carte de départ, sans carte.** Une grille de régions d'un degré, des distances à vol
 * d'oiseau : ce qui se teste est la règle — un QG par siège, la même main pour chacun, des
 * disputés au milieu. La pose réelle a ses tests (`convex/blitz.test.ts`).
 */

const BOX = { west: 0, south: 40, east: 20, north: 52 };

/** Une grille dont la colonne ouest est la côte. */
const grid: ReadonlyArray<BlitzCandidate> = Array.from({ length: 21 * 13 }, (_, rank) => {
  const lon = rank % 21;
  const lat = 40 + Math.floor(rank / 21);
  return { regionId: `R${lon}-${lat}`, point: [lon, lat] as LonLat, coastal: lon === 0 };
});
const pointOf = new Map(grid.map((candidate) => [candidate.regionId, candidate.point]));

const flying = (regionId: string): ReadonlyMap<string, number> =>
  new Map(grid.map((other) => [other.regionId, distanceKm(pointOf.get(regionId)!, other.point)]));

const RULES: BlitzMapRules = {
  hqRing: 0.6,
  hqTries: 6,
  starting: [{ key: 'barracks', km: 120 }],
  near: [
    { key: 'city', km: 250 },
    { key: 'port', km: 350 },
  ],
  disputed: ['city', 'airfield'],
  spreadKm: 80,
  fairness: 0.8,
};

const plan = (seats: ReadonlyArray<string>, seed = 7) =>
  planBlitzMap({ seats, candidates: grid, box: BOX, rules: RULES, seed, measure: flying });

const km = (a: string, b: string) => flying(a).get(b)!;

describe('la carte de départ de la Blitz', () => {
  it('pose un QG et une caserne à chaque joueur, le reste neutre', () => {
    const sites = plan(['A', 'B', 'C']);
    for (const seat of ['A', 'B', 'C']) {
      const mine = sites.filter((site) => site.owner === seat).map((site) => site.key);
      expect(mine.sort()).toEqual(['barracks', 'hq']);
    }
    expect(sites.filter((site) => site.owner === null).length).toBeGreaterThan(0);
  });

  it('écarte les QG équitablement en distance de route', () => {
    const hqs = plan(['A', 'B', 'C']).filter((site) => site.key === 'hq');
    const gaps = [
      km(hqs[0]!.regionId, hqs[1]!.regionId),
      km(hqs[1]!.regionId, hqs[2]!.regionId),
      km(hqs[0]!.regionId, hqs[2]!.regionId),
    ];
    expect(Math.min(...gaps) / Math.max(...gaps)).toBeGreaterThan(0.7);
    expect(Math.min(...gaps)).toBeGreaterThan(500);
  });

  it('donne à chacun ses neutres proches à la même distance', () => {
    const sites = plan(['A', 'B']);
    const hqOf = (seat: string) => sites.find((site) => site.key === 'hq' && site.owner === seat)!;
    const cities = sites.filter((site) => site.near !== null && site.key === 'city');
    const reach = cities.map((site) => km(hqOf(site.near!).regionId, site.regionId));
    expect(cities.map((site) => site.near).sort()).toEqual(['A', 'B']);
    expect(Math.abs(reach[0]! - reach[1]!)).toBeLessThan(60);
  });

  it('ne pose un port que sur la côte', () => {
    const ports = plan(['A', 'B']).filter((site) => site.key === 'port');
    expect(ports.length).toBeGreaterThan(0);
    for (const port of ports) expect(pointOf.get(port.regionId)![0]).toBe(0);
  });

  it('pose les disputés à mi-chemin entre deux voisins', () => {
    const sites = plan(['A', 'B']);
    const [a, b] = ['A', 'B'].map((seat) =>
      sites.find((site) => site.key === 'hq' && site.owner === seat)!,
    );
    const disputed = sites.filter((site) => site.owner === null && site.near === null);
    expect(disputed.map((site) => site.key).sort()).toEqual(['airfield', 'city']);
    for (const site of disputed) {
      const [left, right] = [km(a!.regionId, site.regionId), km(b!.regionId, site.regionId)];
      expect(Math.min(left, right) / Math.max(left, right)).toBeGreaterThan(0.8);
    }
  });

  it('ne pose jamais deux bâtiments sur une région, et rejoue la même carte', () => {
    const sites = plan(['A', 'B', 'C', 'D'], 11);
    expect(new Set(sites.map((site) => site.regionId)).size).toBe(sites.length);
    expect(plan(['A', 'B', 'C', 'D'], 11)).toEqual(sites);
  });
});
