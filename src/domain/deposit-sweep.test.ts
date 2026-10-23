import { describe, expect, it } from 'vitest';
import {
  depositSweep,
  SWEEP_MS,
  SWEEP_RANGE_KM,
  sweepCandidates,
  sweepFrontKm,
} from './deposit-sweep';
import type { LonLat } from './geo';
import type { PlayerView } from './player-view';
import { DEPOSIT_POINTS } from './world';

const byId = (id: string) => DEPOSIT_POINTS.find((deposit) => deposit.id === id)!;

/** The maquette's France, a mine of its own at coal-FRA-5334, a German mine surveyed, an outpost
 *  at Namur. */
const view = {
  me: {
    nation: 'france',
    construction: null,
    constructionQueue: [],
    buildings: [{ key: 'mine', point: byId('coal-FRA-5334').lonLat, level: 2 }],
    outposts: [],
  },
  surveyedInstallations: [
    { id: 's', key: 'mine', regionId: 'DEU-1581', point: byId('coal-DEU-1581').lonLat },
  ],
} as unknown as PlayerView;
const NAMUR = [{ id: 'o', lonLat: [4.87, 50.47] as LonLat, reachKm: 120 }];
const BRUSSELS: LonLat = [4.35, 50.85];

describe('sweepCandidates', () => {
  const coal = new Map(
    sweepCandidates(view, 'coal', NAMUR).map((one) => [one.deposit.id, one.reached]),
  );

  it('offers only the free deposits of the species the view knows of', () => {
    expect(coal.has('coal-FRA-5334')).toBe(false);
    expect(coal.has('coal-DEU-1581')).toBe(false);
    expect(coal.has('food-BEL-3476')).toBe(false);
    expect(coal.has('coal-BEL-2')).toBe(true);
  });

  it('says out of reach a deposit neither on national soil nor under an outpost', () => {
    expect(coal.get('coal-BEL-2')).toBe(true);
    expect(coal.get('coal-FRA-5328')).toBe(true);
    expect(coal.get('coal-DEU-1572')).toBe(false);
  });
});

describe('depositSweep', () => {
  const sweep = depositSweep(sweepCandidates(view, 'coal', NAMUR), BRUSSELS);

  it('finds the three nearest free deposits, nearest first, each with its distance and heading', () => {
    expect(sweep.found).toHaveLength(3);
    expect(sweep.found[0]!.deposit.id).toBe('coal-BEL-2');
    expect(sweep.found[0]!.km).toBeGreaterThan(50);
    expect(sweep.found[0]!.km).toBeLessThan(65);
    // Mons lies south-west of Brussels.
    expect(sweep.found[0]!.bearing).toBeGreaterThan(200);
    expect(sweep.found[0]!.bearing).toBeLessThan(250);
    const kms = sweep.found.map((hit) => hit.km);
    expect(kms).toEqual([...kms].sort((a, b) => a - b));
    expect(sweep.nearest).toBeNull();
  });

  it('reaches a deposit when the front of the wave does', () => {
    for (const hit of sweep.found) expect(sweepFrontKm(hit.hitMs)).toBeCloseTo(hit.km, 3);
    expect(sweepFrontKm(SWEEP_MS)).toBe(SWEEP_RANGE_KM);
    expect(sweepFrontKm(SWEEP_MS * 2)).toBe(SWEEP_RANGE_KM);
  });

  it(`finds nothing past ${SWEEP_RANGE_KM} km, and names the nearest instead`, () => {
    const far = depositSweep(sweepCandidates(view, 'coal', NAMUR), [-150, -60]);
    expect(far.found).toEqual([]);
    expect(far.nearest).not.toBeNull();
    expect(far.nearest!.km).toBeGreaterThan(SWEEP_RANGE_KM);
  });

  it('finds nothing at all where the view knows no free deposit of the species', () => {
    expect(depositSweep([], BRUSSELS)).toEqual({ found: [], nearest: null });
  });
});
