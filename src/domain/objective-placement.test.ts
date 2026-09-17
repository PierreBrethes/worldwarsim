import { describe, expect, it } from 'vitest';
import type { LonLat } from './geo';
import {
  neighbourPairs,
  planObjectives,
  type ObjectiveCandidate,
  type ObjectiveDraw,
  type ObjectiveMeasure,
  type ObjectiveSeat,
} from './objective-placement';

/**
 * **La répartition, sans carte.** Les distances sont données, pas mesurées : ce qui se teste ici
 * est la règle — deux prises par siège, un dur par paire de voisins, et les gardes qui décident de
 * ce qui ne se pose pas. La grille a ses propres tests (`routing.test.ts`), et la pose réelle les
 * siens (`convex/objectives.test.ts`).
 */

const ARCHETYPES: ReadonlyArray<ObjectiveDraw> = [
  { key: 'abandonedStores', tier: 'easy' },
  { key: 'stalledConvoy', tier: 'medium' },
  { key: 'fuelDump', tier: 'medium' },
  { key: 'irregularArsenal', tier: 'hard' },
];

const RULES = {
  nearKm: 1_000,
  spreadKm: 300,
  hardMinKm: 800,
  hardFairness: 0.75,
  hardMax: 4,
};

/** Une rangée de régions le long d'un méridien : un degré de latitude vaut 111 km, donc l'écart
 *  entre deux d'entre elles se lit à l'œil et la règle d'espacement se vérifie sans table. */
const along = (count: number): ReadonlyArray<ObjectiveCandidate> =>
  Array.from({ length: count }, (_, rank) => ({
    regionId: `R${String(rank).padStart(2, '0')}`,
    point: [0, rank] as LonLat,
  }));

const seatAt = (id: string, hq: LonLat): ObjectiveSeat => ({ id, hq });

/** Tout à la même distance de tout le monde : la carte ne dit rien, seule la règle parle. */
const evenly = (
  candidates: ReadonlyArray<ObjectiveCandidate>,
  km: number | null,
  pairKm: number | null = null,
): ObjectiveMeasure => {
  const field = new Map(candidates.map((candidate) => [candidate.regionId, km ?? 0]));
  const pairField = new Map(candidates.map((candidate) => [candidate.regionId, pairKm ?? 0]));
  return {
    nearKmFrom: () => (km === null ? new Map() : field),
    between: () => (pairKm === null ? null : { fromLeft: pairField, fromRight: pairField }),
  };
};

const measuring = (
  near: Readonly<Record<string, Readonly<Record<string, number>>>>,
  pair: Readonly<Record<string, number>> | null,
): ObjectiveMeasure => ({
  nearKmFrom: (seat) => new Map(Object.entries(near[seat.id] ?? {})),
  between: (left, right) =>
    pair === null
      ? null
      : {
          fromLeft: new Map(Object.entries(near[left.id] ?? {})),
          fromRight: new Map(Object.entries(near[right.id] ?? {})),
        },
});

