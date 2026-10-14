import { describe, expect, it } from 'vitest';
import { distanceKm, type LonLat } from './geo';
import {
  planBlitzMap,
  type BlitzCandidate,
  type BlitzMapRules,
  type BlitzMeasure,
} from './blitz-placement';

/**
 * **La carte de départ, sans carte.** Un continent en grille d'un degré, quelques îlots seuls au
 * large, des distances à vol d'oiseau : à pied on ne quitte pas sa terre, en combiné on va
 * partout. Ce qui se teste est la règle ; la pose réelle a ses tests (`convex/blitz.test.ts`).
 */

/** Un continent bordé de côtes. */
const continent: ReadonlyArray<BlitzCandidate> = Array.from({ length: 21 * 13 }, (_, rank) => {
  const lon = rank % 21;
  const lat = 40 + Math.floor(rank / 21);
  return {
    regionId: `R${lon}-${lat}`,
    point: [lon, lat] as LonLat,
    coastal: lon === 0 || lon === 20 || lat === 40 || lat === 52,
  };
});
const islets: ReadonlyArray<BlitzCandidate> = [
  [-4, 46],
  [24, 46],
  [10, 55],
  [10, 37],
].map(([lon, lat]) => ({
  regionId: `I${lon}-${lat}`,
  point: [lon!, lat!] as LonLat,
  coastal: true,
}));

const landOf = (regionId: string) => (regionId.startsWith('I') ? regionId : 'continent');

const measuring =
  (candidates: ReadonlyArray<BlitzCandidate>): BlitzMeasure =>
  (regionId, mode, maxKm) => {
    const from = candidates.find((candidate) => candidate.regionId === regionId)!;
    return new Map(
      candidates.flatMap((other) => {
        const km = distanceKm(from.point, other.point);
        const walkable = mode === 'combined' || landOf(other.regionId) === landOf(regionId);
        return walkable && km <= maxKm ? [[other.regionId, km] as const] : [];
      }),
    );
  };

const RULES: BlitzMapRules = {
  hqRadiusKm: 600,
  hqRadiusSpread: 0.5,
  hqDraws: 60,
  hqTries: 12,
  hqEvenness: 0.6,
  tolerance: 0.35,
  starting: [{ key: 'barracks', km: 120 }],
  near: [
    { key: 'city', km: 250 },
    { key: 'port', km: 350 },
  ],
  disputed: ['city', 'airfield'],
  spreadKm: 80,
  fairness: 0.8,
};

const world = [...continent, ...islets];
const plan = (
  seats: ReadonlyArray<string>,
  seed = 7,
  candidates: ReadonlyArray<BlitzCandidate> = world,
) => planBlitzMap({ seats, candidates, rules: RULES, seed, measure: measuring(candidates) });
const placed = (seats: ReadonlyArray<string>, seed = 7) => plan(seats, seed)!;

const pointOf = new Map(world.map((candidate) => [candidate.regionId, candidate.point]));
const km = (a: string, b: string) => distanceKm(pointOf.get(a)!, pointOf.get(b)!);

describe('la carte de départ de la Blitz', () => {
  it('pose un QG et une caserne à chaque joueur, le reste neutre', () => {
    const sites = placed(['A', 'B', 'C']);
    for (const seat of ['A', 'B', 'C']) {
      const mine = sites.filter((site) => site.owner === seat).map((site) => site.key);
      expect(mine.sort()).toEqual(['barracks', 'hq']);
    }
    expect(sites.filter((site) => site.owner === null).length).toBeGreaterThan(0);
  });

  it('ne pose jamais un QG sur un îlot où l’on ne marche nulle part', () => {
    for (const seed of [1, 7, 11, 23]) {
      for (const hq of placed(['A', 'B', 'C', 'D'], seed).filter((site) => site.key === 'hq')) {
        expect(landOf(hq.regionId)).toBe('continent');
      }
    }
  });

  it('écarte les QG équitablement en distance de route', () => {
    const hqs = placed(['A', 'B', 'C']).filter((site) => site.key === 'hq');
    const gaps = [
      km(hqs[0]!.regionId, hqs[1]!.regionId),
      km(hqs[1]!.regionId, hqs[2]!.regionId),
      km(hqs[0]!.regionId, hqs[2]!.regionId),
    ];
    expect(Math.min(...gaps) / Math.max(...gaps)).toBeGreaterThan(0.6);
    expect(Math.min(...gaps)).toBeGreaterThan(500);
  });

  it('donne à chacun sa caserne et ses neutres proches, à pied, dans la tolérance', () => {
    const sites = placed(['A', 'B', 'C', 'D']);
    for (const seat of ['A', 'B', 'C', 'D']) {
      const hq = sites.find((site) => site.key === 'hq' && site.owner === seat)!;
      for (const { key, km: target } of [...RULES.starting, ...RULES.near]) {
        const site = sites.find(
          (candidate) =>
            candidate.key === key && (candidate.owner === seat || candidate.near === seat),
        )!;
        expect(landOf(site.regionId)).toBe('continent');
        expect(Math.abs(km(hq.regionId, site.regionId) - target)).toBeLessThanOrEqual(
          target * RULES.tolerance,
        );
      }
    }
  });

  it('ne pose un port que sur la côte', () => {
    const ports = placed(['A', 'B']).filter((site) => site.key === 'port');
    expect(ports.length).toBeGreaterThan(0);
    for (const port of ports) {
      const [lon, lat] = pointOf.get(port.regionId)!;
      expect(lon === 0 || lon === 20 || lat === 40 || lat === 52).toBe(true);
    }
  });

  it('pose les disputés à mi-chemin entre deux voisins', () => {
    const sites = placed(['A', 'B']);
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
    const sites = placed(['A', 'B', 'C', 'D'], 11);
    expect(new Set(sites.map((site) => site.regionId)).size).toBe(sites.length);
    expect(plan(['A', 'B', 'C', 'D'], 11)).toEqual(sites);
  });

  it('refuse une carte qu’aucun tour ne rend équitable', () => {
    expect(plan(['A', 'B'], 7, islets)).toBeNull();
  });
});