describe('placing the neutral objectives', () => {
  it('gives each seat two objectives within reach and far enough from each other', () => {
    const candidates = along(20);
    const plan = planObjectives({
      seats: [seatAt('A', [0, 0])],
      candidates,
      archetypes: ARCHETYPES,
      rules: RULES,
      seed: 7,
      measure: evenly(candidates, 500),
    });

    expect(plan.placed).toHaveLength(2);
    const points = plan.placed.map(
      (entry) => candidates.find((candidate) => candidate.regionId === entry.regionId)!.point,
    );
    expect(Math.abs(points[0]![1] - points[1]![1]) * 111).toBeGreaterThanOrEqual(RULES.spreadKm);
  });

  it('never draws a hard archetype for a near objective', () => {
    const candidates = along(20);
    const plan = planObjectives({
      seats: [seatAt('A', [0, 0]), seatAt('B', [4, 0])],
      candidates,
      archetypes: ARCHETYPES,
      rules: RULES,
      seed: 3,
      measure: evenly(candidates, 400),
    });
    expect(plan.placed.every((entry) => entry.key !== 'irregularArsenal')).toBe(true);
  });

  it('leaves out what stands beyond reach, and places nothing rather than something far', () => {
    const candidates = along(20);
    const plan = planObjectives({
      seats: [seatAt('A', [0, 0])],
      candidates,
      archetypes: ARCHETYPES,
      rules: RULES,
      seed: 1,
      measure: evenly(candidates, 4_000),
    });
    expect(plan.placed).toEqual([]);
  });

  it('never places two objectives on the same region', () => {
    /** Deux sièges, une seule région à portée : la seconde main trouve la place prise. */
    const candidates = along(1);
    const plan = planObjectives({
      seats: [seatAt('A', [0, 0]), seatAt('B', [4, 0])],
      candidates,
      archetypes: ARCHETYPES,
      rules: RULES,
      seed: 11,
      measure: evenly(candidates, 200),
    });
    expect(plan.placed).toHaveLength(1);
  });

  it('puts the hard one where the greater of the two marches is shortest', () => {
    const plan = planObjectives({
      seats: [seatAt('A', [0, 0]), seatAt('B', [20, 0])],
      candidates: along(4),
      archetypes: ARCHETYPES,
      rules: RULES,
      seed: 5,
      /** Tout hors de portée d'une prise proche : seul le dur se pose, et la table dit où. */
      measure: measuring(
        {
          A: { R00: 1_100, R01: 1_200, R02: 1_500, R03: 2_000 },
          B: { R00: 2_000, R01: 1_300, R02: 1_600, R03: 1_100 },
        },
        {},
      ),
    });

    expect(plan.placed).toEqual([{ key: 'irregularArsenal', regionId: 'R01' }]);
    expect(plan.pairsWithoutObjective).toEqual([]);
  });

  it('refuses a detour only one of the two would make', () => {
    const plan = planObjectives({
      seats: [seatAt('A', [0, 0]), seatAt('B', [20, 0])],
      candidates: along(1),
      archetypes: ARCHETYPES,
      rules: RULES,
      seed: 5,
      /** 1 100 contre 2 900 : le rapport tombe sous trois quarts, c'est la réserve de A seul. */
      measure: measuring({ A: { R00: 1_100 }, B: { R00: 2_900 } }, {}),
    });
    expect(plan.placed).toEqual([]);
    expect(plan.pairsWithoutObjective).toEqual([['A', 'B']]);
  });

  it('refuses a sprint, however fair', () => {
    const plan = planObjectives({
      seats: [seatAt('A', [0, 0]), seatAt('B', [6, 0])],
      candidates: along(1),
      archetypes: ARCHETYPES,
      rules: RULES,
      seed: 5,
      measure: measuring({ A: { R00: 400 }, B: { R00: 420 } }, {}),
    });
    /** À portée des deux, donc pris par la prise proche de A — mais jamais comme objectif dur. */
    expect(plan.placed).toEqual([{ key: 'abandonedStores', regionId: 'R00' }]);
    expect(plan.pairsWithoutObjective).toEqual([['A', 'B']]);
  });

  it('names the pair an ocean separates rather than staying silent', () => {
    const candidates = along(1);
    const plan = planObjectives({
      seats: [seatAt('japan', [139, 35]), seatAt('usa', [-77, 38])],
      candidates,
      archetypes: ARCHETYPES,
      rules: RULES,
      seed: 5,
      measure: evenly(candidates, null, null),
    });
    expect(plan.placed).toEqual([]);
    expect(plan.pairsWithoutObjective).toEqual([['japan', 'usa']]);
  });

  it('holds every seat in two pairs at most, and the whole board under the ceiling', () => {
    const seats = [0, 1, 2, 3, 4].map((rank) => seatAt(`S${rank}`, [rank * 10, 0] as LonLat));
    const candidates = along(60);
    const plan = planObjectives({
      seats,
      candidates,
      archetypes: ARCHETYPES,
      rules: RULES,
      seed: 2,
      /** Rien à portée d'une prise proche, tout équidistant pour les paires. */
      measure: evenly(candidates, 5_000, 1_500),
    });
    expect(plan.placed.filter((entry) => entry.key === 'irregularArsenal')).toHaveLength(
      RULES.hardMax,
    );
  });

  it('pairs the two nearest headquarters first', () => {
    const paris = seatAt('france', [2.3, 48.8]);
    const berlin = seatAt('germany', [13.4, 52.5]);
    const tokyo = seatAt('japan', [139.7, 35.7]);
    expect(neighbourPairs([paris, tokyo, berlin], 1)).toEqual([[paris, berlin]]);
  });

  it('draws the same map twice from the same seed, and another one from another', () => {
    const candidates = along(40);
    const draw = (seed: number) =>
      planObjectives({
        seats: [seatAt('A', [0, 0])],
        candidates,
        archetypes: ARCHETYPES,
        rules: RULES,
        seed,
        measure: evenly(candidates, 500),
      }).placed;

    expect(draw(42)).toEqual(draw(42));
    expect(draw(42)).not.toEqual(draw(43));
  });
});
